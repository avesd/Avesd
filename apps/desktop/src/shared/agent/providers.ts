/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Providers
 */

export type AgentProviderId = "codex" | "claude" | "opencode";
export interface AgentProviderConfiguration {
    readonly enabled: boolean;
    readonly executablePath: string;
}
export interface AgentProviderInstallation extends AgentProviderConfiguration {
    readonly id: AgentProviderId;
    readonly name: string;
    readonly status: "checking" | "installed" | "not-found" | "error";
    readonly resolvedPath?: string;
    readonly version?: string;
    readonly message?: string;
    readonly loginCommand: string;
}
export interface AgentProvidersApi {
    list(refresh?: boolean): Promise<readonly AgentProviderInstallation[]>;
    configure(id: AgentProviderId, configuration: AgentProviderConfiguration): Promise<void>;
    openSetup(id: AgentProviderId): Promise<void>;
}
export const agentProvidersChannels = {
    list: "agent-providers:list",
    configure: "agent-providers:configure",
    setup: "agent-providers:setup",
} as const;
