/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Preferences
 */

import type { SidebarSide } from "../../shared/workbench/preferences";
import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";

export class WorkbenchPreferences {
    side: SidebarSide = "right";
    private saving: Promise<void> = Promise.resolve();
    constructor(private readonly path: string) {}

    static async open(path: string): Promise<WorkbenchPreferences> {
        const preferences = new WorkbenchPreferences(path);
        try {
            const value = JSON.parse(await readFile(path, "utf8")) as {
                sidebarSide?: unknown;
            } | null;
            if (value?.sidebarSide === "left" || value?.sidebarSide === "right") {
                preferences.side = value.sidebarSide;
            }
        } catch (error) {
            if (!(error instanceof SyntaxError) && !(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
                throw error;
            }
        }
        return preferences;
    }

    setSide(side: unknown): Promise<void> {
        if (side !== "left" && side !== "right") {
            return Promise.reject(new Error("Invalid sidebar position."));
        }
        const save = this.saving.catch(() => {
        }).then(async () => {
            const temporary = `${this.path}.${randomUUID()}.tmp`;
            try {
                await writeFile(temporary, JSON.stringify({ sidebarSide: side }), { mode: 0o600 });
                await rename(temporary, this.path);
                this.side = side;
            } finally {
                await unlink(temporary).catch(() => {
                });
            }
        });
        this.saving = save;
        return save;
    }
}
