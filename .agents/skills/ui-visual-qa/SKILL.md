---
name: ui-visual-qa
description: Visually verify user-facing UI work in this repository by opening the relevant product surface, exercising affected states, capturing screenshots, inspecting the rendered result, and iterating on authorized visual fixes. Use after implementing or materially changing desktop or browser UI, or when the user asks for a visual review. Do not use for backend-only work or changes with no rendered output.
---

# UI Visual QA

Verify the rendered result rather than treating successful compilation or tests as visual proof. Follow the user's requested scope and the repository instructions; this skill does not expand a review-only request into authorization to edit code.

## Choose the Verification Surface

- Prefer the actual Avesd desktop application for Electron UI changes when native UI automation is available and the host session is accessible.
- Use an existing browser surface for browser UI changes.
- If native automation is unavailable, use the repository's existing browser or headless rendering path only when it faithfully renders the affected UI. State clearly that this verifies the renderer, not native Electron window behavior.
- Before accepting a browser fallback for Electron UI, confirm that the harness loads production styles and supplies safe substitutes for required preload services. A bare renderer development URL may be blank without Electron preload, while an isolated component test may silently render without application CSS.
- Use safe fixture or mock state when needed to reach a visual state. Do not present mocked privileged integrations, persistence, shell behavior, or ACP connectivity as end-to-end verification.
- Do not add a permanent screenshot harness, dependency, or test fixture unless the task requires one.

## Run the Visual Loop

1. Identify the smallest set of states that covers the changed behavior. Include the initial state and the primary interaction state; add loading, empty, error, disabled, overflow, or narrow-window states only when the change can affect them.
2. Start the application or renderer with the repository's existing commands. Reuse an already-running instance when it is trustworthy.
3. Navigate to each selected state using available UI automation. Exercise the interaction instead of relying only on a static initial render.
4. Capture screenshots to an operating-system temporary directory unless the user explicitly requests committed artifacts.
5. Open every captured image with the available image-viewing capability and inspect the pixels. File existence, screenshot dimensions, DOM assertions, and accessibility trees do not substitute for visual inspection.
6. Check the result against the implementation intent or supplied reference. Look for clipping, overlap, unexpected scrolling, broken focus treatment, inconsistent spacing or alignment, weak hierarchy, unreadable contrast, stale content, and incorrect expanded or collapsed state.
7. For an implementation task, fix only observed defects within the authorized scope, rerun proportionate functional checks, then recapture the affected states. For a review or diagnosis task, report defects without changing code.
8. Stop after a clean, proportionate final pass. Do not continue into speculative pixel polishing or unrelated redesign.

## Desktop-Specific Checks

- Verify the configured corner, window edge spacing, collapsed footprint, expanded panel bounds, and whether the panel remains reachable at a narrow supported window size.
- Confirm overlays do not unintentionally block underlying controls and that stacking, shadows, borders, and transparency remain legible against the tested background.
- When drag, resize, always-on-top, native focus, tray, or multi-window behavior changes, require a real Electron pass; a browser render is insufficient.
- When motion affects the result, wait for a stable frame or honor reduced-motion behavior before capturing.

## Protect the User and the Workspace

- Never capture credentials, API keys, tokens, imported documents, contact details, private conversations, or other user-created content. Use obviously synthetic data.
- Respect operating-system locks, permission prompts, confirmations, and sandbox boundaries. Do not bypass them to obtain a screenshot.
- Clean up temporary screenshots and background development processes when practical. Preserve screenshots when they are needed to explain a finding or the user asks for them.
- Report exactly which surface, states, and viewport or window sizes were inspected, plus any limitation. Never claim a native visual pass from a headless render.
