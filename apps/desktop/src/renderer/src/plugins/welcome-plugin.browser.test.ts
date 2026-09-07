import {
  ContributionBroker,
  ContributionRegistry,
  PluginHost,
} from "@avesd/kernel";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { createRoot } from "react-dom/client";

import { dashboardWidgetContribution } from "../workbench/types";
import type { DashboardWidget } from "../workbench/types";
import { welcomePlugin } from "./welcome-plugin";

describe("welcome widget plugin", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("mounts in a real browser and cleans up its DOM", async () => {
    Object.defineProperty(window, "avesd", {
      configurable: true,
      value: {
        runtime: {
          chrome: "test",
          electron: "test",
          node: "test",
          platform: "browser",
        },
      },
    });

    const widgets = new ContributionRegistry<DashboardWidget>();
    const contributions = new ContributionBroker();
    contributions.register(dashboardWidgetContribution, widgets);
    const host = new PluginHost({ contributions });
    await host.replace(welcomePlugin);

    const widget = widgets.getAll(dashboardWidgetContribution.id)[0];
    expect(widget?.pluginId).toBe("avesd.builtin.welcome");

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    root.render(widget?.value.render({ configuration: {}, size: { height: 6, width: 12 } }));

    await expect.element(page.getByRole("heading", {
      name: "Your space, assembled your way.",
    })).toBeVisible();

    root.unmount();
    expect(container.childElementCount).toBe(0);

    await host.remove("avesd.builtin.welcome");
    expect(widgets.getAll(dashboardWidgetContribution.id)).toEqual([]);
  });
});
