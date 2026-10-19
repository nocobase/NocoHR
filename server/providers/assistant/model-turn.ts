import { randomUUID } from 'node:crypto';

import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type { ServiceContainer } from '@nocobase/service-provider';

import type {
  AIEmployeeOptions,
  RegisteredTool,
  ToolActor,
} from '../../ai/contracts.js';
import { capabilityJsonValue } from '../upgrade/json-value.js';
import {
  toolArgumentDigest,
  type StoredToolCall,
  type ToolAuthorization,
} from './tool-executor.js';

export interface AssistantModel {
  reply(input: {
    messages: readonly BaseMessage[];
    tools: readonly RegisteredTool[];
    signal: AbortSignal;
    onText: (text: string) => Promise<void>;
  }): Promise<AIMessage>;
}

export interface PendingToolCallStore {
  create(call: StoredToolCall): Promise<void>;
}

export interface AssistantToolPolicy extends ToolAuthorization {
  decision(
    actor: ToolActor,
    employee: string,
    tool: string,
  ): Promise<'deny' | 'ask' | 'allow'>;
}

export interface AssistantTurnContext {
  actor: ToolActor;
  employee: AIEmployeeOptions;
  sessionId: string;
  history: readonly BaseMessage[];
  signal: AbortSignal;
  onText?: (text: string) => Promise<void>;
}

const turnState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  pending: Annotation<StoredToolCall[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
});

/** The graph owns model reasoning; authorization and side effects stay with application services. */
export class AssistantTurn {
  public constructor(
    private readonly container: ServiceContainer,
    private readonly model: AssistantModel,
    private readonly tools: ReadonlyMap<string, RegisteredTool>,
    private readonly pending: PendingToolCallStore,
    private readonly policy: AssistantToolPolicy,
  ) {}

  public run(input: AssistantTurnContext & { text: string }) {
    return this.invoke(input, [...input.history, new HumanMessage(input.text)]);
  }

  /** Continue a confirmed turn with server-owned ToolMessages, without inventing another user message. */
  public continue(input: AssistantTurnContext) {
    if (!ToolMessage.isInstance(input.history.at(-1)))
      throw new Error('TOOL_RESULT_REQUIRED');
    return this.invoke(input, [...input.history]);
  }

  private async invoke(
    input: AssistantTurnContext,
    messages: BaseMessage[],
  ): Promise<{ messages: BaseMessage[]; pending: StoredToolCall[] }> {
    const available = new Map<string, RegisteredTool>();
    if (input.employee.chatSettings?.enableTools !== false) {
      for (const reference of input.employee.tools ?? []) {
        const tool = this.tools.get(reference.name);
        if (!tool) throw new Error('EMPLOYEE_TOOL_NOT_AVAILABLE');
        available.set(reference.name, tool);
      }
    }
    const graph = new StateGraph(turnState)
      .addNode('model', async (state) => {
        input.signal.throwIfAborted();
        const message = await this.model.reply({
          messages: state.messages,
          tools: [...available.values()],
          signal: input.signal,
          onText: input.onText ?? (async () => undefined),
        });
        message.id = randomUUID();
        return { messages: [message] };
      })
      .addNode('tools', async (state) => {
        const message = state.messages.at(-1);
        if (
          !AIMessage.isInstance(message) ||
          message.invalid_tool_calls?.length
        )
          throw new Error('INVALID_MODEL_TOOL_MESSAGE');
        const replies: BaseMessage[] = [];
        const pending: StoredToolCall[] = [];
        const ids = new Set<string>();
        for (const request of message.tool_calls ?? []) {
          input.signal.throwIfAborted();
          if (!request.id || ids.has(request.id))
            throw new Error('INVALID_MODEL_TOOL_CALL');
          ids.add(request.id);
          const tool = available.get(request.name);
          if (
            !tool ||
            !tool.definition.schema ||
            !tool.definition.schema.safeParse(request.args).success
          )
            throw new Error('INVALID_MODEL_TOOL_CALL');
          await this.policy.authorize(
            input.actor,
            input.employee.username,
            input.sessionId,
            request.name,
          );
          const decision = await this.policy.decision(
            input.actor,
            input.employee.username,
            request.name,
          );
          if (decision === 'deny') {
            replies.push(
              new ToolMessage({
                tool_call_id: request.id,
                content: JSON.stringify({ code: 'TOOL_FORBIDDEN' }),
              }),
            );
            continue;
          }
          if (
            decision === 'ask' ||
            tool.defaultPermission !== 'ALLOW' ||
            tool.execution === 'frontend'
          ) {
            const call: StoredToolCall = {
              id: randomUUID(),
              userId: String(input.actor.id),
              sessionId: input.sessionId,
              employee: input.employee.username,
              tool: request.name,
              messageId: message.id,
              modelCallId: request.id,
              arguments: capabilityJsonValue(request.args),
              argumentDigest: toolArgumentDigest(request.args),
              status: 'pending',
            };
            await this.pending.create(call);
            pending.push(call);
            continue;
          }
          // Persist even automatically allowed calls before executing them, so a worker loss cannot replay a write.
          const call: StoredToolCall = {
            id: randomUUID(),
            userId: String(input.actor.id),
            sessionId: input.sessionId,
            employee: input.employee.username,
            tool: request.name,
            messageId: message.id,
            modelCallId: request.id,
            arguments: capabilityJsonValue(request.args),
            argumentDigest: toolArgumentDigest(request.args),
            status: 'pending',
          };
          await this.pending.create(call);
          // The caller supplies the same durable store to its executor; recording alone is insufficient to run a tool.
          const result = await this.executeAllowed(input.actor, call);
          replies.push(
            new ToolMessage({
              tool_call_id: request.id,
              content: JSON.stringify(capabilityJsonValue(result)),
            }),
          );
        }
        return { messages: replies, pending };
      })
      .addEdge(START, 'model')
      .addConditionalEdges('model', (state) => {
        const message = state.messages.at(-1);
        if (AIMessage.isInstance(message) && message.invalid_tool_calls?.length)
          throw new Error('INVALID_MODEL_TOOL_CALL');
        return AIMessage.isInstance(message) && message.tool_calls?.length
          ? 'tools'
          : END;
      })
      .addConditionalEdges('tools', (state) =>
        state.pending.length ? END : 'model',
      )
      .compile();
    const result = await graph.invoke(
      {
        messages: [
          ...(input.employee.systemPrompt &&
          !SystemMessage.isInstance(messages[0])
            ? [new SystemMessage(input.employee.systemPrompt)]
            : []),
          ...messages,
        ],
      },
      { signal: input.signal, recursionLimit: 32 },
    );
    return { messages: result.messages, pending: result.pending };
  }

  private async executeAllowed(
    actor: ToolActor,
    call: StoredToolCall,
  ): Promise<unknown> {
    // Only stores with atomic execution support can enable automatic tools.
    const store = this.pending as PendingToolCallStore &
      Partial<import('./tool-executor.js').ToolCallStore>;
    if (!store.find || !store.claim || !store.complete)
      throw new Error('DURABLE_TOOL_EXECUTION_REQUIRED');
    const { ToolExecutor } = await import('./tool-executor.js');
    const executor = new ToolExecutor(
      this.container,
      this.tools,
      store as import('./tool-executor.js').ToolCallStore,
      this.policy,
    );
    const result = await executor.decide(actor, {
      id: call.id,
      sessionId: call.sessionId,
      digest: call.argumentDigest,
      decision: 'approve',
    });
    if (result.status !== 'completed')
      throw new Error('TOOL_CALL_STATE_CONFLICT');
    return result.result;
  }
}
