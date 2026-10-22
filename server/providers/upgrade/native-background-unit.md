# Native ordinary generation

Configuration proposals and ordinary structured generation now use the official Agents services. Existing business authorization, output validation, review and persistence stay in their owning services. The complete template upgrade remains unaccepted; keep the pull request in draft and do not deploy it.

## Caller inventory

The inventory compares the production composition at `cbffcb3` with this unit. Each migrated operation has one native execution path. Native configuration and conversations are not copied from old tables.

| Caller                                                                                                 | Before                                              | After                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Employee/header chat                                                                                   | Native own-profile and profile-change tools         | Also exposes the existing `draftSettingsChange` tool, guarded before user-subject refresh; personnel administration and individual draft confirmation still apply            |
| `automation-tasks.ts` shared `structured` callback                                                     | Application assistant runner                        | Native JSON generation for framework review/drafts, HR preparation/import/checklist/compliance/sync/attendance wording, content/FAQ/questions, examination and scenario work |
| Learning-plan sites                                                                                    | Native background generator                         | Same scope, tool-free result, validation and draft service; shares only the native result consumer                                                                           |
| Recruiting-mail `structured` binding in `hr/index.ts`                                                  | Application runner                                  | Native generation under the existing automation owner                                                                                                                        |
| `licensed/index.ts`                                                                                    | Application runner                                  | Native transfer qualification notice wording                                                                                                                                 |
| Recruiting assistant, initial-interview report, preboarding extraction                                 | Application runner                                  | Native structured results; existing resume scrubbing, requirement/quote checks, suggestion/draft review and text-only extraction remain                                      |
| Profile analyst and people-condition parser                                                            | Application runner                                  | Native results with the original caller/recipient context; the summary route passes the complete actor instead of only a user ID                                             |
| Performance assistant                                                                                  | Application runner                                  | Native structured summaries, goal/comment drafts and calibration suggestions                                                                                                 |
| Talent-review analyst, translations, practical notes/checklists and knowledge-candidate topic grouping | Application runner                                  | Native structured generation over the existing authorized/projected facts; this does not connect the official Knowledge retrieval/vector service                             |
| Practice coach and evaluation                                                                          | Application runner                                  | Each existing full-transcript JSON prompt uses a fresh tool-free native background session; rubric/quote checking and existing business corrections remain                   |
| Payroll anomaly explanation                                                                            | Application runner                                  | Native structured wording; the separate vendor-bill tool reply remains retained                                                                                              |
| Weekly certification briefs                                                                            | Old assistant-enabled check plus application runner | Official default-model probe and native generation; same scoped facts, length cap, per-head notification and existing rule fallback                                          |

`native-ai/structured.ts` requires an explicit AuthorizationContext. It rejects `identity.keyScope` before model probing or session creation, then uses the official default and the native background `run/get` consumer. It offers no tools, old employee/model selector, text guessing or compatibility retry. Native `OUTPUT_INVALID` maps to the existing `AIShapeError`; missing configuration maps to `AIUnavailableError`; other model failures propagate to each caller's existing error handling. Native execution limits replace the old runner's per-call timeout wrapper. Existing business-specific wording/quote corrections can still request another generation; one native execution does not promise one request for an entire multi-item business task.

Request-driven transitions that dispatch under a stored owner reject scope-bearing credentials first: manual automation start/retry, practical observation/checklist generation, translation requests and profile-summary regeneration. Trusted scheduled work still resolves its stored owner through the existing automation service. Recipient contexts and direct caller contexts are forwarded where they already exist; no permission-intersection policy or new grant is introduced.

Configuration drafting reuses the existing tool name, input schema, draft store and personnel settings page. It may propose only the existing settings/field/approval-chain kinds. There is no apply tool, automatic confirmation, extra HTTP API or new storage. Malformed tool arguments are rejected by SDK input validation before the adapter; current public history omits that invalid tool part. The tests assert absence of a successful tool result and no draft/settings effect, rather than inventing a public error part.

## Verification

- The actual application/SQLite/OnlineAgent/model SDK consumes a loopback model. The native composition suite has 41 passing cases, retaining the previous 23 chat/learning/approval/revocation/history/secret checks.
- New native cases exercise real manual dictionary-review dispatch for valid output, missing configuration, invalid output, provider failure and owner-grant revocation. No model runs after revocation; failed work keeps its existing run audit. Dictionary suggestions never change the source position.
- The settings tool creates one pending draft and does not call the settings update service. Malformed arguments, a scope-bearing entry and an admitted user whose personnel-administration grant was revoked create no draft or settings effect. The latter retains its independent assistant-use grant; the existing draft service refuses the write.
- Direct ordinary generation and practical/translation dispatch reject scoped credentials with zero model requests and zero SQL. The existing realtime/background/read/write/restore scope matrix remains active.
- Weekly brief cases moved from the old isolated assistant fixture to actual native generation and persistence. Their business-facts projection remains controlled: only the addressed head receives synthetic facts; length, recipients and empty/invalid/provider-failure/unavailable fallbacks retain the old assertions. Each case uses its own head/team, avoiding notification idempotency conflicts.
- Focused native/business/page selection: **55 passed / 1 failed** across three files. The failure is the unchanged notification-management route assertion already reproduced on both earlier heads. It is active, not skipped.
- Business consumers: **150 passed** across the nine affected recruiting, profile, performance, talent-review, licensed, HR-settings, wording and practice-prompt files. These exercise actual business routes/repositories; not every generator/schema in those suites runs an external or loopback model.
- Owning server TypeScript, changed-source ESLint, changed-file formatting, document links and diff checks are recorded in the evidence. No dependency, client rendering, build or startup configuration changed; installation/full build/browser acceptance were not repeated. Test applications do boot the production composition against disposable storage.

## Observed costs

Counts wrap the named complete service operation in the focused suite, excluding setup and assertions. They include native persistence plus existing task, authorization and notification work. All measured segments have zero DELETE. SQLite metadata caches, earlier cases and asynchronous notification processing affect reads and some notification writes; these are observations, not fixed budgets or claimed savings.

| Operation                             | Model requests | SELECT | INSERT | UPDATE | BEGIN / COMMIT |
| ------------------------------------- | -------------: | -----: | -----: | -----: | -------------: |
| Dictionary review, valid              |              1 |    100 |      6 |      7 |          5 / 5 |
| Dictionary review, no model           |              0 |     48 |      3 |      1 |          1 / 1 |
| Dictionary review, invalid output     |              1 |    154 |     10 |     15 |          9 / 9 |
| Dictionary review, model failure      |              1 |    111 |      6 |     11 |          6 / 6 |
| Dictionary review, owner revoked      |              0 |      9 |      1 |      1 |          0 / 0 |
| Weekly brief, valid                   |              1 |    131 |      5 |      6 |          5 / 5 |
| Weekly brief, empty                   |              1 |    156 |      7 |      9 |          7 / 7 |
| Weekly brief, invalid                 |              1 |    156 |      7 |      9 |          7 / 7 |
| Weekly brief, model failure           |              1 |    156 |      7 |      9 |          7 / 7 |
| Weekly brief, no model                |              0 |     91 |      3 |      2 |          2 / 2 |
| Settings draft, valid                 |              2 |     88 |      5 |      8 |          4 / 4 |
| Settings draft, invalid arguments     |              2 |     33 |      2 |      4 |          2 / 2 |
| Settings draft, scoped entry          |              2 |     33 |      2 |      4 |          2 / 2 |
| Settings draft, revoked user          |              2 |     62 |      2 |      4 |          2 / 2 |
| Scoped ordinary generation / dispatch |              0 |      0 |      0 |      0 |          0 / 0 |

The two settings requests are the tool proposal and its continuation. Counts exclude realtime creation before that measurement. A rejected tool turn still has native message/result persistence and continuation costs. The synchronous entry guard itself adds no network, query, write, lock or transaction. Ordinary generation probes the official default (normally two reads), then native background persistence is nonzero. Existing manual HTTP starts retain their endpoint; native SDK calls do not create an extra application HTTP hop. No application polling, runner claim, lease or lock mechanism is added.

The earlier filtered run observed 130 SELECT for valid dictionary review; the complete suite observes 100 with warmed caches. Existing approval still persists one HR request and has 114 SELECT / 5 INSERT / 10 UPDATE / 6 transactions in the expanded order. The original nine-case approval capture of 129 SELECT remains a different documented cache/order boundary, not a performance comparison. Native learning normal/invalid results remain successful tested draft/fallback paths; their current captures are 224/214 SELECT with 9 INSERT / 7 UPDATE / 6 transactions and one model request each.

## Retained boundaries and next unit

- Remaining production `createAIRunner` bindings are IM replies, AI-entry route classification (`fromText`/channel contract), and payroll vendor-bill tool replies. They retain their original disabled compatibility source default; this unit neither enables nor replaces them with stubs.
- Next smallest unit: native Feishu/IM routing and conversation/card/approval links, including the vendor-bill tool-session caller. Knowledge retrieval/embeddings and authorized HR spaces/documents need their own native Knowledge integration. Candidate topic grouping and document-derived text generation above are ordinary JSON calls, not that retrieval integration.
- Old assistant runtime/configuration/history/tool modules and LangChain dependencies still have those consumers and historical readers; none is deleted merely because ordinary generation moved. Preserve the historical tables and all 138 tracked migration/seed sources.
- A native failure is persisted in its native session. As before, the task stores a conversation ID only after successful generation; failed/invalid attempts may therefore be absent from task-side conversation links. This limits task-side tracing and is not redesigned here.
- Unverified: real model/provider behavior and quality, production HR identities, every business generator's model schema as one combined end-to-end flow, production scheduling/Jobs/PostgreSQL, installed-database checksum/backup recovery, and the unfinished full template merge.
- Template `.76` / Skills `.44`, application dependencies/lock, disabled compatibility/process gates, preflight and source completion `.54` remain fixed. No migration, custom storage, new authorization policy, deployment or release was added.

## Reproduce

```bash
pnpm exec vitest run tests/logic/native-ai.test.ts tests/logic/assistant-model-business.test.ts tests/logic/plugin-page-authz.test.ts --disableConsoleIntercept
pnpm exec vitest run tests/logic/v4-performance.test.ts tests/logic/v4-talent-review.test.ts tests/logic/v4-talent-review-13b.test.ts tests/logic/v3-profile.test.ts tests/logic/v4-licensed.test.ts tests/logic/v2-recruiting.test.ts tests/logic/v1-realigned.test.ts tests/logic/automation-wording.test.ts tests/logic/practice-coach-prompt.test.ts --disableConsoleIntercept
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm exec vitest run tests/logic/agents-md.test.ts
```

The first command intentionally retains the known failing notification assertion. Use changed-file lists for ESLint/Prettier; do not repeat a whole-project build to check this server-only unit. Public input versions and initial install/build/browser evidence are documented in [the chat/learning record](native-ai-unit.md); they are not new build evidence for this commit.
