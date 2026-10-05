"""Current-agent WebRTC endpoint mounted alongside the unchanged dev runner."""
import json
from contextlib import asynccontextmanager
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, ValidationError

from .validation import validated_builder
from .builder import AgentValidationError


class CallOffer(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    agent: dict
    sdp: str
    type: Literal['offer']


def call_router(handler, launch):
    # Imports stay at this boundary; validation alone never loads WebRTC or providers.
    from pipecat.runner.types import SmallWebRTCRunnerArguments
    from pipecat.transports.smallwebrtc.request_handler import SmallWebRTCRequest

    @asynccontextmanager
    async def lifespan(app):
        yield
        await handler.close()

    router = APIRouter(lifespan=lifespan)

    @router.post('/test/offer')
    async def offer(request: Request, background_tasks: BackgroundTasks):
        try:
            payload = CallOffer.model_validate_json(await request.body())
            builder = validated_builder(json.dumps(payload.agent))
        except AgentValidationError as error:
            return JSONResponse({'error': str(error), 'errors': error.errors}, status_code=422)
        except ValidationError:
            return JSONResponse({'error': 'Invalid call payload.'}, status_code=422)
        except (ValueError, KeyError, TypeError) as error:
            return JSONResponse({'error': str(error)}, status_code=422)

        async def connected(connection):
            # Each callback closes over its own parsed config, never a global file/state.
            args = SmallWebRTCRunnerArguments(
                webrtc_connection=connection, session_id=str(uuid4())
            )
            background_tasks.add_task(launch, args, builder)

        try:
            return await handler.handle_web_request(
                request=SmallWebRTCRequest(sdp=payload.sdp, type=payload.type),
                webrtc_connection_callback=connected,
            )
        except Exception:
            return JSONResponse({'error': 'Voice runtime could not start the call.'}, status_code=503)

    return router
