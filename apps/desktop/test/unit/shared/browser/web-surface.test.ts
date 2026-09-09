/**
 * @author Avesd
 * @package Desktop
 * @namespace TestUnitSharedBrowser
 * @description Web Surface Test
 */

import { parseWebCommand, parseWebResult, parseWebUrl, settleWebSurfaceCommand,
    unwrapWebSurfaceCommand } from "../../../../src/shared/browser/web-surface";
import { describe, expect, it } from "vitest";

describe("web surface boundaries", () => {

    it("allows secure pages and loopback development, rejects privileged schemes and credentials", () => {

        for (const url of [
            "https://example.com",
            "http://localhost:8080",
            "http://127.0.0.1:8080",
            "http://[::1]:8080",
        ]) {
            expect(parseWebUrl(url)).toBeInstanceOf(URL);
        }
        for (const url of [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,x",
            "https://a:b@example.com",
            "http://example.com",
            "http://localhost.evil.test",
            "bad url",
        ]) {
            expect(() => {

                return parseWebUrl(url);
            }).toThrow();
        }
    });
    it("validates IPC discriminants, dimensions and script limits at runtime", () => {

        expect(() => {

            return parseWebCommand({
                type: "run",
                id: "x",
                document: 0,
                origin: "https://example.com",
                code: "1",
                mode: "node",
            });
        }).toThrow();
        expect(() => {

            return parseWebCommand({
                type: "bounds",
                id: "x",
                bounds: {
                    x: 0,
                    y: 0,
                    width: Infinity,
                    height: 5,
                    visible: true,
                },
            });
        }).toThrow();
        expect(() => {

            return parseWebCommand({
                type: "run",
                id: "x",
                document: 0,
                origin: "https://example.com",
                code: "x".repeat(32769),
                mode: "page",
            });
        }).toThrow();
        expect(() => {

            return parseWebCommand({
                type: "delete-all",
                id: "x",
            });
        }).toThrow();
    });
    it("only accepts bounded JSON, including protection against cyclic or deeply nested results", () => {

        expect(parseWebResult({
            title: "Synthetic",
            value: [
                1,
                true,
                null,
            ],
        })).toEqual({
            title: "Synthetic",
            value: [
                1,
                true,
                null,
            ],
        });
        const cycle: unknown[] = []; cycle.push(cycle);
        for (const value of [
            undefined,
            Infinity,
            new Date(),
            () => {

                return 1;
            },
            cycle,
            "x".repeat(65537),
            "界".repeat(22000),
        ]) {
            expect(() => {

                return parseWebResult(value);
            }).toThrow();
        }
    });
    it("settles lifecycle failures across IPC while preserving renderer rejection semantics", async () => {

        const state = {
            id: "surface",
            document: 0,
            url: "",
            status: "empty" as const,
            result: null,
        };
        expect(unwrapWebSurfaceCommand(await settleWebSurfaceCommand(Promise.resolve(state)))).toEqual(state);
        const result = await settleWebSurfaceCommand(Promise.reject(new Error("Web surface is unavailable.")));
        expect(result).toEqual({
            ok: false,
            error: "Web surface is unavailable.",
        });
        expect(() => {

            return unwrapWebSurfaceCommand(result);
        }).toThrow("Web surface is unavailable.");
    });
});
