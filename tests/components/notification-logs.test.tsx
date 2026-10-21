import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createTestI18nRuntime,
  TestI18nProvider,
} from '@nocobase/i18n/testing';
import { expect, it, vi } from 'vitest';
import NotificationLogsPage from '../../client/pages/notifications/notification-logs-page.js';
import notificationPlugin from '@nocobase/app-plugin-notification/client';

const { api } = vi.hoisted(() => ({ api: { request: vi.fn() } }));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
}));
const namespace = '@nocobase/app-plugin-notification';
const runtime = await createTestI18nRuntime({
  application: { namespace: 'nocohr', resources: {} },
  namespaces: { [namespace]: notificationPlugin().locales! },
});

it('shows historical delivery and attempt providers using only the log response', async () => {
  const createdAt = '2026-10-01T00:00:00Z';
  api.request.mockResolvedValue({
    data: [
      {
        log: {
          id: 'historical-test',
          sourceType: 'notification-test',
          status: 'completed',
          createdAt,
          updatedAt: createdAt,
        },
        deliveries: [
          {
            delivery: {
              id: 'delivery-1',
              channelName: 'retired-email',
              channelType: 'email',
              providerType: 'custom-smtp',
              attemptCount: 1,
              status: 'accepted',
              createdAt,
              updatedAt: createdAt,
            },
            attempts: [
              {
                id: 'attempt-1',
                sequence: 1,
                providerType: 'custom-smtp',
                status: 'accepted',
                startedAt: createdAt,
              },
            ],
            retryAudits: [],
          },
        ],
      },
    ],
  });
  render(
    <TestI18nProvider runtime={runtime} namespace={namespace}>
      <NotificationLogsPage />
    </TestI18nProvider>,
  );
  await screen.findByText('historical-test');
  expect(
    screen.queryByRole('button', { name: 'Send test notification' }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Expand notification' }),
  );
  expect(screen.getByText('retired-email')).toBeInTheDocument();
  expect(screen.getAllByText('custom-smtp')).toHaveLength(2);
  expect(screen.getByText('#1')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(api.request).toHaveBeenCalledTimes(2);
  for (const [request] of api.request.mock.calls) {
    expect(request).toEqual({
      path: 'notifications/logs',
      query: { pageSize: 100 },
    });
  }
});
