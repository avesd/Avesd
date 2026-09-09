/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Mounted Widget
 */

import type { WidgetServiceFactory } from "../workbench/widget-services";
import type { ApplyLayout } from "./dashboard-widgets";
import type { WidgetContribution, WidgetController, WidgetRenderState } from "@avesd/plugin-ui";
import type { WidgetInstance } from "@avesd/workspace-model";
import { useEffect, useRef } from "react";

export const MountedWidget = ({
    widgetServices,
    apply,
    definition,
    instance,
}: {
    readonly widgetServices: WidgetServiceFactory;
    readonly apply: ApplyLayout;
    readonly definition: WidgetContribution;
    readonly instance: WidgetInstance;
}) => {
    const hostRef = useRef<HTMLDivElement>(null);
    const controllerRef = useRef<WidgetController | undefined>(undefined);
    const abortRef = useRef<AbortController | undefined>(undefined);
    const applyRef = useRef(apply);
    const {
        bindings,
        dashboardId,
        id: instanceId,
        pluginId,
        widgetTypeId,
        workspaceId,
    } = instance;
    const bindingsKey = JSON.stringify(bindings);

    useEffect(() => {
        applyRef.current = apply;
    }, [apply]);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) {
            return;
        }
        const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
        const activeBindings = JSON.parse(bindingsKey) as WidgetInstance["bindings"];
        const abortController = new AbortController();
        abortRef.current = abortController;
        const showError = () => {
            root.replaceChildren();
            const message = document.createElement("p");
            message.className = "avesd-widget-error";
            message.textContent = "This widget could not be rendered.";
            root.append(message);
        };

        try {
            const controller = definition.mount(root, {
                ...widgetServices(
                    {
                        bindings: activeBindings,
                        dashboardId,
                        id: instanceId,
                        pluginId,
                        widgetTypeId,
                        workspaceId,
                    },
                    (configuration) => {
                        return applyRef.current([
                            {
                                configuration,
                                id: instanceId,
                                type: "configure",
                            },
                        ]);
                    },
                    {
                        signal: abortController.signal,
                        capabilities: definition.capabilities,
                    },
                ),
                dashboardId,
                instanceId,
                signal: abortController.signal,
                workspaceId,
            });
            controllerRef.current = controller;
        } catch {
            abortController.abort();
            controllerRef.current = undefined;
            showError();
        }

        return () => {
            abortController.abort();
            try {
                controllerRef.current?.dispose();
            } catch {
                // A widget cannot prevent its host surface from being cleaned up.
            } finally {
                controllerRef.current = undefined;
                root.replaceChildren();
            }
        };
    }, [
        bindingsKey,
        dashboardId,
        definition,
        instanceId,
        pluginId,
        widgetServices,
        widgetTypeId,
        workspaceId,
    ]);

    useEffect(() => {
        try {
            controllerRef.current?.update(toRenderState(instance));
        } catch {
            abortRef.current?.abort();
            const controller = controllerRef.current;
            controllerRef.current = undefined;
            try {
                controller?.dispose();
            } catch {
                // The stable host fallback below takes precedence over plugin failures.
            }
            const root = hostRef.current?.shadowRoot;
            if (root) {
                root.replaceChildren();
                const message = document.createElement("p");
                message.textContent = "This widget could not be updated.";
                root.append(message);
            }
        }
    }, [
        instance,
        definition,
        widgetServices,
    ]);

    return <div
        className="dashboard-widget-content"
        ref={hostRef}
    />;
};

const toRenderState = (instance: WidgetInstance): WidgetRenderState => {
    return {
        configuration: instance.configuration,
        size: instance.placement,
    };
};
