/**
 * @author Avesd
 * @package Desktop
 * @namespace TestUnitMainPlugins
 * @description Local Plugin Store Test
 */

import { counterExample } from "../../../../src/main/plugins/local-plugin-contract";
import { LocalPluginStore } from "../../../../src/main/plugins/local-plugin-store";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
afterEach(async () => {

    await Promise.all(directories.splice(0).map((directory) => {

        return rm(directory, {
            recursive: true,
            force: true,
        });
    }));
});
const createStore = async () => {

    const directory = await mkdtemp(join(tmpdir(), "avesd-plugin-store-")); directories.push(directory);

    return {
        directory,
        store: new LocalPluginStore(directory),
    };
};

describe("local plugin installation", () => {

    it("requires a passing exact revision, invalidates edited reports, and reopens installed code", async () => {

        const { directory, store } = await createStore();
        const draft = await store.create(counterExample);
        await expect(store.activate(draft.id, draft.revision)).rejects.toThrow("passing tests");
        store.record({
            draftId: draft.id,
            revision: draft.revision,
            passed: false,
            checks: [],
        });
        await expect(store.activate(draft.id, draft.revision)).rejects.toThrow("passing tests");
        store.record({
            draftId: draft.id,
            revision: draft.revision,
            passed: true,
            checks: [],
        });
        await store.activate(draft.id, draft.revision);
        const edited = await store.write(draft.id, draft.revision, {
            ...counterExample,
            source: `${counterExample.source}\n// Edited`,
        });
        await expect(store.activate(draft.id, edited.revision)).rejects.toThrow("passing tests");
        await expect(store.activate(draft.id, draft.revision)).rejects.toThrow("passing tests");
        await expect(store.write(draft.id, draft.revision, counterExample)).rejects.toThrow("Draft changed");
        const reopened = new LocalPluginStore(directory);
        expect((await reopened.installed(counterExample.manifest.id)).revision).toBe(draft.revision);
        await expect(reopened.activate(draft.id, edited.revision)).rejects.toThrow("passing tests");
    });

    it("rejects path traversal, builtin identities, oversized source, and empty tests", async () => {

        const { store } = await createStore();
        await expect(store.read("../../workspace-v1")).rejects.toThrow();
        await expect(store.installed("../../workspace-v1")).rejects.toThrow();
        await expect(store.create({
            ...counterExample,
            manifest: {
                ...counterExample.manifest,
                id: "avesd.builtin.counter",
            },
        })).rejects.toThrow();
        await expect(store.create({
            ...counterExample,
            source: "x".repeat(65_537),
        })).rejects.toThrow();
        await expect(store.create({
            ...counterExample,
            tests: [],
        })).rejects.toThrow();
    });
});
