import { type AppConfigFactory } from '@nocobase/app-server/config';
import { defineMailChannelsConfig } from '@nocobase/app-server/mailer';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> =
  defineMailChannelsConfig({
    defaults: { channels: { inbox: { provider: 'in-app' } } },
  });

export default notification;
