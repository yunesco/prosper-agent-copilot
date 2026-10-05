import copy
import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

with patch('nltk.download', return_value=False):
    from agent_builder.calls import call_router


def example():
    return json.loads((Path(__file__).parents[1] / 'example_flow.json').read_text())


def setup():
    handler = AsyncMock()
    launch = AsyncMock()

    async def answer(request, webrtc_connection_callback):
        await webrtc_connection_callback(object())
        return {'sdp': 'answer', 'type': 'answer', 'pc_id': 'test'}

    handler.handle_web_request.side_effect = answer
    app = FastAPI()
    app.include_router(call_router(handler, launch))
    return TestClient(app), handler, launch


def test_original_example_and_isolated_sessions():
    client, handler, launch = setup()
    original = example()
    edited = copy.deepcopy(original)
    edited['nodes'][0]['task_messages'][0]['content'] = 'Say the test phrase.'
    with client:
        for agent in [original, edited]:
            assert client.post('/test/offer', json={'agent': agent, 'sdp': 'offer', 'type': 'offer'}).status_code == 200
    first, second = [call.args for call in launch.await_args_list]
    assert first[0].session_id != second[0].session_id
    assert first[1].build_initial_node()['task_messages'] == original['nodes'][0]['task_messages']
    assert second[1].build_initial_node()['task_messages'] == edited['nodes'][0]['task_messages']
    second[1].config.nodes[0].task_messages[0]['content'] = 'Changed in session'
    assert first[1].config.nodes[0].task_messages == original['nodes'][0]['task_messages']
    handler.close.assert_awaited_once()


@pytest.mark.parametrize('payload', [None, [], {}, {'agent': {}, 'sdp': 'offer', 'type': 'offer'}, {'agent': example(), 'sdp': 1, 'type': 'offer'}, {'agent': example(), 'sdp': 'offer', 'type': 'answer'}, {'agent': example(), 'sdp': 'offer', 'type': 'offer', 'pc_id': 'another-session'}])
def test_rejection_never_allocates_voice(payload):
    client, handler, launch = setup()
    assert client.post('/test/offer', json=payload).status_code == 422
    handler.handle_web_request.assert_not_called()
    launch.assert_not_called()


def test_bad_json_graph_and_transport_failure():
    client, handler, launch = setup()
    assert client.post('/test/offer', content='{').status_code == 422
    agent = example()
    agent['nodes'][0]['edges'][0]['target'] = 'missing'
    response = client.post('/test/offer', json={'agent': agent, 'sdp': 'offer', 'type': 'offer'})
    assert response.status_code == 422
    assert 'unknown node' in response.json()['error']
    handler.handle_web_request.assert_not_called()
    handler.handle_web_request.side_effect = RuntimeError('private service internals')
    response = client.post('/test/offer', json={'agent': example(), 'sdp': 'offer', 'type': 'offer'})
    assert response.status_code == 503
    assert 'private' not in response.text
    launch.assert_not_called()
