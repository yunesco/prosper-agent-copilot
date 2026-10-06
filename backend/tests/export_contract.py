"""JSON stdin/stdout bridge used by the cross-language contract check."""
import json
import sys
from dataclasses import asdict
from unittest.mock import patch
from pydantic import TypeAdapter

# Pipecat downloads tokenizer data at import; contract tests do not tokenize speech.
# Suppress only that side effect; test the real builder and Flows classes.
with patch("nltk.download", return_value=False):
    from agent_builder import AgentBuilder, AgentConfig

results = []
for data in json.load(sys.stdin):
    try:
        builder = AgentBuilder(TypeAdapter(AgentConfig).validate_json(json.dumps(data), strict=True))
        builder.build_initial_node()
        for node in builder.config.nodes:
            compiled = builder._make_node(node)
            for function, edge in zip(compiled.get("functions", []), node.edges, strict=True):
                assert function.properties == edge.properties
                assert function.required == edge.required
        results.append({"ok": True, "agent": asdict(builder.config)})
    except (ValueError, KeyError, TypeError) as error:
        results.append({"ok": False, "error": f"{type(error).__name__}: {error}"})
json.dump(results, sys.stdout)
