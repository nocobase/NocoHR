# Capability migration foundations

The application is preparing to replace its retired AI Employee and incompatible Workflow plugins before merging template `1.0.0-beta.61`. The current template declaration remains `1.0.0-beta.54`. The existing plugins remain the active runtimes; the replacement foundations do not register routes, start workers or change the deployment's configuration.

## Implemented boundaries

- `server/ai/contracts.ts` owns employee and tool declarations. Existing employee prompts, names, tool schemas and business implementations remain unchanged. The temporary provider adapter registers these declarations with the existing AI runtime.
- `server/providers/assistant/` supplies a LangGraph model/tool turn, a LangChain streaming adapter, durable tool-call storage and a confirmation executor. Employee tool registration, argument validation, server authorization and confirmation policy bound model requests. ASK calls retain their message and model-call identities; only a user decision can execute them. Automatically allowed calls also acquire durable execution state before invoking business code.
- `server/providers/processes/` supplies definition validation, serialized artifact validation, event deduplication and persisted node execution. Artifacts retain input validation after loading without source code. Definition changes, unknown node types, unavailable handlers and cycles fail before execution.
- `server/providers/upgrade/` supplies a metadata-only cutover gate and a transactional copy ledger. Replaying a copy preserves subsequent runtime state. Changed source records or missing target records fail verification. Digests distinguish dates, bigint values and ordinary JSON values.
- New migrations create application-owned state only. Rollback refuses populated state instead of deleting it. Historical plugin tables and existing migration sources are unchanged.

An execution error after a possible business write marks a tool call or process as uncertain. It cannot trigger an automatic retry. A process node claimed by a lost worker also cannot be replayed by another engine instance. Recovery policy and worker ownership must be integrated before this implementation becomes an active runtime.

## Read-only cutover check

`pnpm nocobase app upgrade-preflight --inventory <path>.inventory.json` reads a metadata inventory inside the application directory. It does not connect to a database. The inventory contains capability identifiers and counts, never credentials, messages, workflow inputs or results. Invalid input produces a fixed diagnostic without echoing its contents.

The command currently reports the replacement runtimes as unverified even for an empty inventory. A synthetic empty inventory is not evidence that an existing installation has no data. Readiness must be based on an actual installation's metadata, complete capability adapters and integration evidence.

## Remaining integration

The foundations are not a complete plugin replacement. Conversation and file storage, streaming API compatibility, approval continuation, configured model/provider adapters, knowledge/skills/MCP adapters, settings pages, background AI calls and Feishu integration still need implementation and validation. Workflow definition/version management, parameters, typed source tooling, artifact resources, custom instructions, jobs, scheduler completion and management pages are also pending.

Historical record mappings require the installed source versions and metadata inventory. Preserve original package namespaces and checksums when retaining migration sources; never re-run their migrations under an application namespace. Drain existing tasks before cutover and require a new user decision for transferred pending tool calls. Unknown capabilities, missing artifacts, missing keys and unexplained historical states prevent switching runtimes.

After both capabilities pass their acceptance checks, remove the old registrations and packages, merge the template's source and compatible dependencies, and run the complete application checks and strict source/compiled startup verification. The template version must change only after that source merge.
