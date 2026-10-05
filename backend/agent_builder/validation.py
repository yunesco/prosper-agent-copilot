"""Shared strict wire parsing and runtime validation."""
from pydantic import TypeAdapter

from .builder import AgentBuilder
from .schema import AgentConfig

agent_payload = TypeAdapter(AgentConfig)


def validated_builder(payload: bytes | str) -> AgentBuilder:
    builder = AgentBuilder(agent_payload.validate_json(payload, strict=True))
    builder.build_initial_node()
    return builder
