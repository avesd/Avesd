/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Identity-scoped widget agent tasks
 */

import { parseAgentTask } from "../../shared/agent/sessions";
import { widgetAgentChannel } from "../../shared/agent/widget-agent";
import type { AgentWorkbench } from "../workspace/agent-workbench";
import type { AgentSessions } from "./agent-sessions";
import type { DashboardScope } from "@avesd/workspace-model";
import type { WebContents } from "electron";
import { ipcMain } from "electron";

export class AgentTaskBridge {
    readonly #callers = new Map<WebContents, string>();
    constructor(private readonly sessions: () => AgentSessions | undefined, private readonly workbench: () => AgentWorkbench | undefined) {

        ipcMain.handle(widgetAgentChannel, (event, input: unknown) => {

            const widgetId = this.#callers.get(event.sender);
            if (!widgetId || event.senderFrame !== event.sender.mainFrame) {
                throw new Error("Widget agent is unavailable.");
            }

            return this.invoke(widgetId, input, () => {

                return this.#callers.get(event.sender) === widgetId && !event.sender.isDestroyed();
            });
        });
    }
    register(contents: WebContents, widgetId: string): () => void {

        this.#callers.set(contents, widgetId);
        const dispose = () => {

            this.#callers.delete(contents);
        };
        contents.once("destroyed", dispose);

        return () => {

            dispose(); contents.off("destroyed", dispose);
        };
    }
    async invoke(widgetId: string, input: unknown, active: () => boolean = () => {

        return true;
    }): Promise<unknown> {

        const manager = this.sessions();
        const owner = await this.workbench()?.authorizeAgentWidget(widgetId);
        if (!manager || !owner || !active() || !input || typeof input !== "object") {
            throw new Error("Widget agent is unavailable.");
        }
        const request = input as Record<string, unknown>;
        if (request.type === "start") {
            const task = parseAgentTask(request.request);
            const session = await manager.create(task.tier, {
                ...owner,
                workspaceId: owner.workspaceId as DashboardScope["workspaceId"],
                dashboardId: owner.dashboardId as DashboardScope["dashboardId"],
                kind: "background",
                source: owner.pluginId,
            });
            if (!active()) {
                await manager.remove(session.id); throw new Error("Widget was closed.");
            }
            void manager.prompt(task.prompt, session.id).catch(() => {
            });

            return session;
        }
        if (typeof request.id !== "string" || request.id.length > 128) {
            throw new Error("Invalid task ID.");
        }
        const origin = manager.owner(request.id);
        if (origin.widgetId !== widgetId || origin.pluginId !== owner.pluginId || origin.workspaceId !== owner.workspaceId) {
            throw new Error("This task belongs to another widget.");
        }
        if (request.type === "cancel") {
            await manager.cancel(request.id);

            return;
        }
        if (request.type !== "read") {
            throw new Error("Unknown widget agent operation.");
        }
        const snapshot = manager.read(request.id);

        return {
            id: snapshot.id,
            tier: snapshot.tier,
            status: snapshot.status,
            answer: snapshot.events.map(({ event }) => {

                return event.type === "messageChunk" ? event.text : "";
            }).join(""),
        };
    }
}
