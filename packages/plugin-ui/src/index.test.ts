import { describe, expect, it, vi } from "vitest";

import { dashboardWidgetContribution } from "./index";
import type { WidgetContribution } from "./index";

describe("widget UI contract", () => {
  it("supports a framework-neutral mount, update, and dispose lifecycle", () => {
    const update = vi.fn();
    const dispose = vi.fn();
    const widget: WidgetContribution = {
      configuration: { default: {}, version: 1 },
      displayName: "Status",
      mount() {
        return { dispose, update };
      },
      sizing: {
        default: { height: 4, width: 6 },
        policy: {
          kind: "fixed",
          sizes: [{ height: 4, width: 6 }],
        },
      },
      widgetTypeId: "status",
    };

    expect(dashboardWidgetContribution.id).toBe("dashboard.widget");
    expect(widget.configuration.version).toBe(1);
    expect(widget.sizing.default).toEqual({ height: 4, width: 6 });
  });
});
