import notification from '@nocobase/app-plugin-notification/client';

/** The pinned client only supports component overrides on app routes, so replace the legacy settings component in its contribution. */
export default function notificationLogsOnly(): ReturnType<
  typeof notification
> {
  const plugin = notification();
  return {
    ...plugin,
    routes: plugin.routes.map(
      (contribution) =>
        ({
          ...contribution,
          routes: contribution.routes.map((group) =>
            group.name === 'notifications' && group.children
              ? {
                  ...group,
                  children: group.children.map((page) =>
                    page.name === 'logs' && 'componentLoader' in page
                      ? {
                          ...page,
                          componentLoader: () =>
                            import('./notification-logs-page.js'),
                        }
                      : page,
                  ),
                }
              : group,
          ),
        }) as typeof contribution,
    ),
  };
}
