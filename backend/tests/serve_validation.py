"""Browser-test validation service: real builder, no tokenizer downloads/providers."""
import sys
from pathlib import Path
from unittest.mock import patch

import uvicorn

sys.path.insert(0, str(Path(__file__).parents[1]))
with patch('nltk.download', return_value=False):
    from agent_builder.api import app

if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=7862)
