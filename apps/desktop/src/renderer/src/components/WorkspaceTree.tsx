/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Workspace Tree
 */

import type { WorkspaceStorageApi } from "../../../shared/desktop-api";
import type { DashboardScope, WorkspaceNavigationState } from "@avesd/workspace-model";
import { parseWorkspaceSnapshot } from "@avesd/workspace-model";
import { ChevronDown, ChevronRight, LayoutDashboard } from "lucide-react";
import { useEffect, useState } from "react";

export function WorkspaceTree({
    navigation,
    storage,
    onSelect,
}: {
    readonly navigation: WorkspaceNavigationState;
    readonly storage: WorkspaceStorageApi;
    readonly onSelect: (scope: DashboardScope) => Promise<void>;
}) {
    const [
        snapshot,
        setSnapshot,
    ] = useState<ReturnType<typeof parseWorkspaceSnapshot>>();
    const [
        collapsed,
        setCollapsed,
    ] = useState<ReadonlySet<string>>(new Set());
    const [
        busy,
        setBusy,
    ] = useState(false);
    const [
        error,
        setError,
    ] = useState<string>();

    useEffect(() => {
        let active = true;
        const refresh = () => {
            void storage.load().then((value) => {
                if (active) {
                    setSnapshot(parseWorkspaceSnapshot(value));
                    setError(undefined);
                }
            })
                .catch(() => {
                    if (active) {
                        setError("Workspace list could not be loaded.");
                    }
                });
        };
        refresh();
        const unsubscribe = storage.subscribe(refresh);
        return () => {
            active = false;
            unsubscribe();
        };
    }, [storage]);

    const toggle = (workspaceId: string) => {
        setCollapsed((current) => {
            const next = new Set(current);
            if (next.has(workspaceId)) {
                next.delete(workspaceId);
            }
            else {
                next.add(workspaceId);
            }
            return next;
        });
    };

    const select = async (scope: DashboardScope) => {
        if (busy || (scope.workspaceId === navigation.scope.workspaceId && scope.dashboardId === navigation.scope.dashboardId)) {
            return;
        }
        setBusy(true);
        setError(undefined);
        try {
            await onSelect(scope);
        } catch {
            setError("Dashboard could not be opened.");
        } finally {
            setBusy(false);
        }
    };

    const workspaces = snapshot?.workspaces ?? navigation.workspaces;
    const dashboards = snapshot?.dashboards ?? navigation.dashboards;

    return <div
        className="workspace-tree-content"
    >
        {error && <p
            className="workspace-tree-error"
            role="alert"
        >
            {error}
        </p>}
        <div
            className="workspace-tree"
            role="tree"
            aria-label="Workspaces and dashboards"
            aria-busy={busy}
        >
            {workspaces.map((workspace) => {
                const isCollapsed = collapsed.has(workspace.id);
                const children = dashboards.filter((dashboard) => {
                    return dashboard.workspaceId === workspace.id;
                });
                return <div
                    className="workspace-tree-group"
                    key={workspace.id}
                >
                    <button
                        className="workspace-tree-workspace"
                        type="button"
                        role="treeitem"
                        aria-expanded={!isCollapsed}
                        onClick={() => {
                            return void toggle(workspace.id);
                        }}
                    >
                        {isCollapsed ? <ChevronRight
                            size={14}
                            aria-hidden="true"
                        /> : <ChevronDown
                            size={14}
                            aria-hidden="true"
                        />}
                        <span>
                            {workspace.name}
                        </span>
                        <small>
                            {children.length}
                        </small>
                    </button>
                    {!isCollapsed && <div
                        role="group"
                    >
                        {children.map((dashboard) => {
                            const selected = dashboard.workspaceId === navigation.scope.workspaceId && dashboard.id === navigation.scope.dashboardId;
                            return <button
                                className="workspace-tree-dashboard"
                                type="button"
                                key={dashboard.id}
                                role="treeitem"
                                aria-current={selected ? "page" : undefined}
                                disabled={busy}
                                onClick={() => {
                                    return void select({
                                        workspaceId: dashboard.workspaceId,
                                        dashboardId: dashboard.id,
                                    });
                                }}
                            >
                                <LayoutDashboard
                                    size={14}
                                    aria-hidden="true"
                                />
                                <span>
                                    {dashboard.name}
                                </span>
                            </button>;
                        })}
                    </div>}
                </div>;
            })}
        </div>
    </div>;
}
