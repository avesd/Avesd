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
scripts, extracted values, and browser sessions do not. Reload or navigation
clears the result; **Clear result** also clears it without navigating. Removing
the page destroys its browser and invalidates the output.

This implementation serves trusted built-in widgets, not sandboxed third-party
plugin code. Remote pages receive no host preload or Electron APIs. Each
instance uses a separate in-memory session; browser permissions, downloads, and
new windows are denied. Up to eight page instances can be open. Script execution
targets the current main document, rejects stale results after navigation, and
limits the caller's wait to five seconds. A timeout does not undo page actions
or guarantee script termination; reload to recover.

Native browser views are hidden while layout editing, while the Agent panel or
page tools are open, and when a page viewport is partly outside the window.
Scroll the widget fully into view to interact with it. This avoids treating DOM
z-index or resized native bounds as reliable clipping.

Document-start hooks, worker/subframe automation, network interception,
retained/shared browser profiles, and Agent script execution are not
implemented. Website login and popup compatibility are not universal. Ordinary
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
do not have that API. Local authored widgets run in separate isolated browsers
and receive no control grants. General third-party plugin privileges and Agent
browser control grants remain unsupported.
