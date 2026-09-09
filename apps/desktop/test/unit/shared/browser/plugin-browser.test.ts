/**
 * @author Avesd
 * @package Desktop
 * @namespace TestUnitSharedBrowser
 * @description Plugin browser boundary tests
 */

import { localManifestSchema } from "../../../../src/main/plugins/local-plugin-contract";
import { allowsBrowserOrigin, parseBrowserSession, parsePluginBrowserRequest } from "../../../../src/shared/browser/plugin-browser";
import { describe, expect, it } from "vitest";

describe("plugin browser contracts", () => {

    it("rejects arbitrary scripts and privileged navigation", () => {

        expect(() => {

            return parsePluginBrowserRequest({
                type: "run",
                code: "document.cookie",
            });
        }).toThrow();
        expect(() => {

            return parsePluginBrowserRequest({
                type: "navigate",
                url: "file:///private",
            });
        }).toThrow();
        expect(parsePluginBrowserRequest({ type: "show" })).toEqual({ type: "show" });
        expect(allowsBrowserOrigin({ origins: ["https://example.com"] }, "https://example.com/login")).toBe(true);
        expect(allowsBrowserOrigin({ origins: ["https://example.com"] }, "https://example.com.evil.test/login")).toBe(false);
    });
    it("requires explicit shared session intent and bounded names", () => {

        expect(() => {

            return parseBrowserSession({ name: "default" });
        }).toThrow();
        expect(() => {

            return parseBrowserSession({
                name: "../other",
                shared: true,
            });
        }).toThrow();
        expect(parseBrowserSession({
            name: "work",
            shared: false,
        })).toEqual({
            name: "work",
            shared: false,
        });
    });
    it("validates browser declarations in installed manifests", () => {

        const manifest = {
            apiVersion: 1,
            id: "avesd.local.browser",
            version: "1.0.0",
            displayName: "Browser",
            widgetTypeId: "browser",
            size: {
                width: 8,
                height: 8,
            },
        };
        expect(localManifestSchema.safeParse({
            ...manifest,
            browser: {
                origins: ["https://example.com"],
                session: {
                    name: "work",
                    shared: true,
                },
            },
        }).success).toBe(true);
        expect(localManifestSchema.safeParse({
            ...manifest,
            browser: { origins: ["https://example.com/path"] },
        }).success).toBe(false);
    });
});
