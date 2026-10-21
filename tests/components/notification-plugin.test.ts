import { expect, it, vi } from 'vitest';
import notification from '@nocobase/app-plugin-notification/client';
import notificationLogsOnly from '../../client/pages/notifications/plugin.js';

vi.mock('@nocobase/app-plugin-notification/client', async (original) => {
  const { default: createPlugin } =
    await original<typeof import('@nocobase/app-plugin-notification/client')>();
  const plugin = createPlugin();
  // The replacement is independent of the contribution's mount: preserve the complete tree and its access rules.
  const registration: ReturnType<typeof createPlugin> = {
    ...plugin,
    routes: [
      {
        parent: 'app',
        routes: [
          {
            name: 'notifications',
            path: '/notifications',
            navigation: { title: 'Notifications' },
            children: [
              {
                name: 'logs',
                path: '/logs',
                authz: {
                  resource: { type: 'page', id: 'notification.logs' },
                  action: 'access',
                },
                componentLoader: async () => ({ default: () => null }),
              },
            ],
          },
        ],
      },
    ],
  };
  return { default: () => registration };
});

it('replaces only the log component and preserves route ownership, access and plugin services', () => {
  const before = notification();
  const after = notificationLogsOnly();
  const group = after.routes[0]!.routes[0]!;
  const originalGroup = before.routes[0]!.routes[0]!;
  expect(after.packageName).toBe(before.packageName);
  expect(after.locales).toBe(before.locales);
  expect(after.serviceProviders).toBe(before.serviceProviders);
  expect(after.routes[0]!.parent).toBe(before.routes[0]!.parent);
  expect(group).toMatchObject({
    name: originalGroup.name,
    path: originalGroup.path,
    navigation: originalGroup.navigation,
  });
  const { componentLoader: _loader, ...originalPage } =
    originalGroup.children![0]!;
  expect(group.children![0]).toMatchObject(originalPage);
  expect(group.children![0]!.componentLoader).not.toBe(
    originalGroup.children![0]!.componentLoader,
  );
});
