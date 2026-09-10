/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Local Plugin Store
 */

import type { LocalPluginDraft, LocalPluginSummary, PluginTestReport } from "../../shared/plugins/local-plugins";
import { draftContentSchema, draftIdSchema, localManifestSchema, revisionSchema } from "./local-plugin-contract";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

type DraftContent = Pick<LocalPluginDraft, "manifest" | "source" | "tests">;
const revisionOf = (content: DraftContent) => {

    return createHash("sha256").update(JSON.stringify(content))
        .digest("hex");
};

export class LocalPluginStore {
    readonly #reports = new Map<string, PluginTestReport>();
    constructor(private readonly directory: string) {}

    async create(input: unknown): Promise<LocalPluginDraft> {

        const content = draftContentSchema.parse(input);
        const draft = {
            ...content,
            id: randomUUID(),
            revision: revisionOf(content),
        };
        await this.#save(join("drafts", `${draft.id}.json`), draft);

        return draft;
    }

    async read(id: string): Promise<LocalPluginDraft> {

        draftIdSchema.parse(id);
        const stored = JSON.parse(await readFile(join(this.directory, "drafts", `${id}.json`), "utf8")) as unknown;
        const content = draftContentSchema.parse(stored && typeof stored === "object"
            ? {
                manifest: Reflect.get(stored, "manifest"),
                source: Reflect.get(stored, "source"),
                tests: Reflect.get(stored, "tests"),
            } : stored);

        return {
            ...content,
            id,
            revision: revisionOf(content),
        };
    }

    async write(id: string, expectedRevision: string, input: unknown): Promise<LocalPluginDraft> {

        const previous = await this.read(id);
        if (previous.revision !== revisionSchema.parse(expectedRevision)) {
            throw new Error("Draft changed; read it before editing.");
        }
        const content = draftContentSchema.parse(input);
        if (content.manifest.id !== previous.manifest.id) {
            throw new Error("A draft's plugin identity cannot change.");
        }
        const draft = {
            ...content,
            id,
            revision: revisionOf(content),
        };
        await this.#save(join("drafts", `${id}.json`), draft);
        this.#reports.delete(id);

        return draft;
    }

    record(report: PluginTestReport): void {

        this.#reports.set(report.draftId, report);
    }

    async activate(id: string, revision: string): Promise<LocalPluginSummary> {

        const draft = await this.read(id);
        const report = this.#reports.get(id);
        if (draft.revision !== revisionSchema.parse(revision) || report?.revision !== revision || !report.passed) {
            throw new Error("Run passing tests for this exact draft revision before activating.");
        }
        const installed = await this.list();
        const previous = installed.find((plugin) => {

            return plugin.manifest.id === draft.manifest.id;
        });
        if (previous && previous.manifest.widgetTypeId !== draft.manifest.widgetTypeId) {
            throw new Error("An installed widget's type cannot change in this version.");
        }
        await this.#save(join("installed", `${draft.manifest.id}.json`), draft);

        return {
            manifest: draft.manifest,
            revision: draft.revision,
        };
    }

    async installed(id: string): Promise<LocalPluginDraft> {

        localManifestSchema.shape.id.parse(id);
        const stored = JSON.parse(await readFile(join(this.directory, "installed", `${id}.json`), "utf8")) as LocalPluginDraft;
        const content = draftContentSchema.parse({
            manifest: stored.manifest,
            source: stored.source,
            tests: stored.tests,
        });
        if (content.manifest.id !== id || revisionOf(content) !== stored.revision) {
            throw new Error("Installed plugin integrity check failed.");
        }

        return {
            ...content,
            id: draftIdSchema.parse(stored.id),
            revision: stored.revision,
        };
    }

    async list(): Promise<readonly LocalPluginSummary[]> {

        let files: string[];
        try { files = await readdir(join(this.directory, "installed")); }
        catch (error) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT") {
                return [];
            }
            throw new Error("Local plugins could not be read.", { cause: error });
        }

        return Promise.all(files.filter((file) => {

            return /^avesd\.local\.[a-z][a-z0-9-]{0,63}\.json$/.test(file);
        }).sort()
            .map(async (file) => {

                const draft = await this.installed(file.slice(0, -5));

                return {
                    manifest: draft.manifest,
                    revision: draft.revision,
                };
            }));
    }

    async #save(relativePath: string, value: unknown): Promise<void> {

        const path = join(this.directory, relativePath);
        await mkdir(join(path, ".."), {
            recursive: true,
            mode: 0o700,
        });
        const temporary = `${path}.${randomUUID()}.tmp`;
        await writeFile(temporary, JSON.stringify(value), {
            encoding: "utf8",
            mode: 0o600,
        });
        await rename(temporary, path);
    }
}
