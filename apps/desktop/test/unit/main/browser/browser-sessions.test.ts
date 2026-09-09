/**
 * @author Avesd
 * @package Desktop
 * @namespace TestUnitMainBrowser
 * @description Persistent browser session isolation and consent
 */

import { browserPartition, openBrowserSession } from "../../../../src/main/browser/browser-sessions";
import type { BrowserWindow } from "electron";
import { dialog, session } from "electron";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => {

    return {
        dialog: { showMessageBox: vi.fn() },
        session: {
            fromPartition: vi.fn(() => {

                return {
                    setPermissionRequestHandler() {},
                    setPermissionCheckHandler() {},
                    setDevicePermissionHandler() {},
                    listenerCount: () => {

                        return 1;
                    },
                };
            }),
        },
    };
});

describe("browser sessions", () => {

    it("shares only explicit groups in the same workspace", () => {

        const privateSession = {
            name: "work",
            shared: false,
        };
        const shared = {
            ...privateSession,
            shared: true,
        };
        expect(browserPartition("one", "a", privateSession)).not.toBe(browserPartition("one", "b", privateSession));
        expect(browserPartition("one", "a", shared)).toBe(browserPartition("one", "b", shared));
        expect(browserPartition("one", "a", shared)).not.toBe(browserPartition("two", "a", shared));
        expect(browserPartition("one", "a", shared)).not.toBe(browserPartition("one", "a", privateSession));
    });
    it("never opens a shared partition after denied consent and coalesces concurrent approvals", async () => {

        const window = {} as BrowserWindow;
        const shared = {
            name: "synthetic",
            shared: true,
        };
        vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({
            response: 0,
            checkboxChecked: false,
        });
        await expect(openBrowserSession(window, "test", "denied", shared)).rejects.toThrow("not approved");
        expect(session.fromPartition).not.toHaveBeenCalled();
        vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({
            response: 1,
            checkboxChecked: false,
        });
        await Promise.all([
            openBrowserSession(window, "test", "allowed", shared),
            openBrowserSession(window, "test", "allowed", shared),
        ]);
        expect(dialog.showMessageBox).toHaveBeenCalledTimes(2);
    });
});
