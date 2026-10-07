#
# Tool registry — the actions an agent step can take besides transitioning.
#
# A step lists tool names (`tools: ["check_availability"]`); the builder compiles each into a
# Pipecat Flows function that calls the handler and keeps the step active, so the model can
# speak the result. Adding a tool is one entry here (plus its mock in mock_api.py).
#

from dataclasses import dataclass
from typing import Callable

from . import mock_api


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    properties: dict
    required: list[str]
    handler: Callable[..., dict]


def _text(description: str) -> dict:
    return {"type": "string", "description": description}


_PATIENT_TYPE = {"type": "string", "enum": ["new", "existing"], "description": "Whether the caller is a new or existing patient."}

TOOLS: dict[str, Tool] = {
    tool.name: tool
    for tool in [
        Tool(
            "check_availability",
            "Look up Dr. Smith's next open appointment slots for this kind of patient. Only offer slots this returns.",
            {"patient_type": _PATIENT_TYPE},
            ["patient_type"],
            lambda patient_type: mock_api.check_availability(patient_type),
        ),
        Tool(
            "book_appointment",
            "Book one slot returned by check_availability. Fails if the slot was taken or is not allowed for this patient.",
            {
                "slot_id": _text("The slot_id exactly as returned by check_availability."),
                "full_name": _text("Caller's full name."),
                "patient_type": _PATIENT_TYPE,
            },
            ["slot_id", "full_name", "patient_type"],
            lambda slot_id, full_name, patient_type: mock_api.book_appointment(slot_id, full_name, patient_type),
        ),
        Tool(
            "lookup_patient",
            "Look up a patient record by full name and date of birth (YYYY-MM-DD) to confirm they are an existing patient.",
            {"full_name": _text("Caller's full name."), "date_of_birth": _text("Date of birth as YYYY-MM-DD.")},
            ["full_name", "date_of_birth"],
            lambda full_name, date_of_birth: mock_api.lookup_patient(full_name, date_of_birth),
        ),
        Tool(
            "verify_eligibility",
            "Check whether the clinic accepts an insurance provider and return the copay and remaining deductible.",
            {"insurance_provider": _text("Insurance provider name as the caller said it.")},
            ["insurance_provider"],
            lambda insurance_provider: mock_api.verify_eligibility(insurance_provider),
        ),
        Tool(
            "transfer_to_human",
            "Hand the caller to clinic staff for anything this agent cannot do. Give a short reason.",
            {"reason": _text("Why the caller needs a person.")},
            ["reason"],
            lambda reason: mock_api.transfer_to_human(reason),
        ),
    ]
}


def run_tool(name: str, args: dict) -> dict:
    """Run a tool and turn API failures into a result the model can act on."""
    try:
        return TOOLS[name].handler(**args)
    except mock_api.ApiError as error:
        return {"error": error.message, "status": error.status}
    except TypeError as error:
        return {"error": f"Invalid arguments: {error}", "status": 422}
