import notificationRoutes from './notification/routes.js';
import notificationLocales from './notification/locales/index.js';
import type {
  AppClientPluginRegistration,
  AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import type { LocaleLoaders, LocalesModule } from '@nocobase/i18n';
import { createUsersRoutes } from './users/routes.js';
import usersLocales from './users/locales/index.js';
import { createApiKeysRoutes } from './api-keys/routes.js';
import keysLocales from './api-keys/locales/index.js';
import authorizationRoutes from './authorization/routes.js';
import authorizationLocales from './authorization/locales/index.js';
import defaultRoutes from './authz-default-access/routes.js';
import defaultLocales from './authz-default-access/locales/index.js';
import sharingRoutes from './authz-sharing-rules/routes.js';
import sharingLocales from './authz-sharing-rules/locales/index.js';
import restrictionRoutes from './authz-restriction-rules/routes.js';
import restrictionLocales from './authz-restriction-rules/locales/index.js';
import databaseRoutes from './database-explorer/routes.js';
import databaseLocales from './database-explorer/locales/index.js';
import schedulerRoutes from './scheduler/routes.js';
import schedulerLocales from './scheduler/locales/index.js';

function merge(left: object, right: object): Record<string, unknown> {
  const result: Record<string, unknown> = { ...left };
  for (const [key, value] of Object.entries(right as Record<string, unknown>)) {
    const previous = result[key];
    result[key] =
      previous &&
      typeof previous === 'object' &&
      value &&
      typeof value === 'object'
        ? merge(previous, value)
        : value;
  }
  return result;
}

function loaders(module: LocalesModule): LocaleLoaders {
  return 'default' in module && typeof module.default !== 'function'
    ? module.default
    : (module as LocaleLoaders);
}

/** UI retired upstream is application-owned; the installed plugin still owns APIs, permissions and providers. */
export function retainManagement(
  registration: AppClientPluginRegistration,
): AppClientPluginRegistration {
  const entries: Record<
    string,
    { routes: readonly AppClientRouteContribution[]; locales: LocaleLoaders }
  > = {
    notification: {
      routes: [notificationRoutes],
      locales: notificationLocales,
    },
    users: {
      routes: [createUsersRoutes({ mount: 'settings' })],
      locales: usersLocales,
    },
    'api-keys': { routes: [createApiKeysRoutes({})], locales: keysLocales },
    authorization: {
      routes: [authorizationRoutes],
      locales: authorizationLocales,
    },
    'authz-default-access': {
      routes: [defaultRoutes],
      locales: defaultLocales,
    },
    'authz-sharing-rules': { routes: [sharingRoutes], locales: sharingLocales },
    'authz-restriction-rules': {
      routes: [restrictionRoutes],
      locales: restrictionLocales,
    },
    'database-explorer': { routes: [databaseRoutes], locales: databaseLocales },
    scheduler: { routes: schedulerRoutes, locales: schedulerLocales },
  };
  const entry =
    entries[registration.packageName.replace('@nocobase/app-plugin-', '')];
  if (!entry) return registration;
  return {
    ...registration,
    routes: [...registration.routes, ...entry.routes],
    locales: async () => {
      const current = registration.locales;
      const currentLoaders = current
        ? loaders(typeof current === 'function' ? await current() : current)
        : {};
      return Object.fromEntries(
        Object.entries(entry.locales).map(([locale, load]) => [
          locale,
          async () => {
            const oldModule = await load();
            const newModule = await currentLoaders[locale]?.();
            const oldResource =
              'default' in oldModule
                ? (oldModule.default as object)
                : oldModule;
            const newResource =
              newModule && 'default' in newModule
                ? (newModule.default as object)
                : newModule;
            return { default: merge(oldResource, newResource ?? {}) };
          },
        ]),
      );
    },
  };
}
