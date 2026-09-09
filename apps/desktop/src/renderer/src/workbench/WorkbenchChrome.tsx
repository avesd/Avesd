/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Workbench Chrome
 */

import type { AgentProvidersApi } from "../../../shared/agent/providers";
import type { WorkspaceStorageApi } from "../../../shared/desktop-api";
import type { SidebarSide, WorkbenchPreferencesApi } from "../../../shared/workbench/preferences";
import { AgentProviderSettings } from "../components/settings/AgentProviderSettings";
import { WorkspaceTree } from "../components/WorkspaceTree";
import { useDashboardEditing } from "./dashboard-editing";
import { IconButton, PanelHeader, SidePanel, ToolRail, ToolRailButton } from "@avesd/ui";
import type { DashboardScope, WorkspaceNavigationState } from "@avesd/workspace-model";
import { Bot, FolderTree, LockKeyhole, PanelLeft, PanelRight, Settings2, UnlockKeyhole, X } from "lucide-react";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

const PanelContext = createContext<{
    agentOpen: boolean;
    closeAgent(): void;
} | undefined>(undefined);
export function useAgentPanel() {
    const context = useContext(PanelContext);
    if (!context) {
        throw new Error("Agent panel requires the workbench chrome.");
    }
    return context;
}

export function WorkbenchChrome({ children, preferences, agentAvailable = true, agentProviders, workspaceNavigation, workspaceStorage }: {
    readonly children: ReactNode;
    readonly preferences: WorkbenchPreferencesApi;
    readonly agentAvailable?: boolean;
    readonly agentProviders?: AgentProvidersApi;
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
    ] = useState<"agent" | "settings" | "workspaces">();
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
                    ref={agentButton}
                    aria-label="Open agent"
                    title="Agent"
                    aria-expanded={panel === "agent"}
                    disabled={!agentAvailable}
                    onClick={() => {
                        return void setPanel(panel === "agent" ? undefined : "agent");
                    }}
                >
                    <Bot
                        size={20}
                        aria-hidden="true"
                    />
                </ToolRailButton>
                <ToolRailButton
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
            </ToolRail>
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
