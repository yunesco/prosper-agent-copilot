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
