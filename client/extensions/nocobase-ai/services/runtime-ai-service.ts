import type { ApiClient } from '@nocobase/app-client';
import { NocoBaseAIService } from './nocobase-ai-service.js';
import type {
  AIService,
  CreateAIConversationOptions,
  UpdateToolCallDecisionOptions,
} from './types.js';

/** Enabled applications own legacy reads and copied sessions; no retired plugin request is required. */
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
        .replace(
          /^aiEmployees\/([^/]+)\/userPrompt$/u,
          'assistantEmployees/$1/userPrompt',
        )
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
  private async service(id?: string) {
    const enabled = await this.isEnabled();
    if (!enabled) {
      if (id?.startsWith('assistant-'))
        throw new Error('ASSISTANT_UNAVAILABLE');
      return this.legacy;
    }
    return this.application;
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
    return this.application.listConversations(keyword);
  }

  async getConversationMessages(
    id: string,
    options?: { updateRead?: boolean },
  ) {
    return (await this.service(id)).getConversationMessages(id, options);
  }
  async getConversationActiveState(id: string) {
    return (await this.service(id)).getConversationActiveState(id);
  }

  async updateConversationTitle(id: string, title: string) {
    return (await this.service(id)).updateConversationTitle(id, title);
  }
  async destroyConversation(id: string) {
    return (await this.service(id)).destroyConversation(id);
  }
  async createConversation(options: CreateAIConversationOptions) {
    return (await this.service()).createConversation(options);
  }
  async sendMessagesStream(body: unknown, signal?: AbortSignal) {
    return (await this.service(this.sessionId(body))).sendMessagesStream(
      body,
      signal,
    );
  }
  async resumeToolCallStream(body: unknown, signal?: AbortSignal) {
    return (await this.service(this.sessionId(body))).resumeToolCallStream(
      body,
      signal,
    );
  }
  async updateToolCallDecision(options: UpdateToolCallDecisionOptions) {
    return (await this.service(options.sessionId)).updateToolCallDecision(
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
    return (await this.service()).updateEmployeeUserPrompt(username, prompt);
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
