import { useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { WidgetContribution } from "@avesd/plugin-ui";
import type { GridPlacement, WidgetInstance, WidgetSize } from "@avesd/workspace-model";
import type { WidgetServiceFactory } from "../workbench/widget-services";
import type { ApplyLayout } from "./dashboard-widgets";
import { MountedWidget } from "./MountedWidget";

export const WidgetSurface = ({
  widgetServices,
  apply,
  definition,
  instance,
  isEditing,
}: {
  readonly widgetServices: WidgetServiceFactory;
  readonly apply: ApplyLayout;
  readonly definition?: WidgetContribution;
  readonly instance: WidgetInstance;
  readonly isEditing: boolean;
}) => {
  const [preview, setPreview] = useState<{ readonly x: number; readonly y: number }>();
  const placementStyle = {
    gridColumn: `${(preview?.x ?? instance.placement.x) + 1} / span ${instance.placement.width}`,
    gridRow: `${(preview?.y ?? instance.placement.y) + 1} / span ${instance.placement.height}`,
  };

  const move = (x: number, y: number) => apply([{
    id: instance.id,
    type: "move",
    x: Math.max(0, Math.min(24 - instance.placement.width, x)),
    y: Math.max(0, y),
  }]);

  const resize = () => {
    if (!definition) {
      return Promise.resolve();
    }
    const next = nextSize(definition, instance.placement);
    return apply([{
      height: next.height,
      id: instance.id,
      type: "resize",
      width: next.width,
    }]);
  };

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const grid = event.currentTarget.closest(".dashboard-grid");
    if (!(grid instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    const start = { clientX: event.clientX, clientY: event.clientY };
    const cellWidth = grid.getBoundingClientRect().width / 24;
    let next = { x: instance.placement.x, y: instance.placement.y };
    const handleMove = (moveEvent: PointerEvent) => {
      next = {
        x: Math.max(0, Math.min(
          24 - instance.placement.width,
          instance.placement.x + Math.round((moveEvent.clientX - start.clientX) / cellWidth),
        )),
        y: Math.max(
          0,
          instance.placement.y + Math.round((moveEvent.clientY - start.clientY) / 24),
        ),
      };
      setPreview(next);
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      setPreview(undefined);
      void move(next.x, next.y);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  return (
    <article className="dashboard-widget" style={placementStyle}>
      {definition
        ? <MountedWidget
            widgetServices={widgetServices}
            apply={apply}
            definition={definition}
            instance={instance}
          />
        : <p className="dashboard-widget-missing">This widget's plugin is not installed.</p>}
      {isEditing && (
        <div className="dashboard-widget-editor">
          <span
            aria-label={`Drag ${definition?.displayName ?? "missing widget"}`}
            onPointerDown={beginDrag}
            role="button"
            tabIndex={0}
          >{definition?.displayName ?? "Missing widget"}</span>
          <div>
            <button aria-label="Move widget left" onClick={() => void move(
              instance.placement.x - 1,
              instance.placement.y,
            )} type="button">←</button>
            <button aria-label="Move widget right" onClick={() => void move(
              instance.placement.x + 1,
              instance.placement.y,
            )} type="button">→</button>
            <button aria-label="Move widget up" onClick={() => void move(
              instance.placement.x,
              instance.placement.y - 1,
            )} type="button">↑</button>
            <button aria-label="Move widget down" onClick={() => void move(
              instance.placement.x,
              instance.placement.y + 1,
            )} type="button">↓</button>
            <button aria-label="Change widget size" onClick={() => void resize()} type="button">↗</button>
            <button
              aria-label="Remove widget"
              onClick={() => void apply([{ id: instance.id, type: "remove" }])}
              type="button"
            >×</button>
          </div>
        </div>
      )}
    </article>
  );
};

const nextSize = (
  definition: WidgetContribution,
  current: GridPlacement,
): WidgetSize => {
  if (definition.sizing.policy.kind === "fixed") {
    const index = definition.sizing.policy.sizes.findIndex(
      ({ height, width }) => height === current.height && width === current.width,
    );
    return definition.sizing.policy.sizes[(index + 1) % definition.sizing.policy.sizes.length]
      ?? definition.sizing.default;
  }
  const step = definition.sizing.policy.step ?? { height: 1, width: 1 };
  const width = current.width + step.width <= definition.sizing.policy.maximum.width
    ? current.width + step.width
    : definition.sizing.policy.minimum.width;
  const height = current.height + step.height <= definition.sizing.policy.maximum.height
    ? current.height + step.height
    : definition.sizing.policy.minimum.height;
  return { height, width };
};
