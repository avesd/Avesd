/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Persistent browser sessions and explicit sharing consent
 */

import type { BrowserSessionConfiguration } from "../../shared/browser/plugin-browser";
import type { BrowserWindow, Session } from "electron";
import { dialog, session } from "electron";
import { createHash } from "node:crypto";

const approvals = new Map<string, Promise<boolean>>();

export function browserPartition(workspaceId: string, owner: string, configuration: BrowserSessionConfiguration): string {

    const identity = JSON.stringify([
        workspaceId,
        configuration.shared ? "shared" : "private",
        configuration.shared ? "" : owner,
        configuration.name,
    ]);

    return `persist:avesd-browser-${createHash("sha256").update(identity)
        .digest("hex")}`;
}

export async function openBrowserSession(window: BrowserWindow, workspaceId: string, owner: string, configuration: BrowserSessionConfiguration): Promise<Session> {

    const partition = browserPartition(workspaceId, owner, configuration);
    if (configuration.shared) {
        const key = JSON.stringify([
            partition,
            owner,
        ]);
        let approval = approvals.get(key);
        if (!approval) {
            approval = dialog.showMessageBox(window, {
                type: "question",
                title: "Share browser login",
                message: `Allow ${owner} to use shared session “${configuration.name}”?`,
                detail: "This shares website login and storage with other approved plugins or pages using this session in this workspace. Approval lasts until Avesd exits.",
                buttons: [
                    "Cancel",
                    "Allow shared session",
                ],
                defaultId: 0,
                cancelId: 0,
                noLink: true,
            }).then(result => {

                return result.response === 1;
            });
            approvals.set(key, approval);
        }
        if (!await approval) {
            approvals.delete(key);
            throw new Error("Shared browser session was not approved.");
        }
    }
    const browserSession = session.fromPartition(partition);
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) => {

        return void callback(false);
    });
    browserSession.setPermissionCheckHandler(() => {

        return false;
    });
    browserSession.setDevicePermissionHandler(() => {

        return false;
    });
    if (!browserSession.listenerCount("will-download")) {
        browserSession.on("will-download", event => {

            return void event.preventDefault();
        });
    }

    return browserSession;
}
