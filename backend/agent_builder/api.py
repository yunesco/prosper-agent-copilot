"""Validation-only HTTP boundary; never imports or starts the voice pipeline."""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .validation import validated_builder
from .builder import AgentValidationError

app = FastAPI()


@app.post('/validate')
async def validate_agent(request: Request):
    try:
        validated_builder(await request.body())
    except ValidationError as error:
        errors = [f"{'.'.join(map(str, item['loc']))}: {item['msg']}" for item in error.errors(include_input=False)]
        return JSONResponse({'valid': False, 'error': "\n".join(errors), 'errors': errors}, status_code=422)
    except AgentValidationError as error:
        return JSONResponse({'valid': False, 'error': str(error), 'errors': error.errors}, status_code=422)
    except (ValueError, KeyError, TypeError) as error:
        return JSONResponse({'valid': False, 'error': str(error)}, status_code=422)
    return {'valid': True}
