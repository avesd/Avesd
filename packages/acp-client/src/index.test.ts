import { describe, expect, it, vi } from "vitest";
import * as acp from "@agentclientprotocol/sdk";

import { AcpClient, AcpSessionConnection } from "./index";
import type { AcpTransport } from "./index";

describe("AcpClient", () => {
  it("uses ACP v1 session methods without provider-specific behavior", async () => {
    const requests: string[] = [];
    const notify = vi.fn();
    const transport: AcpTransport = {
      notify,
      onNotification: () => () => undefined,
      async request<TResult>(method: string): Promise<TResult> {
        requests.push(method);
        const response = method === "initialize"
          ? { agentCapabilities: {}, protocolVersion: 1 }
          : method === "session/new"
            ? { sessionId: "session-1" }
            : { stopReason: "end_turn" };
        return response as TResult;
      },
    };
    const client = new AcpClient(transport);

    await client.initialize({ name: "avesd", version: "0.0.0" }, { terminal: true });
    await client.newSession("/workspace");
    await client.prompt("session-1", [{ text: "Update the UI", type: "text" }]);
    client.cancel("session-1");

    expect(requests).toEqual([
      "initialize",
      "session/new",
      "session/prompt",
    ]);
    expect(notify).toHaveBeenCalledWith("session/cancel", { sessionId: "session-1" });
  });
});

describe("AcpSessionConnection", () => {
  it("initializes a session and normalizes streamed agent text", async () => {
    const clientToAgent = new TransformStream<Uint8Array>();
    const agentToClient = new TransformStream<Uint8Array>();
    const agent = acp.agent({ name: "test-agent" })
      .onRequest("initialize", () => ({
        agentCapabilities: {},
        agentInfo: { name: "test-agent", title: "Test Agent", version: "1.0.0" },
        protocolVersion: acp.PROTOCOL_VERSION,
      }))
      .onRequest("session/new", () => ({ sessionId: "session-1" }))
      .onRequest("session/prompt", async ({ client, params }) => {
        await client.notify("session/update", {
          sessionId: params.sessionId,
          update: {
            content: { text: "Hello", type: "text" },
            sessionUpdate: "agent_message_chunk",
          },
        });
        return { stopReason: "end_turn" };
      })
      .onNotification("session/cancel", () => undefined);
    const agentConnection = agent.connect(acp.ndJsonStream(
      agentToClient.writable,
      clientToAgent.readable,
    ));
    const onEvent = vi.fn();
    const session = await AcpSessionConnection.connect({
      clientInfo: { name: "test-client", version: "1.0.0" },
      cwd: "/workspace",
      onEvent,
      stream: {
        readable: agentToClient.readable,
        writable: clientToAgent.writable,
      },
    });

    await expect(session.prompt("Hi")).resolves.toBe("end_turn");
    expect(session.agentName).toBe("Test Agent");
    expect(onEvent).toHaveBeenCalledWith({ text: "Hello", type: "messageChunk" });

    session.close();
    agentConnection.close();
  });
});
