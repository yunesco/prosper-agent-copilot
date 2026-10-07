#
# Mock clinic APIs — scheduling, patient records, insurance, handoff.
#
# Stands in for an EHR / payer integration. State lives in memory and answers are computed
# from "today", so nothing is a fixed list: availability moves with the calendar, booking
# a slot removes it, and an ineligible or taken slot is refused the way a real API would.
# Replace this module (or point the tool handlers at HTTP) to talk to a real system.
#

from dataclasses import dataclass
from datetime import date, datetime, timedelta

CLINIC_HOURS = range(9, 17)  # 9 AM to 5 PM, hourly slots
HORIZON_DAYS = 21
LEAD_DAYS = 1  # nothing bookable today

# Dr. Smith's rule, enforced here and not in any prompt: new patients on Monday and Wednesday only.
WEEKDAYS = {"new": {0, 2}, "existing": {0, 2, 4}}
ACCEPTED_INSURANCE = {
    "aetna": {"copay": 25, "deductible_remaining": 500},
    "blue cross": {"copay": 30, "deductible_remaining": 750},
    "cigna": {"copay": 25, "deductible_remaining": 300},
    "unitedhealthcare": {"copay": 35, "deductible_remaining": 1000},
    "medicare": {"copay": 0, "deductible_remaining": 0},
}
PATIENTS = {("jordan reyes", "1979-04-02"): "existing", ("priya nair", "1991-11-23"): "existing"}


class ApiError(Exception):
    """An HTTP-style failure: the tool hands `status` and `message` to the model."""

    def __init__(self, status: int, message: str):
        self.status, self.message = status, message
        super().__init__(f"{status}: {message}")


@dataclass
class Booking:
    confirmation_id: str
    slot_id: str
    full_name: str


_bookings: dict[str, Booking] = {}
_handoffs: list[dict] = []


def reset() -> None:
    _bookings.clear()
    _handoffs.clear()


def _label(slot: datetime) -> str:
    return f"{slot:%A, %B} {slot.day} at {slot.hour % 12 or 12}:00 {'AM' if slot.hour < 12 else 'PM'}"


def _is_taken(slot: datetime) -> bool:
    if slot.isoformat(timespec="minutes") in {b.slot_id for b in _bookings.values()}:
        return True
    # Deterministic existing load, so some hours are always full and results differ by day.
    return (slot.date().toordinal() * 7 + slot.hour * 13) % 3 == 0


def _slots(patient_type: str, today: date):
    for offset in range(LEAD_DAYS, HORIZON_DAYS):
        day = today + timedelta(days=offset)
        if day.weekday() not in WEEKDAYS[patient_type]:
            continue
        for hour in CLINIC_HOURS:
            slot = datetime(day.year, day.month, day.day, hour)
            if not _is_taken(slot):
                yield slot


def check_availability(patient_type: str, limit: int = 4, today: date | None = None) -> dict:
    if patient_type not in WEEKDAYS:
        raise ApiError(422, "patient_type must be 'new' or 'existing'.")
    found = []
    for slot in _slots(patient_type, today or date.today()):
        found.append({"slot_id": slot.isoformat(timespec="minutes"), "label": _label(slot)})
        if len(found) >= min(max(limit, 1), 8):
            break
    return {"provider": "Dr. Smith", "slots": found}


def book_appointment(slot_id: str, full_name: str, patient_type: str, today: date | None = None) -> dict:
    try:
        slot = datetime.fromisoformat(slot_id)
    except ValueError:
        raise ApiError(404, "Unknown slot_id. Use a slot_id returned by check_availability.") from None
    if patient_type not in WEEKDAYS:
        raise ApiError(422, "patient_type must be 'new' or 'existing'.")
    if slot.weekday() not in WEEKDAYS[patient_type] or slot.hour not in CLINIC_HOURS:
        raise ApiError(422, f"Dr. Smith does not see {patient_type} patients at that time.")
    if slot.date() < (today or date.today()) + timedelta(days=LEAD_DAYS):
        raise ApiError(422, "That time has passed or is too soon to book.")
    if _is_taken(slot):
        raise ApiError(409, "That slot was just taken. Call check_availability again.")
    booking = Booking(f"A{100 + len(_bookings) + 1}", slot.isoformat(timespec="minutes"), full_name)
    _bookings[booking.confirmation_id] = booking
    return {"confirmation_id": booking.confirmation_id, "provider": "Dr. Smith", "label": _label(slot)}


def lookup_patient(full_name: str, date_of_birth: str) -> dict:
    kind = PATIENTS.get((" ".join(full_name.lower().split()), date_of_birth.strip()))
    return {"found": True, "patient_type": kind} if kind else {"found": False}


def verify_eligibility(insurance_provider: str) -> dict:
    name = insurance_provider.lower().strip()
    for plan, terms in ACCEPTED_INSURANCE.items():
        if plan in name:
            return {"accepted": True, "plan": plan.title(), **terms}
    return {"accepted": False, "accepted_plans": [plan.title() for plan in ACCEPTED_INSURANCE]}


def transfer_to_human(reason: str) -> dict:
    _handoffs.append({"reason": reason})
    return {"status": "queued", "message": "A staff member will call the caller back."}
