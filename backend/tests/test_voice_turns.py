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


@asynccontextmanager
async def replay(stop=None, timeout=5):
    stop = stop or BaseUserTurnStopStrategy()

    context = LLMContext()
    with patch('pipecat.turns.user_turn_strategies.default_user_turn_stop_strategies',
               return_value=[stop]) as default_stop:
        # Match bot.py: use the original Pipecat start strategies unchanged.
        aggregator = LLMUserAggregator(context, params=LLMUserAggregatorParams(
            user_turn_stop_timeout=timeout,
        ))
        default_stop.assert_called_once_with()
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


@pytest.mark.parametrize('playing', [False, True])
@pytest.mark.parametrize('signal', ['vad', 'interim', 'final'])
def test_original_start_signals_interrupt_before_turn_completion(playing, signal):
    async def run():
        async with replay() as (aggregator, context, stop, send):
            for answer in ['Yes.', 'Yes.', 'Checkup.', 'Actually, my name is Sam.']:
                reply = asyncio.get_running_loop().create_future()
                aggregator.broadcast_interruption.side_effect = reply.cancel
                before = aggregator.broadcast_interruption.await_count
                if playing:
                    await send(BotStartedSpeakingFrame())
                if signal == 'vad':
                    await send(VADUserStartedSpeakingFrame())
                elif signal == 'interim':
                    # Speech missed by VAD still interrupts before finalization.
                    await send(InterimTranscriptionFrame(answer, '', ''))
                else:
                    await send(TranscriptionFrame(answer, '', ''))
                assert reply.cancelled()
                if signal != 'final':
                    await send(TranscriptionFrame(answer, '', ''))
                await send(InterimTranscriptionFrame(answer, '', ''))
                assert aggregator.broadcast_interruption.await_count == before + 1
                await stop.trigger_user_turn_stopped()
            assert [m['content'] for m in context.messages] == [
                'Yes.', 'Yes.', 'Checkup.', 'Actually, my name is Sam.',
            ]
    asyncio.run(run())


def test_original_defaults_also_interrupt_on_late_partial():
    # Baseline limitation, not a claim that stale-partial protection is retained.
    async def run():
        async with replay() as (aggregator, context, stop, send):
            await send(TranscriptionFrame('Book please.', '', ''))
            await stop.trigger_user_turn_stopped()
            aggregator.broadcast_interruption.reset_mock()
            await send(InterimTranscriptionFrame('Book please.', '', ''))
            aggregator.broadcast_interruption.assert_awaited_once()
            assert context.messages == [{'role': 'user', 'content': 'Book please.'}]
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
