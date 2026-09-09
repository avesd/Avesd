/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Widget Surface
 */

import { WIDGET_BORDER, WIDGET_RADIUS } from "../../../shared/widget-appearance";
import type { WidgetServiceFactory } from "../workbench/widget-services";
import type { ApplyLayout } from "./dashboard-widgets";
import { MountedWidget } from "./MountedWidget";
import type { WidgetContribution } from "@avesd/plugin-ui";
import type { GridPlacement, WidgetInstance, WidgetSize } from "@avesd/workspace-model";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";

export const WidgetSurface = ({
    widgetServices, apply, definition, instance, isEditing,
}: {
    readonly widgetServices: WidgetServiceFactory;
    readonly apply: ApplyLayout;
    readonly definition?: WidgetContribution;
    readonly instance: WidgetInstance;
    readonly isEditing: boolean;
}) => {
    const [
        preview,
        setPreview,
    ] = useState<GridPlacement>();
    const cancelGesture = useRef<(() => void) | undefined>(undefined);
    useEffect(() => {
        return () => {
            return cancelGesture.current?.();
        };
    }, [
        isEditing,
        instance,
    ]);
    const placement = preview ?? instance.placement;
    const name = definition?.displayName ?? "Missing widget";
    const canResize = definition && (definition.sizing.policy.kind === "range"
        ? definition.sizing.policy.minimum.width !== definition.sizing.policy.maximum.width
      || definition.sizing.policy.minimum.height !== definition.sizing.policy.maximum.height
        : definition.sizing.policy.sizes.length > 1);

    const move = (x: number, y: number) => {
        return apply([
            {
                id: instance.id,
                type: "move",
                x: Math.max(0, Math.min(24 - instance.placement.width, x)),
                y: Math.max(0, y),
            },
        ]);
    };
    const resize = (size: WidgetSize) => {
        return apply([
            {
                id: instance.id,
                type: "resize",
                ...size,
            },
        ]);
    };

    const beginGesture = (event: ReactPointerEvent<HTMLElement>, kind: "move" | "resize") => {
        if (event.button !== 0 || !isEditing) {
            return;
        }
        const grid = event.currentTarget.closest(".dashboard-grid");
        if (!(grid instanceof HTMLElement)) {
            return;
        }
        event.preventDefault();
        cancelGesture.current?.();
        const start = {
            x: event.clientX,
            y: event.clientY,
        };
        const original = instance.placement;
        const cellWidth = grid.getBoundingClientRect().width / 24;
        let next = original;
        const handleMove = (moving: PointerEvent) => {
            if (moving.pointerId !== event.pointerId) {
                return;
            }
            const dx = (moving.clientX - start.x) / cellWidth;
            const dy = (moving.clientY - start.y) / 24;
            next = kind === "resize" && definition
                ? {
                    ...original,
                    ...snapSize(definition, original, original.width + dx, original.height + dy, cellWidth),
                }
                : {
                    ...original,
                    x: Math.max(0, Math.min(24 - original.width, original.x + Math.round(dx))),
                    y: Math.max(0, original.y + Math.round(dy)),
                };
            setPreview(next);
        };
        const cleanup = () => {
            window.removeEventListener("pointermove", handleMove);
            window.removeEventListener("pointerup", handleUp);
            window.removeEventListener("pointercancel", cancel);
            window.removeEventListener("blur", cancel);
            window.removeEventListener("keydown", escape);
            cancelGesture.current = undefined;
            setPreview(undefined);
        };
        const cancel = () => {
            return void cleanup();
        };
        const escape = (key: KeyboardEvent) => {
            if (key.key === "Escape") {
                cancel();
            }
        };
        const handleUp = (up: PointerEvent) => {
            if (up.pointerId !== event.pointerId) {
                return;
            }
            cleanup();
            if (kind === "move" && (next.x !== original.x || next.y !== original.y)) {
                void move(next.x, next.y);
            }
            if (kind === "resize" && (next.width !== original.width || next.height !== original.height)) {
                void resize({
                    width: next.width,
                    height: next.height,
                });
            }
        };
        cancelGesture.current = cancel;
        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", handleUp);
        window.addEventListener("pointercancel", cancel);
        window.addEventListener("blur", cancel);
        window.addEventListener("keydown", escape);
    };

    return (
        <article
            className="dashboard-widget"
            style={{
                "--widget-radius": `${WIDGET_RADIUS}px`,
                "--widget-border": `${WIDGET_BORDER}px`,
                gridColumn: `${placement.x + 1} / span ${placement.width}`,
                gridRow: `${placement.y + 1} / span ${placement.height}`,
            } as CSSProperties}
        >
            {definition
                ? <MountedWidget
                    widgetServices={widgetServices}
                    apply={apply}
                    definition={definition}
                    instance={instance}
                />
                : <p
                    className="dashboard-widget-missing"
                >
                    This widget's plugin is not installed.
                </p>}
            {isEditing && (
                <div
                    className="dashboard-widget-editor"
                >
                    <button
                        className="widget-drag-handle"
                        aria-label={`Drag ${name}`}
                        title="Drag to move. Use arrow keys when focused."
                        onPointerDown={(event) => {
                            return void beginGesture(event, "move");
                        }}
                        onKeyDown={(event) => {
                            const directions: Record<string, readonly [number, number]> = {
                                ArrowLeft: [
                                    -1,
                                    0,
                                ],
                                ArrowRight: [
                                    1,
                                    0,
                                ],
                                ArrowUp: [
                                    0,
                                    -1,
                                ],
                                ArrowDown: [
                                    0,
                                    1,
                                ],
                            };
                            const direction = directions[event.key];
                            if (direction) {
                                event.preventDefault(); void move(instance.placement.x + direction[0], instance.placement.y + direction[1]);
                            }
                        }}
                        type="button"
                    >
                        <span>
                            {name}
                        </span>
                    </button>
                    <button
                        className="widget-remove"
                        aria-label="Remove widget"
                        onClick={() => {
                            return void apply([
                                {
                                    id: instance.id,
                                    type: "remove",
                                },
                            ]);
                        }}
                        type="button"
                    >
                        ×
                    </button>
                    {canResize && <button
                        className="widget-resize-handle"
                        aria-label={`Resize ${name}`}
                        title="Drag to resize to supported sizes. Use arrow keys when focused."
                        onPointerDown={(event) => {
                            return void beginGesture(event, "resize");
                        }}
                        onKeyDown={(event) => {
                            if (![
                                "ArrowLeft",
                                "ArrowRight",
                                "ArrowUp",
                                "ArrowDown",
                            ].includes(event.key)) {
                                return;
                            }
                            event.preventDefault();
                            const current = instance.placement;
                            const policy = definition.sizing.policy;
                            const growing = event.key === "ArrowRight" || event.key === "ArrowDown";
                            if (policy.kind === "fixed") {
                                const ordered = [...policy.sizes].filter(size => {
                                    return size.width <= 24 - current.x;
                                })
                                    .sort((a, b) => {
                                        return a.width * a.height - b.width * b.height || a.width - b.width;
                                    });
                                const index = ordered.findIndex(size => {
                                    return size.width === current.width && size.height === current.height;
                                });
                                const next = ordered[index + (growing ? 1 : -1)];
                                if (next) {
                                    void resize(next);
                                }
                            } else {
                                const step = policy.step ?? {
                                    width: 1,
                                    height: 1,
                                };
                                void resize(snapSize(definition, current, current.width + (event.key === "ArrowRight" ? step.width : event.key === "ArrowLeft" ? -step.width : 0), current.height + (event.key === "ArrowDown" ? step.height : event.key === "ArrowUp" ? -step.height : 0), 24));
                            }
                        }}
                        type="button"
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            aria-hidden="true"
                        >
                            <path
                                d="M4 13 13 4M9 13l4-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            />
                        </svg>
                    </button>}
                </div>
            )}
        </article>
    );
};

const snapSize = (definition: WidgetContribution, current: GridPlacement, width: number, height: number, cellWidth: number): WidgetSize => {
    const policy = definition.sizing.policy;
    if (policy.kind === "fixed") {
        const distance = (size: WidgetSize) => {
            return ((size.width - width) * cellWidth) ** 2 + ((size.height - height) * 24) ** 2;
        };
        return policy.sizes.filter(size => {
            return size.width <= 24 - current.x;
        }).reduce<WidgetSize>(
            (nearest, size) => {
                return distance(size) < distance(nearest) ? size : nearest;
            },
            {
                width: current.width,
                height: current.height,
            },
        );
    }
    const step = policy.step ?? {
        width: 1,
        height: 1,
    };
    const snap = (value: number, minimum: number, maximum: number, increment: number) =>
    {
        return minimum + Math.max(0, Math.min(Math.floor((maximum - minimum) / increment), Math.round((value - minimum) / increment))) * increment;
    };
    return {
        width: snap(width, policy.minimum.width, Math.min(policy.maximum.width, 24 - current.x), step.width),
        height: snap(height, policy.minimum.height, policy.maximum.height, step.height),
    };
};
