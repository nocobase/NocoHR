import type { Application } from '@nocobase/app-server/application';
import type { ToolsOptions } from '@nocobase/ai-employee';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import { ServiceProvider } from '@nocobase/service-provider';

import AppAIResources from '../ai/index.js';

/** Hands the application's AI employee and tools to the runtime the plugin created. */
export default class AIResourcesProvider extends ServiceProvider<Application> {
  public readonly name: string = 'hr/ai-resources';

  public override async boot(): Promise<void> {
    if (!this.app.container.has(aiManagerToken)) return;
    const ai = this.app.container.resolve(aiManagerToken);
    const resources = await new AppAIResources().collect();
    // The old runtime remains the only writer until the replacement passes cutover checks.
    const tools = [...resources.tools.values()].map((tool): ToolsOptions => ({
      scope: tool.scope,
      execution: tool.execution,
      defaultPermission: tool.defaultPermission,
      i18n: tool.i18n,
      introduction: tool.introduction,
      definition: tool.definition,
      invoke: (context, args: unknown) =>
        tool.execute(this.app.container, context.actor, args),
    }));
    await ai.toolsManager.registerTools(tools);
    for (const employee of resources.employees.values())
      await ai.employeeManager.registerEmployee(employee);
  }
}
