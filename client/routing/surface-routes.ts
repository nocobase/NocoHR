import {
  defineAppRoutes,
  type AppClientRouteContribution,
  type AppClientRouteDefinition,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';

// NocoHR keeps its Settings and development shells. Client 3 represents every shell's pages as app routes.
function surfaceRoutes(
  routes: readonly AppClientRouteDefinition[],
  prefix: '/settings' | '/dev',
): AppClientRouteContribution {
  const map = (
    route: AppClientRouteDefinition,
    mounted = false,
  ): AppClientRouteDefinition => ({
    ...route,
    auth: route.auth ?? 'required',
    ...(route.path && !mounted && !route.parent
      ? { path: `${prefix}/${route.path.replace(/^\/+/, '')}` }
      : {}),
    ...(prefix === '/dev' && route.componentLoader && route.authz == null
      ? { authz: 'skip' as const }
      : {}),
    ...(route.children
      ? {
          children: route.children.map((child) =>
            map(child, mounted || Boolean(route.path) || Boolean(route.parent)),
          ),
        }
      : {}),
  });
  return defineAppRoutes(routes.map((route) => map(route)));
}

export const defineSettingsRoutes = (
  routes: readonly AppClientRouteDefinition[],
) => surfaceRoutes(routes, '/settings');

export const defineDevRoutes = (routes: readonly AppClientRouteDefinition[]) =>
  surfaceRoutes(import.meta.env.PROD ? [] : routes, '/dev');

/** Pure groups may contain pages in several shells; a page and its children stay together. */
export function filterRouteSurface(
  routes: readonly AppClientRegisteredRoute[],
  prefix: '/settings' | '/dev',
): AppClientRegisteredRoute[] {
  return routes.flatMap((route) => {
    if (route.componentLoader)
      return route.path === prefix || route.path.startsWith(`${prefix}/`)
        ? [route]
        : [];
    const children = filterRouteSurface(route.children ?? [], prefix);
    return children.length ? [{ ...route, children }] : [];
  });
}
