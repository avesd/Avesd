/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description App
 */

import { DashboardEditingProvider } from "./workbench/dashboard-editing";
import { agentOverlayRegistry, mainViewRegistry, workbenchNavigation } from "./workbench/runtime";
import { agentOverlayContribution, mainViewContribution } from "./workbench/types";
import { WorkbenchChrome } from "./workbench/WorkbenchChrome";
import { useSyncExternalStore } from "react";

export const App = () => {

    const navigationState = useSyncExternalStore(workbenchNavigation.subscribe, workbenchNavigation.getSnapshot);
    const { scope } = navigationState;
    const view = useSyncExternalStore(
        (listener) => {

            const unsubscribe = mainViewRegistry.subscribe(listener);

            return () => {

                void unsubscribe();
            };
        },
        () => {

            return mainViewRegistry.get(mainViewContribution.id);
        },
    );
    const overlay = useSyncExternalStore(
        (listener) => {

            const unsubscribe = agentOverlayRegistry.subscribe(listener);

            return () => {

                void unsubscribe();
            };
        },
        () => {

            return agentOverlayRegistry.get(agentOverlayContribution.id);
        },
    );

    return (
        <DashboardEditingProvider
            key={`${scope.workspaceId}/${scope.dashboardId}`}
        >
            <WorkbenchChrome
                preferences={window.avesd.preferences}
                agentProviders={window.avesd.agentProviders}
                agentSessions={window.avesd.agentSessions}
                agentAvailable={!!overlay}
                workspaceStorage={window.avesd.workspaceStorage}
                workspaceNavigation={{
                    state: navigationState,
                    select: scope => {

                        return workbenchNavigation.command({
                            type: "select",
                            scope,
                        });
                    },
                }}
            >
                <div
                    className="plugin-slot"
                >
                    {view?.render()}
                </div>
                <div
                    className="overlay-slot"
                    key={`${scope.workspaceId}/${scope.dashboardId}`}
                >
                    {overlay?.render()}
                </div>
            </WorkbenchChrome>
        </DashboardEditingProvider>
    );
};
