/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Persistent background browser task contract
 */

import { parseWebUrl } from "./web-surface";
import * as z from "zod";

export const browserTasksChannel = "browser-tasks:command";
export const browserTasksChanged = "browser-tasks:changed";
export const browserTaskRecipeSchema = z.strictObject({
    name: z.string().trim()
        .min(1)
        .max(80),
    url: z.string().max(4096)
        .refine(value => {

            try {
                parseWebUrl(value);

                return true;
            } catch { return false; }
        }, "Use an HTTPS or loopback HTTP URL without credentials."),
    fields: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/), z.string().min(1)
        .max(512))
        .refine(value => {

            return Object.keys(value).length > 0 && Object.keys(value).length <= 16;
        }, "Choose 1–16 fields."),
    intervalMinutes: z.number().int()
        .min(0)
        .max(1440),
});
export type BrowserTaskRecipe = z.infer<typeof browserTaskRecipeSchema>;
export const browserTaskCommandSchema = z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("list") }),
    z.strictObject({
        type: z.literal("save"),
        id: z.uuid()
            .optional(),
        recipe: browserTaskRecipeSchema,
    }),
    z.strictObject({
        type: z.enum([
            "refresh",
            "open",
            "close",
            "pause",
            "resume",
            "remove",
        ]),
        id: z.uuid(),
    }),
]);
export type BrowserTaskCommand = z.infer<typeof browserTaskCommandSchema>;
export interface BrowserTask extends BrowserTaskRecipe {
    readonly id: string;
    readonly workspaceId: string;
    readonly paused: boolean;
    readonly lastSuccess?: string;
    readonly result?: Readonly<Record<string, string>>;
    readonly error?: string;
}
export interface BrowserTaskSummary extends BrowserTask {
    readonly state: "closed" | "idle" | "refreshing" | "interaction-required" | "error";
    readonly pageOpen: boolean;
    readonly presented: boolean;
}
export interface BrowserTasksApi {
    command(command: BrowserTaskCommand): Promise<readonly BrowserTaskSummary[]>;
    subscribe(listener: () => void): () => void;
}
