# Avesd UI

`@avesd/ui` is the internal React component library for trusted Avesd product
surfaces. It owns shared design tokens and accessible visual primitives. Product
features keep their data loading, state, and domain behavior in the consuming
application.

Import `@avesd/ui/styles.css` once at the renderer entry point, then import
components from `@avesd/ui`. Prefer semantic variants and CSS variables over
feature-specific color values. Extend the library when the same visual pattern
is used by more than one product surface or when a shared accessibility behavior
belongs with the component.

This package is separate from `@avesd/plugin-ui`. The latter is a framework-neutral
plugin contract and does not expose host React components to sandboxed plugins.
