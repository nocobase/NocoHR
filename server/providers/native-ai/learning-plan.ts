import type {
  OnlineAgentService,
  OnlineAgentContext,
} from '@nocobase/app-plugin-agents/server/online-agent';
import { z } from 'zod';
import { assertUnrestrictedNativeAIEntry } from './access.js';

/** One native background execution; no legacy model selection, text guessing or compatibility retry. */
export async function generateLearningPlan<T>(
  online: OnlineAgentService,
  actor: OnlineAgentContext,
  prompt: string,
  schema: z.ZodType<T>,
) {
  assertUnrestrictedNativeAIEntry(actor.authorization);
  const session = await online.background(actor, {
    scope: ['hr.learningPlans'],
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
