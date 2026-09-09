# Application configuration

Avesd reads application settings from `~/.avesd/config.json` in the user's home
directory. Create the `.avesd` directory and `config.json` file to configure the
application. The currently supported setting is `dataDirectory`, an absolute
path to the product data directory:

```json
{
  "dataDirectory": "/absolute/path/to/avesd-data"
}
```

The configuration location stays fixed even when product data moves. It is
resolved from Electron's `app.getPath("home")`, independently of the current
working directory and Electron's user-data directory. On Windows, this is
normally `%USERPROFILE%\.avesd\config.json`. Windows paths in JSON must escape
backslashes, for example `"D:\\AvesdData"`. Relative paths, `~`, and
environment-variable expansion are not supported.

Quit Avesd before editing this file; the new location takes effect at startup.
The host creates the directory if needed and uses it for `workspace-v1.json`
and `browser-bindings-v1.json`. Plugin drafts and installed versions live in
`plugins/drafts` and `plugins/installed` beneath this directory. The Agent's MCP
relay calls the running desktop host, which owns the same workspace file.
Electron caches and preferences stay in userData; built-in plugin code stays
bundled with the application.

An absent configuration file or `{}` preserves the existing default data
location, Electron's `app.getPath("userData")`. Invalid or unreadable
configuration stops startup with an error instead of silently opening another
workspace.

To preserve existing data when changing directories, copy both data files into
the destination while Avesd is closed, then update the configuration and
restart. Files are not automatically moved, merged, or deleted; an empty
destination starts a new local workspace. Use a separate data directory for
each running application instance. Copy the `plugins` directory as well when
migrating installed local widgets.

Private plugin storage and shared resource metadata also live beneath the
configured data directory. Back up the complete directory rather than only the
workspace snapshot. See [Local widgets](local-widgets.md) for their storage
layout.
