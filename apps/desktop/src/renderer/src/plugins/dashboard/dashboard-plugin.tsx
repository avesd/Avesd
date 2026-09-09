/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Dashboard Plugin
 */

import { DashboardShell } from "../../components/DashboardShell";
import type { WorkbenchNavigation } from "../../workbench/navigation";
import type { WorkbenchView } from "../../workbench/types";
import { mainViewContribution } from "../../workbench/types";
import type { WidgetServiceFactory } from "../../workbench/widget-services";
import type { ContributionRegistry } from "@avesd/kernel";
import type { PluginDefinition } from "@avesd/plugin-api";
import type { WidgetContribution } from "@avesd/plugin-ui";
import type { DashboardLayoutService,
    DataSourceService } from "@avesd/workspace-model";
import { useSyncExternalStore } from "react";

export const createDashboardPlugin = (
    layouts: DashboardLayoutService,
    navigation: WorkbenchNavigation,
    widgets: ContributionRegistry<WidgetContribution>,
    dataSources: DataSourceService,
    widgetServices: WidgetServiceFactory,
): PluginDefinition => {
    const DashboardWorkbench = () => {
        const state = useSyncExternalStore(navigation.subscribe, navigation.getSnapshot);
        return <DashboardShell
            key={`${state.scope.workspaceId}/${state.scope.dashboardId}`}
            widgetServices={widgetServices}
            dataSources={dataSources}
            layouts={layouts}
            scope={state.scope}
            widgets={widgets}
        />;
    };
    const dashboardView: WorkbenchView = {
        render: () => {
            return <DashboardWorkbench />;
        },
    };

    return {
        activate(context) {
            context.effect(() => {
                return context.contributions.contribute(
                    mainViewContribution,
                    dashboardView,
                );
            });
        },
        apiVersion: 1,
        id: "avesd.builtin.dashboard",
        version: "0.1.0",
    };
};
