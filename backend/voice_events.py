"""Compatibility boundary for the pinned Pipecat 1.4 RTVI observer."""
from pipecat.processors.frameworks.rtvi import RTVIObserver, RTVIProcessor
from pipecat.processors.frameworks.rtvi.models import BotInterruptedMessage


class InterruptionAwareRTVIObserver(RTVIObserver):
    async def send_rtvi_message(self, model, exclude_none=True):
        if isinstance(model, BotInterruptedMessage):
            # Pipecat 1.4 cancels audio but leaves pre-playback text queued. Its next
            # BotStartedSpeakingFrame flushes that cancelled response to clients.
            # Reset at the observer's accepted interruption event, after upstream
            # frame deduplication, so repeated frame observations cannot clear the
            # replacement response. Remove this shim when upstream owns this reset.
            self._queued_aggregated_text_frames.clear()
            self._bot_is_speaking = False
        await super().send_rtvi_message(model, exclude_none)


class VoiceRTVIProcessor(RTVIProcessor):
    def create_rtvi_observer(self, *, params=None, **kwargs):
        return InterruptionAwareRTVIObserver(self, params=params, **kwargs)
