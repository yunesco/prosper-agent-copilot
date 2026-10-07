import copy
import json
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
import pytest

with patch('nltk.download', return_value=False):
    from agent_builder.api import app

client = TestClient(app)


def example():
    return json.loads((Path(__file__).parents[1] / 'example_flow.json').read_text())


def test_validates_without_changing_native_fields():
    data = example()
    data['nodes'][0]['task_messages'][0]['extra'] = {'nested': [None, True]}
    before = copy.deepcopy(data)
    assert client.post('/validate', json=data).json() == {'valid': True}
    assert data == before


@pytest.mark.parametrize('data', [None, [], {}, {'nodes': 'bad'}])
def test_rejects_malformed_payload(data):
    assert client.post('/validate', json=data).status_code == 422


def test_invalid_json_and_unknown_target():
    assert client.post('/validate', content='{').status_code == 422
    data = example()
    data['nodes'][0]['edges'][0]['target'] = 'missing'
    response = client.post('/validate', json=data)
    assert response.status_code == 422
    assert 'unknown node' in response.json()['error']


def test_returns_full_graph_and_shape_error_lists():
    data = example()
    data['model'] = 'not-a-model'
    data['nodes'][0]['edges'][0]['required'] = ['ghost']
    response = client.post('/validate', json=data)
    assert response.status_code == 422
    errors = response.json()['errors']
    assert len(errors) == 2
    assert response.json()['error'] == '\n'.join(errors)
    malformed = client.post('/validate', json={'nodes': 'bad'}).json()
    assert len(malformed['errors']) >= 3


def step(name, edges=(), end=False):
    node = {'name': name, 'task_messages': [{'role': 'system', 'content': 'x'}], 'edges': list(edges)}
    if end:
        node['end'] = True
    return node


def go(function, target):
    return {'function': function, 'description': 'd', 'target': target}


def test_hostile_bodies_are_rejected_not_crashed():
    for body in [b'[' * 100_000, b'\xff\xfe{', b'\x00', b'']:
        response = client.post('/validate', content=body)
        assert response.status_code == 422, body[:10]
        assert response.json()['valid'] is False


def test_cycles_with_an_exit_pass_and_traps_fail():
    loop = {'name': 'c', 'initial_node': 'a', 'nodes': [step('a', [go('next', 'b')]), step('b', [go('back', 'a'), go('done', 'e')]), step('e', end=True)]}
    assert client.post('/validate', json=loop).json() == {'valid': True}
    trap = {'name': 'c', 'initial_node': 'a', 'nodes': [step('a', [go('again', 'a')])]}
    response = client.post('/validate', json=trap)
    assert response.status_code == 422
    assert 'no reachable call-ending node' in response.json()['error']


def test_unicode_and_large_graphs_validate():
    emoji = {'name': '🏥 Clínica <b>', 'initial_node': '🏥', 'nodes': [step('🏥', end=True)]}
    assert client.post('/validate', json=emoji).status_code == 200
    chain = [step(f'n{i}', [go(f'f{i}', f'n{i + 1}')]) for i in range(59)] + [step('n59', end=True)]
    assert client.post('/validate', json={'name': 'big', 'initial_node': 'n0', 'nodes': chain}).status_code == 200


def test_duplicate_steps_and_functions_are_named_in_the_error():
    twins = {'name': 'c', 'initial_node': 'a', 'nodes': [step('a', end=True), step('a', end=True)]}
    assert 'Duplicate node name' in client.post('/validate', json=twins).json()['error']
    dup = {'name': 'c', 'initial_node': 'a', 'nodes': [step('a', [go('f', 'e'), go('f', 'e')]), step('e', end=True)]}
    assert 'Duplicate function' in client.post('/validate', json=dup).json()['error']
