import asyncio
from dataclasses import asdict
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

# Pipecat downloads tokenizer data at import; contract tests do not tokenize speech.
# Suppress only that side effect; test the real builder and Flows classes.
with patch("nltk.download", return_value=False):
    from agent_builder import AgentBuilder
    from agent_builder.schema import DEFAULT_MODEL, DEFAULT_VOICE_ID

ROOT = Path(__file__).resolve().parents[2]
AGENTS = [ROOT / "backend/example_flow.json", *sorted((ROOT / "fixtures/agents").glob("*.json"))]


@pytest.mark.parametrize("path", AGENTS, ids=lambda path: path.stem)
def test_fixture_compiles_and_every_edge_persists_state_and_transitions(path):
    builder = AgentBuilder.from_json(path)
    initial = builder.build_initial_node()
    assert initial["name"] == builder.config.initial_node
    # Walk through public compiled edge handlers, including cycles without looping.
    pending = [initial]
    visited = set()
    manager = SimpleNamespace(state={"existing": "preserved"})
    while pending:
        node = pending.pop()
        if node["name"] in visited:
            continue
        visited.add(node["name"])
        source = next(n for n in builder.config.nodes if n.name == node["name"])
        assert node["task_messages"] == source.task_messages
        assert node["role_message"] == (source.role_message or builder.config.persona)
        for function, edge in zip(node["functions"], source.edges, strict=True):
            assert function.name == edge.function
            assert function.properties == edge.properties
            assert function.required == edge.required
            result, target = asyncio.run(function.handler({"collected": "value"}, manager))
            assert result == {"status": "success", "collected": "value"}
            assert target["name"] == edge.target
            assert manager.state == {"existing": "preserved", "collected": "value"}
            pending.append(target)
        if source.end and not source.post_actions:
            assert node["post_actions"] == [{"type": "end_conversation"}]
    assert visited == {node.name for node in builder.config.nodes}


def test_defaults_and_json_roundtrip():
    builder = AgentBuilder.from_dict({"name": "Minimal", "initial_node": "start", "nodes": [{"name": "start", "end": True}]})
    assert builder.config.model == DEFAULT_MODEL
    assert builder.config.voice_id == DEFAULT_VOICE_ID
    assert asdict(AgentBuilder.from_dict(asdict(builder.config)).config) == asdict(builder.config)
    assert "pre_actions" not in builder.build_initial_node()
    assert builder.build_initial_node()["post_actions"] == [{"type": "end_conversation"}]


@pytest.mark.parametrize("data,match", [
    ({"name": "bad", "initial_node": "start", "nodes": []}, "no nodes"),
    ({"name": "bad", "initial_node": "missing", "nodes": [{"name": "start"}]}, "initial_node"),
    ({"name": "bad", "initial_node": "start", "nodes": [{"name": "start", "edges": [
        {"function": "go", "description": "", "target": "missing"}
    ]}]}, "unknown node"),
])
def test_invalid_references_are_rejected(data, match):
    with pytest.raises(ValueError, match=match):
        AgentBuilder.from_dict(data)


def test_native_actions_and_role_override_are_preserved():
    builder = AgentBuilder.from_dict({
        "name": "Actions", "persona": "Global", "initial_node": "end", "nodes": [{
            "name": "end", "role_message": "Override", "end": True,
            "pre_actions": [{"type": "tts_say", "text": "Hello"}],
            "post_actions": [{"type": "tts_say", "text": "Bye"}, {"type": "end_conversation"}],
        }],
    })
    node = builder.build_initial_node()
    assert node["role_message"] == "Override"
    assert node["pre_actions"] == [{"type": "tts_say", "text": "Hello"}]
    # Explicit post-actions take precedence over the default end action.
    assert node["post_actions"] == [{"type": "tts_say", "text": "Bye"}, {"type": "end_conversation"}]


def test_cycles_with_an_exit_compile():
    builder = AgentBuilder.from_dict({
        "name": "Loop", "initial_node": "start", "nodes": [{"name": "start", "edges": [
            {"function": "retry", "description": "Try again", "target": "start"},
            {"function": "finish", "description": "Finish", "target": "end"}
        ]}, {"name": "end", "end": True}],
    })
    function = builder.build_initial_node()["functions"][0]
    _, target = asyncio.run(function.handler({}, SimpleNamespace(state={})))
    assert target["name"] == "start"


def test_reports_all_graph_errors_together():
    from agent_builder.builder import AgentValidationError
    with pytest.raises(AgentValidationError) as caught:
        AgentBuilder.from_dict({
            'name': 'Bad', 'model': 'not-a-model', 'initial_node': 'start', 'nodes': [
                {'name': 'start', 'edges': [
                    {'function': 'pick time!', 'description': '', 'target': 'missing', 'required': ['ghost']},
                    {'function': 'pick time!', 'description': '', 'target': 'start'},
                ]},
                {'name': 'start'}, {'name': 'orphan', 'end': True},
            ],
        })
    errors = caught.value.errors
    for expected in ['Duplicate node', 'Duplicate function', 'invalid tool name', 'undefined property',
                     'unknown node', 'unreachable', 'no reachable call-ending', 'Unsupported model']:
        assert any(expected in error for error in errors), (expected, errors)


@pytest.mark.parametrize('function', ['', 'a' * 65, 'pick time!', 'é'])
def test_rejects_invalid_tool_names(function):
    with pytest.raises(ValueError, match='invalid tool name'):
        AgentBuilder.from_dict({'name': 'Bad', 'initial_node': 'start', 'nodes': [
            {'name': 'start', 'edges': [{'function': function, 'description': '', 'target': 'end'}]},
            {'name': 'end', 'end': True},
        ]})


def test_end_flag_overridden_by_actions_does_not_end_call():
    with pytest.raises(ValueError, match='no reachable call-ending'):
        AgentBuilder.from_dict({'name': 'Bad', 'initial_node': 'end', 'nodes': [
            {'name': 'end', 'end': True, 'post_actions': [{'type': 'tts_say', 'text': 'Bye'}]},
        ]})


def test_closed_loop_is_rejected_even_with_another_reachable_ending():
    with pytest.raises(ValueError, match="'loop' has no path"):
        AgentBuilder.from_dict({'name': 'Bad', 'initial_node': 'start', 'nodes': [
            {'name': 'start', 'edges': [
                {'function': 'loop', 'description': '', 'target': 'loop'},
                {'function': 'finish', 'description': '', 'target': 'end'},
            ]},
            {'name': 'loop', 'edges': [{'function': 'retry', 'description': '', 'target': 'loop'}]},
            {'name': 'end', 'end': True},
        ]})


def test_compiles_all_steps_and_collects_each_compilation_failure():
    from agent_builder.builder import AgentValidationError
    original = AgentBuilder._make_node
    seen = []

    def compile_node(self, node):
        seen.append(node.name)
        if node.name != 'greeting':
            raise ValueError('synthetic compilation failure')
        return original(self, node)

    with patch.object(AgentBuilder, '_make_node', compile_node):
        with pytest.raises(AgentValidationError) as caught:
            AgentBuilder.from_json(AGENTS[0])
    assert seen == ['greeting', 'collect_details', 'offer_times', 'confirm']
    assert len(caught.value.errors) == 3
