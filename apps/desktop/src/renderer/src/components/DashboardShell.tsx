/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Dashboard Shell
 */

import { useDashboardEditing } from "../workbench/dashboard-editing";
import type { WidgetServiceFactory } from "../workbench/widget-services";
import { resolveWidget } from "./dashboard-widgets";
import { WidgetSurface } from "./WidgetSurface";
import type { ContributionRegistry } from "@avesd/kernel";
import type { WidgetContribution } from "@avesd/plugin-ui";
import { dashboardWidgetContribution } from "@avesd/plugin-ui";
import type { DashboardLayoutService,
    DashboardLayoutSnapshot,
    DashboardScope,
    DataSourceService } from "@avesd/workspace-model";
import { useEffect, useState, useSyncExternalStore } from "react";

interface DashboardShellProps {
    readonly widgetServices: WidgetServiceFactory;
    readonly dataSources: DataSourceService;
    readonly layouts: DashboardLayoutService;
    readonly scope: DashboardScope;
    readonly widgets: ContributionRegistry<WidgetContribution>;
}

const EMPTY_WIDGETS: readonly ReturnType<ContributionRegistry<WidgetContribution>["getAll"]>[number][] = [];

export const DashboardShell = ({
    widgetServices,
    dataSources,
    layouts,
    scope,
    widgets,
}: DashboardShellProps) => {

    const availableWidgets = useSyncExternalStore(
        (listener) => {

            const unsubscribe = widgets.subscribe(listener);

            return () => {

                void unsubscribe();
            };
        },
        () => {

            return widgets.getAll(dashboardWidgetContribution.id);
        },
        () => {

            return EMPTY_WIDGETS;
        },
    );
    const [
        snapshot,
        setSnapshot,
    ] = useState<DashboardLayoutSnapshot>();
    const [
        error,
        setError,
    ] = useState<string>();
    const { isEditing, setIsEditing } = useDashboardEditing();

    useEffect(() => {

        let active = true;
        const refresh = () => {

            void layouts.inspect(scope).then(
                (nextSnapshot) => {

                    if (active) {
                        setSnapshot(nextSnapshot);
                    }
                },
                (cause: unknown) => {

                    if (active) {
                        setError(cause instanceof Error ? cause.message : "The dashboard could not be loaded.");
                    }
                },
            );
        };
        refresh();
        const unsubscribe = dataSources.subscribe(refresh);

        return () => {

            active = false;
            unsubscribe();
        };
    }, [
        dataSources,
        layouts,
        scope,
    ]);

    useEffect(() => {

        const handleKeyDown = (event: KeyboardEvent) => {

            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e") {
                event.preventDefault();
                setIsEditing((current) => {

                    return !current;
                });
            } else if (event.key === "Escape") {
                setIsEditing(false);
            }
        };
        window.addEventListener("keydown", handleKeyDown);

        return () => {

            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [setIsEditing]);

    const apply = async (operations: Parameters<DashboardLayoutService["apply"]>[1]["operations"]) => {

        if (!snapshot) {
            return;
        }
        try {
            const updated = await layouts.apply(scope, {
                expectedRevision: snapshot.revision,
                operations,
            });
            setSnapshot(updated);
            setError(undefined);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "The layout could not be updated.");
        }
    };

    return (
        <section
            className={`dashboard-shell${isEditing ? " is-editing" : ""}`}
            aria-label="Dashboard workspace"
            onContextMenu={(event) => {

                event.preventDefault();
                setIsEditing(true);
            }}
        >
            {error && <div
                className="dashboard-error"
                role="alert"
            >
                {error}
            </div>}
            <div
                className="dashboard-grid"
                data-testid="dashboard-grid"
            >
                {snapshot?.widgets.length === 0 && (
                    <div
                        className="dashboard-empty"
                    >
                        <p>Make this space yours.</p>
                        <p>Ask the agent to create what you need.</p>
                    </div>
                )}
                {snapshot?.widgets.map((instance) => {

                    return (
                        <WidgetSurface
                            widgetServices={widgetServices}
                            apply={apply}
                            definition={resolveWidget(availableWidgets, instance)}
                            instance={instance}
                            isEditing={isEditing}
                            key={instance.id}
                        />
                    );
                })}
            </div>

        </section>
    );
};
