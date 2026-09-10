# Agent sessions

Avesd routes agent requests through three tiers: `flagship`, `reasoning`, and
`action`. Settings maps each tier to an installed ACP provider, model ID, and
effort ID. Blank IDs use that adapter's default. Explicit IDs must be supported
by the connected ACP; unsupported values fail before the prompt is sent.
Provider installation and login remain in the ACP settings section.

Model and effort selectors load their options from a fresh ACP session. Changing
the model reloads its effort choices and resets the selected effort to the ACP
default. Saved IDs that are no longer offered remain visible until replaced;
they are never silently substituted. Refresh models retries discovery. An ACP
that does not report model options can still use its default.

Discovery does not send a model prompt. Test connection sends one fixed short
request using the selected model and effort, which may consume provider quota.
A successful test confirms that request only; listed models are not guaranteed
to remain accessible. Changing the selection or refreshing clears the result.
Discovery and tests use temporary sessions without Avesd MCP tools, do not appear
in Sessions, and do not change saved routes or existing conversations. Checks
are limited to three concurrent operations with a 45-second operation deadline
and clean up their adapter processes and scratch directories afterward.

The client negotiates the adapter's structured session-failure extension.
Terminal failure metadata marks the request as failed even when the ACP stop
reason is `end_turn`; ordinary assistant text is never parsed as an error.
Failures show a bounded local message and a Retry action. Retry restores the
connection so another prompt can be sent in the same session. Model and CLI
compatibility still depend on the selected local provider installation.

Each new session captures its tier configuration. Changing settings does not
change sessions already created. Widgets receive the tier abstraction, not
provider installation paths or model configuration.

## Session directory

The sidebar's Agent button creates a new user-initiated Flagship session every
time. Sessions opens the unified directory with User initiated and Background
filters. Select an entry to view its conversation, or choose a tier and create
a session. Stop terminates a running session; Remove releases a finished or
idle session. A stopped session retains its transcript but cannot be resumed.

Drag the Sessions button along the sidebar to change its position, or focus it
and press Alt+ArrowUp/ArrowDown. Its position is saved locally.

Closing a panel, switching the selected session, or changing dashboards does
not cancel a task. Sessions retain their originating workspace and dashboard.
Workspace tools require that dashboard to be active, so a task cannot silently
act on a newly selected dashboard. Widget-originated tool calls also recheck
the source widget and its current agent capability.

Sessions and conversations currently remain in memory until application exit;
they are not imported from external ACP clients or resumed after restart.
Tier settings and sidebar position do persist. The application allows 32
sessions and eight concurrent prompts, and bounds each retained event stream
to approximately 512 KiB of serialized text. Remove old sessions to free slots.

## Widget API

Declare `"agent"` in the widget manifest's `capabilities`, then use the optional
`context.agent` service:

```js
const { id } = await context.agent.start({
    tier: "reasoning",
    prompt: "Summarize the synthetic task list in this dashboard.",
});
const result = await context.agent.read(id);
// { id, tier, status, answer }
// await context.agent.cancel(id);
```

`start` returns immediately; `read` exposes accumulated assistant text and an
`idle`, `running`, `completed`, `error`, or `stopped` status. A widget can read
or stop only sessions created by that widget in the same workspace. Prompts
must be nonempty and at most 32,000 characters. Handle rejected calls and
stop polling when the mount signal is aborted. Store any results needed after
application exit through the widget's declared storage services.

These tasks appear in Sessions under Background. Unmounting the widget does
not stop its agent, but removes its live service access. The `agent` capability
delegates Avesd's agent toolset in the originating scope; it is not an isolated
text-completion API. Draft previews cannot launch agents or inspect live
sessions. All native regression tests use synthetic local ACP processes.
