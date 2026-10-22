// @vitest-environment node
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { registerHooks } from 'node:module';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '@nocobase/app-testing/server';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server/tokens';
import { aiAssistantResource } from '../../server/providers/hr/authz-resources.js';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
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
const requests: { tools?: unknown[] }[] = [];
let tool: { name: string; args: string } | undefined;
let hold = false;
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
