"""Provider construction for the original voice pipeline."""

from pipecat.services.openai.llm import OpenAILLMService


def create_voice_llm(*, api_key: str, model: str) -> OpenAILLMService:
    # Preserve the original bot's provider defaults. Model changes require live
    # waiting/transition checks, not just a successful tool-call smoke test.
    return OpenAILLMService(api_key=api_key, model=model)
