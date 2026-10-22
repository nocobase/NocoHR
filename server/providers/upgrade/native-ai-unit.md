# Native AI unit

New model settings, employee chat and learning-plan generation now use the official Agents service. The selected callers have one native execution path. Existing histories and business data are retained. The complete template upgrade remains unaccepted; do not merge or deploy it.

## Verified behavior

- Settings → Models is the official model-service page with its native read/manage permissions. Agents and Foundation are registered through the native CLI in all three composition roots.
- The employee drawer, existing `/talent/ask` route and authorized header control share the official identity-keyed ChatProvider. New conversation IDs, messages, canonical history, approval binding and Stop belong to the SDK. The embedded views scope `open: true` and omit the global Close control; their route/drawer owns closing.
- Native tools reuse own-profile reading and profile-change request creation. Execution rebuilds current user grants, then invokes the existing HR service. A profile change needs native approval and still creates a request for HR review. Public/model failures expose a safe code, without internal HR error details. Existing tool labels, HR greeting, image URL policy and CSP are retained.
- Learning-plan draft sites inject `structuredPlan`, independently of the remaining compatibility generators. The production binding checks native model availability, starts a tool-free native background session under the automation owner, validates the JSON result, and invokes the unchanged draft service. Missing configuration and invalid output retain deterministic rule fallback; network failures propagate. No legacy execution or compatibility retry is selected for these callers.
- Native integration tests use the actual application composition, database, model catalog, OnlineAgent service and target model SDK over loopback HTTP. They cover send, native own-profile reading without private contact fields, background output validation, history/reopen, cross-user rejection, approval/refusal, duplicate approval, a provider failure, Stop with partial history, model-management 401/403 and revocation during pending approval.
- The approval success test invokes the real HR service against a synthetic employee: it persists exactly one pending profile-change request, leaves the employee record unchanged and does not replay the request after reopening and following up. A separate business-service test uses real plan persistence with a controlled validated-generation double: only the authorized employee receives a draft, its supervisor remains the reviewer, and no assignment is created. Native learning generation and business draft persistence are verified in separate fixtures, rather than a complete scheduled model-to-plan run.
- Browser acceptance runs the real native HTTP/SSE consumer and official tool parts against a loopback model. It covers no-model guidance, send, reopening history without a model request, Approve/Deny, Stop, Models, the header panel and the employee drawer. English screenshots and the controlled replay script accompany the delivery evidence. No external model was contacted.

## Cost boundaries

The following are observed native service costs on a small SQLite test database, after initialization. The approval case includes the existing HR request/notification machinery. They count actual queries, including authorization and metadata resolution inside the measured call, rather than claiming those services are free. Authentication, setup, fixture inserts and assertions outside the call are excluded. Counts are scenario evidence, not production throughput estimates; repeated captures vary by two metadata/authorization reads in the failure/refusal branches.

| Operation                               | Model HTTP requests | SELECT | INSERT | UPDATE | BEGIN / COMMIT |
| --------------------------------------- | ------------------: | -----: | -----: | -----: | -------------: |
| Create realtime session                 |                   0 |     27 |      1 |      0 |          1 / 1 |
| Send and consume plain reply            |                   1 |     38 |      2 |      4 |          2 / 2 |
| Read saved history                      |                   0 |      2 |      0 |      0 |          0 / 0 |
| Native default-model availability probe |                   0 |      2 |      0 |      0 |          0 / 0 |
| Background structured result            |                   1 |     52 |      3 |      6 |          4 / 4 |
| Background invalid result               |                   1 |     52 |      3 |      6 |          4 / 4 |
| Approve and consume continuation        |                   1 |     51 |      0 |      6 |          2 / 2 |
| Refuse and consume continuation         |                   1 |     31 |      0 |      6 |          2 / 2 |
| Provider authentication failure         |                   1 |     33 |      2 |      4 |          2 / 2 |
| Approve after grant revocation          |                   1 |     39 |      0 |      6 |          2 / 2 |
| Stop after first text delta             |                   0 |     13 |      1 |      2 |          1 / 1 |

Every measured segment has zero DELETE. Revoked approval makes no HR service call; the subsequent model request is the native continuation explaining the rejected tool. Approval/refusal figures exclude the preceding tool-request turn. Repeated approval is rejected without another model request or business effect. History restoration and Stop never replay a completed tool.

For one controlled learning business case, authorized selection plus draft persistence costs 82 SELECT / 1 INSERT / no UPDATE, DELETE or transaction. The invalid/missing-model rule fallback has the same business-store cost; the network-failure branch stops after 57 SELECT with no business write. These exclude native execution (the injected business fixture has no model HTTP), task-record persistence and supervisor notification delivery. In production, add native generation and its 2-SELECT availability probe, plus the existing task/audit/notification costs; do not sum distinct fixtures into a claimed exact production total.

The compiled browser's controlled scenario uses six model requests; one capture records 113 native GET and 17 native POST requests, plus the separate configuration operations below. Counts vary with native refresh timing. Its event log records native page GET/POST activity, including native status/history refreshes and queries across surfaces; it is not a per-click isolated HTTP budget. Configuration uses one service POST and one default-model PUT. A first chat uses the native create, message and stream operations; approval uses native control/continuation and refresh; reopening uses saved reads. No application polling loop, claim, lease or lock was added. Official session persistence and tool loops have nonzero request/write costs; additional native tools can require additional model turns.

## Unverified and remaining work

- Real external provider credentials, model quality, HR accounts and data, actual approved profile-change persistence through the browser, complete process termination recovery, production Jobs/Redis, PostgreSQL and multi-instance execution.
- Installed-database migration/checksum prerequisites and backup/restore rehearsal; source-only historical files do not replace the compiled archive or real deployment inventory.
- Remaining assistant consumers: knowledge retrieval and generation, Feishu/IM routing and cards, personnel-settings drafting, framework advisor, practice/recruiting/interview/analysis and other background automations, weekly briefs and legacy history/configuration APIs. They retain their disabled assistant source gate; this unit does not expand or turn it on. Their old adapters are not the execution path for the migrated employee/learning callers.
- Workflow business/history mapping and runtime cutover remain separate. The 138 tracked migration/seed entries and existing data are retained. No custom table, migration, grant policy, automatic legacy conversion, runner or deployment mechanism was introduced.
- Full `.54 → .76` source reconciliation is unfinished. The `.74 → .76` inventory contains 52 template paths; this unit adopts the required dependency/registration changes and native AI surfaces, not all unrelated template changes. Keep `defaultTemplateVersion` at `.54`.

## Details

Fixed release sources are public npm metadata and their tarballs:

| Input                                                                               | Version         | Verified tarball SHA1                      |
| ----------------------------------------------------------------------------------- | --------------- | ------------------------------------------ |
| [Template](https://registry.npmjs.org/@nocobase/app-template-default/1.0.0-beta.76) | `1.0.0-beta.76` | `a65772d58490af3392b2ce80d120731d115a5f11` |
| [Skills](https://registry.npmjs.org/@nocobase/app-skills/0.1.0-beta.44)             | `0.1.0-beta.44` | `533c348db3eb634d84455124cb856622e7986f70` |

Both SHA1 and SHA512 were verified against the frozen release metadata. The application resolves Server `3.0.0-beta.2`, Client `4.0.0-beta.1`, CLI `1.0.0-beta.26`, Agents `1.0.0-beta.18`, Foundation `0.1.0-beta.1`, Skills `.44`, `ai@7.0.128` and `@ai-sdk/react@4.0.131`. The real application lock follows the template manifest's compatible ranges; no rolling dist-tag or tool lock is used.

The scope registry at `pkg-v3.nocobase.com` refused unauthenticated resolution (401). Project resolution now uses public npm, without reading or transferring credential files. Native registration and package resolution succeed. The Registry `agent-chat` command initially failed because its dependency metadata requested unavailable markdown-mermaid `.0.0.2-beta.0` and outdated Agents/i18n majors. The official Registry files were then installed with shadcn from a temporary, flattened Registry bundle, preserving file contents and primitive dependencies, and using the already selected application graph plus `@nocobase/markdown-mermaid@0.1.0-beta.2`. No installed package was edited. The Registry CLI changed existing primitive imports to package-local specifiers; styling is unchanged. Local HR greeting, tool label, embedded header and safe Markdown deltas are application-owned.

The removed generic notification test-send interface has no remaining code import or consumer in client/server/tests. Normal notifications and their historical records remain intact. Source defaults of the compatibility assistant and process runtime, preflight verification and the completion marker are preserved.

Reproduce from the application root:

```bash
pnpm install --frozen-lockfile
pnpm exec vitest run tests/logic/native-ai.test.ts tests/logic/assistant-model-business.test.ts tests/components/markdown-images.test.tsx tests/logic/client-routes.test.ts tests/logic/page-permission-titles.test.ts tests/logic/app-locale-coverage.test.ts tests/logic/agents-md.test.ts --disableConsoleIntercept
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm exec tsc -p tsconfig.node.json --noEmit
pnpm build
```

Client type checking is included in the build. Formatting/lint are scoped to changed sources and documents. The strict compiled configuration requires a nonempty company identity; the isolated fixture sets `talent.companyName` with the native configuration command rather than relaxing validation. Build and strict source/compiled startup use dedicated temporary configuration and SQLite storage with `HR_DEMO_SEED=false`; no deployment database or management Studio credentials participate. Browser evidence uses the exact Local URL printed by the independent development server. The final affected selection reports **50 passed / 1 failed** (51 cases across eight files). Changed-source ESLint, formatting, the three owning TypeScript projects, the frozen install and the complete build pass. Strict source and compiled startup and the controlled English browser flows pass. The management-route regression now checks native Models instead of the retired AI Employee page. Its independent notification-administration assertion remains a known failing check pending that surface; it was not skipped or weakened. Existing isolated-test type/lint failures recorded in earlier units are historical and were not silently reclassified as passed by these application checks.
