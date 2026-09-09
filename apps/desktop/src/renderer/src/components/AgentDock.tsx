/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Agent Dock
 */

import { useAgentPanel } from "../workbench/WorkbenchChrome";
import type { TranscriptEntry } from "./agent-transcript";
import { appendAgentEvent, finishTools } from "./agent-transcript";
import { AgentMarkdown } from "./AgentMarkdown";
import type { AgentConnectionStatus,
    AgentEvent,
    AgentService,
    AgentSettings } from "@avesd/plugin-api";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItemContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger, IconButton, SidePanel } from "@avesd/ui";
import { ArrowUp, Bot, ChevronDown, Sparkles, Square, X } from "lucide-react";
import type { KeyboardEvent, SyntheticEvent } from "react";
import { useEffect, useRef, useState } from "react";

const statusLabels: Record<AgentConnectionStatus, string> = {
    connected: "Ready",
    connecting: "Connecting",
    disconnected: "Offline",
    error: "Unavailable",
};

export const AgentDock = ({ service }: {
    readonly service: AgentService;
}) => {
    const { agentOpen: open, closeAgent } = useAgentPanel();
    const nextMessageId = useRef(0);
    const composer = useRef<HTMLTextAreaElement>(null);
    const conversation = useRef<HTMLDivElement>(null);
    const followOutput = useRef(true);
    useEffect(() => {
        if (open) {
            composer.current?.focus();
        }
    }, [open]);
    const [
        settings,
        setSettings,
    ] = useState<AgentSettings>();
    const [
        changingSettings,
        setChangingSettings,
    ] = useState(false);
    const providerUnavailable = settings?.providers.find(provider => {
        return provider.id === settings.providerId;
    })?.available === false;
    const providerName = settings?.providers.find(provider => {
        return provider.id === settings.providerId;
    })?.name ?? "Codex";
    const agentName = settings?.agentName ?? providerName;
    const modelName = settings?.models.find(model => {
        return model.id === settings.modelId;
    })?.name ?? settings?.modelId;
    const effortName = settings?.efforts?.find(effort => {
        return effort.id === settings.effortId;
    })?.name ?? settings?.effortId ?? "Default";
    const [
        activity,
        setActivity,
    ] = useState<string>();
    const [
        busy,
        setBusy,
    ] = useState(false);
    const [
        draft,
        setDraft,
    ] = useState("");
    const [
        error,
        setError,
    ] = useState<string>();
    const [
        messages,
        setMessages,
    ] = useState<readonly TranscriptEntry[]>([]);
    const [
        status,
        setStatus,
    ] = useState<AgentConnectionStatus>("disconnected");

    useEffect(() => {
        const element = conversation.current;
        if (element && followOutput.current) {
            element.scrollTop = element.scrollHeight;
        }
    }, [
        messages,
        busy,
        open,
    ]);

    useEffect(() => {
        let active = true;
        let receivedSettings = false;
        void service.getSettings?.().then(value => {
            if (active && !receivedSettings) {
                setSettings(value); setStatus(value.status);
            }
        })
            .catch(() => {
                if (active) {
                    setError("Agent settings could not be loaded.");
                }
            });
        const dispose = service.subscribe((event: AgentEvent) => {
            if (event.type === "settings") {
                receivedSettings = true; setSettings(event.settings); setStatus(event.settings.status); return;
            }
            if (event.type === "sessionReset") {
                setMessages([]); setActivity(undefined); setBusy(false); setError(undefined); return;
            }
            if (event.type === "status") {
                setStatus(event.status);
                setError(event.status === "error" ? event.message ?? "Agent could not connect." : undefined);
                if (event.status === "error" || event.status === "disconnected") {
                    setBusy(false);
                    setMessages(finishTools);
                }
                return;
            }
            if (event.type === "activity") {
                setActivity(event.title);
                return;
            }
            if (event.type === "turnComplete") {
                setActivity(undefined);
                setBusy(false);
                setMessages(finishTools);
                return;
            }

            const id = nextMessageId.current++;
            setMessages(current => {
                return appendAgentEvent(current, event, id);
            });
        });

        return () => {
            active = false;
            void dispose();
        };
    }, [service]);

    const connect = async (): Promise<void> => {
        if (providerUnavailable || status === "connected" || status === "connecting") {
            return;
        }

        setError(undefined);
        try {
            await service.connect();
        } catch {
            setError((current) => {
                return current ?? "Agent could not connect.";
            });
        }
    };

    const changeSettings = async (kind: "provider" | "model" | "effort", id: string) => {
        const currentId = kind === "provider" ? settings?.providerId : kind === "model" ? settings?.modelId : settings?.effortId;
        if (busy || changingSettings || status === "connecting" || id === currentId) {
            return;
        }
        setChangingSettings(true); setError(undefined);
        try {
            if (kind === "provider") {
                await service.selectProvider?.(id);
            }
            else if (kind === "model") {
                await service.selectModel?.(id);
            }
            else {
                await service.selectEffort?.(id);
            }
            const value = await service.getSettings?.();
            if (value) {
                setSettings(value); setStatus(value.status);
            }
        } catch {
            setError(kind === "provider" ? "Could not connect to this provider. Check its local login, then retry." : `${kind === "model" ? "Model" : "Reasoning effort"} change failed. The current session settings are shown.`);
        } finally { setChangingSettings(false); }
    };

    const sendPrompt = async (): Promise<void> => {
        const text = draft.trim();
        if (!text || busy || changingSettings || status === "connecting" || (providerUnavailable && status !== "connected")) {
            return;
        }

        setDraft("");
        setError(undefined);
        setActivity(undefined);
        setBusy(true);
        followOutput.current = true;
        setMessages((current) => {
            return [
                ...current,
                {
                    id: nextMessageId.current++,
                    kind: "user",
                    text,
                },
            ];
        });

        try {
            await service.prompt(text);
        } catch {
            setBusy(false);
            setMessages(finishTools);
            setError((current) => {
                return current ?? "Agent could not complete that request.";
            });
        }
    };

    const handleSubmit = (event: SyntheticEvent<HTMLFormElement>): void => {
        event.preventDefault();
        void sendPrompt();
    };

    const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void sendPrompt();
        }
    };

    if (!open) {
        return null;
    }

    return (
        <SidePanel
            aria-label="Workspace agent"
            className="agent-panel"
            onKeyDown={(event) => {
                if (event.key === "Escape" && !event.defaultPrevented && event.currentTarget.contains(event.target as Node)) {
                    closeAgent(); event.stopPropagation();
                }
            }}
        >
            <header
                className="agent-header"
            >
                <span
                    aria-hidden="true"
                    className="agent-mark is-small"
                >
                    <Bot
                        size={18}
                    />
                </span>
                <div
                    className="agent-identity"
                >
                    <strong>
                        {agentName}
                    </strong>
                    <span>
                        <span
                            className={`agent-connection-dot is-${status}`}
                        />
                        {statusLabels[status]}
                        {" "}
                        · Avesd workspace
                    </span>
                </div>
                {status !== "connected" && <Button
                    className="agent-connect"
                    size="small"
                    disabled={providerUnavailable || status === "connecting" || changingSettings}
                    onClick={() => {
                        return void connect();
                    }}
                >
                    {status === "connecting" ? "Connecting…" : "Connect"}
                </Button>}
                <IconButton
                    aria-label="Close agent"
                    className="agent-icon-button"
                    onClick={() => {
                        return void closeAgent();
                    }}
                >
                    <X
                        size={18}
                        aria-hidden="true"
                    />
                </IconButton>
            </header>

            <div
                ref={conversation}
                onScroll={() => {
                    const element = conversation.current;
                    if (element) {
                        followOutput.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64;
                    }
                }}
                className="agent-conversation"
            >
                {messages.length === 0 ? (
                    <div
                        className="agent-empty-state"
                    >
                        <span
                            aria-hidden="true"
                            className="agent-empty-glyph"
                        >
                            <Sparkles
                                size={24}
                            />
                        </span>
                        <h2>What are we working on?</h2>
                        <p>Your agent can inspect and arrange this dashboard through scoped local tools.</p>
                    </div>
                ) : messages.map((message) => {
                    if (message.kind === "thought") {
                        return <details
                            className="agent-trace agent-reasoning"
                            key={message.id}
                        >
                            <summary>
                                Thinking
                                <span>Agent-provided reasoning</span>
                            </summary>
                            <AgentMarkdown
                                text={message.text}
                            />
                        </details>;
                    }
                    if (message.kind === "tool") {
                        return <details
                            className="agent-trace agent-tool"
                            key={message.id}
                        >
                            <summary>
                                <span
                                    className="agent-tool-title"
                                >
                                    {message.title}
                                </span>
                                <span
                                    className={`agent-tool-status is-${message.status}`}
                                >
                                    {({
                                        pending: "Pending",
                                        in_progress: "Running",
                                        completed: "Completed",
                                        failed: "Failed",
                                        interrupted: "Interrupted",
                                    } as Record<string, string>)[message.status] ?? message.status}
                                </span>
                            </summary>
                            {message.input !== undefined && <>
                                <h4>Input</h4>
                                <pre>
                                    {message.input}
                                </pre>
                            </>}
                            {message.output !== undefined && <>
                                <h4>Output</h4>
                                <pre>
                                    {message.output}
                                </pre>
                            </>}
                            {message.input === undefined && message.output === undefined && <p>No details provided by the agent.</p>}
                        </details>;
                    }
                    return (
                        <div
                            className={`agent-message is-${message.kind === "user" ? "user" : "agent"}`}
                            key={message.id}
                        >
                            {message.kind === "user" ? message.text : <AgentMarkdown
                                text={message.text}
                            />}
                        </div>
                    );
                })}
                {busy && <p
                    className="agent-progress"
                    role="status"
                >
                    <span
                        className="agent-thinking"
                    >
                        <i />
                        <i />
                        <i />
                    </span>
                    Working…
                </p>}
                {activity ? <p
                    className="agent-activity"
                >
                    {activity}
                </p> : null}
            </div>

            {providerUnavailable && status !== "connected" && <p
                className="agent-installation-notice"
            >
                This agent is unavailable. Open Settings → Agents to enable it or configure its installation.
            </p>}
            {error ? (
                <div
                    className="agent-error"
                    role="alert"
                >
                    <span>
                        {error}
                    </span>
                    {(status === "error" || status === "disconnected") && !providerUnavailable && <button
                        onClick={() => {
                            return void connect();
                        }}
                        type="button"
                        disabled={changingSettings}
                    >
                        Retry
                    </button>}
                </div>
            ) : null}

            <form
                className="agent-composer"
                onSubmit={handleSubmit}
            >
                <textarea
                    ref={composer}
                    aria-label="Message agent"
                    disabled={status === "connecting" || changingSettings}
                    onChange={(event) => {
                        return void setDraft(event.target.value);
                    }}
                    onKeyDown={handleComposerKeyDown}
                    placeholder={status === "connecting" ? `Connecting to ${providerName}…` : "Do anything…"}
                    rows={3}
                    value={draft}
                />
                <div
                    className="agent-composer-footer"
                >
                    <div
                        className="agent-model-controls"
                    >
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                asChild
                            >
                                <Button
                                    aria-label="ACP harness"
                                    className="agent-model-trigger"
                                    variant="ghost"
                                    size="small"
                                    disabled={!service.selectProvider || !settings || busy || changingSettings || status === "connecting"}
                                    title="Changing harness starts a new conversation"
                                >
                                    <span>
                                        <span
                                            className="agent-selection-label"
                                        >
                                            Harness
                                        </span>
                                        {" "}
                                        {providerName}
                                    </span>
                                    <ChevronDown
                                        size={12}
                                        aria-hidden="true"
                                    />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                aria-label="ACP harness"
                                className="agent-selection-menu"
                                side="top"
                                align="start"
                                margin="none"
                                sideOffset={8}
                                collisionPadding={8}
                            >
                                <DropdownMenuLabel
                                    description="Changing harness starts a new conversation."
                                >
                                    ACP harness
                                </DropdownMenuLabel>
                                <DropdownMenuRadioGroup
                                    value={settings?.providerId}
                                    onValueChange={id => {
                                        return void changeSettings("provider", id);
                                    }}
                                >
                                    {settings?.providers.map(provider => {
                                        return <DropdownMenuRadioItem
                                            key={provider.id}
                                            value={provider.id}
                                            disabled={provider.available === false || busy || changingSettings || status === "connecting"}
                                        >
                                            <DropdownMenuItemContent
                                                description={provider.available === false ? provider.unavailableReason ?? "Unavailable" : undefined}
                                            >
                                                {provider.name}
                                            </DropdownMenuItemContent>
                                        </DropdownMenuRadioItem>;
                                    })}
                                </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                asChild
                            >
                                <Button
                                    aria-label="Agent model"
                                    className="agent-model-trigger"
                                    variant="ghost"
                                    size="small"
                                    disabled={!service.selectModel || !settings?.models.length || busy || changingSettings || status !== "connected"}
                                    title={status !== "connected" ? "Connect to load models" : settings?.models.length ? "Model for this session" : "This provider does not expose model selection"}
                                >
                                    <span>
                                        <span
                                            className="agent-selection-label"
                                        >
                                            Model
                                        </span>
                                        {" "}
                                        {modelName ?? (status === "connected" ? "Agent default" : "Connect for models")}
                                    </span>
                                    <ChevronDown
                                        size={12}
                                        aria-hidden="true"
                                    />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                aria-label="Agent model"
                                className="agent-selection-menu"
                                side="top"
                                align="end"
                                margin="none"
                                sideOffset={8}
                                collisionPadding={8}
                            >
                                <DropdownMenuLabel>Model for this session</DropdownMenuLabel>
                                <DropdownMenuRadioGroup
                                    value={settings?.modelId}
                                    onValueChange={id => {
                                        return void changeSettings("model", id);
                                    }}
                                >
                                    {settings?.models.map(model => {
                                        return <DropdownMenuRadioItem
                                            key={model.id}
                                            value={model.id}
                                            disabled={busy || changingSettings || status !== "connected"}
                                        >
                                            <DropdownMenuItemContent>
                                                {model.name}
                                            </DropdownMenuItemContent>
                                        </DropdownMenuRadioItem>;
                                    })}
                                </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {!!settings?.efforts?.length && <DropdownMenu>
                            <DropdownMenuTrigger
                                asChild
                            >
                                <Button
                                    aria-label="Reasoning effort"
                                    className="agent-model-trigger"
                                    variant="ghost"
                                    size="small"
                                    disabled={!service.selectEffort || busy || changingSettings || status !== "connected"}
                                    title="Reasoning effort for this session"
                                >
                                    <span>
                                        <span
                                            className="agent-selection-label"
                                        >
                                            Effort
                                        </span>
                                        {" "}
                                        {effortName}
                                    </span>
                                    <ChevronDown
                                        size={12}
                                        aria-hidden="true"
                                    />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                aria-label="Reasoning effort"
                                className="agent-selection-menu"
                                side="top"
                                align="end"
                                margin="none"
                                sideOffset={8}
                                collisionPadding={8}
                            >
                                <DropdownMenuLabel>Reasoning effort</DropdownMenuLabel>
                                <DropdownMenuRadioGroup
                                    value={settings.effortId}
                                    onValueChange={id => {
                                        return void changeSettings("effort", id);
                                    }}
                                >
                                    {settings.efforts.map(effort => {
                                        return <DropdownMenuRadioItem
                                            key={effort.id}
                                            value={effort.id}
                                            disabled={busy || changingSettings || status !== "connected"}
                                        >
                                            <DropdownMenuItemContent>
                                                {effort.name}
                                            </DropdownMenuItemContent>
                                        </DropdownMenuRadioItem>;
                                    })}
                                </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                        </DropdownMenu>}
                    </div>
                    {busy ? (
                        <button
                            aria-label="Stop agent"
                            className="agent-send is-stop"
                            onClick={() => {
                                return void service.cancel();
                            }}
                            type="button"
                        >
                            <Square
                                size={12}
                                fill="currentColor"
                                aria-hidden="true"
                            />
                        </button>
                    ) : (
                        <button
                            aria-label="Send message"
                            className="agent-send"
                            disabled={!draft.trim() || status === "connecting" || changingSettings || (providerUnavailable && status !== "connected")}
                            type="submit"
                        >
                            <ArrowUp
                                size={18}
                                aria-hidden="true"
                            />
                        </button>
                    )}
                    {" "}
                </div>
            </form>
        </SidePanel>
    );
};
