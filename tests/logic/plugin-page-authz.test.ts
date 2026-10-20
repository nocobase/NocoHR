// @vitest-environment node
import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';
import applicationRoutes from '../../client/routes.js';
const flatten = (
  routes: readonly AppClientRegisteredRoute[],
): AppClientRegisteredRoute[] =>
  routes.flatMap((route) => [route, ...flatten(route.children ?? [])]);
describe('management page authorization', () => {
  it('retains the outstanding legacy AI and notification administration grants in the complete plugin composition', async () => {
    // Deliberately requires the retained packages: no virtual modules or test-only replacement registry.
    const { default: clientPlugins } = await import('../../client/plugins.js');
    const resolved = resolveAppClientContributions([
      { packageName: 'hr', source: 'application', routes: applicationRoutes },
      ...clientPlugins.plugins.map((plugin) => ({
        packageName: plugin.packageName,
        source: 'plugin' as const,
        routes: plugin.routes,
      })),
    ]);
    for (const name of [
      '@nocobase/app-plugin-ai-employee',
      '@nocobase/app-plugin-notification',
    ])
      expect(
        flatten(resolved.routes).some(
          (route) =>
            route.componentLoader &&
            route.packageName === name &&
            typeof route.authz === 'object' &&
            route.authz.resource.type === 'page' &&
            route.authz.action === 'access',
        ),
      ).toBe(true);
  });
});
