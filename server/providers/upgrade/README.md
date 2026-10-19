# Capability migration foundations

The application is preparing to replace its retired AI Employee and incompatible Workflow plugins before merging template `1.0.0-beta.70` (paired with `@nocobase/app-skills@0.1.0-beta.38`, from `https://registry.npmjs.org`). The current template declaration remains `1.0.0-beta.54`. The existing plugins remain the active runtimes; the replacement foundations do not register routes, start workers or change the deployment's configuration.

## Implemented boundaries

- `server/ai/contracts.ts` owns employee and tool declarations. Existing employee prompts, names, tool schemas and business implementations remain unchanged. The temporary provider adapter registers these declarations with the existing AI runtime.
- `server/providers/assistant/` supplies a LangGraph model/tool turn, a LangChain streaming adapter, durable tool-call storage and a confirmation executor. Employee tool registration, argument validation, server authorization and confirmation policy bound model requests. ASK calls retain their message and model-call identities; only a user decision can execute them. Automatically allowed calls also acquire durable execution state before invoking business code.
- `server/providers/processes/` supplies definition validation, serialized artifact validation, event deduplication and persisted node execution. Artifacts retain input validation after loading without source code. Definition changes, unknown node types, unavailable handlers and cycles fail before execution.
- `server/providers/upgrade/` supplies a metadata-only cutover gate and a transactional copy ledger. Replaying a copy preserves subsequent runtime state. Changed source records or missing target records fail verification. Digests distinguish dates, bigint values and ordinary JSON values.
- New migrations create application-owned state only. Rollback refuses populated state instead of deleting it. Historical plugin tables and existing migration sources are unchanged.

An execution error after a possible business write marks a tool call or process as uncertain. It cannot trigger an automatic retry. A process node claimed by a lost worker also cannot be replayed by another engine instance. Drain active work before cutover and resolve uncertain executions individually; automatic takeover, leases and replay are outside the current scope.

## Read-only cutover check

`pnpm nocobase app upgrade-preflight --inventory <path>.inventory.json` reads a metadata inventory inside the application directory. It does not connect to a database. The inventory contains capability identifiers and counts, never credentials, messages, workflow inputs or results. Invalid input produces a fixed diagnostic without echoing its contents.

The command currently reports the replacement runtimes as unverified even for an empty inventory. A synthetic empty inventory is not evidence that an existing installation has no data. Readiness must be based on an actual installation's metadata, complete capability adapters and integration evidence.

## Remaining integration

### Text and backend confirmation adapter

`AssistantChatAdapter` adapts the text-only subset of the current page protocol: `NocoBaseAIService.sendMessagesStream`, `updateToolCallDecision` and `resumeToolCallStream`. Synthetic requests and events are in `tests/fixtures/assistant-chat-protocol.ts`; behavior tests use the real `AssistantTurn`, `ToolExecutor` and client SSE decoder. No client page or production route is changed.

The conversation host must load an authenticated `AssistantChatSession` and provide conversation and tool authorization from the existing permission services. Session history, employee configuration, selected model and pending row identities are server-owned. Pass the existing user decision body unchanged, and use the stored model-call identifier as the page's tool-call identifier. The adapter validates the owning user, employee, session, model, message, tool and argument digest. It executes approvals through the existing atomic tool executor and resumes with persisted results or a rejection result, without adding a user message or running the tool again. Completed result reads reuse the existing nullable `assistantToolCalls.result` column; no schema or migration is added.

The host still needs transcript persistence and message-ID mapping, serialized turn handling, HTTP/SSE binding, cancellation/error forwarding and the actual provider configuration. These are integration prerequisites, not supplied by this adapter. In particular, do not bind these methods alongside the old runtime's writers or expose `AssistantChatSession` as request JSON. Resume itself does not claim a conversation turn: the host must prevent duplicate/concurrent model continuations and commit the returned transcript before accepting the next turn. An uncertain business execution remains blocked without replay.

Only text with backend tools is supported in this unit. Editing tool arguments, frontend tools, attachments, task/system overrides, work context, web search and resend/reconnect are rejected rather than silently ignored. Their normal page flows, background calls and historical mappings remain follow-up integration work before switching runtimes.

For a group of N pending backend calls, approval adds 2N+1 tool-row reads, one conditional claim and one result write; rejection adds 2N+1 reads and one conditional claim. Resume reads N rows and adds no writes before model execution. A new model turn retains the existing tool persistence costs (one create per requested call, plus execution writes for automatically allowed calls). Conversation/transcript and authorization costs belong to the host and are additional. No new polling, locks, leases, workers or transactions are introduced. Current production request costs are unchanged because this adapter is not registered.

### Cutover prerequisites

The foundations are not a complete plugin replacement. Conversation and file storage, streaming API compatibility, approval continuation, configured model/provider adapters, knowledge/skills/MCP adapters, settings pages, background AI calls and Feishu integration still need implementation and validation. Workflow definition/version management, parameters, typed source tooling, artifact resources, custom instructions, jobs, scheduler completion and management pages are also pending.

Historical record mappings require the installed source versions and metadata inventory. Preserve original package namespaces and checksums when retaining migration sources; never re-run their migrations under an application namespace. Drain existing tasks before cutover and require a new user decision for transferred pending tool calls. Unknown capabilities, missing artifacts, missing keys and unexplained historical states prevent switching runtimes.

After both capabilities pass their acceptance checks, remove the old registrations and packages, merge the template's source and compatible dependencies, and run the complete application checks and strict source/compiled startup verification. The template version must change only after that source merge.
