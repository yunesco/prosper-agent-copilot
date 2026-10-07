import asyncio
from datetime import date
from unittest.mock import patch

import pytest

with patch("nltk.download", return_value=False):
    from agent_builder import AgentBuilder
    from agent_builder import mock_api
    from agent_builder.builder import AgentValidationError
    from agent_builder.tools import TOOLS, run_tool

TODAY = date(2026, 10, 7)  # a Wednesday


@pytest.fixture(autouse=True)
def fresh_state():
    mock_api.reset()


def test_new_patients_only_get_monday_and_wednesday_and_booking_removes_the_slot():
    first = mock_api.check_availability("new", limit=8, today=TODAY)["slots"]
    assert first and all(s["slot_id"][:10] and date.fromisoformat(s["slot_id"][:10]).weekday() in (0, 2) for s in first)
    chosen = first[0]
    booking = mock_api.book_appointment(chosen["slot_id"], "Dana Whitfield", "new", today=TODAY)
    assert booking["label"] == chosen["label"] and booking["confirmation_id"].startswith("A")
    after = mock_api.check_availability("new", limit=8, today=TODAY)["slots"]
    assert chosen["slot_id"] not in {s["slot_id"] for s in after}
    with pytest.raises(mock_api.ApiError) as taken:
        mock_api.book_appointment(chosen["slot_id"], "Someone Else", "new", today=TODAY)
    assert taken.value.status == 409


def test_existing_patients_can_use_friday_but_new_patients_are_refused():
    friday = next(
        s for s in mock_api.check_availability("existing", limit=8, today=TODAY)["slots"]
        if date.fromisoformat(s["slot_id"][:10]).weekday() == 4
    )
    with pytest.raises(mock_api.ApiError) as refused:
        mock_api.book_appointment(friday["slot_id"], "Dana Whitfield", "new", today=TODAY)
    assert refused.value.status == 422
    assert mock_api.book_appointment(friday["slot_id"], "Jordan Reyes", "existing", today=TODAY)["confirmation_id"]


def test_availability_is_computed_from_today_not_a_fixed_list():
    soon = mock_api.check_availability("existing", today=TODAY)["slots"]
    later = mock_api.check_availability("existing", today=date(2026, 12, 1))["slots"]
    assert soon != later


def test_lookup_eligibility_and_transfer():
    assert mock_api.lookup_patient("  jordan   REYES ", "1979-04-02") == {"found": True, "patient_type": "existing"}
    assert mock_api.lookup_patient("Dana Whitfield", "1988-06-12") == {"found": False}
    assert mock_api.verify_eligibility("Aetna PPO")["accepted"] is True
    assert mock_api.verify_eligibility("Blue Horizon")["accepted"] is False
    assert mock_api.transfer_to_human("emergency")["status"] == "queued"


def test_run_tool_returns_errors_instead_of_raising():
    assert run_tool("book_appointment", {"slot_id": "nope", "full_name": "A", "patient_type": "new"})["status"] == 404
    assert run_tool("check_availability", {"patient_type": "new", "bogus": 1})["status"] == 422


def agent(tools, edges=None):
    return {
        "name": "t", "initial_node": "a",
        "nodes": [
            {"name": "a", "tools": tools, "edges": edges or [{"function": "go", "description": "d", "target": "b"}]},
            {"name": "b", "end": True},
        ],
    }


def test_tool_functions_stay_on_the_node_and_report_to_the_runtime():
    builder = AgentBuilder.from_dict(agent(["check_availability"]))
    seen = []

    async def on_tool(name, args, result):
        seen.append((name, args, result))

    builder.on_tool = on_tool
    node = builder.build_initial_node()
    assert "Today is" in node["role_message"]
    tool = next(f for f in node["functions"] if f.name == "check_availability")
    result, target = asyncio.run(tool.handler({"patient_type": "new"}, None))
    assert target is None and result["slots"]
    assert seen[0][0] == "check_availability"


@pytest.mark.parametrize("tools,match", [
    (["nope"], "unknown tool 'nope'"),
    (["lookup_patient", "lookup_patient"], "Duplicate tool"),
    (["check_availability"], "named like its tool"),
])
def test_tool_validation(tools, match):
    edges = [{"function": "check_availability", "description": "d", "target": "b"}] if "named" in match else None
    with pytest.raises(AgentValidationError, match=match):
        AgentBuilder.from_dict(agent(tools, edges))


def test_registry_has_five_tools():
    assert set(TOOLS) == {"check_availability", "book_appointment", "lookup_patient", "verify_eligibility", "transfer_to_human"}
