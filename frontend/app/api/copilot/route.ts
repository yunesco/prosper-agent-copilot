import { createUIMessageStream, createUIMessageStreamResponse, toUIMessageStream } from 'ai';
import { parseCopilotRequest, reviewBehavior, startCopilot, type CopilotMessage } from '@/lib/copilot/server';
export async function POST(request: Request) {
  let input;
  try {
    input = await parseCopilotRequest(await request.json());
  } catch {
    return new Response('Invalid Copilot request. Check saved guidelines and selected context.', {
      status: 400,
    });
  }
  if (!process.env.OPENAI_API_KEY)
    return new Response(
      'Copilot is not configured. Set OPENAI_API_KEY in backend/.env and restart the web server.',
      { status: 503 },
    );
  return createUIMessageStreamResponse({
    stream: createUIMessageStream<CopilotMessage>({
      onError: () => 'Copilot could not complete this request. Retry; your saved agent is unchanged.',
      execute: async ({ writer }) => {
        if (input.intent === 'review') {
          writer.write({ type: 'start' });
          const { review } = await reviewBehavior(input, { signal: request.signal });
          writer.write({ type: 'data-review', data: review });
          writer.write({ type: 'text-start', id: 'review-summary' });
          writer.write({ type: 'text-delta', id: 'review-summary', delta: review.summary });
          writer.write({ type: 'text-end', id: 'review-summary' });
          writer.write({ type: 'finish' });
        } else {
          const result = await startCopilot(input, { signal: request.signal });
          writer.merge(toUIMessageStream({ stream: result.stream }));
        }
      },
    }),
  });
}
