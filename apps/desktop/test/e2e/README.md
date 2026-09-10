# Native integration tests

Run from the repository root. `pnpm test:electron` builds once and runs all
scenarios. Supply one or more names to run only the relevant scenarios:

```sh
pnpm test:electron browser plugins
pnpm test:electron workspace
pnpm test:electron storage resources
```

Use `node apps/desktop/test/e2e/run.mjs --list` to list names without a
build. The runner rejects unknown names before launching anything, deduplicates
selections, stops at the first failure, and bounds each scenario to two minutes.

## Coverage ownership

| Scenario | Native boundary owned here | Detailed checks owned elsewhere |
| --- | --- | --- |
| `agent-sessions` | Native ACP tier routing, independent foreground/background histories, widget sender isolation, cancellation, scope retention, sidebar movement and restart settings | Session lifecycle and route validation in agent unit tests; queued scope enforcement in workbench integration tests |
| `browser` | Remote view sandbox, JS/CSS execution, result binding, origin/action authorization, navigation and teardown | URL/result parsing and browser grant rules in `test/unit/shared/browser` and `test/unit/main/browser` |
| `browser-auth` | Plugin browser sender/origin checks, persistent shared sessions, login presentation, popup session and restart | Session consent/isolation and manifest validation in browser unit suites |
| `plugins` | Real MCP relay, draft/test/activate flow, actual local sandbox restrictions, preview lifecycle, edit visibility and restart | Manifest validation and revision state rules in `test/unit/main/plugins` |
| `widget-resize` | Native pointer and keyboard resizing, live instance size delivery, cancellation, independent defaults and restart | Grid validation and atomic persistence in workspace model tests |
| `workspace` | Widget service bridge, dashboard transitions, stale identities/tokens, view teardown and selection persistence | Scope, navigation and mutation rules in workspace model/workbench tests |
| `storage` | Typed binary IPC, files/SQLite from a sandbox, capability enforcement, plugin/workspace isolation, preview isolation and restart | Path traversal, SQL allow/deny rules, transaction recovery and limits in `test/integration/main/storage` |
| `resources` | Publisher/consumer discovery, shared file/SQLite calls, read-only grants, revocation of existing handles, directory isolation and restart | Forged locators, grant corruption, failed saves and access rule combinations in `test/integration/main/storage` |

Keep negative tests at the real boundary when they validate sender identity,
capability enforcement, or access revocation. Do not repeat an entire input
validation matrix over Electron merely because a new API uses the same service.
Restart and preview checks can appear in multiple scenarios when they exercise
different persistent stores or service wiring.

## Harness and fixtures

`support/desktop.mjs` owns temporary profiles, launch/restart, bounded shutdown,
cleanup, host renderer errors, HTTP host tools, and local widget discovery.
`support/bootstrap.mjs` points the real application at the synthetic profile;
it does not mock persistence or preload APIs. Plugin installation is a helper;
preview isolation assertions remain explicit in the scenarios that own them.
The authoring scenario additionally uses the real MCP stdio relay, since the
HTTP helper alone would not verify that boundary.

Fixtures stay inline with the scenario unless they are actually shared. Use
synthetic content only. Profiles are deleted on success and failure. Routine
regressions do not save screenshots: a saved image without pixel inspection is
not visual QA. Follow the repository UI visual QA skill for rendered changes.
