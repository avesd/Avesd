# Browser widgets

## Embedded web pages

The built-in **Web page** widget embeds a sandboxed `WebContentsView` managed by
the desktop main process. Add it from **Edit layout**, leave editing, enter an
HTTPS URL (HTTP is supported on loopback hosts), and choose **Go**.

Its **Tools** panel supports active-document JavaScript in either an isolated
world or the page world, plus CSS insertion. Each run requires explicitly
enabling that script for the displayed origin; editing the script or navigating
clears this selection. Both JavaScript modes can read and change the page using
its login session. Isolation is not a read-only permission.

Add a **Web result** widget and bind its **Web output** input to the page's
temporary output in **Edit layout**. Script JSON results are available to bound
widgets in the same dashboard. These outputs are read-only, capped at 64 KiB,
and kept in memory: they are not workspace data records and are not returned by
the workspace MCP server. Layout and binding identifiers persist, but URLs,
scripts and extracted values do not. Browser login/storage persists locally. Reload or navigation
clears the result; **Clear result** also clears it without navigating. Removing
the page destroys its browser and invalidates the output.

The built-in page tools serve trusted host widgets; local plugins use the narrower browser service described below. Remote pages receive no host preload or Electron APIs. Each
instance defaults to a separate persistent session; browser permissions and downloads are denied. Login popups are sandboxed and share their opener session. Up to eight page instances can be open. Script execution
targets the current main document, rejects stale results after navigation, and
limits the caller's wait to five seconds. A timeout does not undo page actions
or guarantee script termination; reload to recover.

Native browser views are hidden while layout editing, while the Agent panel or
page tools are open, and when a page viewport is partly outside the window.
Scroll the widget fully into view to interact with it. This avoids treating DOM
z-index or resized native bounds as reliable clipping.

Document-start hooks, worker/subframe automation, network interception,
and Agent script execution are not implemented. Website login and popup compatibility are not universal. Ordinary
local widgets remain usable without network access.

Run `pnpm test:electron` for the native integration test. It builds the desktop,
opens an isolated temporary profile, serves a synthetic loopback page, and
checks sandbox settings, JavaScript/CSS execution, temporary binding, navigation
races, and teardown. It does not use the user's browser profile or connect an
Agent. Native visual QA remains a separate check on an unlocked desktop.

## Browser control bindings

Add **Browser controls** to operate a separate **Web page** widget. In **Edit
layout → Browser control bindings**, choose its target instance, enter the
allowed website origin, select `extract`, `navigate`, and/or `click`, and save.
No actions are granted by default. Choose **Not connected** and save to revoke
the binding. Each controller currently has one input named `browser`. The
controller provides **Read text**, **Navigate**, and **Click element** buttons;
selectors and destination URLs entered there are temporary.

Bindings refer to stable instance IDs, not plugin IDs, display order, grid
position, or temporary browser handles. A plugin supplies widget types; a
dashboard owns their instances. Bindings are restricted to supported trusted
controllers and target browsers in the same dashboard. Moving either instance
preserves the binding; removing an endpoint invalidates it without retargeting
another browser.

Grants persist in `browser-bindings-v1.json`, owned and written only by main,
outside the renderer/MCP workspace snapshot. A failed save does not install a
new grant. Invalid grant storage disables browser controls while leaving the
local dashboard available.

The host gives controller widgets a `WidgetBrowserService` scoped to their own
instance. Calls use the input name; callers do not select a target ID. Main
resolves the binding and checks the operation, both instances, dashboard,
actual origin, and document generation. Navigation destinations must match the
allowed origin. Field extraction uses host-owned text selectors and bounded
JSON, and publishes to the browser's existing temporary output. Click dispatches
a DOM `.click()` on exactly one HTML element; it is not native trusted input.
The control interface does not accept arbitrary JavaScript. Revocation or
navigation discards pending results; it cannot undo already dispatched actions.

These are host-enforced control rules for trusted built-in widgets, not a
security sandbox between renderer plugins. The renderer is still one trusted
execution environment with access to the host administration API. Remote pages
do not have that API. Local authored widgets run in separate isolated browsers and use their manifest-declared browser service rather than these host bindings. General third-party plugin privileges and Agent
browser control grants remain unsupported.


## Persistent sessions and background pages

**Web page → Tools** includes a session name and workspace-sharing checkbox.
Choose **Apply session** to reopen the page in that session. Private sessions
are scoped to the workspace and page instance; plugin-private sessions are
scoped to the workspace and plugin. Shared sessions are scoped to workspace and
name. Every owner must approve joining a shared session through a native dialog;
concurrent requests coalesce and approval lasts until application exit.
Declining leaves the existing page intact. Session settings are saved in widget
configuration; session contents live in Electron's local persistent partitions,
not workspace snapshots or agent output. Removal retains session data.

**Hide page** keeps the page and its controls running without an embedded view.
**Open login window** moves the same page into a native window. Closing that
window returns the page to its widget/background state without reloading.
Hidden cross-origin navigations and redirects reveal the page for interaction.
Same-origin login cannot be detected generically: the user or plugin explicitly
opens the login window. One login popup per page is supported, including an
initial `about:blank` popup; child navigation is restricted to HTTPS/loopback HTTP
and nested popups are denied. Authentication provider policies can still reject
embedded browsers. Opening an external browser does not transfer its cookies.

## Local plugin browser service

Declare a browser in the installed plugin manifest:

```json
{
  "browser": {
    "origins": ["https://example.com"],
    "session": { "name": "work", "shared": true }
  }
}
```

This adds `context.browser` with `navigate(url)`, `extract({name: selector})`,
`click(selector)`, `show()`, `hide()`, `close()`, and `status()`. Status reports
`interaction-required` with a null URL on undeclared origins, so plugins can
request user interaction without reading the login provider. Each widget owns
one page, initially hidden. Calls are authenticated by the plugin's native main
frame and recheck the live widget and installed declaration. Navigation targets
and text/click operations require a declared origin; a redirect to a login
provider does not grant the plugin access to that provider. Extraction is
bounded text only. The API exposes no arbitrary scripts or raw Cookie API;
plugins with access to an authenticated site can act as that site's user.

Session sharing shares login/storage, not tabs, DOM state or plugin permissions.
Widget teardown destroys its page and login windows while retaining login data.
Preview browser operations are unavailable and cannot touch persistent sessions.

## Electron 45 and macOS passkeys

The catalog pins `45.0.0-alpha.2`, a preview release satisfying the repository's
existing dependency maturity policy. macOS startup enables
`app.configureWebAuthn({ platformPasskeys: true })`.

This is an integration point, **not universal iCloud passkey support for arbitrary
websites**. Electron's system credential-provider path requires macOS 13+,
a signed app, an embedded provisioning profile authorizing Associated Domains,
a matching application identifier, `webcredentials:<domain>` entitlements, and
that domain's HTTPS AASA file listing the app. Unsigned development builds and
localhost cannot complete this native ceremony. No placeholder team identifiers
or fake signing entitlements are installed by this repository. Domain ownership
and a real signing identity are required to finish provisioning.

The native integration suite tests session persistence, login presentation,
popup session/opener behavior and authorization with synthetic local pages. It
does not claim successful iCloud authentication, exercise real credentials, or
validate signed distribution. See the [Electron change](https://github.com/electron/electron/pull/51563)
and the installed Electron API documentation for provisioning details.

## Task-owned background collections

The sidebar's **Background browsers** panel manages persistent collection tasks
in the current workspace. A task owns a private browser session and page,
independently of dashboard widget instances. Dashboard navigation and removing
its result widget do not destroy the task page. Existing widget-private browser
services retain their previous lifecycle; they are not silently migrated.

A recipe contains a name, HTTPS URL (loopback HTTP is supported), 1–16 named CSS
text selectors, and a refresh interval in minutes. Zero means manual refresh.
`avesd_browser_task` lets an Agent list, save, refresh, open, close, pause,
resume, or explicitly remove these tasks. It returns recipe/status metadata,
not collected values. The Agent must already know or help establish selectors;
automatic page exploration and arbitrary Agent browser scripts are not exposed.
The panel also allows users to create and edit recipes directly.

A refresh loads the configured URL, waits up to twenty seconds for each selector
to match exactly one element, and reads bounded text at that URL's origin.
There are no click, form submission, or arbitrary-script operations in this
service. One refresh runs per task. Cross-origin pages require user interaction;
missing fields report an error that may indicate login or a changed page.
Refresh failures retain the last successful result and timestamp. Editing a
recipe clears its previous result to avoid presenting old fields as new data.

**Open page** presents the existing page for login or inspection. Close that
window to return it to the background; manual and scheduled refreshes yield
while it is presented. **Close page** cancels collection, discards pending
results, and releases the page without clearing login or the recipe; a later
scheduled refresh may reopen it. **Pause** stops scheduled work. **Delete
collection** explicitly removes the task and saved result, retaining browser
login storage. Task sessions are private and are not automatically shared with
existing widget or plugin sessions. At most eight task pages can be open.

Recipes, pause settings, and results persist atomically in private
`browser-tasks-v1.json` storage. Browser handles and running operations do not
persist. Schedules run only while the desktop window is alive, and start a new
interval after reopening; Avesd does not schedule operating-system background
jobs. Deleting a workspace releases and removes its tasks on the next service
tick. Invalid task storage disables this service without overwriting the file
or preventing the local dashboard from opening.

The built-in **Collection result** widget (`avesd.builtin.collections/result`)
selects a task in its workspace, or receives `configuration: { taskId }` through
`avesd_add_widget`. It subscribes to the task's persistent result and status.
This is a read-only task result source, separate from the existing generic
widget input/data-source binding contract. Local authored widgets still do not
receive generic data-source bindings or direct task management privileges.

`pnpm test:electron browser-tasks browser browser-auth` covers native collection,
private session persistence, cancellation, presentation, dashboard-independent
ownership, workspace isolation, and the existing browser lifecycle boundaries.
