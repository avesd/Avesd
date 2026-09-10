/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Reconnectable transcript view of one managed agent session
 */

import type { AgentSessionsApi } from "../../../shared/agent/sessions";
import type { AgentService } from "@avesd/plugin-api";

export function sessionAgentService(api: AgentSessionsApi, id: string): AgentService {

    return {
        connect: () => {

            return api.connect(id);
        },
        prompt: text => {

            return api.prompt(id, text);
        },
        cancel: () => {

            return api.cancel(id);
        },
        subscribe(listener) {

            let disposed = false;
            let sequence = 0;
            let version = 0;
            let refreshing = false;
            let pending = false;
            const isDisposed = () => {

                return disposed;
            };
            const finish = () => {

                disposed = true; unsubscribe();
                listener({ type: "sessionReset" });
                listener({
                    type: "status",
                    status: "disconnected",
                });
            };
            const refresh = async () => {

                if (isDisposed()) {
                    return;
                }
                if (refreshing) {
                    pending = true; version++;

                    return;
                }
                refreshing = true;
                const current = ++version;
                try {
                    const snapshot = await api.read(id);
                    if (disposed || current !== version) {
                        return;
                    }
                    if (!snapshot) {
                        finish();

                        return;
                    }
                    if (!sequence || (snapshot.events[0]?.sequence ?? 0) > sequence + 1) {
                        listener({ type: "sessionReset" });
                    }
                    for (const item of snapshot.events) {
                        if (item.sequence > sequence) {
                            listener(item.event); sequence = item.sequence;
                        }
                    }
                    if (snapshot.settings) {
                        listener({
                            type: "settings",
                            settings: snapshot.settings,
                        });
                    }
                    if (snapshot.status === "running") {
                        listener({ type: "turnStarted" });
                    }
                    else {
                        listener({
                            type: "turnComplete",
                            stopReason: snapshot.status,
                        });
                    }
                    if (snapshot.status === "stopped" || snapshot.status === "error") {
                        const failure = snapshot.events.findLast(item => {

                            return item.event.type === "status" && item.event.status === "error";
                        })?.event;
                        listener({
                            type: "status",
                            status: snapshot.status === "stopped" ? "disconnected" : "error",
                            message: snapshot.status === "error" ? (failure?.type === "status" ? failure.message : undefined)
                                ?? "This task failed. Check Settings → Agents and retry." : undefined,
                        });
                    }
                } catch {
                    if (!disposed && current === version) {
                        listener({
                            type: "status",
                            status: "error",
                            message: "Session is unavailable.",
                        });
                    }
                } finally {
                    refreshing = false;
                    if (pending && !disposed) {
                        pending = false; void refresh();
                    }
                }
            };
            const unsubscribe = api.subscribe(change => {

                if (disposed || change.id !== id) {
                    return;
                }
                if (change.type === "removed") {
                    finish();
                }
                else if (change.type === "updated") {
                    void refresh();
                }
            });
            void refresh();

            return () => {

                disposed = true; unsubscribe();
            };
        },
    };
}
