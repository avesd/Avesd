/**
 * @author Avesd
 * @package Desktop
 * @namespace TestE2e
 * @description Run
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";

const scenarios = {
    "agent-sessions": "agent-sessions.test.mjs",
    browser: "browser.test.mjs",
    "browser-auth": "browser-auth.test.mjs",
    plugins: "plugin-lifecycle.test.mjs",
    workspace: "workspace.test.mjs",
    storage: "plugin-storage.test.mjs",
    resources: "shared-resources.test.mjs",
};
const requested = process.argv.slice(2);
if (requested.includes("--list")) {
    console.log(Object.keys(scenarios).join("\n"));
} else {
    const selected = requested.length ? [...new Set(requested)] : Object.keys(scenarios);
    const unknown = selected.filter(name => {

        return !Object.hasOwn(scenarios, name);
    });
    if (unknown.length) {
        console.error(`Unknown Electron scenario: ${unknown.join(", ")}. Choose ${Object.keys(scenarios).join(", ")}.`);
        process.exitCode = 1;
    } else {
        for (const name of selected) {
            console.log(`Electron: ${name}`);
            const result = spawnSync(process.execPath, [join(import.meta.dirname, scenarios[name])], {
                stdio: "inherit",
                timeout: 120000,
            });
            if (result.error || result.status !== 0) {
                console.error(`Electron scenario failed: ${name}${result.error ? ` (${result.error.message})` : ""}`);
                process.exitCode = 1;
                break;
            }
        }
    }
}
