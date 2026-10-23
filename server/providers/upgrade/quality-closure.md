# Upgrade quality closure

The breadcrumb translation, native client test hosts and notification management route are upgrade fixes. They are not pre-upgrade exemptions. Current verification and the remaining source-quality findings are recorded below; independent review is still required. The PR remains draft, `.54` and all compatibility gates/preflight remain unchanged.

## Early-drain concurrency prerequisite

The proposed Jobs-only tail adapter is not registered. A controlled official Scheduler/Jobs/SQLite test finds that an in-flight reconciliation can outlive executor drain and dependency cleanup (**1 control passed / 1 safety assertion failed**). [The contract record](shutdown-drain-contract.md) supplies the reproducible boundary, public lifecycle alternative, fixed-scope upgrade checks and exact seed-data/history paths. No production source or test budget changes. This precondition stops the adapter's implementation and dependent full/build/start validation; it does not close the previously confirmed mail-shutdown defect.

## What changed

- Application locale overrides supply `navigation.breadcrumbMore`. Shell tests now scope menu links to their navigation region, since breadcrumbs legitimately duplicate those links.
- Test hosts register API and Realtime services, including the native authentication connection handshake. Session-preparation tests retain their controlled failed/late handshake, cleanup and authorization assertions. No production permission result is mocked by these changes.
- The obsolete employee-routing/hand-off assertion is replaced with the actual native chat controller, model availability and history read. No old runtime or persistent knowledge question-answering path is re-enabled. The other knowledge component permission and settings-save assertions remain.
- Notification logs are restored at `/settings/notifications/logs` under the existing `page:notification.logs/access` grant. Official `2.0.0-beta.0` Registry source was installed through shadcn from its local flattened recipe, omitting stale package requirements because all primitives and fixed dependencies are already present. Its success/waiting badge colors use the existing application semantic status tokens; all service/interaction logic remains official. No lock, dependency, server authorization or generic test-send endpoint changed.
- Typed legacy values are validated rather than implicitly stringifying objects; JSON results remain `unknown` until checked. Existing artifact validation precedes its typed cache. Redundant assertions and deferred local declarations are removed. Historical chat loads start after effect installation and do not start after immediate cleanup. These retained compatibility paths stay disabled in source configuration.
- A full-run succession fixture observed the first recipient instead of the expected manager. It now waits for that manager within the same eight-second budget, retaining the forbidden-recipient and review assertions; no notification retry or delivery mechanism changes.
- The six upgrade-modified files with formatting failures are formatted. Unchanged business files are not swept into this change.

## Notification baseline and actual verification

True pre-upgrade application `2bfd8d1` declares Notification `1.0.0-beta.21`. Official source `nocobase/nocobase3@6f38530` declares that same version and contributes `/settings/notifications/logs` with `notification.logs`. The fixed installed `2.0.0-beta.0` client has no routes and supplies `registry/logs-ui`; the previous assertion therefore identified an actual missing upgrade connection. Its replacement checks the retained URL, authentication, loader and exact grant, not plugin ownership. This is source/contract evidence, not a claim that the old package graph was installed and executed.

An independent temporary SQLite/storage instance used only synthetic seeds and native login, with explicit empty external channels, disabled mail/Feishu and loopback-only browser access. Actual source URL was `http://127.0.0.1:43913/main`; it has been stopped. Updated compiled strict startup also passed at `http://127.0.0.1:39699/main`, including the same real authorization matrix and desktop/mobile page; that instance has also stopped. Browser evidence covers the real Settings page, empty state and Refresh at desktop/375px. Component regression covers nonempty log fields, loading/empty, denied/error retry and cancellation. No synthetic screenshot host replaces the real page.

Each measured API sample is one HTTP request. Anonymous denial: 0 SQL; administrator empty list: 26 SELECT; ordinary employee denial: 33 SELECT; explicit grant: 20 SELECT; revocation: 18 SELECT. All five windows have zero INSERT/UPDATE/DELETE/transactions/model requests. Test grant/revoke, login, initialization and browser SQL are outside these windows; they are not claimed free. The page reads once on mount and once per Refresh, without polling or sending. These cold/warm samples are not a fixed budget.

## Callback waiting and internal close diagnostics

The process-presentation test now waits separately for the error callback after observing the translated alert. It retains the original callback assertion and checks one callback carrying an Error in each language. Production layout/callback effects and test timeouts are unchanged. The independent source review distinguished alert state rendering from its later callback effect; it did not reproduce a missing production callback.

The two previously failing API fixtures (training acceptance and authorization review) now install `tests/helpers/scheduler-close-diagnostics.ts` on their own initialized application. They retain active calendars and original business assertions. No broader calendar isolation or extra maintenance trigger is added.

The helper observes the original executor, backend, state-file write, handler, target start/describe, event recording/delivery and reconciliation calls. It correlates begin/done/failed with a local call number, schedule/job identifiers and target type. Outer application close snapshots include pending internal phases and backend running/queued counts. Existing minute-maintenance service methods are observed only if already constructed; the helper does not instantiate services. Calls begun during bootstrap before installation are outside its tracing boundary. The views are fixed-version diagnostics, not public application execution APIs, and need revalidation when those packages change.

The observer preserves receiver, arguments and the original return value/promise, rethrows synchronous errors and leaves original promise rejection available to the caller. It neither cancels nor takes over execution. Wrappers are restored after the original fixture close settles. Its outer observer retains the original timeout and removes its own unreferenced interval in `finally`. Logs omit payloads, headers, configuration and exception text.

The diagnostic self-check and real component cases pass **12 cases**; the final target combination passes **160 cases**. Scope TypeScript for the new helper and its self-check, changed-code lint/format and record links pass. All **661** original assertion chains in the four API fixtures are identical to `9150ef3` (182 in the newly observed files, 479 in the previously isolated files).

Exactly one diagnostic full run completes: **235 files, 234 passed / 1 failed; all 1976 cases passed**, exit 1, **664.10 seconds**. There are three additional diagnostic self-check cases. The repaired component callback cases pass; no full run is repeated to obtain a passing result.

Both original failing fixtures close normally: training **29 ms**, authorization review **32 ms**, with backend running/queued counts zero and no pending observed calls. Real backend-close/state-write phases finish. This run does not exercise a scheduled firing/target/event-delivery path in those two applications, so it does not identify their earlier 30-second blocker. Their fourteen installed observers are coverage instrumentation, not evidence that every internal branch executed.

The actual full-run failure is unchanged `v2-attendance-feishu.test.ts:182`, awaiting `server.close()`. Same-window outer snapshots record Scheduler shutting down through **30006 ms**, with no application terminal marker. Native Mail appears ready in the close-begin snapshot and has already reached shutdown by the Scheduler-wait snapshots. No internal method observer was installed on this different fixture.

Read-only inspection after that worker exits finds one persisted running occurrence: **`hr.mail-poll` / `app.hr-mail-poll`**, scheduled at `11:45:00Z`, started at `11:45:00.114Z`, without a finished time. Three native mail sync records remain running in history/catchUp phases. These are post-exit persisted states, not proof of a live blocked call. Source `hr/index.ts:2863–2870` awaits settings then `mailService.poll()`; `hr/mail/service.ts:307–319` starts sync and can wait 100 times at 100 ms for each mailbox, and `poll()` visits mailboxes sequentially. Together these support a **mail-poll / Mail-close-order candidate**, not a confirmed causal explanation or proof about the two earlier failures.

**Minimum next proposal:** put the existing internal observer on the actually failing attendance/Feishu fixture and observe mail poll plus native sync start/status waits. In a controlled local test with an active mail poll, compare the original close sequence with draining Scheduler while Mail remains available. If that establishes causality, propose an application lifecycle ordering adaptation so dependent scheduled work settles before Mail closes. That is a production lifecycle change requiring separate confirmation; it is not implemented here. Do not change retries, locks, budgets, job ownership or blanket-disable calendars.

The prior independent probe initially passed `registerOnly=true`, leaving its synthetic task untriggered until the test deadline. Its corrected probe schedules the task normally and passes. Both logs remain supplied as diagnostic-tool history; the first is not classified as a product shutdown fault. Prior full-run timeout and callback failures remain in the historical sections below.

Cost: these are test-only observers and a test wait correction, with no new production request, query, model call, persistent state or execution mechanism. Recording a phase reads memory and emits a local log line. Existing real fixture initialization, authorization changes, business/Jobs SQL and model work are outside prior measured endpoint windows and are not zero; this unit does not add a controlled minute task to ordinary tests. Post-failure inspection adds **5 SELECT and 6 schema PRAGMA operations** on the disposable synthetic SQLite, with no writes, model calls or external requests; it is outside endpoint windows. Independent review, residual warning/format cleanup and complete shutdown acceptance remain required.

## API fixture calendar isolation

The ordinary API fixtures in `talent-acceptance.test.ts` and `v3-profile.test.ts` now stop only Scheduler's calendar executor after initialization, using `jobExecutorServiceToken.getScheduleExecutor('@nocobase/app-plugin-scheduler').shutdown()`. One-off Jobs, all existing business assertions and the dedicated Scheduler/Jobs suites remain active. Production sources, schedules, cancellation, locks, retries and timeouts are unchanged.

`tests/helpers/close-diagnostics.ts` observes the original application and local writeback close operations. It logs begin/done/failed and, while waiting, a read-only provider-state snapshot every five seconds; its observer is unreferenced and cleared after completion or failure. It adds no deadline, race, cancellation or forced connection disposal. Profile diagnostics count received/finished/aborted requests and remaining request/connection IDs without logging bodies, headers, credentials or configuration. Raw stderr output retains these phases in command logs.

The change is fixture isolation, not a demonstrated explanation of the earlier intermittent timeout. The independent pre-change comparison had one full run with all 1973 assertions passing but `talent-acceptance` application close timing out, and one diagnostic full run with all 234 files / 1973 assertions passing. Two slow Scheduler-provider samples completed after about 10.34 and 10.29 seconds; they did not capture the provider responsible for the original 30-second failure. The profile writeback server closed normally in the observed passing samples.

The target combination passes **112 cases**. The two predetermined full runs have different outcomes:

| Run    | Files                 | Cases                  | Exit | Duration       |
| ------ | --------------------- | ---------------------- | ---- | -------------- |
| First  | 234 passed            | 1973 passed            | 0    | 666.59 seconds |
| Second | 231 passed / 3 failed | 1972 passed / 1 failed | 1    | 911.79 seconds |

Both full runs pass the two changed fixtures, all their original assertions and their three close stages. Application close takes talent/profile **25/21 ms** in the first run and **23/24 ms** in the second; profile writeback close takes **0 ms** in both. Each profile run receives and finishes two requests, with zero aborted/pending requests or open writeback connections at completion. An AST comparison preserves all **479** original assertion chains. Changed-code lint/format, the diagnostic helper's scoped TypeScript check and record-link checks pass.

The second run remains a failing acceptance result. `training-acceptance.test.ts:150` and `authorization-review-fixes.test.ts:34` exceed the existing 30-second afterAll budget. Verification-only observation of the original shutdown promise records Scheduler **shutting-down** at 5-second intervals through **30005 ms** in both applications, with no terminal marker. These are application/provider waits, not profile writeback waits. The specific internal scheduled operation is unproven; no production shutdown change is proposed from that evidence alone. The first run also records an unchanged mail-audit application's Scheduler wait completing after **20610 ms**.

The second run additionally fails `process-presentation.test.tsx:108`: the error callback has not been observed when its final assertion runs, after the expected alert check. The first run passes this same unchanged test. Its cause is not established and this fixture-only unit does not modify or waive it. No third full run, retry, timeout increase or forced shutdown was added. Independent review and the residual lint/format gates remain open.

The full commands inherit every test and timeout from the repository configuration, add only a temporary read-only whole-application close observer, and run sequentially with `--maxWorkers=2`. That observer is evidence tooling, not committed application code. Raw logs retain both failures and all phase snapshots. A temporary-config ESM loading error before test execution was corrected by using `.mts`; its startup logs are separate from the two actual full runs.

Cost: no production endpoint, query, model call, transaction or lock is added. The test-only phase observer reads in-memory state and writes log lines. The official memory calendar executor persists its existing state during shutdown, now at fixture initialization rather than teardown; the later provider shutdown uses the same completed promise. Initialization, existing business/Jobs work, fixture authorization changes and full-suite SQL/model costs are not zero and are outside any previously measured API window. No deployment benchmark or shutdown-speed improvement is claimed.

## Historical verification before fixture isolation

Final full run: **234 files, 233 passed / 1 failed; all 1973 test cases passed**. The remaining suite failure is `v3-profile.test.ts:347` afterAll exceeding 30 seconds, not an assertion failure. No unhandled-error summary remains. Organization-sync's 19 cases and cleanup passed in this full run. Overall test exit is still 1.

- The first diagnostic full run (one worker, during the locale fix) had 1968 passed / 2 locale failures and three afterAll timeouts: mail-plugin-local, v2-attendance-feishu and v4-agent-clients.
- The second full run had 1972 passed / 1 failed. Its real failure output showed one other recipient's notification while the expected manager's item had not arrived. The bounded observation condition was corrected; the final full run passes that assertion.
- Five targeted files covering those three shutdown suites, organization sync and succession pass **50 cases**. A separate temporary copy of the current source with close-stage diagnostic markers passes the profile file's **23 cases and cleanup**. These do not erase the full-run failure.
- **Unclosed:** determine whether the intermittent close delay is in application provider shutdown or the profile fixture's local writeback HTTP server, then fix the responsible lifecycle/fixture boundary and obtain a clean full run. The current timeout result does not isolate which await blocked. It is not classified as a pre-upgrade exemption and no shutdown/queue/lease/lock mechanism was changed here.

Three-project `pnpm typecheck`, updated full `pnpm build`, source/compiled strict page acceptance, targeted 73 cases and root documentation's 3 checks pass. Final lint is 0 errors / 17 warnings (exit 1); format is 54 unchanged-source files (exit 1). Changed source lint and formatting pass. Complete CI collections are checked after push; an empty collection is not success.

Final command results are recorded in the delivery evidence. The original `6350d42` full run (1923 passed, 47 failed, 39 errors) and organization-sync full-run cleanup timeout remain historical results; isolated success never rewrites them.

Remaining warnings and formatting failures have true-base source/diagnostic evidence and remain subject to the separately requested cleanup; source ownership is not a quality-gate waiver. No rule is disabled, assertion skipped, timeout extended or failure marked green. Independent review must cover the new logs connection and the compatibility-path type/cleanup changes. Production source changed in this unit, so the updated build and source-start evidence supplement the earlier install/restore record; drained same-path restore evidence remains reusable for unchanged storage mechanisms.

Persistent knowledge Q&A remains deferred. No used old environment exists; old-environment migration/restore is not applicable. External providers and other database/multi-instance deployment forms require their own activation checks. Final acceptance/merge/deployment and any residual-quality exemption stay with the owner.

## Residual quality gates requiring a disposition

The current full lint run has **0 errors / 17 warnings** and still exits 1 under `--max-warnings 0`. The same fixed toolchain on the true `2bfd8d1` source reproduces all residual locations/rules (18 warnings there, including a ref naming issue corrected here). This is a source/toolchain comparison, not a claim of installing the old dependency graph.

| Files                                                       | Residual rule / consequence                          | Recommended follow-up                                                                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Settings departments; training reports                      | Lazy state initialization; repeat render computation | Separate small performance cleanup.                                                                                      |
| Employees; learning video; questions index                  | Ref naming convention                                | Separate mechanical naming cleanup.                                                                                      |
| Learning video                                              | Missing effect dependency                            | Review reporting subscription lifetime before changing dependencies.                                                     |
| Profile change; practice; question dialog; training reports | Array-index keys                                     | Review list insertion/removal behavior; practice turns currently append. Do not invent IDs solely to suppress a warning. |
| My mailbox                                                  | State update in effect                               | Review load/error timing before rescheduling.                                                                            |
| Sessions                                                    | Date created during render                           | Review refresh semantics before moving the clock read.                                                                   |

Nine residual lint files are byte-identical to the true baseline. The practice file has other upgrade changes but its array-key expression and diagnostic are unchanged. No warning suppression is added. No residual warning is accepted. The separate cleanup has been requested; this fixture-only unit neither performs it nor closes that gate.

Full formatting still reports **54 files**, all byte-identical to `2bfd8d1`; the same current formatter flags those exact baseline files. The delivery includes each path/hash and paired output. These are formatting-only differences in untouched business/test source, with no demonstrated runtime defect; complete a separate formatting-only batch to close the format gate. This step intentionally does not mix that unrelated batch into the upgrade fix.
