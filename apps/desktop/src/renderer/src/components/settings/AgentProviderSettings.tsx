/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Agent Provider Settings
 */

import type { AgentProviderConfiguration, AgentProviderInstallation, AgentProvidersApi } from "../../../../shared/agent/providers";
import { Button } from "@avesd/ui";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const labels = {
    checking: "Checking…",
    installed: "Installed",
    "not-found": "Not installed",
    error: "Needs attention",
};

export function AgentProviderSettings({ api }: {
    readonly api: AgentProvidersApi;
}) {
    const [
        providers,
        setProviders,
    ] = useState<readonly AgentProviderInstallation[]>([]);
    const [
        busy,
        setBusy,
    ] = useState(true);
    const [
        error,
        setError,
    ] = useState<string>();
    const active = useRef(true);
    useEffect(() => {
        active.current = true;
        void api.list(true).then(value => {
            if (active.current) {
                setProviders(value);
            }
        })
            .catch(() => {
                if (active.current) {
                    setError("Agent installations could not be checked. Try refreshing.");
                }
            })
            .finally(() => {
                if (active.current) {
                    setBusy(false);
                }
            });
        return () => {
            active.current = false;
        };
    }, [api]);
    const run = async (operation: () => Promise<void>) => {
        setBusy(true); setError(undefined);
        try {
            await operation(); const result = await api.list(); if (active.current) {
                setProviders(result);
            }
        }
        catch (cause) {
            if (active.current) {
                setError(cause instanceof Error ? cause.message : "Agent settings could not be updated.");
            }
        }
        finally {
            if (active.current) {
                setBusy(false);
            }
        }
    };
    return <section
        className="agent-installations"
        aria-label="Agent installations"
        aria-busy={busy}
    >
        <div
            className="settings-section-heading"
        >
            <h3>Agents</h3>
            <Button
                size="small"
                disabled={busy}
                leading={<RefreshCw
                    size={13}
                />}
                onClick={() => {
                    return void run(async () => {
                        await api.list(true);
                    });
                }}
            >
                Refresh
            </Button>
        </div>
        <p>Use agents installed on this device. Enable the ones you want in the chat picker.</p>
        {busy && providers.length === 0 && <p
            role="status"
        >
            Checking installations…
        </p>}
        {error && <p
            className="settings-error"
            role="alert"
        >
            {error}
        </p>}
        <p
            className="settings-note"
        >
            Changing the active agent’s path or enabled setting ends its current conversation.
        </p>
        {providers.map(provider => {
            return <ProviderCard
                key={provider.id}
                provider={provider}
                disabled={busy}
                configure={configuration => {
                    return run(() => {
                        return api.configure(provider.id, configuration);
                    });
                }}
                openSetup={() => {
                    return run(() => {
                        return api.openSetup(provider.id);
                    });
                }}
            />;
        })}
        <p
            className="settings-note"
        >
            Installation checks run locally without sending a message. Installation does not verify login. Sign in with the CLI commands above. ACP adapters are included for Codex and Claude; OpenCode uses its own ACP command.
        </p>
    </section>;
}

function ProviderCard({ provider, disabled, configure, openSetup }: {
    readonly provider: AgentProviderInstallation;
    readonly disabled: boolean;
    readonly configure: (configuration: AgentProviderConfiguration) => Promise<void>;
    readonly openSetup: () => Promise<void>;
}) {
    const [
        draft,
        setDraft,
    ] = useState({
        source: provider.executablePath,
        value: provider.executablePath,
    });
    const path = draft.source === provider.executablePath ? draft.value : provider.executablePath;
    return <article
        className="provider-card"
        aria-label={`${provider.name} installation`}
    >
        <div
            className="provider-card-heading"
        >
            <strong>
                {provider.name}
            </strong>
            <label
                className="provider-enable"
            >
                <input
                    type="checkbox"
                    aria-label={`Enable ${provider.name}`}
                    checked={provider.enabled}
                    disabled={disabled}
                    onChange={event => {
                        return void configure({
                            enabled: event.target.checked,
                            executablePath: provider.executablePath,
                        });
                    }}
                />
                {" "}
                Enabled
            </label>
        </div>
        <div
            className="provider-status-line"
        >
            <span
                className={`provider-badge is-${provider.status}`}
            >
                {labels[provider.status]}
            </span>
            {provider.version && <span>
                v
                {provider.version}
            </span>}
            {!provider.enabled && <span>Disabled in chat</span>}
        </div>
        {provider.message && <p>
            {provider.message}
        </p>}
        {provider.resolvedPath && <p
            className="provider-detected-path"
            title={provider.resolvedPath}
        >
            {provider.resolvedPath}
        </p>}
        <details>
            <summary>Executable path</summary>
            <form
                onSubmit={event => {
                    event.preventDefault(); void configure({
                        enabled: provider.enabled,
                        executablePath: path,
                    });
                }}
            >
                <label>
                    Custom path
                    <input
                        aria-label={`${provider.name} executable path`}
                        value={path}
                        disabled={disabled}
                        placeholder="Auto-detect"
                        autoComplete="off"
                        spellCheck={false}
                        onChange={event => {
                            return void setDraft({
                                source: provider.executablePath,
                                value: event.target.value,
                            });
                        }}
                    />
                </label>
                <div
                    className="provider-path-actions"
                >
                    <span>Leave blank to detect automatically.</span>
                    <Button
                        size="small"
                        type="submit"
                        disabled={disabled || path === provider.executablePath}
                    >
                        Save path
                    </Button>
                </div>
            </form>
        </details>
        <div
            className="provider-setup"
        >
            <Button
                size="small"
                disabled={disabled}
                leading={<ExternalLink
                    size={12}
                />}
                onClick={() => {
                    return void openSetup();
                }}
            >
                Installation guide
            </Button>
            <code>
                {provider.loginCommand}
            </code>
        </div>
    </article>;
}
