import type { TranscriptEntry } from "../../../../../src/renderer/src/components/agent-transcript";
import { appendAgentEvent, finishTools } from "../../../../../src/renderer/src/components/agent-transcript";
import { expect, it } from "vitest";

it("keeps interleaved output in order and merges sparse tool updates without losing details", () => {

    let entries: readonly TranscriptEntry[] = [];
    entries = appendAgentEvent(entries, {
        type: "thoughtChunk",
        text: "Inspect ",
    }, 1);
    entries = appendAgentEvent(entries, {
        type: "thoughtChunk",
        text: "the dashboard.",
    }, 2);
    entries = appendAgentEvent(entries, {
        type: "toolCall",
        id: "inspect",
        title: "Inspect dashboard",
        input: "{}",
        status: "in_progress",
    }, 3);
    entries = appendAgentEvent(entries, {
        type: "messageChunk",
        text: "Found ",
    }, 4);
    entries = appendAgentEvent(entries, {
        type: "toolCall",
        id: "inspect",
        output: "Two widgets",
        status: "completed",
    }, 5);
    entries = appendAgentEvent(entries, {
        type: "messageChunk",
        text: "two widgets.",
    }, 6);
    expect(entries).toEqual([
        {
            id: 1,
            kind: "thought",
            text: "Inspect the dashboard.",
        },
        {
            id: 3,
            kind: "tool",
            toolId: "inspect",
            title: "Inspect dashboard",
            input: "{}",
            output: "Two widgets",
            status: "completed",
        },
        {
            id: 4,
            kind: "answer",
            text: "Found two widgets.",
        },
    ]);
    entries = appendAgentEvent(entries, {
        type: "toolCall",
        id: "next",
        status: "in_progress",
    }, 7);
    expect(finishTools(entries).at(-1)).toMatchObject({ status: "interrupted" });
    expect(finishTools(entries)[1]).toMatchObject({ status: "completed" });
});
