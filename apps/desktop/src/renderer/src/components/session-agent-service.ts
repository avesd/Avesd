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
            const refresh = async () => {

                const current = ++version;
                try {
                    const snapshot = await api.read(id);
                    if (disposed || current !== version) {
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
                        listener({
                            type: "status",
                            status: snapshot.status === "stopped" ? "disconnected" : "error",
                            message: snapshot.status === "error" ? "This task failed. Check Settings → Agents and retry." : undefined,
                        });
                    }
                } catch {
                    if (!disposed) {
                        listener({
                            type: "status",
                            status: "error",
                            message: "Session is unavailable.",
                        });
                    }
                }
            };
            const unsubscribe = api.subscribe(() => {

                void refresh();
            });
            void refresh();

            return () => {

                disposed = true; unsubscribe();
            };
        },
    };
}
