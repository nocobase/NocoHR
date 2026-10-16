// @vitest-environment jsdom
import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';
import plugins from '../../client/plugins.js';
import { defineSettingsRoutes } from '../../client/routing/surface-routes.js';

const resolved = resolveAppClientContributions(
  plugins.plugins.map((plugin) => ({
    packageName: plugin.packageName,
    source: 'plugin' as const,
    routes: plugin.routes,
  })),
);
const flatten = (
  routes: readonly AppClientRegisteredRoute[],
): AppClientRegisteredRoute[] =>
  routes.flatMap((route) => [route, ...flatten(route.children ?? [])]);
const pages = flatten(resolved.routes).filter((route) => route.componentLoader);

describe('template upgrade compatibility', () => {
  it('retains administrative and business automation entry points', () => {
    expect(pages.map((route) => route.path)).toEqual(
      expect.arrayContaining([
        '/settings/users',
        '/settings/api-keys',
        '/settings/database-explorer',
        '/settings/authorization/permission-sets',
        '/settings/authorization/inspector',
        '/settings/authorization/default-access',
        '/settings/authorization/sharing-rules',
        '/settings/authorization/restriction-rules',
        '/settings/schedules',
        '/settings/notifications/logs',
        '/settings/workflow',
        '/settings/ai',
      ]),
    );
  });

  it('keeps nested paths relative and inherits their existing authorization', () => {
    const permission = {
      resource: { type: 'settings', id: 'kept' },
      action: 'read',
    };
    const routes = resolveAppClientContributions([
      {
        packageName: 'test',
        routes: defineSettingsRoutes([
          {
            name: 'group',
            path: '/kept',
            navigation: { title: 'kept' },
            children: [
              {
                name: 'parent',
                path: '/page',
                authz: permission,
                componentLoader: async () => ({ default: () => null }),
                children: [
                  {
                    name: 'detail',
                    path: ':id',
                    componentLoader: async () => ({ default: () => null }),
                  },
                ],
              },
            ],
          },
        ]),
      },
    ]).routes;
    const detail = flatten(routes).find((route) => route.name === 'detail');
    expect(detail).toMatchObject({
      path: '/settings/kept/page/:id',
      auth: 'required',
      authz: permission,
    });
  });

  it('keeps every management page behind a server-recognized grant', () => {
    for (const route of pages.filter((page) =>
      page.path.startsWith('/settings/'),
    )) {
      expect(route.auth).toBe('required');
      expect(route.authz).not.toBe('skip');
      expect(route.authz).not.toBe('unrestricted');
    }
  });

  it('loads every retained plugin page with client 3', async () => {
    for (const route of pages) {
      await expect(route.componentLoader!()).resolves.toMatchObject({
        default: expect.any(Function),
      });
    }
  }, 60_000);
});
