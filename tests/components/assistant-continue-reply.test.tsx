// @vitest-environment jsdom
import {
  AIContext,
  type AIProviderValue,
} from '../../client/extensions/nocobase-ai/providers/ai-context.js';
import { AIChatProvider } from '../../client/extensions/nocobase-ai/providers/chat-provider.js';
import { useAIChatBase } from '../../client/extensions/nocobase-ai/providers/chat-context.js';
import { ChatMessages } from '../../client/extensions/nocobase-ai/components/chat/chat-messages.js';
import { NocoBaseChatTransport } from '../../client/extensions/nocobase-ai/providers/chat-transport.js';
import type { AIService } from '../../client/extensions/nocobase-ai/services/types.js';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useConversationHistory } from '../../client/extensions/nocobase-ai/providers/use-conversation-history.js';
import { useChatMessageActions } from '../../client/extensions/nocobase-ai/providers/use-chat-message-actions.js';
import { getDecidedToolMessage } from '../../client/extensions/nocobase-ai/providers/chat-message-utils.js';
import { AIChatMessageList } from '../../client/extensions/nocobase-ai/components/chat/chat-messages.js';
import type { AIChatMessage } from '../../client/extensions/nocobase-ai/providers/types.js';

// Use real chat contexts; stub unrelated rich cards and locale infrastructure.
vi.mock(
  '../../client/extensions/nocobase-ai/providers/index.js',
  async () =>
    import('../../client/extensions/nocobase-ai/providers/chat-context.js'),
);
vi.mock(
  '../../client/extensions/nocobase-ai/components/chat/chat-message.js',
  () => ({ ChatMessage: () => <div>Saved tool result</div> }),
);
vi.mock(
  '../../client/extensions/nocobase-ai/components/chat/chat-empty-state.js',
  () => ({ ChatEmptyState: () => null }),
);
vi.mock(
  '../../client/extensions/nocobase-ai/locales/use-ai-translate.js',
  () => ({
    useAITranslate: () => (_key: string, fallback: string) => fallback,
  }),
);
afterEach(cleanup);

const message = (
  state:
    | 'output-available'
    | 'output-error'
    | 'input-available' = 'output-available',
): AIChatMessage => ({
  id: 'saved-message',
  role: 'assistant',
  metadata: { serverMessageId: 'saved-message' },
  parts: [
    {
      type: 'dynamic-tool',
      toolName: 'action',
      toolCallId: 'saved-call',
      state,
      input: {},
      ...(state === 'output-error'
        ? { errorText: 'BUSINESS_REFUSED' }
        : state === 'output-available'
          ? { output: { value: 42 } }
          : {}),
      callProviderMetadata: {
        nocobase: { requiresApproval: state === 'input-available' },
      },
    } as AIChatMessage['parts'][number],
  ],
});

function actionFixture() {
  const chat = {
    id: 'assistant-session',
    status: 'ready',
    messages: [message()],
    resumeStream: vi.fn<() => Promise<void>>(async () => undefined),
  };
  const transport = { prepareToolResume: vi.fn(), cancelToolResume: vi.fn() };
  const ai = { updateToolCallDecision: vi.fn(), invokeToolCall: vi.fn() };
  const setError = vi.fn();
  const options = {
    ai,
    activeChat: chat,
    getChat: () => chat,
    stateRef: { current: { activeConversationId: chat.id } },
    chatSurfaceOpenRef: { current: true },
    transportsRef: { current: new Map([[chat.id, transport]]) },
    getRuntimeContext: () => ({ employeeUsername: 'employee' }),
    refreshConversationMessages: vi.fn(),
    setHistoryError: setError,
    editingSnapshotRef: { current: undefined },
    setEditingMessageId: vi.fn(),
    getConversationAttachments: () => [],
    getConversationWorkContext: () => [],
    setConversationAttachments: vi.fn(),
    setConversationWorkContext: vi.fn(),
    dispatch: vi.fn(),
    requestComposerFocus: vi.fn(),
  } as unknown as Parameters<typeof useChatMessageActions>[0];
  return { chat, transport, ai, setError, options };
}

describe('saved tool decision continuation', () => {
  it('offers an explicit page action after reopen without executing or deciding a tool', async () => {
    const f = actionFixture();
    const hook = renderHook(() => useChatMessageActions(f.options));
    const { rerender } = render(
      <AIChatMessageList
        messages={f.chat.messages}
        continueReply={hook.result.current.continueReply}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue reply' }));
    await waitFor(() => expect(f.chat.resumeStream).toHaveBeenCalledTimes(1));
    expect(f.transport.prepareToolResume).toHaveBeenCalledWith(
      'saved-message',
      expect.stringMatching(/^assistant-/),
      ['saved-call'],
      [],
    );
    expect(f.ai.updateToolCallDecision).not.toHaveBeenCalled();
    expect(f.ai.invokeToolCall).not.toHaveBeenCalled();
    expect(f.chat.messages[0]).toEqual(message());
    rerender(
      <AIChatMessageList
        messages={f.chat.messages}
        continueReply={hook.result.current.continueReply}
        status='submitted'
      />,
    );
    expect(
      (
        screen.getByRole('button', {
          name: 'Continue reply',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    rerender(
      <AIChatMessageList
        messages={f.chat.messages}
        continueReply={hook.result.current.continueReply}
        readOnly
      />,
    );
    expect(screen.queryByRole('button', { name: 'Continue reply' })).toBeNull();
  });

  it('connects the actual chat Provider, restored history, page button and transport', async () => {
    let finished = false;
    const resume = vi.fn(async () => {
      finished = true;
      const events = [
        { type: 'new_message', body: { id: 'final-reply' } },
        { type: 'content', body: { content: 'Done' } },
      ];
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''),
            ),
          );
          controller.close();
        },
      });
    });
    const model = {
      llmService: 'synthetic',
      value: 'synthetic',
      label: 'Synthetic',
    };
    const employee = {
      username: 'employee',
      nickname: 'Employee',
      position: '',
      greeting: '',
    };
    const value = {
      configurationStatus: 'ready',
      employees: [employee],
      models: [model],
      hasEnabledModels: true,
      listConversations: vi.fn(async () => [
        {
          id: 'assistant-session',
          title: 'Saved',
          employeeUsername: 'employee',
          updatedAt: new Date().toISOString(),
        },
      ]),
      getConversationMessages: vi.fn(async () =>
        finished
          ? [
              {
                id: 'final-reply',
                role: 'assistant',
                metadata: { serverMessageId: 'final-reply' },
                parts: [{ type: 'text', text: 'Done' }],
              },
            ]
          : [message()],
      ),
      getConversationActiveState: vi.fn(async () =>
        finished ? 'idle' : 'pending',
      ),
      createTransport: ({ getContext }: { getContext: () => never }) =>
        new NocoBaseChatTransport({
          service: { resumeToolCallStream: resume } as unknown as AIService,
          getContext,
        }),
      updateToolCallDecision: vi.fn(),
      invokeToolCall: vi.fn(),
      canAutoApproveToolCall: () => false,
    } as unknown as AIProviderValue;
    function Page() {
      const chat = useAIChatBase();
      return (
        <>
          <button onClick={() => chat.selectConversation('assistant-session')}>
            Open saved conversation
          </button>
          <ChatMessages />
        </>
      );
    }
    render(
      <AIContext.Provider value={value}>
        <AIChatProvider id='continuation-page'>
          <Page />
        </AIChatProvider>
      </AIContext.Provider>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Open saved conversation' }),
    );
    const button = await screen.findByRole('button', {
      name: 'Continue reply',
    });
    expect(value.getConversationMessages).toHaveBeenCalledTimes(1);
    expect(value.getConversationActiveState).toHaveBeenCalledTimes(1);
    expect(resume).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(resume).toHaveBeenCalledTimes(1));
    expect(resume).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'assistant-session',
        messageId: 'saved-message',
        toolCallResults: [],
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Continue reply' }),
      ).toBeNull(),
    );
    expect(value.updateToolCallDecision).not.toHaveBeenCalled();
    expect(value.invokeToolCall).not.toHaveBeenCalled();
  });

  it('blocks repeated clicks while continuation is in flight', async () => {
    const f = actionFixture();
    let release!: () => void;
    f.chat.resumeStream.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const { result } = renderHook(() => useChatMessageActions(f.options));
    await act(async () => {
      const first = result.current.continueReply();
      await result.current.continueReply();
      expect(f.chat.resumeStream).toHaveBeenCalledTimes(1);
      release();
      await first;
    });
    expect(f.transport.prepareToolResume).toHaveBeenCalledTimes(1);
  });

  it('preserves business errors and removes a failed continuation placeholder', async () => {
    const f = actionFixture();
    f.chat.messages = [message('output-error')];
    f.chat.resumeStream.mockRejectedValue(new Error('CHAT_REQUEST_CONFLICT'));
    const { result } = renderHook(() => useChatMessageActions(f.options));
    await act(() => result.current.continueReply());
    expect(f.chat.messages).toEqual([message('output-error')]);
    expect(f.transport.cancelToolResume).toHaveBeenCalledWith('saved-message');
    expect(f.setError).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'CHAT_REQUEST_CONFLICT' }),
    );
    expect(f.ai.invokeToolCall).not.toHaveBeenCalled();
  });

  it('does not offer a finished reply or an incompletely decided group', () => {
    expect(getDecidedToolMessage([message('input-available')])).toBeUndefined();
    expect(
      getDecidedToolMessage([
        message(),
        {
          id: 'reply',
          role: 'assistant',
          metadata: { serverMessageId: 'reply' },
          parts: [{ type: 'text', text: 'Done' }],
        },
      ]),
    ).toBeUndefined();
    expect(getDecidedToolMessage([message('output-error')])).toBeDefined();
  });

  it('reloads persisted pending state on close/reopen and never auto-resumes it', async () => {
    const f = actionFixture();
    const getMessages = vi.fn(async () => [message()]);
    const getState = vi.fn(async () => 'pending');
    const onError = vi.fn();
    const onRead = vi.fn();
    const getChat = () => f.chat as never;
    const getId = () => f.chat.id;
    const getTransport = () => f.transport as never;
    const hook = renderHook(
      ({ open }) =>
        useConversationHistory({
          chatSurfaceOpen: open,
          activeConversationId: f.chat.id,
          getActiveConversationId: getId,
          getChat,
          getTransport,
          getConversationMessages: getMessages,
          getConversationActiveState: getState,
          onMarkRead: onRead,
          onError,
        }),
      { initialProps: { open: true } },
    );
    await waitFor(() =>
      expect(hook.result.current.pendingConversationId).toBe(f.chat.id),
    );
    expect(f.chat.resumeStream).not.toHaveBeenCalled();
    hook.rerender({ open: false });
    hook.rerender({ open: true });
    await waitFor(() => expect(getState).toHaveBeenCalledTimes(2));
    expect(hook.result.current.pendingConversationId).toBe(f.chat.id);
    expect(f.chat.resumeStream).not.toHaveBeenCalled();
  });

  it('ignores late state responses after switching conversations', async () => {
    const f = actionFixture();
    let resolve!: (state: string) => void;
    const getState = vi.fn(
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    );
    let active = f.chat.id;
    const getId = () => active;
    const getChat = () => f.chat as never;
    const getMessages = async () => [message()];
    const getTransport = () => undefined;
    const onRead = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useConversationHistory({
        chatSurfaceOpen: true,
        activeConversationId: f.chat.id,
        getActiveConversationId: getId,
        getChat,
        getTransport,
        getConversationMessages: getMessages,
        getConversationActiveState: getState,
        onMarkRead: onRead,
        onError,
      }),
    );
    await waitFor(() => expect(getState).toHaveBeenCalledTimes(1));
    active = 'another-session';
    await act(async () => resolve('pending'));
    expect(result.current.pendingConversationId).toBeUndefined();
  });
});
