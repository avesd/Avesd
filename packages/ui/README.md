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

## Component styling

Use the exported `cn` helper (`clsx` followed by `tailwind-merge`) to compose
conditional classes and resolve Tailwind utility conflicts. Component variants
live in colocated `style.ts` files using `class-variance-authority`. Production
styles currently use semantic CSS classes and Avesd tokens; `cn` does not generate
Tailwind CSS, and consumers need their own Tailwind build to use utility classes.

## Dropdown menus

Dropdown components wrap Radix Dropdown Menu and retain its native props,
events, and React 19 refs. Import `DropdownMenu`, `DropdownMenuTrigger`,
`DropdownMenuContent`, and the item components from `@avesd/ui`.

```tsx
<DropdownMenu>
    <DropdownMenuTrigger asChild>
        <Button variant="secondary">Actions</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={openSettings}>
            Settings
            <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
        </DropdownMenuItem>
    </DropdownMenuContent>
</DropdownMenu>
```

The full composition includes Group, Label, Separator, CheckboxItem, RadioGroup,
RadioItem, Sub, SubTrigger, SubContent, ItemContent, ItemAppearance, and Portal
(all prefixed with `DropdownMenu`). ItemContent supports icons, title adornments,
and ReactNode descriptions. Shortcut only displays a hint; the application owns
shortcut registration. ItemAppearance is visual only, with no menu semantics.

Root supports controlled and uncontrolled open state. Items support `disabled`,
`onSelect`, and `asChild`; checkboxes support `onCheckedChange` and indeterminate
state. Prevent the select event's default action to keep the menu open. Prefer
`onSelect` over pointer-specific handlers for keyboard activation.

Content and SubContent include a Portal; do not wrap them in another Portal.
Use `portalProps` for a custom container or forced mounting. Content retains
Radix placement/collision props and adds `margin` (`none`, `small`, `medium`,
`large`). For precise collision-aware spacing, use `margin="none"` with
`sideOffset`. Items expose `variant="destructive"` and `isUseCursorPointer`;
labels expose `fontWeight`; radio items can hide indicator padding while their
group has no selection. Motion respects reduced-motion preferences.

Browser integration tests live in the desktop renderer's existing Vitest browser
project and load this package's production stylesheet. They use synthetic data
and do not require Electron preload services.
