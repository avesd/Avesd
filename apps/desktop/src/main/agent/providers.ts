/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Providers
 */

import type { ProviderInstallations } from "./provider-installations";
import { providerDefinitions } from "./provider-installations";
import { createRequire } from "node:module";

const moduleRequire = createRequire(import.meta.url);
interface AgentLaunch {
    command: string;
    args: string[];
    env?: Record<string, string>;
}
export interface AgentProvider {
    readonly id: string;
    readonly name: string;
    readonly availability?: () => {
        available: boolean;
        unavailableReason?: string;
    };
    readonly launch: () => AgentLaunch | Promise<AgentLaunch>;
}

/** The host resolves a user installation; bundled adapters only provide the ACP bridge. */
export function createAgentProviders(installations: ProviderInstallations): readonly AgentProvider[] {
    return providerDefinitions.map(({ id, name }) => {
        return {
            id,
            name,
            availability: () => {
                const item = installations.list().find(provider => {
                    return provider.id === id;
                })!;
                return {
                    available: item.enabled && item.status === "installed",
                    unavailableReason: !item.enabled ? "Disabled" : item.status === "not-found" ? "Not installed" : item.status === "checking" ? "Checking installation" : item.status === "error" ? "Needs attention" : undefined,
                };
            },
            launch: async (): Promise<AgentLaunch> => {
                const executable = await installations.executable(id);
                if (id === "opencode") {
                    return {
                        command: executable,
                        args: ["acp"],
                        env: { OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: { "*": "ask" } }) },
                    };
                }
                return {
                    command: process.execPath,
                    args: [moduleRequire.resolve(id === "codex" ? "@agentclientprotocol/codex-acp" : "@agentclientprotocol/claude-agent-acp/dist/index.js")],
                    env: id === "codex" ? {
                        CODEX_PATH: executable,
                        INITIAL_AGENT_MODE: "read-only",
                    } : { CLAUDE_CODE_EXECUTABLE: executable },
                };
            },
        };
    });
}
