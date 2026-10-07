#
# AgentBuilder — loads a declarative agent (JSON / dict) and compiles its node
# graph into Pipecat Flows objects.
#
#   JSON  ->  AgentConfig (validated)  ->  Pipecat Flows NodeConfig graph
#
# This is the seam between "agent as data" (what the Phase 2 Composer produces)
# and "agent as a running conversation" (what bot.py executes). Keeping the
# compile + validation here means bot.py never touches the graph internals.
#

import json
import re
from collections import Counter
from pathlib import Path
from typing import Awaitable, Callable, Optional, Union

from loguru import logger
from pipecat_flows import FlowManager, FlowsFunctionSchema, NodeConfig

from .schema import AgentConfig, Edge, Node, DEFAULT_MODEL


class AgentValidationError(ValueError):
    """All candidate errors, suitable for a proposal repair loop."""

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("\n".join(errors))


class AgentBuilder:
    """Builds a runnable Pipecat Flows graph from a declarative AgentConfig."""

    def __init__(self, config: AgentConfig):
        self.config = config
        self._nodes_by_name = {n.name: n for n in config.nodes}
        # Set by the runtime to observe transitions (e.g. to tell a Test Call client
        # which step is active). Unset for ordinary runs.
        self.on_node: Optional[Callable[[str], Awaitable[None]]] = None
        self._validate()

    # ---- loading -----------------------------------------------------------
    @classmethod
    def from_dict(cls, data: dict) -> "AgentBuilder":
        return cls(AgentConfig.from_dict(data))

    @classmethod
    def from_json(cls, path: Union[str, Path]) -> "AgentBuilder":
        data = json.loads(Path(path).read_text())
        return cls.from_dict(data)

    # ---- validation --------------------------------------------------------
    def _validate(self) -> None:
        errors: list[str] = []
        names = set(self._nodes_by_name)
        if not names:
            errors.append("Agent has no nodes.")
        for name, count in Counter(n.name for n in self.config.nodes).items():
            if count > 1:
                errors.append(f"Duplicate node name '{name}'.")
        if self.config.initial_node not in names:
            errors.append(f"initial_node '{self.config.initial_node}' is not a defined node.")
        if self.config.model != DEFAULT_MODEL:
            errors.append(f"Unsupported model '{self.config.model}'; supported model: {DEFAULT_MODEL}.")
        terminal = set()
        for node in self.config.nodes:
            # Match compilation: explicit post_actions override the end flag.
            actions = node.pre_actions + node.post_actions
            if (node.end and not node.post_actions) or any(a.get("type") == "end_conversation" for a in actions):
                terminal.add(node.name)
            for function, count in Counter(e.function for e in node.edges).items():
                if count > 1:
                    errors.append(f"Duplicate function '{function}' in node '{node.name}'.")
            for edge in node.edges:
                context = f"Edge '{edge.function}' in node '{node.name}'"
                if not re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", edge.function):
                    errors.append(f"{context} has an invalid tool name (1–64 letters, digits, underscores or hyphens).")
                if edge.target not in names:
                    errors.append(f"{context} targets unknown node '{edge.target}'.")
                for field in edge.required:
                    if field not in edge.properties:
                        errors.append(f"{context} requires undefined property '{field}'.")
        reachable = set()
        pending = [self.config.initial_node]
        while pending:
            name = pending.pop()
            if name in reachable or name not in names:
                continue
            reachable.add(name)
            pending.extend(e.target for e in self._nodes_by_name[name].edges)
        for name in sorted(names - reachable):
            errors.append(f"Node '{name}' is unreachable from initial_node.")
        if not terminal & reachable:
            errors.append("Agent has no reachable call-ending node.")
        # Cycles are allowed, but every step must have a path to a call ending.
        can_end = set(terminal)
        while True:
            previous = len(can_end)
            can_end.update(n.name for n in self.config.nodes if any(e.target in can_end for e in n.edges))
            if len(can_end) == previous:
                break
        for name in sorted(names - can_end):
            errors.append(f"Node '{name}' has no path to a call-ending node.")
        # Compile every step even when another step fails, collecting all errors.
        for node in self.config.nodes:
            try:
                self._make_node(node)
            except (ValueError, KeyError, TypeError) as error:
                errors.append(f"Node '{node.name}' failed compilation: {error}")
        if errors:
            raise AgentValidationError(errors)

    # ---- compilation -------------------------------------------------------
    def build_initial_node(self) -> NodeConfig:
        """Return the entry node after validation/compilation of every step."""
        return self._make_node(self._nodes_by_name[self.config.initial_node])

    def _make_node(self, node: Node) -> NodeConfig:
        node_config: NodeConfig = {
            "name": node.name,
            "role_message": node.role_message or self.config.persona,
            "task_messages": node.task_messages,
            "functions": [self._make_edge_function(edge) for edge in node.edges],
        }
        if node.pre_actions:
            node_config["pre_actions"] = node.pre_actions
        # Explicit post_actions win; otherwise a terminal node ends the call.
        if node.post_actions:
            node_config["post_actions"] = node.post_actions
        elif node.end:
            node_config["post_actions"] = [{"type": "end_conversation"}]
        return node_config

    def _make_edge_function(self, edge: Edge) -> FlowsFunctionSchema:
        async def handler(args: dict, flow_manager: FlowManager):
            # Persist what the caller gave us so later nodes can use it.
            flow_manager.state.update(args)
            logger.info(f"[{edge.function}] -> {edge.target} | collected: {args}")
            next_node = self._make_node(self._nodes_by_name[edge.target])
            if self.on_node:
                await self.on_node(edge.target)
            return {"status": "success", **args}, next_node

        return FlowsFunctionSchema(
            name=edge.function,
            description=edge.description,
            properties=edge.properties,
            required=edge.required,
            handler=handler,
        )
