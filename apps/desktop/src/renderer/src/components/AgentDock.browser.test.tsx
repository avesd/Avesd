import type { AgentEvent, AgentService } from "@avesd/plugin-api";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

import { AgentDock } from "./AgentDock";

describe("AgentDock", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("opens, connects, and renders a streamed Codex response", async () => {
    let listener: ((event: AgentEvent) => void) | undefined;
    const service: AgentService = {
      cancel: vi.fn(async () => undefined),
      connect: vi.fn(async () => {
        listener?.({ status: "connected", type: "status" });
      }),
      prompt: vi.fn(async () => {
        listener?.({ text: "Hello ", type: "messageChunk" });
        listener?.({ text: "from Codex", type: "messageChunk" });
        listener?.({ stopReason: "end_turn", type: "turnComplete" });
      }),
      subscribe(nextListener) {
        listener = nextListener;
        return () => {
          listener = undefined;
        };
      },
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    root.render(<AgentDock service={service} />);

    await page.getByRole("button", { name: "Open Codex" }).click();
    await expect.element(page.getByRole("dialog", { name: "Codex agent" })).toBeVisible();
    await expect.element(page.getByText("Ready")).toBeVisible();

    await page.getByRole("textbox", { name: "Message Codex" }).fill("Say hello");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect.element(page.getByText("Say hello")).toBeVisible();
    await expect.element(page.getByText("Hello from Codex")).toBeVisible();
    expect(service.prompt).toHaveBeenCalledWith("Say hello");

    root.unmount();
  });
});
