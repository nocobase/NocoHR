import path from 'node:path';
import type { Application } from '@nocobase/app-server/application';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';
import type { JobExecutor } from '@nocobase/jobs';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { scopeForUser } from '../hr/authorize.js';
import type { ProcessesConfig } from '../../config/processes.js';
import {
  processHandlers,
  processScheduledUsers,
} from '../../processes/index.js';
import { ProcessCatalog } from './catalog.js';
import { ProcessService, bindProcessJobs } from './service.js';
import { ProcessHistory } from './history.js';

export const processServiceToken = createServiceToken<ProcessService>(
  'app/process-service',
);
export const processHistoryToken = createServiceToken<ProcessHistory>(
  'app/process-history',
);
export default class ProcessesProvider extends ServiceProvider<Application> {
  public readonly name = 'app/processes';
  private executor?: JobExecutor;
  private catalog?: ProcessCatalog;
  private enqueue?: (eventKey: string, occurrenceId?: string) => Promise<void>;
  public override register() {
    if (!this.app.config.get<ProcessesConfig>('processes')?.enabled) return;
    const container = this.app.container,
      db = container.resolve(databaseManagerToken).connection();
    const authorize = async (userId: string) => {
      const auth = await scopeForUser(
        container.resolve(authorizationToken),
        userId,
      );
      const effect = String(
        (
          await auth.authorize({
            resource: { type: 'settings', id: 'workflow' },
            action: 'manage',
          })
        ).effect,
      );
      // The retained runtime calls a grant "allow"; target core calls it "permit". Unknown/conditional effects fail closed.
      if (effect !== 'allow' && effect !== 'permit')
        throw new Error('PROCESS_FORBIDDEN');
    };
    this.catalog = new ProcessCatalog(processHandlers);
    container.singleton(
      processServiceToken,
      () =>
        new ProcessService(
          db,
          this.catalog!,
          processHandlers,
          authorize,
          async (key, occurrence) => {
            if (!this.enqueue) throw new Error('PROCESS_JOBS_NOT_STARTED');
            await this.enqueue(key, occurrence);
          },
        ),
    );
    container.singleton(
      processHistoryToken,
      () => new ProcessHistory(db, authorize),
    );
  }
  public override async boot() {
    if (!this.catalog) return;
    await this.catalog.load(
      path.resolve(import.meta.dirname, '../../processes/artifacts'),
    );
    this.executor = this.app.container
      .resolve(jobExecutorServiceToken)
      .getJobExecutor('@hr/processes');
    this.enqueue = (
      await bindProcessJobs(
        this.app.container.resolve(processServiceToken),
        this.executor,
        this.app.container.resolve(schedulerServiceToken),
        (scheduleId) => processScheduledUsers.get(scheduleId),
      )
    ).enqueue;
  }
  public override async start() {
    await this.executor?.setup();
  }
  public override async shutdown() {
    await this.executor?.shutdown();
  }
}
