import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import AppAIResources from '../../ai/index.js';
import type { AIEmployeeOptions, RegisteredTool } from '../../ai/contracts.js';
import type { AssistantConfig } from '../../config/assistant.js';
import { scopeForUser } from '../hr/authorize.js';
import { AssistantConversations } from './conversation-service.js';
import { ConversationStore } from './conversation-store.js';
import { assistantModels } from './configured-models.js';
import { DatabaseToolCallStore } from './tool-call-store.js';
import { assistantConversationsToken } from './tokens.js';

export default class AssistantProvider extends ServiceProvider<Application> {
  public readonly name = 'app/assistant';
  private readonly employees = new Map<string, AIEmployeeOptions>();
  private readonly tools = new Map<string, RegisteredTool>();
  public override register() {
    const config = this.app.config.get<AssistantConfig>('assistant');
    if (!config?.enabled) return;
    const container = this.app.container;
    const db = container.resolve(databaseManagerToken).connection();
    const entry = async (actor: { id: string | number }) => {
      // Resolve subjects again for every operation, including decisions from an already open page.
      const authz = await scopeForUser(
        container.resolve(authorizationToken),
        String(actor.id),
      );
      const decision = await authz.authorize({
        resource: { type: 'composite', id: 'talent.aiAssistant' },
        action: 'use',
      });
      if (decision.effect !== 'allow') throw new Error('ASSISTANT_FORBIDDEN');
    };
    container.singleton(
      assistantConversationsToken,
      () =>
        new AssistantConversations(
          container,
          new ConversationStore(db),
          new DatabaseToolCallStore(db),
          this.employees,
          this.tools,
          {
            authorizeConversation: entry,
            authorize: entry,
            decision: async (_actor, employee, tool) => {
              const reference = this.employees
                .get(employee)
                ?.tools?.find((item) => item.name === tool);
              return reference?.autoCall !== false &&
                this.tools.get(tool)?.defaultPermission === 'ALLOW'
                ? 'allow'
                : 'ask';
            },
          },
          assistantModels(config),
        ),
    );
    // Application declarations bound automatic calls. Business services recheck their action and row policies as this user. Installed overrides remain a cutover inventory requirement.
  }
  public override async boot() {
    if (!this.app.config.get<AssistantConfig>('assistant')?.enabled) return;
    const resources = await new AppAIResources().collect();
    for (const [name, employee] of resources.employees)
      this.employees.set(name, employee);
    for (const [name, tool] of resources.tools) this.tools.set(name, tool);
  }
}
