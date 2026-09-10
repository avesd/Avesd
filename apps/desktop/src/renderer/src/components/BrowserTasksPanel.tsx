/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Background browser task management
 */

import type { BrowserTaskRecipe, BrowserTasksApi, BrowserTaskSummary } from "../../../shared/browser/browser-tasks";
import { Button, IconButton, PanelHeader, SidePanel } from "@avesd/ui";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

export function BrowserTasksPanel({ api, onClose }: {
    readonly api: BrowserTasksApi;
    readonly onClose: () => void;
}) {

    const [
        tasks,
        setTasks,
    ] = useState<readonly BrowserTaskSummary[]>([]);
    const [
        error,
        setError,
    ] = useState("");
    const [
        busy,
        setBusy,
    ] = useState(false);
    const [
        editing,
        setEditing,
    ] = useState<string>();
    const [
        recipe,
        setRecipe,
    ] = useState<BrowserTaskRecipe>({
        name: "",
        url: "",
        fields: { value: "h1" },
        intervalMinutes: 0,
    });
    const [
        fields,
        setFields,
    ] = useState("value = h1");
    useEffect(() => {

        let active = true; let version = 0;
        const refresh = async () => {

            const current = ++version;
            try {
                const result = await api.command({ type: "list" }); if (active && version === current) {
                    setTasks(result);
                }
            }
            catch {
                if (active) {
                    setError("Background browsers could not be loaded.");
                }
            }
        };
        const unsubscribe = api.subscribe(() => {

            void refresh();
        }); void refresh();

        return () => {

            active = false; unsubscribe();
        };
    }, [api]);
    const run = (work: () => Promise<void>) => {

        setBusy(true); setError("");
        void work().catch(error => {

            setError(error instanceof Error ? error.message : "Browser action failed.");
        })
            .finally(() => {

                setBusy(false);
            });
    };
    const edit = (task?: BrowserTaskSummary) => {

        const value = task ?? {
            name: "",
            url: "",
            fields: { value: "h1" },
            intervalMinutes: 0,
        };
        setRecipe(value); setFields(Object.entries(value.fields).map(([
            key,
            selector,
        ]) => {

            return `${key} = ${selector}`;
        })
            .join("\n")); setEditing(task?.id ?? "new");
    };
    const labels: Record<BrowserTaskSummary["state"], string> = {
        closed: "Page closed",
        idle: "Ready",
        refreshing: "Refreshing",
        "interaction-required": "Needs attention",
        error: "Refresh failed",
    };

    return <SidePanel
        className="agent-panel browser-tasks-panel"
        aria-label="Background browsers"
        onKeyDown={event => {

            if (event.key === "Escape") {
                onClose(); event.stopPropagation();
            }
        }}
    >
        <PanelHeader
            title="Background browsers"
            actions={<IconButton
                aria-label="Close background browsers"
                onClick={onClose}
            >
                <X
                    size={18}
                />
            </IconButton>}
        />
        <div
            className="browser-tasks-content"
        >
            <p>Tasks keep collecting while Avesd is open, independently of dashboard widgets. Login stays on this device.</p>
            <Button
                disabled={busy}
                onClick={() => {

                    edit();
                }}
            >
                New collection
            </Button>
            {error && <p
                role="alert"
            >
                {error}
            </p>}
            {editing !== undefined && <form
                onSubmit={event => {

                    event.preventDefault();
                    run(async () => {

                        const entries = fields.split("\n").filter(line => {

                            return line.trim();
                        })
                            .map(line => {

                                const index = line.indexOf("=");
                                if (index < 1) {
                                    throw new Error("Use one field = selector per line.");
                                }

                                return [
                                    line.slice(0, index).trim(),
                                    line.slice(index + 1).trim(),
                                ];
                            });
                        if (new Set(entries.map(entry => {

                            return entry[0];
                        })).size !== entries.length) {
                            throw new Error("Field names must be unique.");
                        }
                        await api.command({
                            type: "save",
                            id: editing === "new" ? undefined : editing,
                            recipe: {
                                ...recipe,
                                fields: Object.fromEntries(entries),
                            },
                        }); setEditing(undefined);
                    });
                }}
            >
                <fieldset
                    disabled={busy}
                >
                    <legend>
                        {editing === "new" ? "New collection" : "Edit collection"}
                    </legend>
                    <label>
                        Name
                        <input
                            required
                            maxLength={80}
                            value={recipe.name}
                            onChange={event => {

                                setRecipe({
                                    ...recipe,
                                    name: event.target.value,
                                });
                            }}
                        />
                    </label>
                    <label>
                        Website URL
                        <input
                            required
                            type="url"
                            value={recipe.url}
                            onChange={event => {

                                setRecipe({
                                    ...recipe,
                                    url: event.target.value,
                                });
                            }}
                        />
                    </label>
                    <label>
                        Refresh interval
                        <select
                            value={recipe.intervalMinutes}
                            onChange={event => {

                                setRecipe({
                                    ...recipe,
                                    intervalMinutes: Number(event.target.value),
                                });
                            }}
                        >
                            <option
                                value={0}
                            >
                                Manual only
                            </option>
                            <option
                                value={5}
                            >
                                Every 5 minutes
                            </option>
                            <option
                                value={15}
                            >
                                Every 15 minutes
                            </option>
                            <option
                                value={60}
                            >
                                Every hour
                            </option>
                            {![
                                0,
                                5,
                                15,
                                60,
                            ].includes(recipe.intervalMinutes) && <option
                                value={recipe.intervalMinutes}
                            >
                                Every
                                {recipe.intervalMinutes}
                                {" "}
                                minutes
                            </option>}
                        </select>
                    </label>
                    <label>
                        Text fields · name = CSS selector
                        <textarea
                            rows={3}
                            required
                            value={fields}
                            onChange={event => {

                                setFields(event.target.value);
                            }}
                        />
                    </label>
                    <p>Each selector must match one element. Ask the Agent to help configure these rules. Editing rules clears the previous result.</p>
                    <Button
                        type="submit"
                    >
                        Save collection
                    </Button>
                    <Button
                        type="button"
                        onClick={() => {

                            setEditing(undefined);
                        }}
                    >
                        Cancel
                    </Button>
                </fieldset>
            </form>}
            {!tasks.length && editing === undefined && <p>No background collections yet. Ask the Agent to set one up, or create one here.</p>}
            {tasks.map(task => {

                return <article
                    key={task.id}
                    className="browser-task-row"
                >
                    <h3>
                        {task.name}
                    </h3>
                    <p
                        className="browser-task-origin"
                    >
                        {new URL(task.url).origin}
                    </p>
                    <p
                        role="status"
                    >
                        {task.paused ? "Paused · " : ""}
                        {labels[task.state]}
                        {" "}
                        ·
                        {task.intervalMinutes ? `Every ${task.intervalMinutes} min` : "Manual"}
                    </p>
                    <p>
                        {task.lastSuccess ? `Last success: ${new Date(task.lastSuccess).toLocaleString()}` : "No successful collection yet"}
                    </p>
                    {task.error && <p
                        className="browser-task-error"
                    >
                        {task.error}
                        {" "}
                        {task.lastSuccess ? "The last successful result is retained." : ""}
                    </p>}
                    <div
                        className="browser-task-actions"
                    >
                        <Button
                            disabled={busy || task.state === "refreshing" || task.presented}
                            onClick={() => {

                                run(async () => {

                                    await api.command({
                                        type: "refresh",
                                        id: task.id,
                                    });
                                });
                            }}
                        >
                            Refresh
                        </Button>
                        <Button
                            disabled={busy || task.state === "refreshing"}
                            onClick={() => {

                                run(async () => {

                                    await api.command({
                                        type: "open",
                                        id: task.id,
                                    });
                                });
                            }}
                        >
                            Open page
                        </Button>
                        <Button
                            disabled={busy}
                            onClick={() => {

                                run(async () => {

                                    await api.command({
                                        type: task.paused ? "resume" : "pause",
                                        id: task.id,
                                    });
                                });
                            }}
                        >
                            {task.paused ? "Resume" : "Pause"}
                        </Button>
                        <Button
                            disabled={!task.pageOpen}
                            onClick={() => {

                                run(async () => {

                                    await api.command({
                                        type: "close",
                                        id: task.id,
                                    });
                                });
                            }}
                        >
                            Close page
                        </Button>
                        <Button
                            disabled={busy || task.state === "refreshing"}
                            onClick={() => {

                                edit(task);
                            }}
                        >
                            Edit
                        </Button>
                        <Button
                            disabled={busy}
                            onClick={() => {

                                run(async () => {

                                    await api.command({
                                        type: "remove",
                                        id: task.id,
                                    });
                                });
                            }}
                        >
                            Delete collection
                        </Button>
                    </div>
                    <p>Closing releases the page; scheduled refresh can reopen it. Pause stops the schedule. Deleting removes this collection and its saved result.</p>
                </article>;
            })}
        </div>
    </SidePanel>;
}
