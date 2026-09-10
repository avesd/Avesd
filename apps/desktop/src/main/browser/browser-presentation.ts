/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Visible browser authentication and bounded login popups
 */

import { parseWebUrl } from "../../shared/browser/web-surface";
import type { WebContents, WebContentsView } from "electron";
import { BrowserWindow } from "electron";

export class BrowserPresentation {
    #window?: BrowserWindow;
    #popup?: BrowserWindow;
    #disposed = false;

    constructor(private readonly host: BrowserWindow, private readonly view: WebContentsView, private readonly changed: () => void) {

        this.#guard(view.webContents);
        view.webContents.setWindowOpenHandler(({ url }) => {

            if (this.#disposed || this.#popup) {
                return { action: "deny" };
            }
            try {
                if (url !== "about:blank") {
                    parseWebUrl(url);
                }
            } catch { return { action: "deny" }; }

            return {
                action: "allow",
                overrideBrowserWindowOptions: {
                    parent: this.host,
                    width: 900,
                    height: 720,
                    autoHideMenuBar: true,
                    webPreferences: {
                        session: view.webContents.session,
                        sandbox: true,
                        nodeIntegration: false,
                        contextIsolation: true,
                        webSecurity: true,
                        navigateOnDragDrop: false,
                    },
                },
            };
        });
        view.webContents.on("did-create-window", popup => {

            if (this.#disposed || this.#popup) {
                popup.destroy();

                return;
            }
            this.#popup = popup;
            this.#guard(popup.webContents);
            popup.webContents.setWindowOpenHandler(() => {

                return { action: "deny" };
            });
            popup.on("closed", () => {

                this.#popup = undefined; this.changed();
            });
            popup.show(); popup.focus(); this.changed();
        });
        const reveal = (_event: Electron.Event, url: string, _inPlace?: boolean, mainFrame?: boolean) => {

            if (mainFrame === false || view.getVisible() || !view.webContents.getURL()) {
                return;
            }
            try {
                if (parseWebUrl(url).origin !== parseWebUrl(view.webContents.getURL()).origin) {
                    this.show();
                }
            } catch { /* Invalid destinations are blocked by the navigation guard. */ }
        };
        view.webContents.on("will-redirect", reveal);
        view.webContents.on("will-navigate", reveal);
    }

    get presented(): boolean {

        return !!this.#window || !!this.#popup;
    }

    show(): void {

        if (this.#disposed) {
            return;
        }
        if (!this.#window) {
            const window = new BrowserWindow({
                parent: this.host,
                width: 960,
                height: 760,
                title: "Browser · close to return to background",
                autoHideMenuBar: true,
            });
            this.#window = window;
            this.host.contentView.removeChildView(this.view);
            window.contentView.addChildView(this.view);
            const resize = () => {

                const [
                    width = 960,
                    height = 760,
                ] = window.getContentSize();
                this.view.setBounds({
                    x: 0,
                    y: 0,
                    width,
                    height,
                });
            };
            window.on("resize", resize);
            window.on("close", () => {

                window.contentView.removeChildView(this.view);
                if (!this.#disposed && !this.host.isDestroyed()) {
                    this.host.contentView.addChildView(this.view);
                }
                this.view.setVisible(false);
                this.#window = undefined;
                this.changed();
            });
            resize();
        }
        try { this.#window.setTitle(`Browser · ${parseWebUrl(this.view.webContents.getURL()).origin} · close to return`); } catch { /* Empty browser. */ }
        this.view.setVisible(true); this.#window.show(); this.#window.focus(); this.view.webContents.focus(); this.changed();
    }

    hide(): void {

        this.#popup?.close(); this.#window?.close();
    }

    dispose(): void {

        this.#disposed = true;
        this.#popup?.destroy();
        // Detach the guest before destroying its presentation window.
        if (this.#window) {
            this.#window.contentView.removeChildView(this.view); this.#window.destroy(); this.#window = undefined;
        }
    }

    #guard(contents: WebContents): void {

        const guard = (event: Electron.Event, url: string) => {

            try { parseWebUrl(url); } catch { event.preventDefault(); }
        };
        contents.on("will-frame-navigate", event => {

            return void guard(event, event.url);
        });
        contents.on("will-redirect", (event, url) => {

            return void guard(event, url);
        });
        const title = () => {

            try { (contents === this.view.webContents ? this.#window : this.#popup)?.setTitle(`Sign in · ${parseWebUrl(contents.getURL()).origin} · close to return`); } catch { /* Initial blank popup. */ }
        };
        contents.on("page-title-updated", event => {

            event.preventDefault(); title();
        });
        contents.on("did-navigate", title);
    }
}
