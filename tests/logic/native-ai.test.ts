// @vitest-environment node
import { runWeeklyBriefs } from '../../server/providers/hr/maintenance.js';
import {
  platformToken,
  insightServiceToken,
  licensedServicesToken,
  talentReviewServicesToken,
} from '../../server/providers/hr/tokens.js';
import { createNativeStructuredAI } from '../../server/providers/native-ai/structured.js';
import {
  personnelSettingsToken,
  settingsDraftServiceToken,
} from '../../server/providers/hr/tokens.js';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { registerHooks } from 'node:module';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '@nocobase/app-testing/server';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server/tokens';
import { learningCoachResource } from '../../server/providers/hr/training-resources.js';
import {
  frameworkAdvisorResource,
  aiAssistantResource,
} from '../../server/providers/hr/authz-resources.js';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import {
  automationServiceToken,
  automationTasksToken,
} from '../../server/providers/hr/tokens.js';
import { hrCoreServiceToken } from '../../server/providers/hr/tokens.js';
import { z } from 'zod';
import { createStandaloneServer } from '../../server/standalone.js';
import { scopeForUser } from '../../server/providers/hr/authorize.js';
import { generateLearningPlan } from '../../server/providers/native-ai/learning-plan.js';

// Historical application seeds use Node's source loader, outside Vitest transforms.
const loader = registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ERR_MODULE_NOT_FOUND' &&
        specifier.startsWith('.') &&
        specifier.endsWith('.js') &&
        (context.parentURL ?? '').replace(/[?#].*$/u, '').endsWith('.ts') &&
        !context.parentURL.includes('/node_modules/')
      )
        return next(specifier.slice(0, -3) + '.ts', context);
      throw error;
    }
  },
});
let app: TestApp;
let text = 'Native fixture reply';
let calls = 0;
const requests: { tools?: unknown[]; messages?: unknown[] }[] = [];
let tool: { name: string; args: string } | undefined;
let hold = false;
let heldStream: { opened(): void; closed(): void } | undefined;
let fail = false;
const model = createServer(async (req, res) => {
  let raw = '';
  for await (const part of req) raw += part;
  const input = JSON.parse(raw) as { stream?: boolean; tools?: unknown[] };
  requests.push(input);
  calls++;
  if (fail) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        error: {
          message: 'Controlled model rejection',
          type: 'authentication_error',
        },
      }),
    );
    return;
  }
  const selectedTool = tool;
  tool = undefined;
  const message = { role: 'assistant', content: text };
  if (input.stream) {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const chunk = (delta: unknown, finish_reason: string | null = null) =>
      res.write(
        `data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
      );
    if (selectedTool) {
      chunk({
        role: 'assistant',
        tool_calls: [
          {
            index: 0,
            id: 'controlled-call',
            type: 'function',
            function: { name: selectedTool.name, arguments: selectedTool.args },
          },
        ],
      });
      chunk({}, 'tool_calls');
    } else {
      chunk(message);
    }
    if (hold) {
      res.once('close', () => heldStream?.closed());
      heldStream?.opened();
      return;
    }
    chunk({}, 'stop');
    res.end('data: [DONE]\n\n');
  } else {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'fixture',
        object: 'chat.completion',
        created: 1,
        model: 'fixture',
        choices: [{ index: 0, message, finish_reason: 'stop' }],
        usage: { prompt_tokens: 2, completion_tokens: 3 },
      }),
    );
  }
});
let actor: Awaited<ReturnType<typeof actorContext>>;
async function actorContext(id: string) {
  return {
    user: { id },
    authorization: await scopeForUser(
      app.application.container.resolve(authorizationToken),
      id,
    ),
    credentials: { kind: 'controlled-test', userId: id },
  };
}
async function cost<T>(name: string, action: () => Promise<T>) {
  const sql: string[] = [];
  const client = await app.connection.client<{
    on(event: string, callback: (q: { sql: string }) => void): void;
    removeListener(event: string, callback: (q: { sql: string }) => void): void;
  }>();
  const listener = (q: { sql: string }) => sql.push(q.sql);
  const before = calls;
  client.on('query', listener);
  try {
    return await action();
  } finally {
    client.removeListener('query', listener);
    process.stdout.write(
      'NATIVE_AI_COST ' +
        JSON.stringify({
          name,
          modelRequests: calls - before,
          ...Object.fromEntries(
            ['select', 'insert', 'update', 'delete', 'begin', 'commit'].map(
              (verb) => [
                verb,
                sql.filter((q) => new RegExp('^' + verb + '\\b', 'i').test(q))
                  .length,
              ],
            ),
          ),
        }) +
        '\n',
    );
  }
}
beforeAll(async () => {
  await new Promise<void>((resolve) => model.listen(0, '127.0.0.1', resolve));
  app = await createTestApp({
    createServer: createStandaloneServer,
    server: { env: { HR_DEMO_SEED: 'false' } },
    config: {
      auth: { secret: randomBytes(32).toString('hex') },
      secrets: {
        keys: [{ version: 1, key: randomBytes(32).toString('base64') }],
      },
      i18n: { defaultLocale: 'en-US' },
    },
  });
  const login = await app.request('/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ username: 'nocobase', password: 'admin123' }),
  });
  if (login.status !== 200) throw new Error('Native fixture sign-in failed');
  const identity = (await login.json()) as { user: { id: string } };
  actor = await actorContext(identity.user.id);
  const stamp = { createdAt: new Date(), updatedAt: new Date() };
  await app.connection.repository('departments').createOne({
    values: {
      id: 'controlled-team',
      title: 'Controlled team',
      active: true,
      sortOrder: 0,
      ...stamp,
    },
  });
  await app.connection.repository('employees').createOne({
    values: {
      id: 'controlled-person',
      employeeNo: 'controlled-person',
      name: 'Controlled employee',
      userId: actor.user.id,
      departmentId: 'controlled-team',
      status: 'active',
      employmentType: 'fullTime',
      syncLocked: false,
      address: 'Original address',
      ...stamp,
    },
  });
  const services =
    app.application.container.resolve(agentsToken).models.services;
  const address = model.address();
  if (!address || typeof address === 'string') throw new Error('model address');
  await services.create({
    title: 'Controlled fixture',
    provider: 'openai-compatible',
    apiKey: 'synthetic-key',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    models: [{ value: 'fixture' }],
  });
}, 60_000);
afterAll(async () => {
  await app?.close();
  model.closeAllConnections();
  await new Promise<void>((resolve) => model.close(() => resolve()));
  loader.deregister();
});

describe('native AI application composition', () => {
  it('owns new realtime history and restores it without another model call', async () => {
    const online = app.application.container.resolve(agentsToken).onlineAgent;
    const session = await cost('create', () => online.realtime(actor));
    await cost('send', async () => {
      await session.send([{ role: 'user', content: 'Hello' }]);
      await Array.fromAsync(await session.receive());
    });
    const history = await cost('history', () => session.history());
    expect(JSON.stringify(history)).toContain('Native fixture reply');
    const before = calls;
    const reopened = await cost('reopen', () =>
      online.realtime(actor, {
        sessionId: session.sessionId,
      }),
    );
    expect(await reopened.history()).toEqual(history);
    expect(calls).toBe(before);
  });
  it('reads the signed-in employee through the native tool without exposing private profile fields', async () => {
    const online = app.application.container.resolve(agentsToken).onlineAgent;
    const session = await online.realtime(actor);
    tool = { name: 'getMyHrProfile', args: '{}' };
    await session.send([{ role: 'user', content: 'Read my own HR profile.' }]);
    const stream = await session.receive();
    if (stream) await Array.fromAsync(stream);
    const history = await session.history();
    const part = history
      .flatMap((message) => message.parts)
      .find((part) => part.type === 'tool-getMyHrProfile');
    expect(part).toMatchObject({
      state: 'output-available',
      output: {
        status: 'success',
        content: { linked: true, name: 'Controlled employee' },
      },
    });
    expect(JSON.stringify(history)).not.toContain('Original address');
  });
  it('generates a validated background draft and never treats text as a structured result', async () => {
    const online = app.application.container.resolve(agentsToken).onlineAgent;
    expect(
      (
        await cost('background-defaults', () =>
          app.application.container
            .resolve(agentsToken)
            .models.services.defaults(),
        )
      ).effectiveChat,
    ).toBeTruthy();
    const schema = z.object({
      summary: z.string(),
      items: z
        .array(
          z.object({
            type: z.enum(['course', 'learningPath', 'exam', 'practice']),
            refId: z.string(),
            competencyId: z.string(),
            reason: z.string().min(1),
            dueInDays: z.number(),
          }),
        )
        .min(1),
    });
    const draft = {
      summary: 'Controlled learning draft',
      items: [
        {
          type: 'course',
          refId: 'course',
          competencyId: 'competency',
          reason: 'Closes the measured gap',
          dueInDays: 14,
        },
      ],
    };
    text = JSON.stringify(draft);
    const result = await cost('background-success', () =>
      generateLearningPlan(online, actor, 'Draft a learning plan.', schema),
    );
    expect(requests.at(-1)?.tools ?? []).toHaveLength(0);
    expect(result.data).toEqual(draft);
    const reopened = await online.background(actor, {
      sessionId: result.sessionId,
    });
    expect(await reopened.get()).toEqual(result.data);
    text = 'Unstructured model reply';
    await expect(
      cost('background-invalid', () =>
        generateLearningPlan(online, actor, 'Draft a learning plan.', schema),
      ),
    ).rejects.toMatchObject({ code: 'OUTPUT_INVALID' });
  });
  it.each(['valid', 'invalid'] as const)(
    'uses the production learning connection from model selection to stored draft: %s',
    async (output) => {
      const db = app.connection;
      const container = app.application.container;
      const stamp = { createdAt: new Date(), updatedAt: new Date() };
      const suffix = 'learning-' + output;
      const owner = await container.resolve(userManagementServiceToken).create({
        name: 'Controlled learning manager',
        username: 'manager_' + output,
        email: 'manager_' + output + '@example.invalid',
        password: randomBytes(24).toString('hex'),
      });
      const authz = container.resolve(authorizationToken);
      await authz.permissionSets.create({
        key: suffix,
        grants: [
          learningCoachResource.reference().grant({
            use: {
              employees: 'talent.managedDepartments',
              learningPlans: 'allRecords',
            },
            configure: {
              aiAutomationSettings: 'allRecords',
              aiTaskRuns: 'allRecords',
              aiTaskRunItems: 'allRecords',
            },
          }),
        ],
      });
      await authz.permissionSets.assign({
        subject: { type: 'user', id: owner.id },
        permissionSet: suffix,
      });
      await db.repository('departments').createOne({
        values: {
          id: suffix,
          title: 'Controlled learning department',
          active: true,
          sortOrder: 0,
          managerId: owner.id,
          ...stamp,
        },
      });
      await db.repository('employees').createOne({
        values: {
          id: suffix + '-manager',
          employeeNo: suffix + '-manager',
          name: 'Controlled learning manager',
          userId: owner.id,
          departmentId: suffix,
          status: 'active',
          employmentType: 'fullTime',
          syncLocked: false,
          ...stamp,
        },
      });
      await db.repository('jobFamilies').createOne({
        values: {
          id: suffix,
          code: suffix,
          title: 'Controlled family',
          active: true,
          sortOrder: 0,
          ...stamp,
        },
      });
      await db.repository('positions').createOne({
        values: {
          id: suffix,
          code: suffix,
          title: 'Controlled position',
          jobFamilyId: suffix,
          departmentId: suffix,
          active: true,
          sortOrder: 0,
          isKey: false,
          ...stamp,
        },
      });
      await db.repository('competencies').createOne({
        values: {
          id: suffix,
          code: suffix,
          title: 'Controlled skill',
          category: 'skill',
          maxLevel: 5,
          source: 'manual',
          reviewStatus: 'confirmed',
          active: true,
          ...stamp,
        },
      });
      await db.repository('positionRequirements').createOne({
        values: {
          id: suffix,
          positionId: suffix,
          competencyId: suffix,
          requiredLevel: 3,
          mandatory: true,
          source: 'manual',
          reviewStatus: 'confirmed',
          ...stamp,
        },
      });
      await db.repository('employees').createOne({
        values: {
          id: suffix,
          employeeNo: suffix,
          name: 'Controlled learner',
          departmentId: suffix,
          positionId: suffix,
          status: 'active',
          employmentType: 'fullTime',
          syncLocked: false,
          ...stamp,
        },
      });
      await db.repository('employees').createOne({
        values: {
          id: suffix + '-outside',
          employeeNo: suffix + '-outside',
          name: 'Out-of-scope controlled learner',
          departmentId: 'controlled-team',
          positionId: suffix,
          status: 'active',
          employmentType: 'fullTime',
          syncLocked: false,
          ...stamp,
        },
      });
      await db.repository('employeeCompetencies').createOne({
        values: {
          id: suffix + '-outside',
          employeeId: suffix + '-outside',
          competencyId: suffix,
          level: 1,
          source: 'manual',
          assessedBy: actor.user.id,
          assessedAt: new Date(),
          ...stamp,
        },
      });
      await db.repository('courses').createOne({
        values: {
          id: suffix,
          title: 'Controlled course',
          ownerUserId: actor.user.id,
          source: 'manual',
          reviewStatus: 'confirmed',
          published: true,
          active: true,
          deliveryMode: 'online',
          kind: 'course',
          version: 1,
          locale: 'en-US',
          ...stamp,
        },
      });
      await db.repository('courseCompetencies').createOne({
        values: {
          id: suffix,
          courseId: suffix,
          competencyId: suffix,
          ...stamp,
        },
      });
      const ctx = { userId: actor.user.id, authz: actor.authorization };
      await db.repository('employeeCompetencies').createOne({
        values: {
          id: suffix,
          employeeId: suffix,
          competencyId: suffix,
          level: 1,
          source: 'manual',
          assessedBy: owner.id,
          assessedAt: new Date(),
          ...stamp,
        },
      });
      await container
        .resolve(automationServiceToken)
        .update(ctx, 'learningCoach.gapPlans', {
          enabled: true,
          ownerUserId: owner.id,
        });
      const draft = {
        summary: 'Controlled native draft',
        items: [
          {
            type: 'course',
            refId: suffix,
            competencyId: suffix,
            reason: 'Closes the known gap',
            dueInDays: 14,
          },
        ],
      };
      text =
        output === 'valid'
          ? JSON.stringify(draft)
          : 'Unstructured native result';
      const online = container.resolve(agentsToken).onlineAgent;
      const originalBackground = online.background.bind(online);
      let sessionId: string | undefined;
      const background = vi
        .spyOn(online, 'background')
        .mockImplementation(async (...args) => {
          const session = await originalBackground(...args);
          sessionId = session.sessionId;
          return session;
        });
      const before = calls;
      const beforeAssignments = await db.repository('assignments').count();
      try {
        const result = await cost('learning-production-' + output, () =>
          container
            .resolve(automationTasksToken)
            .runScheduled('learningCoach.gapPlans', 'manual'),
        );
        expect(result.status).toBe('succeeded');
        expect(calls - before).toBe(1);
        expect(background).toHaveBeenCalledOnce();
        expect(background.mock.calls[0]?.[0].user.id).toBe(owner.id);
        expect(requests.at(-1)?.tools ?? []).toHaveLength(0);
        const plans = await db
          .repository('learningPlans')
          .findMany({ filter: { employeeId: suffix } });
        expect(plans).toHaveLength(1);
        expect(plans[0]?.summary).toEqual(
          output === 'valid'
            ? draft.summary
            : expect.stringContaining('Controlled learner'),
        );
        const items =
          typeof plans[0]?.items === 'string'
            ? JSON.parse(plans[0].items)
            : plans[0]?.items;
        expect(items).toMatchObject([
          { type: 'course', refId: suffix, competencyId: suffix },
        ]);
        expect(
          await db
            .repository('learningPlans')
            .count({ filter: { employeeId: suffix + '-outside' } }),
        ).toBe(0);
        expect(plans[0]).toMatchObject({
          status: 'draft',
          reviewerUserId: owner.id,
          source: 'ai',
        });
        expect(await db.repository('assignments').count()).toBe(
          beforeAssignments,
        );
        expect(
          await db
            .repository('assignments')
            .count({ filter: { employeeId: suffix } }),
        ).toBe(0);
        const run = await db
          .repository('aiTaskRuns')
          .findOne({ filter: { id: result.runId } });
        expect(run).toMatchObject({
          status: 'succeeded',
          fallback: output === 'invalid',
        });
        expect(run?.conversationSessionId).toBe(
          output === 'valid' ? sessionId : null,
        );
        const native = await container
          .resolve(agentsToken)
          .conversations.get(owner.id, sessionId!);
        expect(native.execution?.outcome).toBe(
          output === 'valid' ? 'completed' : 'failed',
        );
        expect(
          await db
            .repository('aiTaskRunItems')
            .count({ filter: { runId: result.runId } }),
        ).toBe(1);
      } finally {
        background.mockRestore();
      }
    },
  );
  it('rejects a different owner before replaying history or running a model', async () => {
    const online = app.application.container.resolve(agentsToken).onlineAgent;
    const session = await online.realtime(actor);
    const before = calls;
    await expect(
      online.realtime(await actorContext('different-owner'), {
        sessionId: session.sessionId,
      }),
    ).rejects.toThrow();
    expect(calls).toBe(before);
  });
  it.each([true, false])(
    'binds native approval and does not repeat an approved business request (%s)',
    async (approved) => {
      text = 'The profile change has been considered.';
      const container = app.application.container;
      const original = container.resolve(hrCoreServiceToken);
      const operation = vi.spyOn(original, 'requestProfileChange');
      const beforeRequests = await app.connection
        .repository('profileChangeRequests')
        .count();
      try {
        const online = container.resolve(agentsToken).onlineAgent;
        const session = await online.realtime(actor);
        tool = {
          name: 'submitMyProfileChange',
          args: '{"changes":{"address":"Controlled address"}}',
        };
        await session.send([
          { role: 'user', content: 'Please request an address correction.' },
        ]);
        await Array.fromAsync((await session.receive())!);
        const history = await session.history();
        const message = history.at(-1)!;
        const part = message.parts.find(
          (p) => 'approval' in p && p.approval?.id,
        );
        if (
          !part ||
          !('approval' in part) ||
          !part.approval ||
          !message.metadata?.executionId
        )
          throw new Error('Missing native approval binding');
        expect(operation.mock.calls.length).toBe(0);
        const input = {
          messageId: message.id,
          executionId: message.metadata.executionId,
          approval: { id: part.approval.id, approved },
        };
        await expect(
          session.approve({ ...input, executionId: 'wrong-execution' }),
        ).rejects.toThrow();
        expect(operation.mock.calls.length).toBe(0);
        await cost(approved ? 'approval' : 'rejection', async () => {
          await session.approve(input);
          const stream = await session.receive();
          if (stream) await Array.fromAsync(stream);
        });
        expect(operation.mock.calls.length).toBe(approved ? 1 : 0);
        const before = calls;
        await expect(session.approve(input)).rejects.toThrow();
        expect(operation.mock.calls.length).toBe(approved ? 1 : 0);
        expect(calls).toBe(before);
        const reopened = await online.realtime(actor, {
          sessionId: session.sessionId,
        });
        expect(await reopened.history()).toEqual(await session.history());
        expect(calls).toBe(before);
        await reopened.send([
          {
            role: 'user',
            content: 'Follow up without repeating that request.',
          },
        ]);
        const followup = await reopened.receive();
        if (followup) await Array.fromAsync(followup);
        expect(operation.mock.calls.length).toBe(approved ? 1 : 0);
        expect(calls).toBe(before + 1);
        expect(
          await app.connection.repository('profileChangeRequests').count(),
        ).toBe(beforeRequests + (approved ? 1 : 0));
        if (approved) {
          expect(
            await app.connection
              .repository('profileChangeRequests')
              .findOne({ filter: { employeeId: 'controlled-person' } }),
          ).toMatchObject({ status: 'pending', source: 'assistant' });
        }
        expect(
          await app.connection
            .repository('employees')
            .findOne({ filter: { id: 'controlled-person' } }),
        ).toMatchObject({ address: 'Original address' });
      } finally {
        operation.mockRestore();
      }
    },
  );
  it('persists a failed native execution without replaying it on reopen', async () => {
    fail = true;
    const online = app.application.container.resolve(agentsToken).onlineAgent;
    const session = await online.realtime(actor);
    try {
      await cost('model-failure', async () => {
        await session.send([{ role: 'user', content: 'Controlled failure' }]);
        const stream = await session.receive();
        if (stream) await Array.fromAsync(stream);
      });
      expect(await session.status()).toBe('idle');
      const history = await session.history();
      const saved = await app.application.container
        .resolve(agentsToken)
        .conversations.get(actor.user.id, session.sessionId);
      expect(saved.execution).toMatchObject({
        status: 'idle',
        outcome: 'failed',
      });
      const before = calls;
      const reopened = await online.realtime(actor, {
        sessionId: session.sessionId,
      });
      expect(await reopened.history()).toEqual(history);
      expect(calls).toBe(before);
    } finally {
      fail = false;
    }
  });
  it('reauthorizes a pending tool after its business grant is revoked', async () => {
    const container = app.application.container;
    const authz = container.resolve(authorizationToken);
    const password = randomBytes(24).toString('hex');
    const user = await container.resolve(userManagementServiceToken).create({
      name: 'Controlled employee',
      username: 'controlled_employee',
      email: 'controlled@example.invalid',
      password,
    });
    expect((await app.request('/agents/services')).status).toBe(401);
    const login = await app.request('/auth/sign-in/username', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ username: 'controlled_employee', password }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    expect(
      (await app.request('/agents/services', { headers: { cookie } })).status,
    ).toBe(403);
    await authz.permissionSets.create({
      key: 'controlled-native-ai',
      grants: [
        aiAssistantResource
          .reference()
          .grant({ use: { employees: 'allRecords' } }),
      ],
    });
    const assignment = await authz.permissionSets.assign({
      subject: { type: 'user', id: user.id },
      permissionSet: 'controlled-native-ai',
    });
    const core = container.resolve(hrCoreServiceToken);
    const operation = vi.spyOn(core, 'requestProfileChange');
    try {
      const online = container.resolve(agentsToken).onlineAgent;
      const session = await online.realtime(await actorContext(user.id));
      tool = {
        name: 'submitMyProfileChange',
        args: '{"changes":{"address":"Controlled address"}}',
      };
      await session.send([{ role: 'user', content: 'Request a correction' }]);
      await Array.fromAsync((await session.receive())!);
      const message = (await session.history()).at(-1)!;
      const part = message.parts.find((p) => 'approval' in p && p.approval?.id);
      if (
        !part ||
        !('approval' in part) ||
        !part.approval ||
        !message.metadata?.executionId
      )
        throw new Error('Missing approval');
      await authz.permissionSets.revoke(assignment.id);
      await cost('revoked-tool', async () => {
        await session.approve({
          messageId: message.id,
          executionId: message.metadata!.executionId!,
          approval: { id: part.approval!.id, approved: true },
        });
        const stream = await session.receive();
        if (stream) await Array.fromAsync(stream);
      });
      expect(operation).not.toHaveBeenCalled();
      expect(JSON.stringify(await session.history())).toContain('output-error');
    } finally {
      operation.mockRestore();
    }
  });
  it.each(
    (
      [
        'realtime-read',
        'background-read',
        'restored-read',
        'realtime-write',
        'restored-write',
      ] as const
    ).flatMap((path) =>
      [false, true].map((allowsUse) => ({ path, allowsUse })),
    ),
  )(
    'refuses restricted service credentials before rebuilding HR identity: $path / use=$allowsUse',
    async ({ path, allowsUse }) => {
      const container = app.application.container;
      const authorization = container.resolve(authorizationToken);
      const restricted = authorization.for({
        ...actor.authorization.identity,
        keyScope: {
          keyId: 'controlled-restricted-entry',
          allows: (resource, action) =>
            allowsUse &&
            resource.type === 'composite' &&
            resource.id === 'talent.aiAssistant' &&
            action === 'use',
          objects: () => [],
          permissions: allowsUse
            ? [
                {
                  resource: { type: 'composite', id: 'talent.aiAssistant' },
                  actions: ['use'],
                },
              ]
            : [],
        },
      });
      expect(
        (
          await restricted.authorize({
            resource: { type: 'composite', id: 'talent.aiAssistant' },
            action: 'use',
          })
        ).effect === 'deny',
      ).toBe(!allowsUse);
      const entry = { ...actor, authorization: restricted };
      const core = container.resolve(hrCoreServiceToken);
      const read = vi.spyOn(core, 'myHrProfile');
      const write = vi.spyOn(core, 'requestProfileChange');
      const subjects = vi.spyOn(authorization.subjects, 'resolveFor');
      const online = container.resolve(agentsToken).onlineAgent;
      const beforeRequests = await app.connection
        .repository('profileChangeRequests')
        .count();
      try {
        const reading = path.endsWith('read');
        tool = reading
          ? { name: 'getMyHrProfile', args: '{}' }
          : {
              name: 'submitMyProfileChange',
              args: '{"changes":{"address":"Restricted proposal"}}',
            };
        if (path === 'background-read') {
          const session = await online.background(entry);
          await cost('restricted-background-read', async () => {
            await session.run(
              [
                {
                  role: 'user',
                  content: 'Read through a restricted service entry',
                },
              ],
              {
                type: 'object',
                properties: { ok: { type: 'boolean' } },
                required: ['ok'],
                additionalProperties: false,
              },
            );
            await session.try({ wait: 1000 });
          });
          expect(JSON.stringify(await session.history())).not.toContain(
            'Controlled employee',
          );
        } else {
          let session = await online.realtime(
            path.startsWith('restored-') ? actor : entry,
          );
          if (path === 'restored-read')
            session = await online.realtime(entry, {
              sessionId: session.sessionId,
            });
          await cost(
            'restricted-' + path + '-request-use-' + allowsUse,
            async () => {
              await session.send([
                { role: 'user', content: 'Use this restricted service entry' },
              ]);
              const stream = await session.receive();
              if (stream) await Array.fromAsync(stream);
            },
          );
          if (!reading) {
            const message = (await session.history()).at(-1)!;
            const part = message.parts.find(
              (p) => 'approval' in p && p.approval?.id,
            );
            if (
              !part ||
              !('approval' in part) ||
              !part.approval ||
              !message.metadata?.executionId
            )
              throw new Error('Missing approval');
            if (path === 'restored-write')
              session = await online.realtime(entry, {
                sessionId: session.sessionId,
              });
            await cost('restricted-' + path, async () => {
              await session.approve({
                messageId: message.id,
                executionId: message.metadata!.executionId!,
                approval: { id: part.approval!.id, approved: true },
              });
              const stream = await session.receive();
              if (stream) await Array.fromAsync(stream);
            });
          }
          const history = JSON.stringify(await session.history());
          expect(history).not.toContain('Controlled employee');
          expect(history).toContain('output-error');
        }
        expect(read).not.toHaveBeenCalled();
        expect(write).not.toHaveBeenCalled();
        expect(subjects).not.toHaveBeenCalled();
        expect(
          await app.connection.repository('profileChangeRequests').count(),
        ).toBe(beforeRequests);
      } finally {
        read.mockRestore();
        write.mockRestore();
        subjects.mockRestore();
      }
    },
  );
  it('refuses restricted learning entry before model selection or native persistence', async () => {
    const authorization = app.application.container.resolve(authorizationToken);
    const restricted = authorization.for({
      ...actor.authorization.identity,
      keyScope: {
        keyId: 'controlled-restricted-learning',
        allows: () => false,
        objects: () => [],
        permissions: [],
      },
    });
    const online = app.application.container.resolve(agentsToken).onlineAgent;
    const background = vi.spyOn(online, 'background');
    try {
      await expect(
        cost('restricted-learning-entry', () =>
          generateLearningPlan(
            online,
            { ...actor, authorization: restricted },
            'Restricted learning data',
            z.object({ ok: z.boolean() }),
          ),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(background).not.toHaveBeenCalled();
    } finally {
      background.mockRestore();
    }
  });
  it('never returns stored model credentials in service responses', async () => {
    const payload = JSON.stringify(
      await app.application.container
        .resolve(agentsToken)
        .models.services.list(),
    );
    expect(payload).not.toContain('synthetic-key');
    expect(payload).toContain('apiKeySet');
  });

  it.each([
    'valid',
    'no-model',
    'invalid',
    'model-failure',
    'timeout',
  ] as const)(
    'uses the production ordinary task connection with native output: %s',
    async (outcome) => {
      const container = app.application.container;
      const ctx = { userId: actor.user.id, authz: actor.authorization };
      await container
        .resolve(automationServiceToken)
        .update(ctx, 'frameworkAdvisor.dictionaryReview', {
          enabled: true,
          ownerUserId: actor.user.id,
        });
      // An ungraded position guarantees a review candidate, independently of demo content.
      const stamp = { createdAt: new Date(), updatedAt: new Date() };
      const suffix = 'native-dictionary-' + outcome;
      await app.connection.repository('jobFamilies').createOne({
        values: {
          id: suffix,
          code: suffix,
          title: 'Controlled review family',
          active: true,
          sortOrder: 0,
          ...stamp,
        },
      });
      await app.connection.repository('positions').createOne({
        values: {
          id: suffix,
          code: suffix,
          title: 'Controlled review position',
          jobFamilyId: suffix,
          active: true,
          sortOrder: 0,
          isKey: false,
          ...stamp,
        },
      });
      const position = await app.connection
        .repository('positions')
        .findOne({ filter: { id: suffix } });
      const services = container.resolve(agentsToken).models.services;
      const service = (await services.list())[0]!;
      text =
        outcome === 'valid'
          ? JSON.stringify({
              suggestions: [
                {
                  kind: 'position',
                  competencies: ['Controlled review position'],
                  suggestion: 'Ask its owner to review the grade',
                  reason: 'The grade is empty',
                },
              ],
            })
          : 'Invalid ordinary background output';
      if (outcome === 'no-model')
        await services.update(service.name, { enabled: false });
      fail = outcome === 'model-failure';
      hold = outcome === 'timeout';
      const opened = Promise.withResolvers<void>();
      const closed = Promise.withResolvers<void>();
      if (hold) heldStream = { opened: opened.resolve, closed: closed.resolve };
      const before = calls;
      const native = container.resolve(agentsToken).onlineAgent;
      const original = native.background.bind(native);
      let sessionId: string | undefined;
      let active: Awaited<ReturnType<typeof original>> | undefined;
      const background = vi
        .spyOn(native, 'background')
        .mockImplementation(async (...args) => {
          const session = await original(...args);
          sessionId = session.sessionId;
          active = session;
          if (outcome === 'timeout') {
            const observe = session.try.bind(session);
            vi.spyOn(session, 'try').mockImplementation((options) => {
              // Keep production composition and its 120 s default; shorten only
              // the official observation budget instead of waiting two minutes.
              expect(options?.wait).toBeGreaterThan(110_000);
              return observe({ wait: 300 });
            });
          }
          return session;
        });
      let finished = false;
      const pending = cost('ordinary-production-' + outcome, () =>
        container
          .resolve(automationTasksToken)
          .runScheduled('frameworkAdvisor.dictionaryReview', 'manual'),
      ).finally(() => {
        finished = true;
      });
      try {
        if (outcome === 'timeout') {
          await opened.promise;
          await vi.waitFor(() => expect(finished).toBe(true), {
            timeout: 2000,
          });
          await closed.promise;
          expect(await active!.status()).toBe('idle');
        }
        const result = await pending;
        expect(calls - before).toBe(outcome === 'no-model' ? 0 : 1);
        expect(result.status).toBe(
          outcome === 'model-failure' || outcome === 'timeout'
            ? 'failed'
            : 'succeeded',
        );
        const run = await app.connection
          .repository('aiTaskRuns')
          .findOne({ filter: { id: result.runId } });
        expect(run?.fallback).toBe(
          outcome === 'no-model' || outcome === 'invalid',
        );
        expect(run?.conversationSessionId).toBe(
          outcome === 'valid' ? sessionId : null,
        );
        if (outcome === 'timeout') {
          expect(run?.error).toBe('The operation timed out');
          expect(run?.finishedAt).toBeTruthy();
        }
        if (outcome === 'valid') {
          expect(JSON.stringify(run?.output)).toContain('Ask its owner');
          expect(requests.at(-1)?.tools ?? []).toHaveLength(0);
        }
        if (sessionId) {
          const saved = await container
            .resolve(agentsToken)
            .conversations.get(actor.user.id, sessionId);
          expect(saved.execution?.outcome).toBe(
            outcome === 'valid'
              ? 'completed'
              : outcome === 'timeout'
                ? 'cancelled'
                : 'failed',
          );
        }
        expect(
          await app.connection
            .repository('positions')
            .findOne({ filter: { id: suffix } }),
        ).toEqual(position);
      } finally {
        fail = false;
        hold = false;
        if (!finished) await active?.abort();
        await pending;
        heldStream = undefined;
        background.mockRestore();
        if (outcome === 'no-model')
          await services.update(service.name, { enabled: true });
      }
    },
  );
  it('refuses an ordinary production task after its owner loses the business grant', async () => {
    const container = app.application.container;
    const authz = container.resolve(authorizationToken);
    const user = await container.resolve(userManagementServiceToken).create({
      name: 'Controlled task owner',
      username: 'ordinary_owner',
      email: 'ordinary_owner@example.invalid',
      password: randomBytes(24).toString('hex'),
    });
    await app.connection.repository('employees').createOne({
      values: {
        id: 'ordinary-owner',
        employeeNo: 'ordinary-owner',
        name: 'Controlled task owner',
        userId: user.id,
        departmentId: 'controlled-team',
        status: 'active',
        employmentType: 'fullTime',
        syncLocked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await authz.permissionSets.create({
      key: 'ordinary-owner',
      grants: [
        frameworkAdvisorResource.reference().grant({
          use: { positions: 'allRecords', competencies: 'allRecords' },
          configure: {
            aiAutomationSettings: 'allRecords',
            aiTaskRuns: 'allRecords',
            aiTaskRunItems: 'allRecords',
          },
        }),
      ],
    });
    const assignment = await authz.permissionSets.assign({
      subject: { type: 'user', id: user.id },
      permissionSet: 'ordinary-owner',
    });
    const automation = container.resolve(automationServiceToken);
    const root = { userId: actor.user.id, authz: actor.authorization };
    await automation.update(root, 'frameworkAdvisor.dictionaryReview', {
      enabled: true,
      ownerUserId: user.id,
    });
    await authz.permissionSets.revoke(assignment.id);
    const before = calls;
    try {
      const result = await cost('ordinary-production-revoked', () =>
        container
          .resolve(automationTasksToken)
          .runScheduled('frameworkAdvisor.dictionaryReview', 'manual'),
      );
      expect(result.status).toBe('failed');
      expect(calls).toBe(before);
      const run = await app.connection
        .repository('aiTaskRuns')
        .findOne({ filter: { id: result.runId } });
      expect(run?.conversationSessionId).toBeNull();
      expect(run?.fallback).toBe(false);
    } finally {
      await automation.update(root, 'frameworkAdvisor.dictionaryReview', {
        ownerUserId: actor.user.id,
      });
    }
  });
  it.each(['checklist', 'observation', 'translation'] as const)(
    'refuses a restricted request before dispatching work as a stored owner: %s',
    async (path) => {
      const container = app.application.container;
      const authorization = container.resolve(authorizationToken).for({
        ...actor.authorization.identity,
        keyScope: {
          keyId: 'controlled-dispatch',
          allows: () => true,
          objects: () => [],
          permissions: null,
        },
      });
      const ctx = { userId: actor.user.id, authz: authorization };
      const service = container.resolve(talentReviewServicesToken);
      await expect(
        cost('restricted-dispatch-' + path, () =>
          path === 'checklist'
            ? service.draftChecklist(ctx, {})
            : path === 'observation'
              ? service.structureRecord(ctx, 'unknown')
              : service.translations.request(ctx, 'course', 'unknown'),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    },
  );
  it.each([
    'success',
    'empty',
    'invalid',
    'provider-failure',
    'unavailable',
  ] as const)(
    'preserves weekly brief facts and rule fallback through the actual native connection: %s',
    async (kind) => {
      const container = app.application.container;
      const platform = container.resolve(platformToken);
      const insights = container.resolve(insightServiceToken);
      const licensed = container.resolve(licensedServicesToken);
      const owner = await container.resolve(userManagementServiceToken).create({
        name: 'Controlled brief owner',
        username: 'brief_' + kind.replaceAll('-', '_'),
        email: 'brief_' + kind + '@example.invalid',
        password: randomBytes(24).toString('hex'),
      });
      await app.connection.repository('departments').createOne({
        values: {
          id: 'brief-' + kind,
          title: 'Controlled brief team',
          managerId: owner.id,
          active: true,
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      const facts = {
        newThisWeek: ['Synthetic member'],
        expiringSoon: [],
        expired: [],
        missing: [],
      };
      // Same business-facts boundary as the former isolated brief test, now with real native SDK/persistence.
      const weekly = vi
        .spyOn(insights, 'weeklyFacts')
        .mockImplementation(async (ctx) =>
          ctx.userId === owner.id ? facts : (undefined as never),
        );
      const lost = vi.spyOn(licensed, 'lostThisWeek').mockResolvedValue([]);
      const notify = vi.spyOn(platform, 'notify');
      const services = container.resolve(agentsToken).models.services;
      const service = (await services.list())[0]!;
      text = JSON.stringify(
        kind === 'success'
          ? { brief: 'A'.repeat(240) }
          : kind === 'empty'
            ? { brief: '  ' }
            : { wrong: true },
      );
      fail = kind === 'provider-failure';
      if (kind === 'unavailable')
        await services.update(service.name, { enabled: false });
      const before = calls;
      try {
        const result = await cost('weekly-native-' + kind, () =>
          runWeeklyBriefs(container, 'UTC'),
        );
        expect(result).toMatchObject({ sent: 1, fallback: kind !== 'success' });
        expect(calls - before).toBe(kind === 'unavailable' ? 0 : 1);
        expect(
          weekly.mock.calls.filter(([ctx]) => ctx.userId === owner.id),
        ).toHaveLength(1);
        const notification = notify.mock.calls.find(
          ([input]) => input.message === 'weeklyBrief',
        )?.[0];
        expect(notification).toMatchObject({
          userIds: [owner.id],
          params: {
            brief:
              kind === 'success'
                ? 'A'.repeat(200)
                : '本周新增持证 1 人：Synthetic member',
          },
        });
        if (kind !== 'unavailable')
          expect(JSON.stringify(requests.at(-1)?.messages)).toContain(
            'Synthetic member',
          );
        if (kind !== 'unavailable')
          expect(requests.at(-1)?.tools ?? []).toHaveLength(0);
      } finally {
        fail = false;
        weekly.mockRestore();
        lost.mockRestore();
        notify.mockRestore();
        if (kind === 'unavailable')
          await services.update(service.name, { enabled: true });
        await app.connection
          .repository('departments')
          .deleteOne({ filter: { id: 'brief-' + kind } });
      }
    },
  );
  it('rejects a scope-bearing ordinary generation entry before any model probe or persistence', async () => {
    const container = app.application.container;
    const authorization = container.resolve(authorizationToken).for({
      ...actor.authorization.identity,
      keyScope: {
        keyId: 'controlled-background-scope',
        allows: () => true,
        objects: () => [],
        permissions: null,
      },
    });
    const defaults = vi.spyOn(
      container.resolve(agentsToken).models.services,
      'defaults',
    );
    try {
      await expect(
        cost('ordinary-restricted-entry', () =>
          createNativeStructuredAI(container).structured({
            userId: actor.user.id,
            authorization,
            employee: 'frameworkAdvisor',
            title: 'Controlled background',
            prompt: 'No HR data',
            schema: z.object({ ok: z.boolean() }),
            timeZone: 'UTC',
          }),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(defaults).not.toHaveBeenCalled();
    } finally {
      defaults.mockRestore();
    }
  });
  it.each(['valid', 'invalid', 'restricted', 'revoked'] as const)(
    'uses the native settings tool without automatically applying configuration: %s',
    async (outcome) => {
      const container = app.application.container;
      const authz = container.resolve(authorizationToken);
      let entry = actor;
      if (outcome === 'restricted')
        entry = {
          ...actor,
          authorization: authz.for({
            ...actor.authorization.identity,
            keyScope: {
              keyId: 'controlled-settings-scope',
              allows: () => true,
              objects: () => [],
              permissions: null,
            },
          }),
        };
      if (outcome === 'revoked') {
        const user = await container
          .resolve(userManagementServiceToken)
          .create({
            name: 'Controlled settings administrator',
            username: 'native_settings',
            email: 'native_settings@example.invalid',
            password: randomBytes(24).toString('hex'),
          });
        await authz.permissionSets.create({
          key: 'native-settings-tool',
          grants: [authz.settings.grant('talent.hr', ['administer'])],
        });
        await authz.permissionSets.create({
          key: 'native-settings-entry',
          grants: [
            aiAssistantResource
              .reference()
              .grant({ use: { employees: 'allRecords' } }),
          ],
        });
        await authz.permissionSets.assign({
          subject: { type: 'user', id: user.id },
          permissionSet: 'native-settings-entry',
        });
        const assignment = await authz.permissionSets.assign({
          subject: { type: 'user', id: user.id },
          permissionSet: 'native-settings-tool',
        });
        entry = await actorContext(user.id);
        // The admitted actor still has its original subjects; tool execution must refresh them.
        await entry.authorization.require({
          resource: { type: 'settings', id: 'talent.hr' },
          action: 'administer',
        });
        await authz.permissionSets.revoke(assignment.id);
        const fresh = await actorContext(user.id);
        const decision = await fresh.authorization.authorize({
          resource: { type: 'composite', id: 'talent.aiAssistant' },
          action: 'use',
        });
        expect(decision.effect).not.toBe('deny');
        expect(decision.conditions).toHaveProperty('database.employees');
      }
      const settings = container.resolve(personnelSettingsToken);
      const drafts = container.resolve(settingsDraftServiceToken);
      const beforeSettings = await settings.read('reminders');
      const beforeRows = await app.connection
        .repository('settingsChangeLog')
        .count();
      const apply = vi.spyOn(settings, 'update');
      const draft = vi.spyOn(drafts, 'draft');
      tool = {
        name: 'draftSettingsChange',
        args: JSON.stringify({
          utterance: 'Controlled reminder proposal',
          items: [
            {
              type: 'setting',
              section: outcome === 'invalid' ? 'salary' : 'reminders',
              changes: { probationDays: 17 },
            },
          ],
        }),
      };
      try {
        const session = await container
          .resolve(agentsToken)
          .onlineAgent.realtime(entry);
        await cost('settings-native-' + outcome, async () => {
          await session.send([
            {
              role: 'user',
              content: 'Draft a reminder change. Keep it pending my review.',
            },
          ]);
          const stream = await session.receive();
          if (stream) await Array.fromAsync(stream);
        });
        expect(apply).not.toHaveBeenCalled();
        expect(await settings.read('reminders')).toEqual(beforeSettings);
        expect(
          await app.connection.repository('settingsChangeLog').count(),
        ).toBe(beforeRows + (outcome === 'valid' ? 1 : 0));
        expect(draft).toHaveBeenCalledTimes(
          outcome === 'valid' || outcome === 'revoked' ? 1 : 0,
        );
        const history = JSON.stringify(await session.history());
        if (outcome === 'invalid') {
          // SDK input validation rejects malformed arguments before the adapter. Public history omits that invalid tool part.
          expect(history).not.toContain('/settings/personnel');
          expect(history).not.toContain('output-available');
        } else
          expect(history).toContain(
            outcome === 'valid' ? '/settings/personnel' : 'output-error',
          );
        if (outcome === 'valid') {
          const changes = await drafts.list({
            authz: actor.authorization,
            userId: actor.user.id,
          });
          expect(changes[0]).toMatchObject({
            status: 'draft',
            items: [{ status: 'draft' }],
          });
        }
      } finally {
        apply.mockRestore();
        draft.mockRestore();
      }
    },
  );
  it.each(['deadline', 'caller'] as const)(
    'finalizes a stalled ordinary generation before rejecting: %s',
    async (kind) => {
      const online = app.application.container.resolve(agentsToken).onlineAgent;
      const original = online.background.bind(online);
      let active: Awaited<ReturnType<typeof original>> | undefined;
      const background = vi
        .spyOn(online, 'background')
        .mockImplementation(async (...args) => {
          active = await original(...args);
          return active;
        });
      const opened = Promise.withResolvers<void>();
      const closed = Promise.withResolvers<void>();
      heldStream = { opened: opened.resolve, closed: closed.resolve };
      hold = true;
      text = '{"ok":true}';
      const controller = new AbortController();
      const reason = new Error('Controlled caller cancellation');
      const add = vi.spyOn(controller.signal, 'addEventListener');
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      let finished = false;
      let rejection: unknown;
      const before = calls;
      const pending = cost('ordinary-stalled-' + kind, () =>
        createNativeStructuredAI(app.application.container).structured({
          employee: 'controlled',
          userId: actor.user.id,
          authorization: actor.authorization,
          title: 'Stalled generation',
          prompt: 'Return JSON',
          schema: z.object({ ok: z.boolean() }),
          timeZone: 'UTC',
          timeoutMs: kind === 'deadline' ? 500 : 120_000,
          signal: controller.signal,
        }),
      ).then(
        () => {
          finished = true;
        },
        (error: unknown) => {
          rejection = error;
          finished = true;
        },
      );
      try {
        await opened.promise;
        if (kind === 'caller') controller.abort(reason);
        await vi.waitFor(() => expect(finished).toBe(true), { timeout: 2000 });
        await closed.promise;
        if (kind === 'caller') expect(rejection).toBe(reason);
        else expect(rejection).toMatchObject({ name: 'TimeoutError' });
        expect(await active!.status()).toBe('idle');
        const saved = await app.application.container
          .resolve(agentsToken)
          .conversations.get(actor.user.id, active!.sessionId);
        expect(saved.execution?.outcome).toBe('cancelled');
        expect(calls - before).toBe(1);
        expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]![1]);
      } finally {
        hold = false;
        if (!finished) await active?.abort();
        await pending;
        heldStream = undefined;
        background.mockRestore();
        add.mockRestore();
        remove.mockRestore();
      }
    },
  );
  it('preserves a native model failure when caller cancellation arrives with its outcome', async () => {
    const online = app.application.container.resolve(agentsToken).onlineAgent;
    const original = online.background.bind(online);
    const controller = new AbortController();
    const reason = new Error('Cancellation after model failure');
    const background = vi
      .spyOn(online, 'background')
      .mockImplementation(async (...args) => {
        const session = await original(...args);
        const observe = session.try.bind(session);
        vi.spyOn(session, 'try').mockImplementation(async (options) => {
          const result = await observe(options);
          controller.abort(reason);
          return result;
        });
        return session;
      });
    fail = true;
    try {
      await expect(
        createNativeStructuredAI(app.application.container).structured({
          employee: 'controlled',
          userId: actor.user.id,
          authorization: actor.authorization,
          title: 'Failing generation',
          prompt: 'Return JSON',
          schema: z.object({ ok: z.boolean() }),
          timeZone: 'UTC',
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ reason: 'failed', code: 'EXECUTION_FAILED' });
    } finally {
      fail = false;
      background.mockRestore();
    }
  });
  it('rejects an already cancelled ordinary call before model probing or storage', async () => {
    const controller = new AbortController();
    const reason = new Error('Cancelled before generation');
    controller.abort(reason);
    await expect(
      cost('ordinary-pre-cancelled', () =>
        createNativeStructuredAI(app.application.container).structured({
          employee: 'controlled',
          userId: actor.user.id,
          authorization: actor.authorization,
          title: 'Cancelled generation',
          prompt: 'Return JSON',
          schema: z.object({ ok: z.boolean() }),
          timeZone: 'UTC',
          signal: controller.signal,
        }),
      ),
    ).rejects.toBe(reason);
  });
  it('releases ordinary wait listeners and keeps completed output after the deadline and later cancellation', async () => {
    const online = app.application.container.resolve(agentsToken).onlineAgent;
    const original = online.background.bind(online);
    let active: Awaited<ReturnType<typeof original>> | undefined;
    let abort: ReturnType<typeof vi.spyOn> | undefined;
    const background = vi
      .spyOn(online, 'background')
      .mockImplementation(async (...args) => {
        active = await original(...args);
        abort = vi.spyOn(active, 'abort');
        return active;
      });
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    text = '{"ok":true}';
    try {
      const result = await createNativeStructuredAI(
        app.application.container,
      ).structured({
        employee: 'controlled',
        userId: actor.user.id,
        authorization: actor.authorization,
        title: 'Completed generation',
        prompt: 'Return JSON',
        schema: z.object({ ok: z.boolean() }),
        timeZone: 'UTC',
        timeoutMs: 300,
        signal: controller.signal,
      });
      expect(result.data).toEqual({ ok: true });
      const history = await active!.history();
      expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]![1]);
      await new Promise((resolve) => setTimeout(resolve, 350));
      controller.abort(new Error('Late cancellation'));
      expect(abort).not.toHaveBeenCalled();
      expect(await active!.status()).toBe('idle');
      expect(await active!.history()).toEqual(history);
    } finally {
      abort?.mockRestore();
      background.mockRestore();
      add.mockRestore();
      remove.mockRestore();
    }
  });
  it('stops a live native response and restores its saved partial message', async () => {
    text = 'A controlled partial reply';
    hold = true;
    const online = app.application.container.resolve(agentsToken).onlineAgent;
    const session = await online.realtime(actor);
    let signal!: () => void;
    const reached = new Promise<void>((r) => {
      signal = r;
    });
    try {
      await session.send([{ role: 'user', content: 'Wait for Stop' }]);
      const stream = await session.receive();
      const reading = (async () => {
        if (stream)
          for await (const chunk of stream) {
            if (chunk.type === 'text-delta') signal();
          }
      })();
      await reached;
      await cost('stop', () => session.abort());
      await reading;
      expect(await session.status()).toBe('idle');
      expect(JSON.stringify(await session.history())).toContain(
        'controlled partial',
      );
      const before = calls;
      const reopened = await online.realtime(actor, {
        sessionId: session.sessionId,
      });
      expect(await reopened.history()).toEqual(await session.history());
      expect(calls).toBe(before);
    } finally {
      hold = false;
    }
  });
});
