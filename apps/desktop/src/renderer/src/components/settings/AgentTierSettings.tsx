/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Provider routes behind the three agent tiers
 */

import type { AgentProviderId } from "../../../../shared/agent/providers";
import type { AgentSessionsApi, AgentTierRoutes } from "../../../../shared/agent/sessions";
import { AGENT_TIERS, agentTierLabels } from "../../../../shared/agent/sessions";
import { Button } from "@avesd/ui";
import { useEffect, useState } from "react";

export function AgentTierSettings({ api }: {
    readonly api: AgentSessionsApi;
}) {

    const [
        routes,
        setRoutes,
    ] = useState<AgentTierRoutes>();
    const [
        busy,
        setBusy,
    ] = useState(false);
    const [
        message,
        setMessage,
    ] = useState("");
    useEffect(() => {

        let active = true; void api.routes().then(value => {

            if (active) {
                setRoutes(value);
            }
        })
            .catch(() => {

                if (active) {
                    setMessage("Tier settings could not be loaded.");
                }
            });

        return () => {

            active = false;
        };
    }, [api]);

    return <section
        aria-label="Agent tiers"
        className="agent-tier-settings"
    >
        <h3>Agent tiers</h3>
        <p>Widgets choose a tier. Avesd selects its ACP, model and effort. Changes apply to new sessions.</p>
        {routes && AGENT_TIERS.map(tier => {

            return <fieldset
                key={tier}
                disabled={busy}
            >
                <legend>
                    {agentTierLabels[tier]}
                </legend>
                <label>
                    ACP
                    <select
                        aria-label={`${agentTierLabels[tier]} ACP`}
                        value={routes[tier].providerId}
                        onChange={event => {

                            return void setRoutes({
                                ...routes,
                                [tier]: {
                                    ...routes[tier],
                                    providerId: event.target.value as AgentProviderId,
                                    modelId: "",
                                    effortId: "",
                                },
                            });
                        }}
                    >
                        <option
                            value="codex"
                        >
                            Codex
                        </option>
                        <option
                            value="claude"
                        >
                            Claude
                        </option>
                        <option
                            value="opencode"
                        >
                            OpenCode
                        </option>
                    </select>
                </label>
                <label>
                    Model ID
                    <input
                        aria-label={`${agentTierLabels[tier]} model`}
                        value={routes[tier].modelId}
                        maxLength={512}
                        placeholder="ACP default"
                        onChange={event => {

                            return void setRoutes({
                                ...routes,
                                [tier]: {
                                    ...routes[tier],
                                    modelId: event.target.value,
                                },
                            });
                        }}
                    />
                </label>
                <label>
                    Effort ID
                    <input
                        aria-label={`${agentTierLabels[tier]} effort`}
                        value={routes[tier].effortId}
                        maxLength={512}
                        placeholder="ACP default"
                        onChange={event => {

                            return void setRoutes({
                                ...routes,
                                [tier]: {
                                    ...routes[tier],
                                    effortId: event.target.value,
                                },
                            });
                        }}
                    />
                </label>
            </fieldset>;
        })}
        <p>Use model and effort IDs supported by that ACP. Leave blank for its default. Unsupported values fail before a prompt is sent.</p>
        <Button
            size="small"
            disabled={!routes || busy}
            onClick={() => {

                if (!routes) {
                    return;
                }
                setBusy(true); setMessage("");
                void api.configure(routes).then(() => {

                    return void setMessage("Tier settings saved.");
                })
                    .catch(() => {

                        return void setMessage("Tier settings could not be saved.");
                    })
                    .finally(() => {

                        return void setBusy(false);
                    });
            }}
        >
            Save agent tiers
        </Button>
        {message && <p
            role="status"
        >
            {message}
        </p>}
    </section>;
}
