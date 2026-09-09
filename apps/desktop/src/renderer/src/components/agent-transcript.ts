import type { AgentEvent } from "@avesd/plugin-api";

export type TranscriptEntry =
    | {
        id: number;
        kind: "user" | "answer" | "thought";
        text: string;
    }
    | {
        id: number;
        kind: "tool";
        toolId: string;
        title: string;
        status: string;
        input?: string;
        output?: string;
    };

export function appendAgentEvent(entries: readonly TranscriptEntry[], event: AgentEvent, id: number): readonly TranscriptEntry[] {

    if (event.type === "toolCall") {
        const index = entries.findIndex(entry => {

            return entry.kind === "tool" && entry.toolId === event.id;
        });
        const previous = entries[index];
        const tool: TranscriptEntry = {
            id: previous?.id ?? id,
            kind: "tool",
            toolId: event.id,
            title: "Tool call",
            status: "pending",
            ...(previous?.kind === "tool" ? previous : {}),
            ...(event.title !== undefined ? { title: event.title } : {}),
            ...(event.status !== undefined ? { status: event.status } : {}),
            ...(event.input !== undefined ? { input: event.input } : {}),
            ...(event.output !== undefined ? { output: event.output } : {}),
        };

        return index < 0 ? [
            ...entries,
            tool,
        ] : entries.map((entry, offset) => {

            return offset === index ? tool : entry;
        });
    }
    if (event.type === "messageChunk" || event.type === "thoughtChunk" || event.type === "userMessage") {
        const kind = event.type === "userMessage" ? "user" : event.type === "messageChunk" ? "answer" : "thought";
        const last = entries.at(-1);
        if (kind !== "user" && last?.kind === kind) {
            return [
                ...entries.slice(0, -1),
                {
                    ...last,
                    text: last.text + event.text,
                },
            ];
        }

        return [
            ...entries,
            {
                id,
                kind,
                text: event.text,
            },
        ];
    }

    return entries;
}

export function finishTools(entries: readonly TranscriptEntry[]): readonly TranscriptEntry[] {

    return entries.map(entry => {

        return entry.kind === "tool" && [
            "pending",
            "in_progress",
        ].includes(entry.status) ? {
                ...entry,
                status: "interrupted",
            } : entry;
    });
}
