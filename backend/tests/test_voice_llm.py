import asyncio
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from openai import NOT_GIVEN

with patch("nltk.download", return_value=False):
    from agent_builder import AgentBuilder
    from pipecat.adapters.schemas.tools_schema import ToolsSchema
    from pipecat.processors.aggregators.llm_context import LLMContext
    from pipecat.services.openai.llm import OpenAILLMService


def test_original_voice_request_preserves_flow_tools_without_reasoning_override():
    builder = AgentBuilder.from_json(Path(__file__).resolve().parents[1] / "example_flow.json")
    node = builder.build_initial_node()
    context = LLMContext(
        messages=[{"role": "system", "content": node["role_message"]}, *node["task_messages"]],
        tools=ToolsSchema(standard_tools=[tool.to_function_schema() for tool in node["functions"]]),
    )
    create = AsyncMock(return_value=object())
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    with patch.object(OpenAILLMService, "create_client", return_value=client):
        llm = OpenAILLMService(api_key="test-key", model=builder.config.model)
    asyncio.run(llm.get_chat_completions(context))
    params = create.call_args.kwargs
    assert params["model"] == "gpt-4o"
    assert "reasoning_effort" not in params
    # Preserve the original provider default rather than forcing a tool call.
    assert params["tool_choice"] is NOT_GIVEN
    assert not any(message["role"] == "user" for message in params["messages"])
    assert params["stream"] is True
    assert params["tools"][0]["function"]["name"] == node["functions"][0].name
    assert params["tools"][0]["function"]["parameters"]["required"] == node["functions"][0].required


@pytest.mark.parametrize("model", ["gpt-6-luna", "gpt-6.1-sol", "unknown"])
def test_voice_validation_rejects_models_without_the_supported_runtime_settings(model):
    with pytest.raises(ValueError, match="Unsupported model"):
        AgentBuilder.from_dict({"name": "Test", "model": model, "initial_node": "end", "nodes": [{"name": "end", "end": True}]})
