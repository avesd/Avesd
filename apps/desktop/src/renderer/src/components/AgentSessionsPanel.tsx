/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Foreground and background session directory
 */

import type { AgentSessionsApi, AgentSessionSummary } from "../../../shared/agent/sessions";
import { AGENT_TIERS, agentTierLabels } from "../../../shared/agent/sessions";
import type { AgentTier } from "@avesd/plugin-api";
import { Button, IconButton, PanelHeader, SidePanel } from "@avesd/ui";
import { X } from "lucide-react";
import { useState } from "react";

export function AgentSessionsPanel({ api, sessions, selectedId, onSelect, onCreate, onClose }: {
    readonly api: AgentSessionsApi;
    readonly sessions: readonly AgentSessionSummary[];
    readonly selectedId?: string;
    readonly onSelect: (id: string) => Promise<void>;
    readonly onCreate: (tier: AgentTier) => Promise<void>;
    readonly onClose: () => void;
}) {

    const [
        kind,
        setKind,
    ] = useState<"interactive" | "background">("interactive");
    const [
        tier,
        setTier,
    ] = useState<AgentTier>("flagship");
    const [
        error,
        setError,
    ] = useState("");
    const [
        busy,
        setBusy,
    ] = useState(false);
    const run = (work: () => Promise<void>) => {

        setBusy(true); setError(""); void work().catch(() => {

            return void setError("Session action failed. Please retry.");
        })
            .finally(() => {

                return void setBusy(false);
            });
    };
    const visible = sessions.filter(session => {

        return session.kind === kind;
    });

    return <SidePanel
        className="agent-panel session-panel"
        aria-label="Agent sessions"
        onKeyDown={event => {

            if (event.key === "Escape") {
                onClose(); event.stopPropagation();
            }
        }}
    >
        <PanelHeader
            title="Sessions"
            actions={<IconButton
                aria-label="Close sessions"
                onClick={onClose}
            >
                <X
                    size={18}
                />
            </IconButton>}
        />
        <div
            className="session-controls"
        >
            <div
                role="group"
                aria-label="Session source"
                className="session-tabs"
            >
                <Button
                    size="small"
                    aria-pressed={kind === "interactive"}
                    onClick={() => {

                        return void setKind("interactive");
                    }}
                >
                    User initiated
                </Button>
                <Button
                    size="small"
                    aria-pressed={kind === "background"}
                    onClick={() => {

                        return void setKind("background");
                    }}
                >
                    Background
                </Button>
            </div>
            <div
                className="session-new"
            >
                <select
                    aria-label="New session tier"
                    value={tier}
                    onChange={event => {

                        return void setTier(event.target.value as AgentTier);
                    }}
                >
                    {AGENT_TIERS.map(value => {

                        return <option
                            key={value}
                            value={value}
                        >
                            {agentTierLabels[value]}
                        </option>;
                    })}
                </select>
                <Button
                    size="small"
                    disabled={busy}
                    onClick={() => {

                        return void run(() => {

                            return onCreate(tier);
                        });
                    }}
                >
                    New session
                </Button>
            </div>
            <p>All ACP sessions in this app. Viewing or closing a panel does not stop a task. Conversation history stays in memory until you quit.</p>
        </div>
        <div
            className="session-list"
        >
            {!visible.length && <p>
                No
                {" "}
                {kind === "interactive" ? "user-initiated" : "background"}
                {" "}
                sessions yet.
            </p>}
            {visible.map(session => {

                return <article
                    key={session.id}
                    className="session-row"
                    data-selected={session.id === selectedId}
                >
                    <button
                        className="session-open"
                        disabled={busy}
                        onClick={() => {

                            return void run(() => {

                                return onSelect(session.id);
                            });
                        }}
                    >
                        <strong>
                            {agentTierLabels[session.tier]}
                            {" "}
                            ·
                            {" "}
                            {session.status}
                        </strong>
                        <span>
                            {session.source}
                        </span>
                        <time>
                            {new Date(session.createdAt).toLocaleTimeString()}
                        </time>
                    </button>
                    <div
                        className="session-actions"
                    >
                        {session.status === "running" && <Button
                            size="small"
                            disabled={busy}
                            onClick={() => {

                                return void run(() => {

                                    return api.cancel(session.id);
                                });
                            }}
                        >
                            Stop
                        </Button>}
                        {session.status !== "running" && <Button
                            size="small"
                            disabled={busy}
                            onClick={() => {

                                return void run(() => {

                                    return api.remove(session.id);
                                });
                            }}
                        >
                            Remove
                        </Button>}
                    </div>
                </article>;
            })}
        </div>
        {error && <p
            role="alert"
        >
            {error}
        </p>}
    </SidePanel>;
}
