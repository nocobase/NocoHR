import type {
  OnlineAgentService,
  OnlineAgentContext,
} from '@nocobase/app-plugin-agents/server/online-agent';
import { z } from 'zod';
import { assertUnrestrictedNativeAIEntry } from './access.js';

/** Consume one native structured execution; the official service owns validation, storage and finalization. */
export async function generateStructuredResult<T>(
  online: OnlineAgentService,
  actor: OnlineAgentContext,
  prompt: string,
  schema: z.ZodType<T>,
  scope: string,
) {
  assertUnrestrictedNativeAIEntry(actor.authorization);
  const session = await online.background(actor, {
    scope: [scope],
    tool: [],
  });
  await session.run(
    [{ role: 'user', content: prompt }],
    z.toJSONSchema(schema, { target: 'draft-7' }) as Parameters<
      typeof session.run
    >[1],
  );
  const result = await session.get();
  return { data: schema.parse(result), sessionId: session.sessionId };
}
