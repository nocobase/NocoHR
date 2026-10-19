import {
  defineAppConfig,
  envBoolean,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
export interface ProcessesConfig {
  enabled: boolean;
}
const processes: AppConfigFactory<ProcessesConfig> =
  defineAppConfig<ProcessesConfig>({
    defaults: { enabled: false },
    env: { APP_PROCESSES_ENABLED: envBoolean('enabled') },
  });
export default processes;
