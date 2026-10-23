# Upgrade quality closure

The breadcrumb translation, native client test hosts and notification management route are upgrade fixes. They are not pre-upgrade exemptions. Current verification and the remaining source-quality findings are recorded below; independent review is still required. The PR remains draft, `.54` and all compatibility gates/preflight remain unchanged.

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

## Verification and remaining action

Final full run: **234 files, 233 passed / 1 failed; all 1973 test cases passed**. The remaining suite failure is `v3-profile.test.ts:347` afterAll exceeding 30 seconds, not an assertion failure. No unhandled-error summary remains. Organization-sync's 19 cases and cleanup passed in this full run. Overall test exit is still 1.

- The first diagnostic full run (one worker, during the locale fix) had 1968 passed / 2 locale failures and three afterAll timeouts: mail-plugin-local, v2-attendance-feishu and v4-agent-clients.
- The second full run had 1972 passed / 1 failed. Its real failure output showed one other recipient's notification while the expected manager's item had not arrived. The bounded observation condition was corrected; the final full run passes that assertion.
- Five targeted files covering those three shutdown suites, organization sync and succession pass **50 cases**. A separate temporary copy of the current source with close-stage diagnostic markers passes the profile file's **23 cases and cleanup**. These do not erase the full-run failure.
- **Unclosed:** determine whether the intermittent close delay is in application provider shutdown or the profile fixture's local writeback HTTP server, then fix the responsible lifecycle/fixture boundary and obtain a clean full run. The current timeout result does not isolate which await blocked. It is not classified as a pre-upgrade exemption and no shutdown/queue/lease/lock mechanism was changed here.

Three-project `pnpm typecheck`, updated full `pnpm build`, source/compiled strict page acceptance, targeted 73 cases and root documentation's 3 checks pass. Final lint is 0 errors / 17 warnings (exit 1); format is 54 unchanged-source files (exit 1). Changed source lint and formatting pass. Complete CI collections are checked after push; an empty collection is not success.

Final command results are recorded in the delivery evidence. The original `6350d42` full run (1923 passed, 47 failed, 39 errors) and organization-sync full-run cleanup timeout remain historical results; isolated success never rewrites them.

Remaining warnings and formatting failures must have exact true-base source/diagnostic evidence and an explicit owner disposition or a separately scoped cleanup. No rule is disabled, assertion skipped, timeout extended or failure marked green. Independent review must cover the new logs connection and the compatibility-path type/cleanup changes. Production source changed in this unit, so the updated build and source-start evidence supplement the earlier install/restore record; drained same-path restore evidence remains reusable for unchanged storage mechanisms.

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

Nine residual lint files are byte-identical to the true baseline. The practice file has other upgrade changes but its array-key expression and diagnostic are unchanged. No warning suppression is added. No residual warning is automatically accepted: the owner must authorize the separate cleanup or explicitly accept its stated impact before closing the gate.

Full formatting still reports **54 files**, all byte-identical to `2bfd8d1`; the same current formatter flags those exact baseline files. The delivery includes each path/hash and paired output. These are formatting-only differences in untouched business/test source, with no demonstrated runtime defect; recommend a separate formatting-only batch if a fully green gate is required. This step intentionally does not mix that unrelated batch into the upgrade fix.
