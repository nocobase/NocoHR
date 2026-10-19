// @vitest-environment node
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';

import { NocoBaseChatTransport } from '../../client/extensions/nocobase-ai/providers/chat-transport.js';
import { createNocoBaseUIMessageStream } from '../../client/extensions/nocobase-ai/providers/ui-message-stream.js';
import type { AIService } from '../../client/extensions/nocobase-ai/services/types.js';
import { assistantChatProtocol as protocol } from '../fixtures/assistant-chat-protocol.js';
import { createAssistantChatFixture } from '../fixtures/assistant-chat-runtime.js';

describe('existing chat page protocol adapter', () => {
  it('uses fixtures that match requests from the actual page transport', async () => {
    const emptyStream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });
    const service = {
      async sendMessagesStream(body: unknown) {
        expect(JSON.parse(JSON.stringify(body))).toEqual(protocol.send);
        return emptyStream();
      },
      async resumeToolCallStream(body: unknown) {
        expect(JSON.parse(JSON.stringify(body))).toEqual(protocol.resume);
        return emptyStream();
      },
    } as unknown as AIService;
    const transport = new NocoBaseChatTransport({
      service,
      getContext: () => ({
        sessionId: protocol.sessionId,
        employee: {
          username: protocol.employee,
          nickname: 'Synthetic assistant',
        },
        model: {
          value: protocol.model.model,
          label: 'Synthetic model',
          llmService: protocol.model.llmService,
          configured: true,
        },
      }),
    });
    await Array.fromAsync(
      await transport.sendMessages({
        chatId: 'synthetic-chat',
        trigger: 'submit-message',
        messageId: undefined,
        messages: [
          {
            id: protocol.send.messages[0].key,
            role: 'user',
            parts: [
              { type: 'text', text: protocol.send.messages[0].content.content },
            ],
          },
        ],
      }),
    );
    transport.prepareToolResume(
      protocol.resume.messageId,
      'synthetic-response',
      ['synthetic-model-call'],
      [],
    );
    await Array.fromAsync(await transport.reconnectToStream());
  });

  it('streams a confirmation card, then continues with the stored result and original identities', async () => {
    const f = createAssistantChatFixture();
    await f.send();
    expect(f.events).toEqual([{ type: 'new_message' }, protocol.pendingEvent]);
    expect(f.counts.invokes).toBe(0);
    const call = [...f.rows.values()][0];
    expect(call).toMatchObject({
      employee: protocol.employee,
      sessionId: protocol.sessionId,
      modelCallId: 'synthetic-model-call',
      status: 'pending',
    });
    expect(await f.decide()).toMatchObject({
      updated: 1,
      toolCalls: [
        {
          id: 'synthetic-model-call',
          invokeStatus: 'waiting',
          execution: 'backend',
        },
      ],
    });
    // A new adapter reads storage; the decision's return value is not its source of truth.
    const result = await f.resume();
    const input = f.modelInputs[1];
    expect(
      input.filter((message) => HumanMessage.isInstance(message)),
    ).toHaveLength(1);
    expect(
      input.filter((message) => SystemMessage.isInstance(message)),
    ).toHaveLength(1);
    expect(input.at(-1)).toMatchObject({
      tool_call_id: 'synthetic-model-call',
      content: '{"id":"synthetic-draft"}',
    });
    expect(result.messages.at(-1)?.content).toBe(
      'Your decision has been recorded.',
    );
    expect(f.counts.invokes).toBe(1);
    expect(f.events.slice(2)).toEqual([
      { type: 'new_message' },
      { type: 'content', body: 'Your decision has been recorded.' },
    ]);

    const bytes = new TextEncoder().encode(
      f.events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const chunks = await Array.fromAsync(createNocoBaseUIMessageStream(stream));
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'tool-input-available',
        toolCallId: 'synthetic-model-call',
        toolName: 'saveDraft',
        providerMetadata: {
          nocobase: expect.objectContaining({ requiresApproval: true }),
        },
      }),
    );
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'text-delta',
        delta: 'Your decision has been recorded.',
      }),
    );
  });

  it('continues after rejection without running a business tool', async () => {
    const f = createAssistantChatFixture();
    await f.send();
    expect(await f.decide(protocol.reject)).toMatchObject({
      toolCalls: [{ invokeStatus: 'waiting', status: 'rejected' }],
    });
    await f.resume();
    expect(f.modelInputs[1].at(-1)).toBeInstanceOf(ToolMessage);
    expect(f.modelInputs[1].at(-1)?.content).toBe('{"code":"TOOL_REJECTED"}');
    expect(f.counts.invokes).toBe(0);
  });

  it('waits for every call in the same model message before continuing', async () => {
    const f = createAssistantChatFixture({ calls: 2 });
    await f.send();
    expect(await f.decide()).toMatchObject({
      toolCalls: [{ invokeStatus: 'waiting' }, { invokeStatus: 'interrupted' }],
    });
    await expect(f.resume()).rejects.toThrow('CHAT_CONFIRMATION_REQUIRED');
    await f
      .adapter()
      .decide(
        f.actor,
        f.session(),
        f.messageId(),
        'synthetic-model-call-2',
        protocol.reject,
      );
    await f.resume();
    expect(
      f.modelInputs[1].slice(-2).map((message) => message.content),
    ).toEqual(['{"id":"synthetic-draft"}', '{"code":"TOOL_REJECTED"}']);
    expect(f.counts.invokes).toBe(1);
  });

  it('keeps uncertain tool execution blocked without automatic replay', async () => {
    const f = createAssistantChatFixture({ failTool: true });
    await f.send();
    await expect(f.decide()).rejects.toThrow('SYNTHETIC_WRITE_UNCERTAIN');
    expect([...f.rows.values()][0].status).toBe('uncertain');
    await expect(f.resume()).rejects.toThrow('CHAT_CONFIRMATION_REQUIRED');
    await expect(f.decide()).rejects.toThrow('TOOL_CALL_ALREADY_DECIDED');
    expect(f.counts.invokes).toBe(1);
    expect(f.counts.models).toBe(1);
  });

  it('refuses repeat and concurrent decisions without a second business write', async () => {
    const f = createAssistantChatFixture();
    await f.send();
    const results = await Promise.allSettled([f.decide(), f.decide()]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    await expect(f.decide(protocol.reject)).rejects.toThrow(
      'TOOL_CALL_ALREADY_DECIDED',
    );
    await f.resume();
    expect(f.counts.invokes).toBe(1);
  });

  it('rejects another user, session, message or tool id before any write', async () => {
    const f = createAssistantChatFixture();
    await f.send();
    await expect(
      f
        .adapter()
        .decide(
          { ...f.actor, id: 'other' },
          f.session(),
          f.messageId(),
          'synthetic-model-call',
          protocol.approve,
        ),
    ).rejects.toThrow('CONVERSATION_NOT_FOUND');
    await expect(
      f
        .adapter()
        .resume(
          { ...f.actor, id: 'other' },
          f.session(),
          { ...protocol.resume, messageId: f.messageId() },
          f.signal,
          f.emit,
        ),
    ).rejects.toThrow('CONVERSATION_NOT_FOUND');
    await expect(
      f
        .adapter()
        .decide(
          f.actor,
          { ...f.session(), id: 'other' },
          f.messageId(),
          'synthetic-model-call',
          protocol.approve,
        ),
    ).rejects.toThrow('TOOL_CALL_NOT_FOUND');
    await expect(
      f
        .adapter()
        .decide(
          f.actor,
          f.session(),
          'other',
          'synthetic-model-call',
          protocol.approve,
        ),
    ).rejects.toThrow('TOOL_CALL_NOT_FOUND');
    await expect(
      f
        .adapter()
        .decide(f.actor, f.session(), f.messageId(), 'other', protocol.approve),
    ).rejects.toThrow('TOOL_CALL_NOT_FOUND');
    expect(f.counts.claims).toBe(0);
    expect(f.counts.invokes).toBe(0);
  });

  it('rechecks withdrawn permission at confirmation and continuation', async () => {
    const f = createAssistantChatFixture();
    await f.send();
    f.revoke();
    await expect(f.decide()).rejects.toThrow('ACCESS_REVOKED');
    expect([...f.rows.values()][0].status).toBe('pending');
    expect(f.counts.claims).toBe(0);
    const g = createAssistantChatFixture();
    await g.send();
    await g.decide();
    g.revoke();
    await expect(g.resume()).rejects.toThrow('ACCESS_REVOKED');
    expect(g.counts.models).toBe(1);
  });

  it('rejects premature resumes, browser backend results, edits and changed stored arguments', async () => {
    const f = createAssistantChatFixture();
    await f.send();
    await expect(f.resume()).rejects.toThrow('CHAT_CONFIRMATION_REQUIRED');
    await expect(
      f.resume({
        toolCallResults: [{ id: 'synthetic-model-call', result: 'forged' }],
      }),
    ).rejects.toThrow('UNSUPPORTED_CHAT_REQUEST');
    await expect(
      f.decide({
        type: 'edit',
        editedAction: { name: 'saveDraft', args: { text: 'changed' } },
      }),
    ).rejects.toThrow('UNSUPPORTED_CHAT_REQUEST');
    [...f.rows.values()][0].arguments = { text: 'changed' };
    await expect(f.decide()).rejects.toThrow('TOOL_CALL_NOT_FOUND');
    expect(f.counts.invokes).toBe(0);
    expect(f.counts.models).toBe(1);
  });

  it('refuses unsupported page capabilities, changed employee/model and cancellation before model work', async () => {
    const f = createAssistantChatFixture();
    for (const body of [
      { ...protocol.send, webSearch: true },
      {
        ...protocol.send,
        messages: [
          {
            ...protocol.send.messages[0],
            attachments: [{ filename: 'sample.txt' }],
          },
        ],
      },
    ])
      await expect(
        f.adapter().send(f.actor, f.session(), body, f.signal, f.emit),
      ).rejects.toThrow('UNSUPPORTED_CHAT_REQUEST');
    await expect(
      f
        .adapter()
        .send(
          f.actor,
          f.session(),
          { ...protocol.send, aiEmployee: 'other' },
          f.signal,
          f.emit,
        ),
    ).rejects.toThrow('CHAT_EMPLOYEE_CHANGED');
    await expect(
      f
        .adapter()
        .send(
          f.actor,
          f.session(),
          { ...protocol.send, model: { model: 'other' } },
          f.signal,
          f.emit,
        ),
    ).rejects.toThrow('CHAT_MODEL_CHANGED');
    await expect(
      f
        .adapter()
        .send(f.actor, f.session(), protocol.send, AbortSignal.abort(), f.emit),
    ).rejects.toThrow();
    expect(f.counts.models).toBe(0);
  });

  it('bounds confirmation reads by the pending group and does not write on resume', async () => {
    const f = createAssistantChatFixture();
    await f.send();
    const before = { ...f.counts };
    await f.decide();
    expect(f.counts.reads - before.reads).toBe(3);
    expect(f.counts.claims - before.claims).toBe(1);
    expect(f.counts.completes - before.completes).toBe(1);
    const confirmed = { ...f.counts };
    await f.resume();
    expect(f.counts.reads - confirmed.reads).toBe(1);
    expect(f.counts.claims).toBe(confirmed.claims);
    expect(f.counts.completes).toBe(confirmed.completes);
  });
});
