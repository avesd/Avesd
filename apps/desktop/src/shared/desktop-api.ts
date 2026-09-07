import type { AgentService } from "@avesd/plugin-api";

export interface DesktopRuntime {
  readonly chrome: string;
  readonly electron: string;
  readonly node: string;
  readonly platform: string;
}

export interface DesktopApi {
  readonly agent: AgentService;
  readonly runtime: DesktopRuntime;
}

export const agentIpcChannels = Object.freeze({
  cancel: "agent:cancel",
  connect: "agent:connect",
  event: "agent:event",
  prompt: "agent:prompt",
});

export const parseAgentPrompt = (input: unknown): string => {
  if (typeof input !== "string") {
    throw new TypeError("Agent prompt must be a string");
  }

  const prompt = input.trim();
  if (prompt.length === 0) {
    throw new Error("Agent prompt cannot be empty");
  }
  if (prompt.length > 32_768) {
    throw new Error("Agent prompt is too long");
  }

  return prompt;
};

export const formatRuntimeSummary = (runtime: DesktopRuntime): string =>
  `Electron ${runtime.electron} · ${runtime.platform}`;
