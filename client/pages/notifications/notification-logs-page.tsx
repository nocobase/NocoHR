import { PageContainer } from '../../components/page-container.js';
import { PageHeader } from '../../components/page-header.js';
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import type {
  NotificationDeliveryDetails,
  NotificationLogDetails,
  NotificationStatus,
} from './notification-client.js';
import { useApiClient } from '@nocobase/app-client';
import { NotificationClient } from './notification-client.js';

type Translate = (
  key: string,
  options?: Readonly<Record<string, unknown>>,
) => string;

export default function NotificationLogsPage(): ReactElement {
  const api = useApiClient();
  const notification = useMemo(() => new NotificationClient(api), [api]);
  const { t } = useTranslation('@nocobase/app-plugin-notification');
  const [logs, setLogs] = useState<readonly NotificationLogDetails[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const refresh = (): void => {
    setLoading(true);
    setError(undefined);
    setRevision((value) => value + 1);
  };

  useEffect(() => {
    let active = true;
    notification
      .listLogs()
      .then(
        (nextLogs) => {
          if (active) setLogs(nextLogs);
        },
        (cause: unknown) => {
          if (active)
            setError(
              errorMessage(
                cause,
                t('errors.requestFailed', {
                  defaultValue: 'Notification request failed.',
                }),
              ),
            );
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [notification, revision, t]);

  const totals = useMemo(
    () => ({
      deliveries: logs.reduce((sum, item) => sum + item.deliveries.length, 0),
      attention: logs.filter((item) =>
        ['failed', 'partial', 'unknown'].includes(item.log.status),
      ).length,
    }),
    [logs],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('logs.title', { defaultValue: 'Notification logs' })}
        description={t('logs.description', {
          defaultValue:
            'Trace notification delivery and every provider attempt. Message bodies, recipients, and lease tokens are redacted.',
        })}
        actions={
          <>
            <button
              className='inline-flex h-9 items-center justify-center rounded-md border bg-transparent px-4 text-sm font-medium shadow-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50'
              disabled={loading}
              onClick={refresh}
              type='button'
            >
              {loading
                ? t('logs.refreshing', { defaultValue: 'Refreshing…' })
                : t('logs.refresh', { defaultValue: 'Refresh' })}
            </button>
          </>
        }
      />

      <div className='space-y-5'>
        <div className='grid max-w-md grid-cols-2 gap-3'>
          <Metric
            label={t('logs.deliveriesShown', {
              defaultValue: 'Deliveries shown',
            })}
            value={totals.deliveries}
          />
          <Metric
            attention
            label={t('logs.needAttention', { defaultValue: 'Need attention' })}
            value={totals.attention}
          />
        </div>

        {error ? (
          <div className='rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive'>
            <p className='font-medium'>
              {t('logs.unavailable', { defaultValue: 'Logs unavailable' })}
            </p>
            <p className='mt-1'>{error}</p>
          </div>
        ) : null}

        <section className='overflow-hidden rounded-xl border bg-card shadow-sm'>
          <div className='border-b bg-muted/20 px-5 py-4'>
            <h2 className='font-semibold'>
              {t('logs.recent', { defaultValue: 'Recent notifications' })}
            </h2>
          </div>
          {loading ? (
            <div className='p-12 text-center text-sm text-muted-foreground'>
              {t('logs.loading', {
                defaultValue: 'Loading delivery history…',
              })}
            </div>
          ) : logs.length === 0 ? (
            <div className='p-12 text-center'>
              <p className='font-medium'>
                {t('logs.emptyTitle', { defaultValue: 'No deliveries yet' })}
              </p>
              <p className='mt-1 text-sm text-muted-foreground'>
                {t('logs.emptyDescription', {
                  defaultValue:
                    'Delivery records will appear here after notifications are sent.',
                })}
              </p>
            </div>
          ) : (
            <NotificationLogsTable logs={logs} />
          )}
        </section>
      </div>
    </PageContainer>
  );
}

function Metric({
  label,
  value,
  attention = false,
}: {
  readonly label: string;
  readonly value: number;
  readonly attention?: boolean;
}): ReactElement {
  return (
    <div className='rounded-xl border bg-card px-4 py-3 shadow-sm'>
      <div
        className={`text-2xl font-semibold tabular-nums ${attention && value > 0 ? 'text-destructive' : ''}`}
      >
        {value}
      </div>
      <div className='text-xs text-muted-foreground'>{label}</div>
    </div>
  );
}

function NotificationLogsTable({
  logs,
}: {
  readonly logs: readonly NotificationLogDetails[];
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-notification');
  return (
    <div className='overflow-x-auto'>
      <table className='w-full min-w-[860px] text-sm'>
        <thead className='bg-muted/35 text-left'>
          <tr className='border-b'>
            <th
              className='w-12 px-4 py-3'
              aria-label={t('logs.expand', {
                defaultValue: 'Expand notification',
              })}
            />
            <th className='px-4 py-3 font-medium'>
              {t('logs.columns.source', { defaultValue: 'Source' })}
            </th>
            <th className='px-4 py-3 font-medium'>
              {t('logs.columns.notificationId', {
                defaultValue: 'Notification ID',
              })}
            </th>
            <th className='px-4 py-3 font-medium'>
              {t('logs.columns.status', { defaultValue: 'Status' })}
            </th>
            <th className='px-4 py-3 text-right font-medium'>
              {t('logs.columns.deliveries', { defaultValue: 'Deliveries' })}
            </th>
            <th className='px-4 py-3 font-medium'>
              {t('logs.columns.created', { defaultValue: 'Created' })}
            </th>
          </tr>
        </thead>
        <tbody>
          {logs.map((details) => (
            <NotificationTableRow key={details.log.id} details={details} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NotificationTableRow({
  details,
}: {
  readonly details: NotificationLogDetails;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-notification');
  const [open, setOpen] = useState(false);
  return (
    <Fragment>
      <tr className='border-b' aria-expanded={open}>
        <td className='px-4 py-3'>
          <button
            className='grid size-8 place-items-center rounded-md hover:bg-muted'
            aria-label={
              open
                ? t('logs.collapse', {
                    defaultValue: 'Collapse notification',
                  })
                : t('logs.expand', { defaultValue: 'Expand notification' })
            }
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            type='button'
          >
            <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>
              ›
            </span>
          </button>
        </td>
        <td className='px-4 py-3'>
          <div className='font-medium'>{details.log.sourceType}</div>
          {details.log.sourceReferenceId ? (
            <div className='mt-0.5 max-w-48 truncate text-xs text-muted-foreground'>
              {details.log.sourceReferenceId}
            </div>
          ) : null}
        </td>
        <td className='px-4 py-3'>
          <code
            className='text-xs text-muted-foreground'
            title={details.log.id}
          >
            {details.log.id}
          </code>
        </td>
        <td className='px-4 py-3'>
          <StatusBadge status={details.log.status} />
        </td>
        <td className='px-4 py-3 text-right tabular-nums'>
          {details.deliveries.length}
        </td>
        <td className='whitespace-nowrap px-4 py-3 text-muted-foreground'>
          <time dateTime={details.log.createdAt}>
            {formatTime(details.log.createdAt)}
          </time>
        </td>
      </tr>
      {open ? (
        <tr className='border-b bg-muted/15'>
          <td colSpan={6} className='p-4 sm:px-12'>
            <DeliveryTable deliveries={details.deliveries} />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function DeliveryTable({
  deliveries,
}: {
  readonly deliveries: readonly NotificationDeliveryDetails[];
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-notification');
  if (deliveries.length === 0) {
    return (
      <p className='py-4 text-center text-sm text-muted-foreground'>
        {t('logs.noDeliveries', {
          defaultValue: 'No deliveries recorded.',
        })}
      </p>
    );
  }

  return (
    <div className='overflow-x-auto rounded-lg border bg-card'>
      <table className='w-full min-w-[760px] text-sm'>
        <thead className='bg-muted/35 text-left'>
          <tr className='border-b'>
            <th className='px-4 py-3 font-medium'>
              {t('logs.columns.channel', { defaultValue: 'Channel' })}
            </th>
            <th className='px-4 py-3 font-medium'>
              {t('logs.columns.provider', { defaultValue: 'Provider' })}
            </th>
            <th className='px-4 py-3 font-medium'>
              {t('logs.columns.status', { defaultValue: 'Status' })}
            </th>
            <th className='px-4 py-3 text-right font-medium'>
              {t('logs.columns.attempts', { defaultValue: 'Attempts' })}
            </th>
            <th className='px-4 py-3 font-medium'>
              {t('logs.columns.updated', { defaultValue: 'Updated' })}
            </th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((details) => {
            return (
              <Fragment key={details.delivery.id}>
                <tr className='border-b'>
                  <td className='px-4 py-3'>{details.delivery.channelName}</td>
                  <td className='px-4 py-3'>
                    <div className='font-medium'>
                      {details.delivery.providerType}
                    </div>
                  </td>
                  <td className='px-4 py-3'>
                    <StatusBadge status={details.delivery.status} />
                  </td>
                  <td className='px-4 py-3 text-right tabular-nums'>
                    {details.attempts.length}
                  </td>
                  <td className='whitespace-nowrap px-4 py-3 text-muted-foreground'>
                    {formatTime(details.delivery.updatedAt)}
                  </td>
                </tr>
                <tr className='border-b bg-muted/10'>
                  <td colSpan={5} className='px-4 py-3'>
                    <AttemptList details={details} />
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AttemptList({
  details,
}: {
  readonly details: NotificationDeliveryDetails;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-notification');
  if (details.attempts.length === 0) {
    return (
      <p className='text-xs text-muted-foreground'>
        {t('logs.noAttempts', { defaultValue: 'No attempts recorded.' })}
      </p>
    );
  }
  return (
    <div className='grid gap-1.5'>
      {details.attempts.map((attempt) => {
        return (
          <div
            key={attempt.id}
            className='grid grid-cols-[2.5rem_minmax(8rem,1fr)_auto] items-center gap-3 rounded-md bg-muted/35 px-3 py-2 text-xs'
          >
            <span className='font-mono text-muted-foreground'>
              #{attempt.sequence}
            </span>
            <span className='min-w-0'>
              <strong>{attempt.providerType}</strong>
              {attempt.error ? (
                <span className='mt-1 block truncate text-destructive'>
                  {providerErrorMessage(t, attempt.error)}
                </span>
              ) : null}
            </span>
            <StatusBadge status={attempt.status} />
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  readonly status: NotificationStatus;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-notification');
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone(status)}`}
    >
      {t(`status.${status}`, { defaultValue: status.replace('_', ' ') })}
    </span>
  );
}

function statusTone(status: NotificationStatus): string {
  if (status === 'completed' || status === 'accepted') {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
  }
  if (status === 'failed' || status === 'unknown' || status === 'partial') {
    return 'border-destructive/20 bg-destructive/10 text-destructive';
  }
  return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400';
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}

function providerErrorMessage(
  t: Translate,
  error: { readonly message: string; readonly code?: string },
): string {
  if (
    error.code === 'IN_APP_NOTIFICATION_RECIPIENT_NOT_FOUND' ||
    error.message === 'In-app notification recipient does not exist.'
  )
    return t('errors.inAppRecipientNotFound', {
      defaultValue: 'In-app notification recipient does not exist.',
    });
  return error.message;
}
