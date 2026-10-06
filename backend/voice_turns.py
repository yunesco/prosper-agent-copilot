"""Separate turn detection from confirmed-word interruption in the voice stack."""

from collections.abc import Awaitable, Callable

from pipecat.frames.frames import Frame, TranscriptionFrame, VADUserStartedSpeakingFrame
from pipecat.turns.types import ProcessFrameResult
from pipecat.turns.user_start import BaseUserTurnStartStrategy
from pipecat.turns.user_turn_strategies import UserTurnStrategies


class ConfirmedSpeechUserTurnStartStrategy(BaseUserTurnStartStrategy):
    def __init__(self, on_confirmed_speech: Callable[[], Awaitable[None]]):
        super().__init__(enable_interruptions=False)
        self._on_confirmed_speech = on_confirmed_speech
        self._confirmed = False

    async def reset(self):
        # The controller resets start strategies when a new turn starts.
        self._confirmed = False

    async def process_frame(self, frame: Frame) -> ProcessFrameResult:
        final_words = isinstance(frame, TranscriptionFrame) and bool(frame.text.strip())
        if isinstance(frame, VADUserStartedSpeakingFrame) or final_words:
            # Keep VAD turn starts: starting only at the final transcript resets
            # Smart Turn after its incomplete verdict and loses that verdict.
            await self.trigger_user_turn_started()
            if final_words and not self._confirmed:
                self._confirmed = True
                # Await before stop strategies can complete this turn and infer.
                await self._on_confirmed_speech()
            return ProcessFrameResult.STOP
        # ElevenLabs may echo a committed final as a stale interim (#5197).
        return ProcessFrameResult.CONTINUE


def voice_turn_strategies(
    on_confirmed_speech: Callable[[], Awaitable[None]],
) -> UserTurnStrategies:
    # Leave stop strategies unset to preserve Pipecat's default Smart Turn.
    return UserTurnStrategies(start=[ConfirmedSpeechUserTurnStartStrategy(on_confirmed_speech)])
