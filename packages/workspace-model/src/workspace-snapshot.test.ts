/**
 * @author Avesd
 * @package Workspace Model
 * @namespace Root
 * @description Workspace Snapshot Test
 */

import { parseWorkspaceSnapshot } from "./workspace-snapshot";
import { describe, expect, it } from "vitest";

const fixture = () => {
    return {
        version: 1,
        workspaces: [
            {
                id: "workspace",
                name: "Synthetic workspace",
            },
        ],
        dashboards: [
            {
                id: "dashboard",
                workspaceId: "workspace",
                name: "Synthetic dashboard",
                layoutRevision: 0,
                viewState: {},
            },
        ],
        widgets: [
            {
                id: "widget",
                workspaceId: "workspace",
                dashboardId: "dashboard",
                pluginId: "synthetic.plugin",
                widgetTypeId: "test",
                configuration: {
                    nested: [
                        true,
                        null,
                        1,
                        "text",
                    ],
                },
                configurationVersion: 1,
                placement: {
                    x: 0,
                    y: 0,
                    width: 6,
                    height: 4,
                },
                bindings: { input: ["source"] },
            },
        ],
        dataSources: [
            {
                id: "source",
                name: "Synthetic source",
                pluginId: "synthetic.plugin",
                sourceTypeId: "json",
                dataType: "json",
                configuration: {},
                revision: 0,
                value: { count: 1 },
                scope: {
                    kind: "dashboard",
                    workspaceId: "workspace",
                    dashboardId: "dashboard",
                },
            },
        ],
    };
};

describe("workspace snapshot validation", () => {
    it("accepts version 1 without installed plugins and detaches data from the caller", () => {
        const input = fixture();
        const parsed = parseWorkspaceSnapshot(input);
        expect(parsed).toEqual(input);
        input.widgets[0]!.configuration.nested.push("changed");
        expect(parsed?.widgets[0]?.configuration).toEqual({
            nested: [
                true,
                null,
                1,
                "text",
            ],
        });
        expect(parseWorkspaceSnapshot(undefined)).toBeUndefined();
    });

    it("preserves temporary binding identifiers without persisting their values", () => {
        const input = fixture();
        input.widgets[0]!.bindings.input = ["web-result:synthetic-page"];
        expect(parseWorkspaceSnapshot(input)?.widgets[0]?.bindings.input).toEqual(["web-result:synthetic-page"]);
    });

    it.each([
        [
            "version",
            (s: ReturnType<typeof fixture>) => {
                s.version = 2;
            },
        ],
        [
            "missing field",
            (s: ReturnType<typeof fixture>) => {
                Reflect.deleteProperty(s.widgets[0]!, "configuration");
            },
        ],
        [
            "field type",
            (s: ReturnType<typeof fixture>) => {
                Object.assign(s.workspaces[0]!, { name: 3 });
            },
        ],
        [
            "empty ID",
            (s: ReturnType<typeof fixture>) => {
                s.widgets[0]!.id = "";
            },
        ],
        [
            "duplicate workspace",
            (s: ReturnType<typeof fixture>) => {
                s.workspaces.push({ ...s.workspaces[0]! });
            },
        ],
        [
            "duplicate dashboard",
            (s: ReturnType<typeof fixture>) => {
                s.dashboards.push({ ...s.dashboards[0]! });
            },
        ],
        [
            "duplicate widget",
            (s: ReturnType<typeof fixture>) => {
                s.widgets.push({ ...s.widgets[0]! });
            },
        ],
        [
            "duplicate source",
            (s: ReturnType<typeof fixture>) => {
                s.dataSources.push({ ...s.dataSources[0]! });
            },
        ],
        [
            "missing workspace",
            (s: ReturnType<typeof fixture>) => {
                s.workspaces = [];
            },
        ],
        [
            "wrong dashboard owner",
            (s: ReturnType<typeof fixture>) => {
                s.workspaces.push({
                    id: "other",
                    name: "Other",
                }); s.widgets[0]!.workspaceId = "other";
            },
        ],
        [
            "invalid source owner",
            (s: ReturnType<typeof fixture>) => {
                s.dataSources[0]!.scope.dashboardId = "missing";
            },
        ],
        [
            "invalid source scope",
            (s: ReturnType<typeof fixture>) => {
                s.dataSources[0]!.scope.kind = "invalid";
            },
        ],
        [
            "invisible binding",
            (s: ReturnType<typeof fixture>) => {
                s.dashboards.push({
                    ...s.dashboards[0]!,
                    id: "other",
                }); s.dataSources[0]!.scope.dashboardId = "other";
            },
        ],
        [
            "invalid bindings",
            (s: ReturnType<typeof fixture>) => {
                Object.assign(s.widgets[0]!.bindings, { input: "source" });
            },
        ],
        [
            "duplicate binding",
            (s: ReturnType<typeof fixture>) => {
                s.widgets[0]!.bindings.input.push("source");
            },
        ],
        [
            "negative revision",
            (s: ReturnType<typeof fixture>) => {
                s.dashboards[0]!.layoutRevision = -1;
            },
        ],
        [
            "unsafe revision",
            (s: ReturnType<typeof fixture>) => {
                s.dataSources[0]!.revision = Number.MAX_SAFE_INTEGER + 1;
            },
        ],
        [
            "configuration version",
            (s: ReturnType<typeof fixture>) => {
                s.widgets[0]!.configurationVersion = 0;
            },
        ],
        [
            "grid bounds",
            (s: ReturnType<typeof fixture>) => {
                s.widgets[0]!.placement.x = 24;
            },
        ],
        [
            "fractional placement",
            (s: ReturnType<typeof fixture>) => {
                s.widgets[0]!.placement.y = 0.5;
            },
        ],
        [
            "overlap",
            (s: ReturnType<typeof fixture>) => {
                s.widgets.push({
                    ...s.widgets[0]!,
                    id: "second",
                });
            },
        ],
        [
            "nonfinite JSON",
            (s: ReturnType<typeof fixture>) => {
                s.dataSources[0]!.value.count = Infinity;
            },
        ],
        [
            "missing JSON value",
            (s: ReturnType<typeof fixture>) => {
                Reflect.deleteProperty(s.dataSources[0]!, "value");
            },
        ],
        [
            "runtime object",
            (s: ReturnType<typeof fixture>) => {
                Object.assign(s.widgets[0]!, { configuration: new Date() });
            },
        ],
        [
            "cyclic JSON",
            (s: ReturnType<typeof fixture>) => {
                Object.assign(s.widgets[0]!.configuration, { cycle: s });
            },
        ],
    ])("rejects %s", (_name, change) => {
        const input = fixture();
        change(input);
        expect(() => {
            return parseWorkspaceSnapshot(input);
        }).toThrow(/workspace data/);
    });
});
