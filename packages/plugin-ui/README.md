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
