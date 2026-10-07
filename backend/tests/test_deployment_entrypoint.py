import importlib
from pathlib import Path
import tomllib
from unittest.mock import patch

from fastapi.testclient import TestClient


def test_vercel_entrypoint_serves_validation():
    backend = Path(__file__).parents[1]
    config = tomllib.loads((backend / 'pyproject.toml').read_text())
    module_name, attribute = config['tool']['vercel']['entrypoint'].split(':')
    with patch('nltk.download', return_value=False):
        app = getattr(importlib.import_module(module_name), attribute)
    client = TestClient(app)

    response = client.post('/validate', content=(backend / 'example_flow.json').read_bytes())
    assert response.status_code == 200
    assert response.json() == {'valid': True}
    assert client.post('/validate', json={}).status_code == 422
