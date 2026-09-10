/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description ACP-sourced model choices and explicit route verification
 */

import type { AgentProviderId } from "../../../../shared/agent/providers";
import type { AgentRouteOptions, AgentSessionsApi, AgentTierRoute } from "../../../../shared/agent/sessions";
import { agentTierLabels } from "../../../../shared/agent/sessions";
import type { AgentTier } from "@avesd/plugin-api";
import { Button } from "@avesd/ui";
import { useEffect, useState } from "react";

export function AgentTierRouteSettings({ api, tier, route, saving, onChange, onBlocked }: {
    readonly api: Pick<AgentSessionsApi, "probeRoute">;
    readonly tier: AgentTier;
    readonly route: AgentTierRoute;
    readonly saving: boolean;
    readonly onChange: (tier: AgentTier, route: AgentTierRoute) => void;
    readonly onBlocked: (tier: AgentTier, blocked: boolean) => void;
}) {

    const [
        options,
        setOptions,
    ] = useState<AgentRouteOptions>();
    const [
        loading,
        setLoading,
    ] = useState(true);
    const [
        testing,
        setTesting,
    ] = useState(false);
    const [
        refresh,
        setRefresh,
    ] = useState(0);
    const [
        error,
        setError,
    ] = useState("");
    const [
        result,
        setResult,
    ] = useState<{
        key: string;
        message: string;
        failed: boolean;
    }>();
    const key = JSON.stringify(route);
    const label = agentTierLabels[tier];
    const missingModel = !!options && !!route.modelId && !options.models.some(item => {

        return item.id === route.modelId;
    });
    const missingEffort = !!options && !!route.effortId && !options.efforts.some(item => {

        return item.id === route.effortId;
    });
    useEffect(() => {

        setResult(undefined);
    }, [route.effortId]);

    useEffect(() => {

        let active = true;
        setLoading(true); setOptions(undefined); setError(""); setResult(undefined);
        void api.probeRoute({
            providerId: route.providerId,
            modelId: route.modelId,
            effortId: "",
        }, false).then(response => {

            if (!active) {
                return;
            }
            if (response.ok) {
                setOptions(response.options);
            }
            else {
                setError(response.message);
            }
        })
            .catch(() => {

                if (active) {
                    setError("Model options could not be loaded. Check this ACP and refresh.");
                }
            })
            .finally(() => {

                if (active) {
                    setLoading(false);
                }
            });

        return () => {

            active = false;
        };
    }, [
        api,
        route.providerId,
        route.modelId,
        refresh,
    ]);

    useEffect(() => {

        onBlocked(tier, loading || testing || missingModel || missingEffort);
    }, [
        onBlocked,
        tier,
        loading,
        testing,
        missingModel,
        missingEffort,
    ]);

    const testConnection = async () => {

        setTesting(true); setResult(undefined);
        try {
            const response = await api.probeRoute(route, true);
            setResult({
                key,
                failed: !response.ok,
                message: response.ok
                    ? `Test passed · ${response.options.models.find(item => {

                        return item.id === response.options.modelId;
                    })?.name ?? response.options.modelId ?? "ACP default model"}`
                    : response.message,
            });
        } catch {
            setResult({
                key,
                failed: true,
                message: "The connection test could not run. Check this ACP and retry.",
            });
        }
        finally { setTesting(false); }
    };
    const defaultModel = options?.models.find(item => {

        return item.id === options.defaultModelId;
    })?.name ?? options?.defaultModelId;
    const defaultEffort = options?.efforts.find(item => {

        return item.id === options.defaultEffortId;
    })?.name ?? options?.defaultEffortId;

    return <fieldset
        disabled={saving || loading || testing}
        aria-busy={loading || testing}
    >
        <legend>
            {label}
        </legend>
        <label>
            ACP
            <select
                aria-label={`${label} ACP`}
                value={route.providerId}
                onChange={event => {

                    onChange(tier, {
                        providerId: event.target.value as AgentProviderId,
                        modelId: "",
                        effortId: "",
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
            Model
            <select
                aria-label={`${label} model`}
                disabled={!options}
                value={route.modelId}
                onChange={event => {

                    onChange(tier, {
                        ...route,
                        modelId: event.target.value,
                        effortId: "",
                    });
                }}
            >
                <option
                    value=""
                >
                    Use ACP default
                    {defaultModel ? ` (${defaultModel})` : ""}
                </option>
                {route.modelId && !options?.models.some(item => {

                    return item.id === route.modelId;
                }) && <option
                    value={route.modelId}
                    disabled
                >
                    {route.modelId}
                    {" "}
                    ·
                    {options ? "Not offered by ACP" : "Saved selection"}
                </option>}
                {options?.models.map(item => {

                    return <option
                        key={item.id}
                        value={item.id}
                    >
                        {item.name}
                    </option>;
                })}
            </select>
        </label>
        <label>
            Effort
            <select
                aria-label={`${label} effort`}
                disabled={!options || missingModel || (!options.efforts.length && !route.effortId)}
                value={route.effortId}
                onChange={event => {

                    onChange(tier, {
                        ...route,
                        effortId: event.target.value,
                    });
                }}
            >
                <option
                    value=""
                >
                    Use ACP default
                    {defaultEffort ? ` (${defaultEffort})` : ""}
                </option>
                {route.effortId && !options?.efforts.some(item => {

                    return item.id === route.effortId;
                }) && <option
                    value={route.effortId}
                    disabled
                >
                    {route.effortId}
                    {" "}
                    ·
                    {options ? "Not offered by ACP" : "Saved selection"}
                </option>}
                {options?.efforts.map(item => {

                    return <option
                        key={item.id}
                        value={item.id}
                    >
                        {item.name}
                    </option>;
                })}
            </select>
        </label>
        <div
            className="agent-tier-actions"
        >
            <Button
                size="small"
                onClick={() => {

                    return void setRefresh(value => {

                        return value + 1;
                    });
                }}
                aria-label={`Refresh ${label} models`}
            >
                Refresh models
            </Button>
            <Button
                size="small"
                disabled={!options || missingModel || missingEffort}
                onClick={() => {

                    return void testConnection();
                }}
                aria-label={`Test ${label} connection`}
            >
                {testing ? "Testing…" : "Test connection"}
            </Button>
        </div>
        {loading && <p
            role="status"
        >
            Loading ACP options…
        </p>}
        {error && <p
            role="alert"
        >
            {error}
        </p>}
        {missingModel && <p
            role="alert"
        >
            The saved model is no longer offered. Choose another model or use the ACP default.
        </p>}
        {missingEffort && !missingModel && <p
            role="alert"
        >
            The saved effort is unavailable for this model. Choose another effort or its default.
        </p>}
        {options && !loading && !options.models.length && <p>This ACP did not report model options. You can still test its default.</p>}
        {result?.key === key && <p
            role={result.failed ? "alert" : "status"}
        >
            {result.message}
        </p>}
    </fieldset>;
}
