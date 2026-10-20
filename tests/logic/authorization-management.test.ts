// @vitest-environment node
import { findPackageJSON } from 'node:module';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
} from '@nocobase/db';
import { sqlite } from '@nocobase/db-sqlite';
import { createAppAuthorization } from '@nocobase/app-plugin-authorization/server';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function fixture() {
  const db = createDatabaseManager({
    connections: { main: sqlite({ filename: ':memory:' }) },
    metadataStore: new InMemoryCollectionMetadataStore(),
  });
  cleanup.push(() => db.destroy());
  const manifest = findPackageJSON(
    '@nocobase/app-plugin-authorization/server',
    import.meta.url,
  );
  if (!manifest) throw new Error('Missing target authorization package');
  await db
    .createMigrator({
      sources: [
        {
          packageName: '@nocobase/app-plugin-authorization',
          directory: path.join(
            path.dirname(manifest),
            'dist/database/migrations',
          ),
        },
      ],
    })
    .latest();
  const authz = createAppAuthorization({
    database: db,
    connection: db.connection(),
  });
  const users = ['manager', 'reader', 'alice', 'bob'];
  authz.subjects.add('user', {
    filterActive: async (ids) => ids.filter((id) => users.includes(id)),
    administration: {
      title: 'User',
      selection: {
        type: 'collection',
        list: async ({ page, pageSize }) => ({
          items: users
            .slice((page - 1) * pageSize, page * pageSize)
            .map((id) => ({ id, title: id })),
          total: users.length,
        }),
        resolve: async (ids) =>
          ids
            .filter((id) => users.includes(id))
            .map((id) => ({ id, title: id })),
      },
    },
  });
  for (const [key, actions] of [
    ['manager', ['read', 'assign']],
    ['reader', ['read']],
  ] as const) {
    await authz.permissionSets.create({
      key,
      grants: [
        authz.settings.grant('authorization.permission-sets', actions),
        ...(key === 'manager'
          ? [authz.settings.grant('authorization.inspector', ['inspect'])]
          : []),
      ],
    });
    await authz.permissionSets.assign({
      permissionSet: key,
      subject: { type: 'user', id: key },
    });
  }
  await authz.permissionSets.create({
    key: 'operators',
    grants: [authz.pages.grant('sample')],
  });
  const assignment = await authz.permissionSets.assign({
    permissionSet: 'operators',
    subject: { type: 'user', id: 'alice' },
  });
  const requests: string[] = [];
  const costs: {
    endpoint: string;
    method: string;
    select: number;
    write: number;
    transaction: number;
  }[] = [];
  const client = await db.connection().client<{
    on: (event: string, listener: (query: { sql: string }) => void) => void;
  }>();
  client.on('query', (query) => requests.push(query.sql));
  const request = async (
    user: string,
    endpoint: string,
    method = 'GET',
    body?: unknown,
  ) => {
    const before = requests.length;
    const url = new URL('http://isolated.invalid' + endpoint);
    const response = await authz.routes.handle({
      path: url.pathname,
      request: new Request(url, {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }),
      }),
      authorization: authz.for({ principal: { type: 'user', id: user } }),
    });
    if (!response) throw new Error('Unregistered native route ' + endpoint);
    const sql = requests.slice(before);
    costs.push({
      endpoint,
      method,
      select: sql.filter((s) => /^\s*select/iu.test(s)).length,
      write: sql.filter((s) => /^\s*(?:insert|update|delete)/iu.test(s)).length,
      transaction: sql.filter((s) => /^\s*begin/iu.test(s)).length,
    });
    return response;
  };
  return { authz, assignment, request, requests, costs };
}

it('uses the native assign action for deletion and keeps no-permission and protected-role denials', async () => {
  const { authz, assignment, request, costs } = await fixture();
  const snapshot = await authz
    .for({ principal: { type: 'user', id: 'manager' } })
    .snapshot();
  expect(snapshot.unrestricted).toBe(false);
  expect(snapshot.permissions).toContainEqual({
    resource: { type: 'settings', id: 'authorization.permission-sets' },
    actions: ['assign', 'read'],
  });
  expect(
    await authz.for({ principal: { type: 'user', id: 'manager' } }).can({
      resource: { type: 'settings', id: 'authorization.permission-sets' },
      action: 'revoke',
    }),
  ).toBe(false);
  const endpoint = `/permissionSets/operators/assignments/${assignment.id}`;
  expect((await request('reader', endpoint, 'DELETE')).status).toBe(403);
  const unprotect = authz.permissionSets.protect({
    owner: 'fixture',
    keys: ['operators'],
    allow: ['assign'],
  });
  const protectedResponse = await request('manager', endpoint, 'DELETE');
  expect(protectedResponse.status).toBe(400);
  expect(await protectedResponse.json()).toMatchObject({
    error: { reason: 'PROTECTED_PERMISSION_SET' },
  });
  expect(await authz.permissionSets.listAssignments('operators')).toHaveLength(
    1,
  );
  unprotect();
  expect((await request('manager', endpoint, 'DELETE')).status).toBe(204);
  expect(await authz.permissionSets.listAssignments('operators')).toHaveLength(
    0,
  );
  console.info('Native assignment requests', JSON.stringify(costs));
});

it('uses native inspect, batch and configured access for restricted subjects and refuses unauthorized callers without writes', async () => {
  const { request, requests, costs } = await fixture();
  const inspect = {
    subject: { type: 'user', id: 'alice' },
    resource: { type: 'page', id: 'sample' },
    action: 'access',
  };
  expect((await request('manager', '/inspector/options')).status).toBe(200);
  const one = await request('manager', '/inspector/decide', 'POST', inspect);
  expect(one.status).toBe(200);
  expect(await one.json()).toMatchObject({
    data: { effect: 'permit', reasons: expect.any(Array) },
  });
  const batch = await request('manager', '/inspector/batchDecide', 'POST', {
    subject: inspect.subject,
    checks: [
      { resource: inspect.resource, action: 'access' },
      { resource: { type: 'page', id: 'other' }, action: 'access' },
    ],
  });
  expect(await batch.json()).toMatchObject({
    data: [
      { decision: { effect: 'permit' } },
      { decision: { effect: 'deny' } },
    ],
  });
  const configured = await request(
    'manager',
    '/inspector/configuredAccess?subjectType=user&subjectId=alice',
  );
  expect(await configured.json()).toMatchObject({
    data: {
      unrestricted: false,
      resources: [inspect.resource],
      identity: { subjects: [{ type: 'authenticated', id: '*' }] },
      sets: [{ key: 'operators', sources: [inspect.subject] }],
    },
  });
  expect(
    (await request('manager', '/inspector/subjects/user?page=1&pageSize=30'))
      .status,
  ).toBe(200);
  for (const endpoint of [
    '/inspector/options',
    '/inspector/configuredAccess?subjectType=user&subjectId=alice',
    '/inspector/subjects/user?page=1&pageSize=30',
  ])
    expect((await request('reader', endpoint)).status).toBe(403);
  expect(
    (await request('reader', '/inspector/decide', 'POST', inspect)).status,
  ).toBe(403);
  expect(
    (
      await request('reader', '/inspector/batchDecide', 'POST', {
        subject: inspect.subject,
        checks: [],
      })
    ).status,
  ).toBe(403);
  expect(
    requests.filter((sql) =>
      /^\s*(?:insert|update|delete|begin|savepoint)/iu.test(sql),
    ),
  ).toEqual([]);
  console.info('Native inspector requests', JSON.stringify(costs));
  console.info(
    'Native inspector sample SQL',
    JSON.stringify({
      select: requests.filter((sql) => /^\s*select/iu.test(sql)).length,
      write: 0,
    }),
  );
});
