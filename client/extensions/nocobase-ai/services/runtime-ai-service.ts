import type { ApiClient } from '@nocobase/app-client';
import { NocoBaseAIService } from './nocobase-ai-service.js';
import type {
  AIService,
  CreateAIConversationOptions,
  UpdateToolCallDecisionOptions,
} from './types.js';

/** Preserve the legacy reader; new sessions never fall through to an old writer. */
export class RuntimeAIService implements AIService {
  private readonly legacy: NocoBaseAIService;
  private readonly application: NocoBaseAIService;
  private enabled?: Promise<boolean>;
  public constructor(private readonly client: ApiClient) {
    this.legacy = new NocoBaseAIService(client);
    this.application = new NocoBaseAIService(client, (path) =>
      path
        .replace(/^aiEmployee\/conversations/u, 'assistantConversations')
        .replace(/^aiEmployees\/roster$/u, 'assistantEmployees')
        .replace(/^aiEmployee\/models$/u, 'assistantModels')
        .replace(/^aiEmployee\//u, 'unsupportedAssistant/')
        .replace(/^aiEmployees\//u, 'unsupportedAssistant/'),
    );
  }
  private isEnabled() {
    return (this.enabled ??= this.client
      .request<{ data: { enabled: boolean } }>({
        path: 'assistantRuntime',
        method: 'GET',
      })
      .then((value) => value.data.enabled));
  }
  private async service(id?: string, write = false) {
    const enabled = await this.isEnabled();
    if (!enabled) {
      if (id?.startsWith('assistant-'))
        throw new Error('ASSISTANT_UNAVAILABLE');
      return this.legacy;
    }
    if (!id || id.startsWith('assistant-')) return this.application;
    if (write) throw new Error('LEGACY_CONVERSATION_READ_ONLY');
    return this.legacy;
  }
  async listEmployees() {
    return (await this.service()).listEmployees();
  }
  async listModels() {
    return (await this.service()).listModels();
  }
  async listConversations(keyword?: string) {
    if (!(await this.isEnabled()))
      return this.legacy.listConversations(keyword);
    const [current, legacy] = await Promise.all([
      this.application.listConversations(keyword),
      this.legacy.listConversations(keyword),
    ]);
    return [...current, ...legacy].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }
  async getConversationMessages(
    id: string,
    options?: { updateRead?: boolean },
  ) {
    const service = await this.service(id);
    return service.getConversationMessages(
      id,
      (await this.isEnabled()) && !id.startsWith('assistant-')
        ? { updateRead: false }
        : options,
    );
  }
  async getConversationActiveState(id: string) {
    if ((await this.isEnabled()) && !id.startsWith('assistant-'))
      return 'idle' as const;
    return (await this.service(id)).getConversationActiveState(id);
  }
  async updateConversationTitle(id: string, title: string) {
    return (await this.service(id, true)).updateConversationTitle(id, title);
  }
  async destroyConversation(id: string) {
    return (await this.service(id, true)).destroyConversation(id);
  }
  async createConversation(options: CreateAIConversationOptions) {
    return (await this.service()).createConversation(options);
  }
  async sendMessagesStream(body: unknown, signal?: AbortSignal) {
    return (await this.service(this.sessionId(body), true)).sendMessagesStream(
      body,
      signal,
    );
  }
  async resumeToolCallStream(body: unknown, signal?: AbortSignal) {
    return (
      await this.service(this.sessionId(body), true)
    ).resumeToolCallStream(body, signal);
  }
  async updateToolCallDecision(options: UpdateToolCallDecisionOptions) {
    return (await this.service(options.sessionId, true)).updateToolCallDecision(
      options,
    );
  }
  async resendMessagesStream(body: unknown, signal?: AbortSignal) {
    if (await this.isEnabled()) throw new Error('UNSUPPORTED_CHAT_REQUEST');
    return this.legacy.resendMessagesStream(body, signal);
  }
  async resumeConversationStream(id: string, signal?: AbortSignal) {
    if (await this.isEnabled()) throw new Error('UNSUPPORTED_CHAT_REQUEST');
    return this.legacy.resumeConversationStream(id, signal);
  }
  async uploadFile(file: File, signal?: AbortSignal) {
    if (await this.isEnabled()) throw new Error('UNSUPPORTED_CHAT_REQUEST');
    return this.legacy.uploadFile(file, signal);
  }
  async updateEmployeeUserPrompt(username: string, prompt: string) {
    if (await this.isEnabled()) throw new Error('UNSUPPORTED_CHAT_REQUEST');
    return this.legacy.updateEmployeeUserPrompt(username, prompt);
  }
  private sessionId(body: unknown): string {
    if (
      !body ||
      typeof body !== 'object' ||
      !('sessionId' in body) ||
      typeof body.sessionId !== 'string' ||
      !body.sessionId
    )
      throw new Error('CONVERSATION_NOT_FOUND');
    return body.sessionId;
  }
}
