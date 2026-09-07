import type { PluginDefinition } from "@avesd/plugin-api";
import { dashboardWidgetContribution } from "@avesd/plugin-ui";
import type { WidgetContribution } from "@avesd/plugin-ui";
import { createRoot } from "react-dom/client";

const welcomeWidgetStyles = `
  :host { display: block; width: 100%; height: 100%; }
  * { box-sizing: border-box; }
  section {
    display: grid;
    height: 100%;
    padding: 20px;
    place-content: center start;
    color: #20221f;
    background:
      radial-gradient(circle at 88% 20%, rgb(160 178 147 / 22%), transparent 34%),
      linear-gradient(140deg, #fafaf6, #f0f2e9);
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }
  .kicker {
    margin: 0 0 7px;
    color: #78836f;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  h2 {
    max-width: 340px;
    margin: 0;
    color: #3b4237;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(16px, 2vw, 24px);
    font-weight: 500;
    letter-spacing: -0.03em;
  }
  p:last-child {
    max-width: 360px;
    margin: 9px 0 0;
    color: #797e74;
    font-size: 10px;
    line-height: 1.5;
  }
`;

const welcomeWidget: WidgetContribution = {
  configuration: {
    default: {},
    schema: { additionalProperties: false, type: "object" },
    version: 1,
  },
  description: "A quiet starting point for your workspace.",
  displayName: "Welcome",
  mount(root) {
    const reactRoot = createRoot(root);
    return {
      dispose() {
        reactRoot.unmount();
      },
      update() {
        reactRoot.render(
          <>
            <style>{welcomeWidgetStyles}</style>
            <section>
              <p className="kicker">Avesd</p>
              <h2>Your space, assembled your way.</h2>
              <p>Add capabilities as you need them. Every widget stays local to this workspace.</p>
            </section>
          </>,
        );
      },
    };
  },
  sizing: {
    default: { height: 6, width: 12 },
    policy: {
      kind: "fixed",
      sizes: [
        { height: 5, width: 8 },
        { height: 6, width: 12 },
        { height: 7, width: 24 },
      ],
    },
  },
  widgetTypeId: "welcome",
};

export const welcomePlugin: PluginDefinition = {
  activate(context) {
    context.effect(() => context.contributions.contribute(
      dashboardWidgetContribution,
      welcomeWidget,
    ));
  },
  apiVersion: 1,
  id: "avesd.builtin.welcome",
  version: "0.1.0",
};
