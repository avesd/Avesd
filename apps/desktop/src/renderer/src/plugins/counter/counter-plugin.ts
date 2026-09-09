/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Counter Plugin
 */

import type { PluginDefinition } from "@avesd/plugin-api";
import type { DataSourceContribution } from "@avesd/plugin-data";
import { dataSourceContribution } from "@avesd/plugin-data";
import type { WidgetContribution } from "@avesd/plugin-ui";
import { dashboardWidgetContribution } from "@avesd/plugin-ui";

const counterSource: DataSourceContribution = {
    configuration: {
        default: {},
        schema: {
            additionalProperties: false,
            type: "object",
        },
        version: 1,
    },
    dataType: "avesd.number",
    description: "A number stored locally and shared through an explicit scope.",
    displayName: "Local counter",
    initialValue: 0,
    sourceTypeId: "counter",
};

const counterWidget: WidgetContribution = {
    configuration: {
        default: { label: "Count" },
        schema: {
            additionalProperties: false,
            properties: {
                label: {
                    title: "Label",
                    type: "string",
                },
            },
            type: "object",
        },
        version: 1,
    },
    description: "Reads and updates a bound local counter.",
    displayName: "Counter",
    inputs: [
        {
            dataType: "avesd.number",
            displayName: "Count",
            id: "count",
            required: true,
        },
    ],
    mount(root, context) {

        const style = document.createElement("style");
        style.textContent = `
      :host { display: block; height: 100%; }
      * { box-sizing: border-box; }
      section { display: grid; height: 100%; padding: 18px; color: #f7f6ef;
        background: linear-gradient(145deg, #313a2e, #1f251e); place-content: center; }
      p { margin: 0 0 6px; color: #adb9a7; font: 700 10px/1.2 ui-sans-serif, system-ui;
        letter-spacing: .1em; text-transform: uppercase; }
      strong { font: 500 42px/1 Georgia, serif; }
      button { margin-top: 14px; padding: 8px 12px; border: 0; border-radius: 9px;
        color: #263023; background: #e9eddf; cursor: pointer; font: 750 11px system-ui; }
      button:disabled { cursor: default; opacity: .5; }
    `;
        const section = document.createElement("section");
        const label = document.createElement("p");
        const value = document.createElement("strong");
        const increment = document.createElement("button");
        increment.textContent = "Increment";
        section.append(label, value, increment);
        root.append(style, section);

        let disposed = false;
        const renderValue = async () => {

            const values = await context.data.read("count");
            if (disposed) {
                return;
            }
            const current = values[0];
            value.textContent = typeof current === "number" ? String(current) : "—";
            increment.disabled = typeof current !== "number";
        };
        const unsubscribe = context.data.subscribe("count", () => {

            return void renderValue();
        });
        increment.addEventListener("click", () => {

            void context.data.read("count").then(([current]) => {

                if (typeof current === "number") {
                    return context.data.update("count", current + 1);
                }
            });
        });

        return {
            dispose() {

                disposed = true;
                void unsubscribe();
                root.replaceChildren();
            },
            update(state) {

                label.textContent = typeof state.configuration.label === "string"
                    ? state.configuration.label
                    : "Count";
                void renderValue();
            },
        };
    },
    sizing: {
        default: {
            height: 7,
            width: 6,
        },
        policy: {
            kind: "fixed",
            sizes: [
                {
                    height: 7,
                    width: 6,
                },
                {
                    height: 8,
                    width: 8,
                },
            ],
        },
    },
    widgetTypeId: "counter",
};

export const counterPlugin: PluginDefinition = {
    activate(context) {

        context.effect(() => {

            return context.contributions.contribute(dataSourceContribution, counterSource);
        });
        context.effect(() => {

            return context.contributions.contribute(
                dashboardWidgetContribution,
                counterWidget,
            );
        });
    },
    apiVersion: 1,
    id: "avesd.builtin.counter",
    version: "0.1.0",
};
