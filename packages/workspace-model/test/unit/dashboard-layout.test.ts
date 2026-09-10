/**
 * @author Avesd
 * @package Workspace Model
 * @namespace TestUnit
 * @description Dashboard Layout Test
 */

import { DashboardLayoutCoordinator,
    findAvailablePlacement } from "../../src/dashboard-layout";
import { InMemoryWorkspaceRepository } from "../../src/in-memory-workspace-repository";
import type { DashboardId,
    DashboardScope,
    DataSourceId,
    WidgetInstanceId,
    WorkspaceId } from "../../src/workspace-model";
import { describe, expect, it } from "vitest";

const scope: DashboardScope = {
    dashboardId: "dashboard-a" as DashboardId,
    workspaceId: "workspace-a" as WorkspaceId,
};

const definition = {
    defaultConfiguration: { tone: "quiet" },
    configurationVersion: 1,
    defaultSize: {
        height: 4,
        width: 6,
    },
    displayName: "Status",
    inputs: [
        {
            dataType: "example.number",
            id: "value",
        },
    ],
    pluginId: "example.plugin",
    widgetTypeId: "status",
};

const setup = async () => {

    const repository = new InMemoryWorkspaceRepository();
    await repository.createWorkspace({
        id: scope.workspaceId,
        name: "Personal",
    });
    await repository.createDashboard(
        { workspaceId: scope.workspaceId },
        {
            id: scope.dashboardId,
            name: "Overview",
            viewState: {},
        },
    );
    const layouts = new DashboardLayoutCoordinator(
        repository,
        (pluginId, widgetTypeId) =>
        {

            return pluginId === definition.pluginId && widgetTypeId === definition.widgetTypeId
                ? definition
                : undefined;
        },
    );

    return {
        layouts,
        repository,
    };
};

describe("DashboardLayoutCoordinator", () => {

    it("automatically places registered widgets on the 24-column grid", async () => {

        const { layouts } = await setup();
        const firstId = "first" as WidgetInstanceId;
        const secondId = "second" as WidgetInstanceId;

        const result = await layouts.apply(scope, {
            expectedRevision: 0,
            operations: [
                {
                    id: firstId,
                    pluginId: definition.pluginId,
                    type: "add",
                    widgetTypeId: definition.widgetTypeId,
                },
                {
                    id: secondId,
                    pluginId: definition.pluginId,
                    type: "add",
                    widgetTypeId: definition.widgetTypeId,
                },
            ],
        });

        expect(result.revision).toBe(1);
        expect(result.widgets.map(({ placement }) => {

            return placement;
        })).toEqual([
            {
                height: 4,
                width: 6,
                x: 0,
                y: 0,
            },
            {
                height: 4,
                width: 6,
                x: 6,
                y: 0,
            },
        ]);
    });

    it("rejects overlapping batches without persisting partial changes", async () => {

        const { layouts } = await setup();

        await expect(layouts.apply(scope, {
            expectedRevision: 0,
            operations: [
                {
                    id: "first" as WidgetInstanceId,
                    placement: {
                        height: 4,
                        width: 6,
                        x: 0,
                        y: 0,
                    },
                    pluginId: definition.pluginId,
                    type: "add",
                    widgetTypeId: definition.widgetTypeId,
                },
                {
                    id: "second" as WidgetInstanceId,
                    placement: {
                        height: 4,
                        width: 6,
                        x: 5,
                        y: 0,
                    },
                    pluginId: definition.pluginId,
                    type: "add",
                    widgetTypeId: definition.widgetTypeId,
                },
            ],
        })).rejects.toMatchObject({ code: "overlap" });

        await expect(layouts.inspect(scope)).resolves.toMatchObject({
            revision: 0,
            widgets: [],
        });
    });

    it("persists arbitrary instance sizes while retaining grid boundaries", async () => {

        const { layouts, repository } = await setup();
        const id = "resized" as WidgetInstanceId;
        await layouts.apply(scope, {
            expectedRevision: 0,
            operations: [
                {
                    type: "add",
                    id,
                    pluginId: definition.pluginId,
                    widgetTypeId: definition.widgetTypeId,
                },
            ],
        });
        const resized = await layouts.apply(scope, {
            expectedRevision: 1,
            operations: [
                {
                    type: "resize",
                    id,
                    width: 9,
                    height: 5,
                },
            ],
        });
        expect(resized.widgets[0]?.placement).toEqual({
            x: 0,
            y: 0,
            width: 9,
            height: 5,
        });
        const reopened = new DashboardLayoutCoordinator(repository, () => {

            return undefined;
        });
        expect(await reopened.inspect(scope)).toEqual(resized);
        for (const size of [
            {
                width: 25,
                height: 5,
            },
            {
                width: 0,
                height: 5,
            },
            {
                width: 9,
                height: 1.5,
            },
        ]) {
            await expect(reopened.apply(scope, {
                expectedRevision: 2,
                operations: [
                    {
                        type: "resize",
                        id,
                        ...size,
                    },
                ],
            })).rejects.toMatchObject({ code: "invalid-placement" });
        }
        expect(await reopened.inspect(scope)).toEqual(resized);
        const minimum = await reopened.apply(scope, {
            expectedRevision: 2,
            operations: [
                {
                    type: "resize",
                    id,
                    width: 1,
                    height: 1,
                },
            ],
        });
        expect(minimum.widgets[0]?.placement).toEqual({
            x: 0,
            y: 0,
            width: 1,
            height: 1,
        });
    });

    it("finds the first available position in row-major order", () => {

        expect(findAvailablePlacement(
            [
                {
                    height: 4,
                    width: 12,
                    x: 0,
                    y: 0,
                },
            ],
            {
                height: 4,
                width: 12,
            },
        )).toEqual({
            height: 4,
            width: 12,
            x: 12,
            y: 0,
        });
    });

    it("updates widget configuration through the same revisioned transaction", async () => {

        const { layouts } = await setup();
        const id = "configured" as WidgetInstanceId;
        const added = await layouts.apply(scope, {
            expectedRevision: 0,
            operations: [
                {
                    id,
                    pluginId: definition.pluginId,
                    type: "add",
                    widgetTypeId: definition.widgetTypeId,
                },
            ],
        });

        const configured = await layouts.apply(scope, {
            expectedRevision: added.revision,
            operations: [
                {
                    configuration: { tone: "bold" },
                    id,
                    type: "configure",
                },
            ],
        });

        expect(configured.widgets[0]).toMatchObject({
            configuration: { tone: "bold" },
            configurationVersion: 1,
        });
    });

    it("binds only visible, type-compatible data sources", async () => {

        const { layouts, repository } = await setup();
        const id = "bound" as WidgetInstanceId;
        const sourceId = "source" as DataSourceId;
        await repository.createDataSource(
            {
                kind: "dashboard",
                ...scope,
            },
            {
                configuration: {},
                dataType: "example.number",
                id: sourceId,
                name: "Value",
                pluginId: "example.plugin",
                sourceTypeId: "number",
                value: 0,
            },
        );
        const added = await layouts.apply(scope, {
            expectedRevision: 0,
            operations: [
                {
                    id,
                    pluginId: definition.pluginId,
                    type: "add",
                    widgetTypeId: definition.widgetTypeId,
                },
            ],
        });

        const bound = await layouts.apply(scope, {
            expectedRevision: added.revision,
            operations: [
                {
                    dataSourceIds: [sourceId],
                    id,
                    inputId: "value",
                    type: "bind",
                },
            ],
        });

        expect(bound.widgets[0]?.bindings).toEqual({ value: [sourceId] });
    });
});
