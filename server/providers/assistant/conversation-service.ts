import { randomUUID } from 'node:crypto';
import {
  AIMessage,
  HumanMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import type { ServiceContainer } from '@nocobase/service-provider';
import type { ZodType } from 'zod';
import type {
  AIEmployeeOptions,
  RegisteredTool,
  ToolActor,
} from '../../ai/contracts.js';
import {
  AssistantChatAdapter,
  type AssistantChatAuthorization,
  type AssistantChatEvent,
  type AssistantChatSession,
} from './chat-adapter.js';
import {
  AssistantTurn,
  type AssistantModel,
  type AssistantToolPolicy,
} from './model-turn.js';
import {
  ToolExecutor,
  type StoredToolCall,
  type ToolCallStore,
} from './tool-executor.js';
import { ConversationStore, type Conversation } from './conversation-store.js';

export interface AssistantModels {
  list(): {
    llmService: string;
    llmServiceTitle: string;
    enabledModels: { value: string; label: string }[];
  }[];
  create(model: Conversation['model'], schema?: ZodType): AssistantModel;
}
type Authorization = AssistantChatAuthorization & AssistantToolPolicy;
type CallStore = ToolCallStore & {
  create(call: StoredToolCall): Promise<void>;
  list(sessionId: string): Promise<StoredToolCall[]>;
};
type Emit = (event: AssistantChatEvent) => Promise<void>;

/** Owns normal request serialization and durable history; never reclaims or replays an interrupted request. */
export class AssistantConversations {
  public constructor(
    private readonly container: ServiceContainer,
    private readonly store: ConversationStore,
    private readonly calls: CallStore,
    private readonly employees: ReadonlyMap<string, AIEmployeeOptions>,
    private readonly tools: ReadonlyMap<string, RegisteredTool>,
    private readonly authorization: Authorization,
    public readonly models: AssistantModels,
  ) {}

  public async authorize(actor: ToolActor) {
    await this.authorization.authorizeConversation(actor, '', '');
  }
  public async roster(actor: ToolActor) {
    await this.authorize(actor);
    return [...this.employees.values()].map(
      ({
        username,
        nickname,
        position,
        avatar,
        description,
        bio,
        greeting,
      }) => ({
        username,
        nickname,
        position,
        avatar,
        description,
        bio,
        greeting,
      }),
    );
  }
  public async create(
    actor: ToolActor,
    employee: string,
    model: Conversation['model'],
    title = 'New conversation',
    mode: Conversation['mode'] = 'chat',
  ) {
    await this.authorize(actor);
    if (!this.employees.has(employee)) throw new Error('EMPLOYEE_NOT_FOUND');
    this.models.create(model);
    return this.store.create({
      userId: String(actor.id),
      employee,
      model,
      title,
      mode,
    });
  }
  public async get(actor: ToolActor, id: string) {
    await this.authorize(actor);
    return this.store.get(id, String(actor.id));
  }
  public async list(actor: ToolActor, keyword = '') {
    await this.authorize(actor);
    return (await this.store.list(String(actor.id))).filter((row) =>
      row.title.toLowerCase().includes(keyword.toLowerCase()),
    );
  }
  public async edit(
    actor: ToolActor,
    id: string,
    values: Parameters<ConversationStore['edit']>[1],
  ) {
    const row = await this.get(actor, id);
    if (row.state === 'running' || row.state === 'archived')
      throw new Error('CHAT_REQUEST_CONFLICT');
    if (
      Object.entries(values).every(
        ([key, value]) => row[key as keyof Conversation] === value,
      )
    )
      return;
    await this.store.edit(row, values);
  }
  public wire(row: Conversation) {
    return {
      sessionId: row.id,
      title: row.title,
      aiEmployee: { username: row.employee },
      options: { modelSettings: row.model },
      read: row.read,
      updatedAt: row.updatedAt.toISOString(),
      llmActiveState: row.state === 'running' ? 'streaming' : 'idle',
      state: row.state,
    };
  }
  private session(
    row: Conversation,
    history: BaseMessage[],
  ): AssistantChatSession {
    const employee = this.employees.get(row.employee);
    if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');
    return {
      id: row.id,
      userId: row.userId,
      employee:
        row.mode === 'structured'
          ? {
              ...employee,
              tools: [],
              chatSettings: { ...employee.chatSettings, enableTools: false },
            }
          : employee,
      model: row.model,
      pendingCallIds: row.pendingCallIds,
      history,
    };
  }
  private adapter(row: Conversation, schema?: ZodType) {
    return new AssistantChatAdapter(
      new AssistantTurn(
        this.container,
        this.models.create(row.model, schema),
        this.tools,
        this.calls,
        this.authorization,
      ),
      new ToolExecutor(
        this.container,
        this.tools,
        this.calls,
        this.authorization,
      ),
      this.calls,
      this.authorization,
      this.tools,
    );
  }
  public async history(actor: ToolActor, id: string) {
    const row = await this.get(actor, id);
    const history = await this.store.history(id);
    const calls = await this.calls.list(id);
    const rows: unknown[] = [];
    for (const message of history) {
      if (!HumanMessage.isInstance(message) && !AIMessage.isInstance(message))
        continue;
      const toolCalls: unknown[] = [];
      if (AIMessage.isInstance(message))
        for (const request of message.tool_calls ?? []) {
          const stored = calls.find(
            (call) =>
              call.messageId === message.id && call.modelCallId === request.id,
          );
          const following = history.slice(history.indexOf(message) + 1);
          const boundary = following.findIndex(
            (item) =>
              AIMessage.isInstance(item) || HumanMessage.isInstance(item),
          );
          const reply = (
            boundary < 0 ? following : following.slice(0, boundary)
          ).find(
            (item) =>
              ToolMessage.isInstance(item) && item.tool_call_id === request.id,
          );
          const result =
            stored?.result ??
            (ToolMessage.isInstance(reply) && typeof reply.content === 'string'
              ? JSON.parse(reply.content)
              : undefined);
          await AssistantChatAdapter.emitToolEvent(
            {
              call: {
                modelCallId: request.id,
                tool: request.name,
                arguments: request.args,
              },
              auto: stored?.auto ?? false,
              status: stored?.status ?? (reply ? 'rejected' : 'uncertain'),
              result,
            },
            async (event) => {
              if (event.type === 'tool_calls')
                toolCalls.push(...(event.body as unknown[]));
              else {
                const body = event.body as {
                  toolCall: object;
                  status: string;
                  content: unknown;
                };
                toolCalls.push({
                  ...body.toolCall,
                  status: body.status,
                  content: body.content,
                });
              }
            },
          );
        }
      rows.push({
        key: message.id,
        createdAt: message.additional_kwargs.createdAt,
        role: HumanMessage.isInstance(message) ? 'user' : row.employee,
        content: {
          messageId: message.id,
          content: typeof message.content === 'string' ? message.content : '',
          tool_calls: toolCalls,
        },
      });
    }
    return rows.reverse();
  }
  public async decide(
    actor: ToolActor,
    id: string,
    messageId: string,
    callId: string,
    body: unknown,
  ) {
    const row = await this.get(actor, id);
    if (row.mode !== 'chat' || row.state !== 'pending')
      throw new Error('CHAT_REQUEST_CONFLICT');
    const history = await this.store.history(id);
    const requestId = await this.store.claim(row);
    try {
      return await this.adapter(row).decide(
        actor,
        this.session(row, history),
        messageId,
        callId,
        body,
      );
    } finally {
      // ToolExecutor retains completed/uncertain status; a refused decision never creates a replay path.
      await this.store.finish(row, requestId, 'pending', row.pendingCallIds);
    }
  }
  public async prepare(
    actor: ToolActor,
    id: string,
    kind: 'send' | 'resume',
    body: unknown,
    signal: AbortSignal,
    schema?: ZodType,
  ) {
    const row = await this.get(actor, id);
    if (
      row.state === 'running' ||
      row.state === 'archived' ||
      row.state === 'failed' ||
      row.state === 'cancelled'
    )
      throw new Error('CHAT_REQUEST_CONFLICT');
    if (row.mode === 'structured' && !schema)
      throw new Error('UNSUPPORTED_CHAT_REQUEST');
    const history = await this.store.history(id);
    const session = this.session(row, history);
    const adapter = this.adapter(row, schema);
    if (kind === 'send') {
      if (row.state !== 'idle') throw new Error('CHAT_CONFIRMATION_REQUIRED');
      const request = await adapter.validateSend(actor, session, body);
      if (
        history.some(
          (message) =>
            HumanMessage.isInstance(message) &&
            message.additional_kwargs.requestKey === request.messages[0].key,
        )
      )
        throw new Error('CHAT_REQUEST_ALREADY_CONSUMED');
    } else {
      if (row.state !== 'pending')
        throw new Error('CHAT_REQUEST_ALREADY_CONSUMED');
      await adapter.validateResume(actor, session, body);
    }
    signal.throwIfAborted();
    const requestId = await this.store.claim(row);
    let started = false;
    return async (emit: Emit) => {
      if (started) throw new Error('CHAT_REQUEST_ALREADY_CONSUMED');
      started = true;
      try {
        const persist = (message: BaseMessage) =>
          this.store.append(id, requestId, message);
        const result = await adapter[kind](
          actor,
          session,
          body,
          signal,
          emit,
          persist,
        );
        signal.throwIfAborted();
        await this.store.finish(
          row,
          requestId,
          result.pending.length ? 'pending' : 'idle',
          result.pending.map((call) => call.id),
        );
        return result;
      } catch (error) {
        await this.store.finish(
          row,
          requestId,
          signal.aborted ? 'cancelled' : 'failed',
          row.pendingCallIds,
        );
        throw error;
      }
    };
  }
  public async text(
    actor: ToolActor,
    input: {
      employee: string;
      model: Conversation['model'];
      title: string;
      text: string;
      sessionId?: string;
      schema?: ZodType;
    },
    signal: AbortSignal,
  ) {
    const row = input.sessionId
      ? await this.get(actor, input.sessionId)
      : await this.create(
          actor,
          input.employee,
          input.model,
          input.title,
          input.schema ? 'structured' : 'chat',
        );
    if (
      row.employee !== input.employee ||
      row.mode !== (input.schema ? 'structured' : 'chat')
    )
      throw new Error('UNSUPPORTED_CHAT_REQUEST');
    const run = await this.prepare(
      actor,
      row.id,
      'send',
      {
        sessionId: row.id,
        aiEmployee: row.employee,
        model: row.model,
        messages: [
          {
            key: randomUUID(),
            role: 'user',
            content: { type: 'text', content: input.text },
          },
        ],
      },
      signal,
      input.schema,
    );
    const result = await run(async () => undefined);
    const last = result.messages.at(-1);
    return {
      text:
        AIMessage.isInstance(last) && typeof last.content === 'string'
          ? last.content
          : '',
      sessionId: row.id,
      paused: result.pending.length > 0,
      pending: result.pending.map((call) => ({
        name: call.tool,
        args: call.arguments,
      })),
    };
  }
}
