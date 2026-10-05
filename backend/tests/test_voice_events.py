import asyncio
from unittest.mock import AsyncMock, Mock, patch

with patch('nltk.download', return_value=False):
    from pipecat.frames.frames import (
        AggregatedTextFrame, BotStartedSpeakingFrame, BotStoppedSpeakingFrame,
        InterruptionFrame,
    )
    from pipecat.observers.base_observer import FramePushed
    from pipecat.processors.frame_processor import FrameDirection
    from pipecat.transports.base_output import BaseOutputTransport
    from voice_events import VoiceRTVIProcessor


def test_interruption_discards_queued_text_before_next_response():
    async def run():
        processor = VoiceRTVIProcessor()
        processor.push_transport_message = AsyncMock()
        observer = processor.create_rtvi_observer()
        output = Mock(spec=BaseOutputTransport)

        async def push(frame):
            await observer.on_push_frame(FramePushed(
                source=output, destination=output, frame=frame,
                direction=FrameDirection.DOWNSTREAM, timestamp=0,
            ))

        def sentence(text):
            frame = AggregatedTextFrame(text=text, aggregated_by='sentence')
            frame.will_be_spoken = True
            return frame

        # The initial reply is generated, but the caller speaks before playback.
        await push(sentence('Cancelled greeting.'))
        interruption = InterruptionFrame()
        await push(interruption)
        replacement = sentence('Replacement greeting.')
        await push(replacement)
        # The same interruption is observed at multiple pipeline boundaries.
        await push(interruption)
        await push(BotStartedSpeakingFrame())
        # Re-observing a text frame must not emit it again.
        await push(replacement)
        messages = [call.args[0].model_dump() for call in processor.push_transport_message.await_args_list]
        assert [m['data']['text'] for m in messages if m['type'] == 'bot-output'] == ['Replacement greeting.']
        assert sum(m['type'] == 'bot-interrupted' for m in messages) == 1
        await observer.cleanup()
        await processor.cleanup()

    asyncio.run(run())


def test_normal_speech_and_repeated_words_in_separate_turns_are_preserved():
    async def run():
        processor = VoiceRTVIProcessor()
        processor.push_transport_message = AsyncMock()
        observer = processor.create_rtvi_observer()
        output = Mock(spec=BaseOutputTransport)

        async def push(frame):
            await observer.on_push_frame(FramePushed(
                source=output, destination=output, frame=frame,
                direction=FrameDirection.DOWNSTREAM, timestamp=0,
            ))

        for _ in range(2):
            frame = AggregatedTextFrame(text='Hello.', aggregated_by='sentence')
            frame.will_be_spoken = True
            await push(frame)
            await push(BotStartedSpeakingFrame())
            await push(BotStoppedSpeakingFrame())
        messages = [call.args[0].model_dump() for call in processor.push_transport_message.await_args_list]
        assert [m['data']['text'] for m in messages if m['type'] == 'bot-output'] == ['Hello.', 'Hello.']
        await observer.cleanup()
        await processor.cleanup()

    asyncio.run(run())
