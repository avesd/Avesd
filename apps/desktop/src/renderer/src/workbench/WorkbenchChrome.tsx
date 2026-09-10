/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Workbench Chrome
 */

import type { AgentProvidersApi } from "../../../shared/agent/providers";
import type { AgentSessionsApi, AgentSessionSummary } from "../../../shared/agent/sessions";
import type { BrowserTasksApi } from "../../../shared/browser/browser-tasks";
import type { WorkspaceStorageApi } from "../../../shared/desktop-api";
import type { SidebarSide, WorkbenchPreferencesApi } from "../../../shared/workbench/preferences";
import { AgentSessionsPanel } from "../components/AgentSessionsPanel";
import { BrowserTasksPanel } from "../components/BrowserTasksPanel";
import { AgentProviderSettings } from "../components/settings/AgentProviderSettings";
import { AgentTierSettings } from "../components/settings/AgentTierSettings";
import { WorkspaceTree } from "../components/WorkspaceTree";
import { useDashboardEditing } from "./dashboard-editing";
import type { AgentTier } from "@avesd/plugin-api";
import { IconButton, PanelHeader, SidePanel, ToolRail, ToolRailButton } from "@avesd/ui";
import type { DashboardScope, WorkspaceNavigationState } from "@avesd/workspace-model";
import { Bot, FolderTree, Globe, LockKeyhole, MessagesSquare, PanelLeft, PanelRight, Settings2, UnlockKeyhole, X } from "lucide-react";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

const PanelContext = createContext<{
    agentOpen: boolean;
    activeSession?: AgentSessionSummary;
    closeAgent(): void;
} | undefined>(undefined);
export function useAgentPanel() {

    const context = useContext(PanelContext);
    if (!context) {
        throw new Error("Agent panel requires the workbench chrome.");
    }

    return context;
}

export function WorkbenchChrome({ children, preferences, agentAvailable = true, agentProviders, agentSessions, workspaceNavigation, workspaceStorage }: {
    readonly children: ReactNode;
    readonly preferences: WorkbenchPreferencesApi;
    readonly agentAvailable?: boolean;
    readonly agentProviders?: AgentProvidersApi;
    readonly agentSessions?: AgentSessionsApi;
    readonly workspaceNavigation?: {
        readonly state: WorkspaceNavigationState;
        readonly select: (scope: DashboardScope) => Promise<void>;
    };
    readonly workspaceStorage?: WorkspaceStorageApi;
}) {

    const [
        side,
        setSide,
    ] = useState<SidebarSide>("right");
    const [
        panel,
        setPanel,
    ] = useState<"agent" | "settings" | "workspaces" | "sessions">();
    const [
        listing,
        setListing,
    ] = useState<{
        selectedId?: string;
        sessions: readonly AgentSessionSummary[];
    }>({ sessions: [] });
    const [
        sessionPosition,
        setSessionPosition,
    ] = useState(2);
    const [
        creatingSession,
        setCreatingSession,
    ] = useState(false);
    const sessionsButton = useRef<HTMLButtonElement>(null);
    useEffect(() => {

        if (!agentSessions) {
            return;
        }
        let active = true; let revision = 0;
        const refresh = async () => {

            const current = ++revision; try {
                const result = await agentSessions.list(); if (active && current === revision) {
                    setListing(result);
                }
            } catch {
                if (active) {
                    setError("Sessions could not be loaded.");
                }
            }
        };
        const unsubscribe = agentSessions.subscribe(() => {

            void refresh();
        });
        void refresh();

        return () => {

            active = false; unsubscribe();
        };
    }, [agentSessions]);
    useEffect(() => {

        let active = true;
        void preferences.getSessionPosition?.().then(value => {

            if (active) {
                setSessionPosition(value);
            }
        })
            .catch(() => {

                if (active) {
                    setError("Session button position could not be loaded.");
                }
            });

        return () => {

            active = false;
        };
    }, [preferences]);
    const moveSession = async (position: number) => {

        try { await preferences.setSessionPosition?.(position); setSessionPosition(position); } catch { setError("Session button position could not be saved."); }
    };
    const sessionDrop = (position: number) => {

        return {
            onDragOver: (event: React.DragEvent) => {

                if (event.dataTransfer.types.includes("application/x-avesd-session")) {
                    event.preventDefault();
                }
            },
            onDrop: (event: React.DragEvent) => {

                if (event.dataTransfer.getData("application/x-avesd-session") === "session") {
                    event.preventDefault(); void moveSession(position);
                }
            },
        };
    };
    const createSession = async (tier: AgentTier) => {

        if (!agentSessions) {
            setPanel("agent");

            return;
        }
        setCreatingSession(true);
        try { await agentSessions.create(tier); setListing(await agentSessions.list()); setPanel("agent"); }
        finally { setCreatingSession(false); }
    };
    const selectSession = async (id: string) => {

        if (agentSessions) {
            await agentSessions.select(id); setListing(await agentSessions.list()); setPanel("agent");
        }
    };
    const [
        saving,
        setSaving,
    ] = useState(true);
    const [
        error,
        setError,
    ] = useState<string>();
    const { isEditing, setIsEditing } = useDashboardEditing();
    const agentButton = useRef<HTMLButtonElement>(null);
    const workspacesButton = useRef<HTMLButtonElement>(null);
    const settingsButton = useRef<HTMLButtonElement>(null);
    const settingsHeading = useRef<HTMLHeadingElement>(null);

    useEffect(() => {

        let active = true;
        void preferences.getSidebarSide().then(value => {

            if (active) {
                setSide(value);
            }
        })
            .catch(() => {

                if (active) {
                    setError("Sidebar position could not be loaded.");
                }
            })
            .finally(() => {

                if (active) {
                    setSaving(false);
                }
            });

        return () => {

            active = false;
        };
    }, [preferences]);
    useEffect(() => {

        if (panel === "settings") {
            settingsHeading.current?.focus();
        }
    }, [panel]);

    const closeAgent = () => {

        setPanel(undefined); agentButton.current?.focus();
    };
    const closeWorkspaces = () => {

        setPanel(undefined); workspacesButton.current?.focus();
    };
    const closeSettings = () => {

        setPanel(undefined); settingsButton.current?.focus();
    };
    const changeSide = async (value: SidebarSide) => {

        setSaving(true); setError(undefined);
        try { await preferences.setSidebarSide(value); setSide(value); }
        catch { setError("Sidebar position could not be saved. Try again."); }
        finally { setSaving(false); }
    };

    return <PanelContext.Provider
        value={{
            agentOpen: panel === "agent",
            closeAgent,
            activeSession: listing.sessions.find(session => {

                return session.id === listing.selectedId;
            }),
        }}
    >
        <main
            className="app-shell"
            data-sidebar-side={side}
        >
            {children}
            <ToolRail
                aria-label="Workbench sidebar"
            >
                <ToolRailButton
                    style={{ order: 0 }}
                    {...sessionDrop(0)}
                    ref={workspacesButton}
                    aria-label="Open workspaces"
                    title="Workspaces"
                    aria-expanded={panel === "workspaces"}
                    disabled={!workspaceNavigation || !workspaceStorage}
                    onClick={() => {

                        return void setPanel(panel === "workspaces" ? undefined : "workspaces");
                    }}
                >
                    <FolderTree
                        size={19}
                        aria-hidden="true"
                    />
                </ToolRailButton>
                <ToolRailButton
                    style={{ order: 2 }}
                    {...sessionDrop(1)}
                    ref={agentButton}
                    aria-label="Open agent"
                    title="Agent"
                    aria-expanded={panel === "agent"}
                    disabled={!agentAvailable || creatingSession}
                    onClick={() => {

                        if (!agentSessions) {
                            setPanel(panel === "agent" ? undefined : "agent");

                            return;
                        }
                        void createSession("flagship").catch(() => {

                            return void setError("A new agent session could not be created.");
                        });
                    }}
                >
                    <Bot
                        size={20}
                        aria-hidden="true"
                    />
                </ToolRailButton>
                {agentSessions && <ToolRailButton
                    ref={sessionsButton}
                    style={{ order: sessionPosition * 2 - 1 }}
                    draggable
                    onDragStart={event => {

                        event.dataTransfer.setData("application/x-avesd-session", "session"); event.dataTransfer.effectAllowed = "move";
                    }}
                    onKeyDown={event => {

                        if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
                            event.preventDefault(); void moveSession(Math.max(0, Math.min(3, sessionPosition + (event.key === "ArrowUp" ? -1 : 1))));
                        }
                    }}
                    aria-label="Open sessions"
                    title="Sessions · drag to move, Alt+↑/↓"
                    aria-expanded={panel === "sessions"}
                    onClick={() => {

                        return void setPanel(panel === "sessions" ? undefined : "sessions");
                    }}
                >
                    <MessagesSquare
                        size={20}
                        aria-hidden="true"
                    />
                </ToolRailButton>}
                <ToolRailButton
                    style={{ order: 4 }}
                    {...sessionDrop(2)}
                    aria-label={isEditing ? "Lock dashboard" : "Unlock dashboard"}
                    aria-pressed={isEditing}
                    title={isEditing ? "Lock dashboard (⌘ / Ctrl E)" : "Unlock dashboard (⌘ / Ctrl E)"}
                    onClick={() => {

                        setIsEditing(value => {

                            return !value;
                        }); setPanel(undefined);
                    }}
                >
                    {isEditing ? <UnlockKeyhole
                        size={19}
                        aria-hidden="true"
                    /> : <LockKeyhole
                        size={19}
                        aria-hidden="true"
                    />}
                </ToolRailButton>
                <ToolRailButton
                    style={{ order: 10 }}
                    {...sessionDrop(3)}
                    ref={settingsButton}
                    placement="bottom"
                    aria-label="Open settings"
                    title="Settings"
                    aria-expanded={panel === "settings"}
                    onClick={() => {

                        return void setPanel(panel === "settings" ? undefined : "settings");
                    }}
                >
                    <Settings2
                        size={19}
                        aria-hidden="true"
                    />
                </ToolRailButton>
                {browserTasks && <ToolRailButton
                    style={{ order: 6 }}
                    aria-label="Open background browsers"
                    title="Background browsers"
                    aria-expanded={panel === "browsers"}
                    onClick={() => {

                        setPanel(panel === "browsers" ? undefined : "browsers");
                    }}
                >
                    <Globe
                        size={19}
                    />
                </ToolRailButton>}
            </ToolRail>
            {panel === "browsers" && browserTasks && <BrowserTasksPanel
                api={browserTasks}
                onClose={() => {

                    setPanel(undefined);
                }}
            />}
            {panel === "sessions" && agentSessions && <AgentSessionsPanel
                api={agentSessions}
                sessions={listing.sessions}
                selectedId={listing.selectedId}
                onSelect={selectSession}
                onCreate={createSession}
                onClose={() => {

                    setPanel(undefined); sessionsButton.current?.focus();
                }}
            />}
            {error && panel !== "settings" && <p
                role="alert"
                className="workbench-session-error"
            >
                {error}
            </p>}
            {panel === "workspaces" && workspaceNavigation && workspaceStorage && <SidePanel
                className="workspace-tree-panel"
                aria-label="Workspaces"
                onKeyDown={event => {

                    if (event.key === "Escape") {
                        closeWorkspaces(); event.stopPropagation();
                    }
                }}
            >
                <PanelHeader
                    title="Workspaces"
                    actions={<IconButton
                        aria-label="Close workspaces"
                        onClick={closeWorkspaces}
                    >
                        <X
                            size={18}
                            aria-hidden="true"
                        />
                    </IconButton>}
                />
                <WorkspaceTree
                    navigation={workspaceNavigation.state}
                    storage={workspaceStorage}
                    onSelect={async scope => {

                        await workspaceNavigation.select(scope); closeWorkspaces();
                    }}
                />
            </SidePanel>}
            {panel === "settings" && <SidePanel
                className="settings-panel"
                aria-label="Settings"
                onKeyDown={event => {

                    if (event.key === "Escape") {
                        closeSettings(); event.stopPropagation();
                    }
                }}
            >
                <PanelHeader
                    title="Settings"
                    titleRef={settingsHeading}
                    actions={<IconButton
                        aria-label="Close settings"
                        onClick={closeSettings}
                    >
                        <X
                            size={18}
                            aria-hidden="true"
                        />
                    </IconButton>}
                />
                <div
                    className="settings-content"
                >
                    {agentProviders && <AgentProviderSettings
                        api={agentProviders}
                    />}
                    {agentSessions && <AgentTierSettings
                        api={agentSessions}
                    />}
                    <h3>Appearance</h3>
                    <fieldset
                        disabled={saving}
                    >
                        <legend>Sidebar position</legend>
                        <p>Keep your tools on the side that suits you.</p>
                        <div
                            className="sidebar-position-options"
                        >
                            <label>
                                <input
                                    type="radio"
                                    name="sidebar-position"
                                    value="left"
                                    checked={side === "left"}
                                    onChange={() => {

                                        return void changeSide("left");
                                    }}
                                />
                                <PanelLeft
                                    size={20}
                                    aria-hidden="true"
                                />
                                {" "}
                                Left
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    name="sidebar-position"
                                    value="right"
                                    checked={side === "right"}
                                    onChange={() => {

                                        return void changeSide("right");
                                    }}
                                />
                                <PanelRight
                                    size={20}
                                    aria-hidden="true"
                                />
                                {" "}
                                Right
                            </label>
                        </div>
                    </fieldset>
                    {error && <p
                        role="alert"
                        className="settings-error"
                    >
                        {error}
                    </p>}
                    <p
                        className="settings-note"
                    >
                        Saved on this device. Applies to all workspaces.
                    </p>
                </div>
            </SidePanel>}
        </main>
    </PanelContext.Provider>;
}
