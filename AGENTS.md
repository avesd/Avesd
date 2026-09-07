# Avesd Core Monorepo

These instructions apply throughout the repository. A nearer `AGENTS.md` may
add subtree-specific constraints.

## Communication and repository language

- Communicate with the user in Chinese.
- Keep checked-in artifacts in English, including code, comments,
  documentation, commit messages, and pull-request text.
- If screenshots are used during a turn, include those screenshots in the
  final response to the user.

## Product boundary

- Avesd is the kiosk that grows with its user: a local-first, extensible desktop
  workspace whose capabilities expand through replaceable plugins.
- Its core local workflow must remain usable without an account, network
  connection, or cloud service.
- Cloud accounts and synchronization are optional future capabilities, not
  current dependencies of the desktop application.

## Electron boundaries

- Renderer code must not access Node.js, Electron privileged APIs, the file
  system, credentials, or persistence directly.
- Expose privileged behavior through narrow, typed preload APIs and explicit
  IPC contracts.
- Keep domain rules independent of Electron, React, persistence drivers, and
  future cloud implementations.
- Treat user-created content, contact details, credentials, imported documents,
  and locally persisted data as sensitive. Do not place them in logs, fixtures,
  snapshots, or committed environment files.

## Repository mechanics

- Dependency versions belong in the `pnpm-workspace.yaml` catalog; workspace
  manifests reference them with `catalog:`.
- Use root scripts for normal verification: `pnpm lint`, `pnpm compile`,
  `pnpm test`, `pnpm build`, and `pnpm validate`.
- `README.md` currently owns product orientation and repository onboarding.
- `working/` contains non-authoritative audits, plans, and temporary notes.

## Git handling

Do not inspect or mutate Git state unless the user explicitly asks for Git work
in that turn. Preserve unrelated user changes.
