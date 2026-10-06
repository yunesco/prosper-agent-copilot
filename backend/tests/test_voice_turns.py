"""Replay real Pipecat turn/aggregation behavior with injected turn analysis."""
import asyncio
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, Mock, patch

import pytest

with patch('nltk.download', return_value=False):
    from pipecat.audio.turn.base_turn_analyzer import EndOfTurnState
    from pipecat.frames.frames import (
        BotStartedSpeakingFrame, InterimTranscriptionFrame, TranscriptionFrame,
        VADUserStartedSpeakingFrame, VADUserStoppedSpeakingFrame,
    )
    from pipecat.processors.aggregators.llm_context import LLMContext
    from pipecat.processors.aggregators.llm_response_universal import (
        LLMUserAggregator, LLMUserAggregatorParams,
    )
    from pipecat.turns.user_stop import BaseUserTurnStopStrategy
    from pipecat.turns.user_stop.turn_analyzer_user_turn_stop_strategy import (
        TurnAnalyzerUserTurnStopStrategy,
    )
    from pipecat.utils.asyncio.task_manager import TaskManager, TaskManagerParams
    from voice_turns import voice_turn_strategies


@asynccontextmanager
async def replay(stop=None, timeout=5):
    stop = stop or BaseUserTurnStopStrategy()

    async def confirmed():
        await aggregator.broadcast_interruption()

    with patch('pipecat.turns.user_turn_strategies.default_user_turn_stop_strategies',
               return_value=[stop]) as default_stop:
        strategies = voice_turn_strategies(confirmed)
        default_stop.assert_called_once_with()
    context = LLMContext()
    aggregator = LLMUserAggregator(context, params=LLMUserAggregatorParams(
        user_turn_strategies=strategies, user_turn_stop_timeout=timeout,
    ))
    aggregator.broadcast_frame = AsyncMock()
    aggregator.broadcast_interruption = AsyncMock()
    aggregator.push_frame = AsyncMock()
    manager = TaskManager()
    manager.setup(TaskManagerParams(loop=asyncio.get_running_loop()))
    controller = aggregator._user_turn_controller
    await controller.setup(manager)

    async def send(frame):
        # Same ordering as LLMUserAggregator.process_frame, without starting
        # audio/provider processors or its unrelated pipeline queue machinery.
        if isinstance(frame, TranscriptionFrame):
            await aggregator._handle_transcription(frame)
        await controller.process_frame(frame)

    try:
        yield aggregator, context, stop, send
    finally:
        await controller.cleanup()
        await aggregator.cleanup()


def test_vad_empty_finals_and_stale_interims_leave_reply_playing_after_timeout():
    async def run():
        async with replay(timeout=0.02) as (aggregator, context, stop, send):
            reply = asyncio.get_running_loop().create_future()
            aggregator.broadcast_interruption.side_effect = reply.cancel
            stopped = asyncio.Event()

            async def on_stopped(*args):
                stopped.set()

            aggregator.add_event_handler('on_user_turn_stopped', on_stopped)
            await send(BotStartedSpeakingFrame())
            await send(VADUserStartedSpeakingFrame())
            await send(TranscriptionFrame('', '', ''))
            await send(TranscriptionFrame('   ', '', ''))
            await send(InterimTranscriptionFrame('Old committed words.', '', ''))
            await send(VADUserStoppedSpeakingFrame())
            await asyncio.wait_for(stopped.wait(), timeout=1)
            assert not reply.cancelled()
            aggregator.broadcast_interruption.assert_not_awaited()
            assert context.messages == []
            aggregator.push_frame.assert_not_awaited()
            # Timeout must not prevent the next real answer from interrupting.
            await send(TranscriptionFrame('Yes.', '', ''))
            assert reply.cancelled()
    asyncio.run(run())


@pytest.mark.parametrize('playing', [False, True])
@pytest.mark.parametrize('vad', [False, True])
def test_final_interrupts_once_before_inference_and_preserves_answers(playing, vad):
    async def run():
        async with replay() as (aggregator, context, stop, send):
            for answer in ['Yes.', 'Yes.', 'Checkup.', 'Actually, my name is Sam.']:
                reply = asyncio.get_running_loop().create_future()
                aggregator.broadcast_interruption.side_effect = reply.cancel
                before = aggregator.broadcast_interruption.await_count
                if playing:
                    await send(BotStartedSpeakingFrame())
                if vad:
                    await send(VADUserStartedSpeakingFrame())
                await send(InterimTranscriptionFrame(answer, '', ''))
                assert not reply.cancelled()
                await send(TranscriptionFrame(answer, '', ''))
                assert reply.cancelled()
                await send(VADUserStartedSpeakingFrame())
                await send(TranscriptionFrame('Please.', '', ''))
                assert aggregator.broadcast_interruption.await_count == before + 1
                await stop.trigger_user_turn_stopped()
                await send(InterimTranscriptionFrame(answer, '', ''))
                assert aggregator.broadcast_interruption.await_count == before + 1
            assert [m['content'] for m in context.messages] == [
                'Yes. Please.', 'Yes. Please.', 'Checkup. Please.',
                'Actually, my name is Sam. Please.',
            ]
    asyncio.run(run())


def test_smart_turn_incomplete_survives_final_until_caller_finishes():
    async def run():
        analyzer = Mock()
        analyzer.cleanup = AsyncMock()
        analyzer.analyze_end_of_turn = AsyncMock(side_effect=[
            (EndOfTurnState.INCOMPLETE, None), (EndOfTurnState.COMPLETE, None),
        ])
        stop = TurnAnalyzerUserTurnStopStrategy(turn_analyzer=analyzer)
        async with replay(stop) as (aggregator, context, _, send):
            order = []
            aggregator.broadcast_interruption.side_effect = lambda: order.append('interrupt')
            aggregator.push_frame.side_effect = lambda *args: order.append('infer')
            await send(VADUserStartedSpeakingFrame())
            await send(VADUserStoppedSpeakingFrame())
            await send(TranscriptionFrame('My name is', '', '', finalized=True))
            # Let the injected STT timeout expire: incomplete still blocks inference.
            await asyncio.sleep(0.01)
            assert order == ['interrupt']
            assert context.messages == []
            await send(VADUserStartedSpeakingFrame())
            await send(VADUserStoppedSpeakingFrame())
            await send(TranscriptionFrame('Sam.', '', '', finalized=True))
            assert order == ['interrupt', 'infer']
            assert context.messages == [{'role': 'user', 'content': 'My name is Sam.'}]
    asyncio.run(run())


def test_final_without_vad_completes_with_default_stop_behavior():
    async def run():
        analyzer = Mock(cleanup=AsyncMock())
        stop = TurnAnalyzerUserTurnStopStrategy(turn_analyzer=analyzer)
        async with replay(stop) as (aggregator, context, _, send):
            order = []
            aggregator.broadcast_interruption.side_effect = lambda: order.append('interrupt')
            aggregator.push_frame.side_effect = lambda *args: order.append('infer')
            await send(TranscriptionFrame('Yes.', '', '', finalized=True))
            await asyncio.sleep(0.01)
            assert order == ['interrupt', 'infer']
            assert context.messages == [{'role': 'user', 'content': 'Yes.'}]
    asyncio.run(run())
