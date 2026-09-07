# Avesd Plugin UI

`@avesd/plugin-ui` is the renderer-only, framework-neutral contract for UI
plugins. A widget contributes serializable metadata plus a `mount` lifecycle.
The host gives it an unstyled `ShadowRoot` covering the widget's assigned grid
region, then calls `update` when configuration or size changes and `dispose`
when the instance or plugin is removed.

Widget plugins own every visual and interactive detail inside their region.
The dashboard host owns only placement, lifecycle, scoped services, edit-mode
overlays, and error containment. A plugin may render with DOM APIs or mount its
own React, Vue, Svelte, or other framework runtime.

Configuration is versioned JSON. Its optional schema is descriptive metadata
for settings UI and agents; schema validation and migrations are not yet part
of the v1 runtime. Widget inputs receive only their explicitly bound sources
through scoped `read`, `subscribe`, and `update` operations.

Shadow DOM provides style isolation, not a security sandbox. External plugin
discovery and sandboxing remain separate runtime concerns.

The desktop's trusted built-in Web page widget uses a host-managed native view
through a desktop-only typed service. It does not add Electron objects to this
public contract. Its temporary `avesd.web-result` output can be consumed through
the existing input binding API; output values are read-only and are not saved.
The host preserves mounted controllers when an unchanged binding map is loaded
again, so unrelated layout updates do not reset live browser sessions.

`WidgetMountContext.browser`, when provided by the host, is a
`WidgetBrowserService` with `extract(inputId, fields)`, `navigate(inputId, url)`,
and `click(inputId, selector)`. The host fixes the source instance and resolves
an explicitly authorized target from the input name. It does not expose target
discovery, binding administration, arbitrary scripts, or Electron handles to
this service. The desktop currently supplies it only to its trusted built-in
Browser controls widget. Missing grants and unsupported actions reject; a
plugin identifier alone does not confer authority over a widget instance.
