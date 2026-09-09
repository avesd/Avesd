/**
 * @author Avesd
 * @package Plugin API
 * @namespace Root
 * @description Provider-independent agent tasks
 */

export type AgentTier = "flagship" | "reasoning" | "action";
export type AgentTaskStatus = "idle" | "running" | "completed" | "error" | "stopped";
export interface AgentTaskRequest {
    readonly tier: AgentTier;
    readonly prompt: string;
}
export interface AgentTaskResult {
    readonly id: string;
    readonly tier: AgentTier;
    readonly status: AgentTaskStatus;
    readonly answer: string;
}
/** Provider, model, effort, credentials and other callers' sessions are never exposed. */
export interface AgentTaskService {
    start(request: AgentTaskRequest): Promise<{
        readonly id: string;
    }>;
    read(id: string): Promise<AgentTaskResult>;
    cancel(id: string): Promise<void>;
}
