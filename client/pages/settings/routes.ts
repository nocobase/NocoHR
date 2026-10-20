import {
  Database,
  Settings,
  Users,
  ShieldCheck,
  ScanSearch,
} from 'lucide-react';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

/** Client 3 removed plugin-owned management pages. Keep NocoHR's original URLs and page grants. */
const systemSettingsRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    name: 'settings',
    path: '/settings',
    navigation: { title: 'settings.title', icon: Settings, order: 100 },
    children: [
      {
        name: 'database-explorer',
        path: '/database-explorer',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'database-explorer' },
          action: 'access',
        },
        navigation: { title: 'settings.databaseExplorer', icon: Database },
        componentLoader: () =>
          import('./database-explorer/database-explorer-page.js'),
        children: [
          {
            name: 'database-explorer.fields',
            path: 'fields',
            authz: {
              resource: { type: 'page', id: 'database-explorer' },
              action: 'access',
            },
            componentLoader: () =>
              import('./database-explorer/collection-fields.js'),
          },
          {
            name: 'database-explorer.columns',
            path: 'columns',
            authz: {
              resource: { type: 'page', id: 'database-explorer' },
              action: 'access',
            },
            componentLoader: () =>
              import('./database-explorer/collection-columns.js'),
          },
        ],
      },

      {
        name: 'api-keys',
        path: '/api-keys',
        auth: 'required',
        authz: { resource: { type: 'page', id: 'api-keys' }, action: 'access' },
        navigation: { title: 'settings.apiKeys' },
        componentLoader: () => import('./api-keys.js'),
      },
      {
        name: 'settingsUsers',
        path: '/users',
        auth: 'required',
        authz: { resource: { type: 'page', id: 'users' }, action: 'access' },
        navigation: { title: 'settings.users', icon: Users },
        breadcrumb: { title: 'settings.users' },
        componentLoader: () => import('./users.js'),
        children: [
          {
            name: 'settingsUserCreate',
            path: 'create',
            authz: { resource: { type: 'user', id: '*' }, action: 'create' },
            componentLoader: () => import('./user-form.js'),
          },
          {
            name: 'settingsUser',
            path: ':userId',
            componentLoader: () => import('./user-detail.js'),
            children: [
              {
                name: 'settingsUserEdit',
                path: 'edit',
                componentLoader: () => import('./user-form.js'),
              },
            ],
          },
        ],
      },
      {
        name: 'settingsAuthorizationInspector',
        path: '/authorization/inspector',
        auth: 'required',
        authz: {
          resource: { type: 'settings', id: 'authorization.inspector' },
          action: 'inspect',
        },
        navigation: {
          title: 'settings.authorizationInspector',
          icon: ScanSearch,
          order: 1000,
        },
        breadcrumb: { title: 'settings.authorizationInspector' },
        componentLoader: () => import('./inspector/index.js'),
      },
      {
        name: 'settingsRoles',
        path: '/authorization/permission-sets',
        auth: 'required',
        authz: {
          resource: { type: 'settings', id: 'authorization.permission-sets' },
          action: 'read',
        },
        navigation: { title: 'settings.roles', icon: ShieldCheck },
        breadcrumb: { title: 'settings.roles' },
        componentLoader: () => import('./roles.js'),
        children: [
          {
            name: 'settingsRoleCreate',
            path: 'new',
            authz: {
              resource: {
                type: 'settings',
                id: 'authorization.permission-sets',
              },
              action: 'read',
            },
            breadcrumb: { title: 'settings.newRole' },
            componentLoader: () => import('./role-form.js'),
          },
          {
            name: 'settingsRoleAssignments',
            path: 'edit/:key/assignments',
            componentLoader: () => import('./role-assignments.js'),
          },
          {
            name: 'settingsRoleDetails',
            path: 'edit/:key/details',
            componentLoader: () => import('./role-form.js'),
          },
          {
            name: 'settingsRoleEdit',
            path: 'edit/:key',
            breadcrumb: { title: 'settings.editRole' },
            componentLoader: () => import('./role-form.js'),
          },
        ],
      },
    ],
  },
]);
export default systemSettingsRoutes;
