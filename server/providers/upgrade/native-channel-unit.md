# Native routing and vendor-bill tools

Routing and vendor-bill review now use native Agents services. The Feishu/IM conversation and approval-card cutover is pending a decision on a new application card binding; it is not implemented or enabled. The complete template upgrade remains unaccepted: keep the pull request in draft and do not deploy.

## Delivered caller changes

| Caller                                 | Before                                                 | After                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aiEntryService.route`                 | Old employee model selection, structured/text guessing | Official structured generation, same authorized row audience and keyword fallback, 30-second total deadline, original caller AuthorizationContext                    |
| `payroll.assistant.billReview`         | Old employee tool reply; reply text could become notes | Native background conversation with only the existing reconciliation and note tools; validated structured summary is an execution result, never guessed text to save |
| Vendor-bill task record                | Old conversation ID on success                         | Native conversation ID in the same existing task field on success; no new map, table or migration                                                                    |
| Feishu/IM reply, session map and cards | Closed compatibility path                              | Unchanged pending the card proposal below; sender binding, per-user/provider/route in-memory session map and signed callback remain retained                         |

The retained `vendorBill.aiEmployee` setting still opts into review but no longer selects an old employee/model. Official model services supply the model. An unset opt-in continues to notify without generating notes. No configuration or transcript is migrated.

The native bill scope persists its admitted bill ID in official scope configuration, derived from trusted server business context. Both tools reject scoped credentials before refreshing identity; they check current view/upload actions and the original services' row/field policies. A model argument for another bill is refused before either business service. The tool list offers no confirmation, amount/line editing, mail or external message action. The employee chat's global tool set stays unchanged.

Billing tools retain their existing ALLOW semantics; there is no human approval wait in this background operation. Its 120-second model budget uses the previously validated finite observer and awaited cancellation/finalization. This budget is not a policy for an idle realtime conversation awaiting human approval.

After generation, the task refreshes its owner's authorization before reading/saving notes. Missing configuration, invalid output and immediate provider failure retain the existing rule fallback. If a tool already saved notes before a timeout/cancellation, the task keeps them instead of writing a second fallback note. Withdrawn access also blocks the fallback. Existing event deduplication prevents a repeated upload trigger from starting another model or writing another note.

The old text-route parser remains a historical helper for existing isolated compatibility tests; production routing no longer invokes it or `fromText`. The only production `createAIRunner` binding is the retained IM reply channel. The old runtime/history, Knowledge and channel consumers still prevent deletion of their shared modules/dependencies.

## Verification and limits

- Actual application composition, SQLite, native SDK and a loopback HTTP model execute the production classifier and bill task connection. There is no real Feishu send, external configuration access or credential read.
- Routing covers valid output, no model, invalid output, immediate model failure, unsupported restricted credentials, revoked use and audience filtering. A model cannot select or see an unauthorized routing row. Invalid plain text uses the keyword rule rather than becoming a guessed structured success.
- Real bill tasks cover read/save/final structured result, missing configuration, invalid output, immediate provider failure, revoked access before saving, and timeout/explicit Stop after saving. Each accepted task writes notes once; confirmed state, original lines and amounts stay unchanged. Reopened native results do not run another model, another user cannot restore the session, and duplicate upload triggers do not repeat the write.
- Direct restricted bill entry rejects before model probing or storage. Raw native read/write tools reject restricted credentials before either business method; a different bill argument also calls neither method. These admitted rejected tool turns still persist native errors and continue the model.
- Related four-file selection: **81 passed / 1 failed**; native composition has **65 passing cases**, including the prior 47 chat/learning/settings/scope/deadline cases. The only failure remains the active notification-management page assertion previously confirmed on older heads.
- Existing vendor-bill upload/reconciliation/export/permission behavior passes its filtered payroll case (1 passed / 25 filtered out). Retained card/transport suites have 22 passing cases; these exercise retained behavior only and are not evidence of native card cutover. The final five-case ownership/tool selection also passes (5 passed / 60 filtered out).
- Unverified: real Feishu transport, native IM/card approval, external providers, production HR/Jobs/PostgreSQL, all scheduling chains, installed-database checksum/backup recovery and the incomplete full template merge. Client rendering, install, full build and browser screenshots were not repeated for this server-only change.

## Observed complete-operation costs

Counts exclude setup/assertions. They include native persistence and existing authorization, task and notification work. Fixture sequence/caches and asynchronous notifications affect reads/writes; these are observed operations, not fixed production budgets. No new application polling, runner claim, retry, lease, lock or coordinator is added.

| Operation                                                  | Models | SELECT | INSERT | UPDATE | DELETE | Transactions |
| ---------------------------------------------------------- | -----: | -----: | -----: | -----: | -----: | -----------: |
| Route valid / invalid / provider failure, each             |      1 |     68 |      3 |      6 |      0 |            4 |
| Route no model                                             |      0 |     16 |      0 |      0 |      0 |            0 |
| Route restricted entry                                     |      0 |      0 |      0 |      0 |      0 |            0 |
| Route revoked                                              |      0 |      2 |      0 |      0 |      0 |            0 |
| Route unauthorized model key                               |      1 |     74 |      3 |      6 |      0 |            4 |
| Bill read, save and successful result                      |      3 |    235 |      8 |      8 |      0 |            6 |
| Bill duplicate trigger                                     |      0 |      2 |      1 |      0 |      0 |            0 |
| Bill no model, rule fallback                               |      0 |     99 |      5 |      2 |      0 |            2 |
| Bill invalid result, rule fallback                         |      1 |    205 |     12 |     16 |      0 |           10 |
| Bill provider failure, rule fallback                       |      1 |    178 |     10 |     12 |      0 |            8 |
| Bill revoke before save (including injected revocation)    |      3 |    173 |      6 |     12 |      1 |            7 |
| Bill timeout after save                                    |      3 |    237 |      8 |      8 |      0 |            6 |
| Bill explicit Stop after save                              |      3 |    236 |      8 |      8 |      0 |            6 |
| Bill restricted entry                                      |      0 |      0 |      0 |      0 |      0 |            0 |
| Raw restricted bill read / write, each (creation excluded) |      2 |     40 |      2 |      6 |      0 |            3 |
| Raw different-bill tool (creation excluded)                |      2 |     46 |      2 |      6 |      0 |            3 |

The bill success uses three model requests: read-tool proposal, save-tool proposal and final structured result. Its tools do not require an approval continuation. Duplicate trigger's insert is the existing skipped-run audit, not a bill write. The revocation scenario includes the controlled permission-assignment removal inside its measurement; that DELETE is not performed by review itself. Timeout/cancellation reads and writes include native terminal persistence; a saved note is not rolled back or replayed. A later filtered ownership/tool capture has different cache/notification boundaries (for example invalid bill 178 SELECT instead of 205); it is not a performance improvement. Separate captures are not added together. Native task failures still may lack a task-side conversation ID even though the native failed session is persisted; this existing tracing boundary is unchanged.

## Pending native IM card binding — proposal only

Recommendation: reuse `imCards`, its signed callback, recipient binding and deduplication. Add one native approval card kind instead of making the historical profile-change card submit the business request outside the native approval. Without a durable binding, a callback cannot identify the exact native approval after a restart and a direct business submit can bypass native execution history.

- **Change:** store `{ sessionId, messageId, executionId, approvalId }` plus safe display in the existing server-owned card payload; use the existing recipient/provider fields, native tuple dedupe key and `refId` for the session. No table/column migration or old-card conversion. Existing legacy and business-approval cards keep their original handlers. The native profile tool currently records source `assistant`, whereas the historical card records `feishuCard`; a trusted channel binding must preserve that audit source through the native business adapter, never through model arguments.
- **Callback:** keep the same signed `{ cardId, button }` ingress. The new kind loads the stored binding, requires the native session owner as recipient and resolves that bound recipient's current authorization, rejects unsupported restricted credentials and calls official native `approve`. Both Approve and Deny continue that exact execution; business tools reauthorize at execution. Model/browser input never supplies authority or approval identifiers.
- **Conversation:** replace the existing in-memory per-user/provider/route map's old IDs with native IDs. Restore through the official owner check; consume saved native messages/results without resending input. Keep the existing restart-starts-a-new-chat boundary, message dedupe and current routing labels. Waiting approval keeps its bound conversation and offers its card/app link; it is not a 120-second model stall. No new persistent channel-session directory, claim, retry or recovery service.
- **Cost:** reuse one existing card insert and send per newly waiting approval, with added payload bytes; callback incurs existing binding/card reads and native approval persistence/model continuation. No application poll or runner claim. Measure the full combination before cutover rather than estimating native/HR SQL as zero.
- **Decision needed:** the new persisted card-to-native-approval mapping and card-kind behavior are an application protocol difference. This portion is not implemented. Native generic chat approvals and historical signed business-card tests do not prove this new channel combination.
- **Left out:** production channel activation, external configuration, Knowledge retrieval, old transcript migration, new authorization policies, retry/lease/lock changes and cross-process session restoration.

## Reproduce

```bash
pnpm exec vitest run tests/logic/native-ai.test.ts tests/logic/assistant-model-business.test.ts tests/logic/plugin-page-authz.test.ts tests/logic/ai-entry-route-text.test.ts --disableConsoleIntercept
pnpm exec vitest run tests/logic/v2-payroll.test.ts -t 'V2-06 vendor bill' --disableConsoleIntercept
pnpm exec vitest run tests/logic/v1-feishu-cards.test.ts tests/logic/feishu-bot.test.ts --disableConsoleIntercept
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm exec vitest run tests/logic/agents-md.test.ts
```

The first command retains the known failing notification assertion. For only new native cases, filter `native-ai.test.ts` with `production native|scoped vendor-bill|raw native bill`. All 138 historical migration/seed sources, application manifest/lock, fixed template `.76` / Skills `.44`, compatibility/process defaults, preflight and source marker `.54` stay intact.
