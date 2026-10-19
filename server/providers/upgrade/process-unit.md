# Process execution and retained history

This unit connects the existing process compiler and durable state to native Jobs and Scheduler, with authorized APIs and explicit terminal-history copying. It is opt-in through `processes.enabled` (default false). Existing plugins, tables, files and historical migration sources remain in place. The application registry is deliberately empty: installed business definitions and handlers still need individual mapping before any switch.

## Verified source and bounded mapping

The old contract is `@nocobase/app-plugin-workflow@1.0.0-beta.32`, checked against [the official published source tree](https://github.com/nocobase/nocobase3/tree/6f38530/packages/plugins/app-plugin-workflow). Its collections, instruction contracts and authorization resource were checked directly. That source is not an archive of the original installed compiled package or migration checksums.

| Source                                                                | Application representation                                                                                                                                                        |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflows`, `workflowNodes`, `workflowStats`, `workflowVersionStats` | A definition snapshot in `processDefinitions`, preserving string IDs, revision hash, metadata and counters; explicit validated artifact hash links it to the reviewed definition. |
| `workflowRuns`, `workflowNodeRuns`                                    | A snapshot in `processRunHistory`, preserving original run/node IDs, inputs, outputs, results, timestamps and terminal statuses. It is never an executable run.                   |
| `run` with a registered module and empty arguments                    | A named application handler; no database-controlled dynamic import.                                                                                                               |
| `condition` with a registered module                                  | A boolean handler and exactly one `yes` and one `no` branch. Branch joins are unsupported.                                                                                        |
| `terminate`                                                           | `success` maps to success, `failure` to failed.                                                                                                                                   |

Module bindings, current definitions/handlers and native schedule-ID-to-user delegation are explicit application source in `server/processes/index.ts`. A handler receives the persisted actor, validated input, prior node results and stable event/node idempotency key. Its business service must enforce its own record scope as that actor. The source mapping does not assume that every old module implements this new handler contract.

Copying requires matching enabled state, normalized JSON input schema and complete mapped topology. Nonempty parameters, parameter values, client capabilities, node options, run arguments, unsupported workflow options, unknown instructions or missing handlers/artifacts fail before commit. Only absent timeout or timeout zero is supported. Old queued/started runs block copying. Terminal statuses 1, -1, -2 and -3 are retained; unknown statuses, missing/duplicate node results and wrong revision references block copying. Successful history must contain exactly its successful recorded path, including a boolean condition result and successful terminator where declared.

One unit is one revision, at most 100 terminal runs and 1,000 total node results. Larger units require a separate batching decision. Definitions with unsupported capabilities remain readable under management authorization but cannot be copied into the verified subset. Failed/aborted histories retain their available terminal results; the unit does not reconstruct missing in-flight state.

## Build and runtime paths

`pnpm nocobase app build-processes` compiles the explicit registry to `server/processes/artifacts/`. The application CLI build hook runs the same command after the server build, writing `dist/server/processes/artifacts/`. There is no runtime TypeScript module loader for persisted definitions.

The manifest selects artifact files by digest. Loading checks manifest size/count, real paths, file size, digest, handler availability, topology and JSON input contract before replacing the in-memory catalog. Invalid or absent artifacts fail enabled startup. Empty source manifest is valid only for the currently empty registry. Production packaging and the complete build hook still require full application verification.

`ProcessesProvider` loads that catalog, registers an `app.processes.execute` job with the application's native Jobs service and an `app.process` asynchronous Scheduler target. The target validates `{key, hash, input}`. Its execution user comes from the source-controlled native schedule-ID mapping, never target JSON. Unbound schedules fail. The service uses the occurrence ID as its stable event key, returns a native execution reference and reports terminal completion to Scheduler. Native inspection observes the saved process state; no application poller is added.

The job advances only unclaimed nodes and rechecks current workflow management authorization before each. Duplicate jobs/events reuse durable state and atomic node claims. A terminal run is observed without replay. A node left running by a lost worker remains occupied; a possibly completed business action that throws leaves an uncertain run. No lease, heartbeat, takeover, node retry or reset endpoint is introduced. Native job retry is not permission to replay nodes.

Submission and job enqueue are separate service operations. Enqueue failure or a process crash between acceptance and enqueue can leave an accepted run without a job; duplicate submission does not repair it. This unit does not add an outbox or automatic recovery. Drain and individually reconcile such work before cutover. Jobs backend durability, deployment shutdown behavior and multi-worker scheduling remain application acceptance gates.

## Authorized API and explicit copy

All following paths are under `/api`. Authentication and authorization middleware are scoped to these paths. The service rechecks the existing `{resource: {type: 'settings', id: 'workflow'}, action: 'manage'}` grant; denied and conditional decisions fail closed. This is administrator-level workflow management, not an employee-owned run inbox. Retained workflow authorization registration still comes from the old plugin and must be preserved when that plugin is later removed.

| Method and path                       | Result                                                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /processDefinitions`             | Bounded compiled definition catalog, with hashes and input schemas.                                         |
| `POST /processRuns`                   | Validates `{key, hash, eventKey, input}`, durably accepts and enqueues, returns 202. Body limit is 256 KiB. |
| `GET /processRuns/:eventKey`          | Saved status and node outputs after a fresh authorization check.                                            |
| `GET /processHistory/definitions/:id` | Copied snapshot, or physical retained definition/nodes/statistics.                                          |
| `GET /processHistory/runs/:id`        | Copied snapshot, or physical retained run/node results.                                                     |

An external event key is namespaced by definition key and actor and stored as a digest. Reusing it with different validated input or revision fails. Copied legacy IDs remain exact strings, including bigint values. Old physical history is readable after old Collection metadata is unregistered; no retired workflow route is required. Reads do not copy records or enqueue work. There is no migration HTTP endpoint.

With legacy writers stopped, an authorized operator can explicitly copy one unit:

```sh
pnpm nocobase app migrate-process-history --source-version 1.0.0-beta.32 --workflow <legacy-id> --hash <compiled-artifact-hash> --user <manager-user-id>
```

The command connects/registers the application without starting workers. It checks the supplied user's native workflow permission and loads the built catalog. It requires the separately reviewed legacy-module bindings. The entire target unit and existing ledger entries commit in one outer transaction. Replay rereads and validates physical sources, preserves subsequent target edits, and writes nothing. A changed source or child run set, target conflict, or missing target fails; a later child failure rolls back the definition and earlier children. Old tables are unchanged. New migration `202610270035` adds two snapshot tables and nullable execution actor state; its down direction refuses populated process state.

## Measured costs

The synthetic SQLite trace includes metadata queries; authorization callbacks and business services are substitutes, so their production queries are excluded. Each request also pays its native authentication/authorization cost. A history copy below contains one definition and one successful run.

| Operation                | SELECT | INSERT | UPDATE | Transactions / ledger savepoints |
| ------------------------ | -----: | -----: | -----: | -------------------------------- |
| Retained definition read |      5 |      0 |      0 | 0 / 0                            |
| Retained run read        |      7 |      0 |      0 | 0 / 0                            |
| First history copy       |     51 |      4 |      0 | 1 / 2                            |
| Same copy replay         |     51 |      0 |      0 | 1 / 2                            |
| Copied run read          |      1 |      0 |      0 | 0 / 0                            |
| New run acceptance       |      7 |      1 |      0 | 1 / 0                            |
| Three-node execution     |     61 |      3 |      9 | 6 / 0                            |
| Duplicate event          |      2 |      0 |      0 | 0 / 0                            |
| Current run read         |      1 |      0 |      0 | 0 / 0                            |

The native Scheduler end-to-end trace includes cold synchronization/activation, one firing, Jobs execution and occurrence reading: successful branch 95 SELECT / 7 INSERT / 13 UPDATE / 8 transactions; failed branch 75 / 6 / 10 / 6. These are whole-unit measurements, not incremental per-poll estimates. Normal submission queues one process job; concurrent first submissions may queue duplicates, while node claims prevent repeat execution. Each scheduled terminal completion calls the existing native completion service, with its own persisted occurrence update. No application lock, recurring scan or polling request is added; native Scheduler's existing reconciliation remains native behavior.

## Verification and remaining gates

The independent target-package checks execute actual SQLite state and ledger transactions, artifact compilation/loading, native Jobs and native Scheduler migrations/service/dispatch/completion. Scheduler dispatch is invoked through its captured native scheduled job, without waiting for wall-clock timers. Success and failure persist as native occurrence outcomes. API tests use actual routes and services with substituted identity/authorization middleware. Cases also cover invalid input, branch selection, duplicate events, permission withdrawal, lost-worker no-replay, reopened history without Collection metadata, exact bigint IDs, rollback, replay preservation and schema rollback refusal.

The strict semantic type subset includes the process runtime, routes/config, new migration, both CLI commands and build hooks against public target packages. Full repository checks cannot run with the unresolved legacy package/CLI environment. The application package manifest and lockfile remain unchanged for later template/dependency integration; public target validation dependencies live outside the repository. No production deployment or credentials are accessed.

Still required before cutover: real installed definition/module inventory and business handlers; all remaining workflow instructions, parameter/version/editor/management capabilities; production Jobs/Scheduler policies and real authentication; PostgreSQL; full CLI, build and strict source/compiled startup. There are no page changes in this unit. Complete application/browser acceptance and original compiled migration package, manifest and checksum archive remain outstanding. Official source and synthetic migration execution do not satisfy that archive requirement.

AI remains disabled independently. Required preflight counts now block unaudited old-mapper profiles and unresolved CUSTOM/default-ASK/autoCall differences. Ledger `unchanged` never establishes correct tool policy and never authorizes overwriting subsequent edits. Both replacement verification flags remain false in the preflight command.
