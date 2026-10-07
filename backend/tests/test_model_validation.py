import pytest
from unittest.mock import patch

with patch("nltk.download", return_value=False):
    from agent_builder import AgentBuilder


@pytest.mark.parametrize("model", ["gpt-6-luna", "gpt-6.1-sol", "unknown"])
def test_voice_validation_rejects_models_without_the_supported_runtime_settings(model):
    with pytest.raises(ValueError, match="Unsupported model"):
        AgentBuilder.from_dict({"name": "Test", "model": model, "initial_node": "end", "nodes": [{"name": "end", "end": True}]})
