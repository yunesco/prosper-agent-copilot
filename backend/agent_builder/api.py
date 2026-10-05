"""Validation-only HTTP boundary; never imports or starts the voice pipeline."""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import TypeAdapter, ValidationError

from .builder import AgentBuilder
from .schema import AgentConfig

app = FastAPI()
agent_payload = TypeAdapter(AgentConfig)


@app.post('/validate')
async def validate_agent(request: Request):
    try:
        config = agent_payload.validate_json(await request.body(), strict=True)
        builder = AgentBuilder(config)
        builder.build_initial_node()
    except ValidationError:
        return JSONResponse({'valid': False, 'error': 'Invalid agent payload.'}, status_code=422)
    except (ValueError, KeyError, TypeError) as error:
        return JSONResponse({'valid': False, 'error': str(error)}, status_code=422)
    return {'valid': True}
