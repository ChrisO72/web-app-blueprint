import { describe, expect, it } from "vitest";
import { codexOutputLimits, codexProgressSchema, runnerRequest } from "~/control/runner-protocol";
import { codexEventSchema, createCodexProgress } from "~/control/runner/progress";

const threadId = "01a1fe5f-54de-79c2-b37b-4069e7d201ae";
const instanceId = "d30f7f05-fee2-4d16-9c5e-1d8a29547aad";

describe("Codex task output", () => {
  it("keeps the local thread ID and publishes agent messages and tool status", () => {
    const output = createCodexProgress({});
    output.record(codexEventSchema.parse({ type: "thread.started", thread_id: threadId }));
    output.record(
      codexEventSchema.parse({
        type: "item.started",
        item: { id: "item_1", type: "command_execution", command: "print a secret" },
      }),
    );
    const first = output.snapshot;
    output.record(
      codexEventSchema.parse({
        type: "item.completed",
        item: {
          id: "item_1",
          type: "command_execution",
          aggregated_output: "secret output",
          exit_code: 1,
        },
      }),
    );
    output.record({
      type: "item.completed",
      item: { id: "item_2", type: "reasoning", text: "private reasoning" },
    });
    output.record({
      type: "item.completed",
      item: { id: "item_3", type: "agent_message", text: "I found the problem." },
    });

    expect(first?.entries[0].text).toBe("Running a command");
    expect(output.snapshot).toEqual({
      revision: 4,
      threadId,
      entries: [
        { id: "item_1", kind: "tool", text: "Command failed" },
        { id: "item_3", kind: "message", text: "I found the problem." },
      ],
      truncated: false,
    });
  });

  it("redacts known runner secrets and common credentials from agent messages", () => {
    const output = createCodexProgress({ CONTROL_RUNNER_SECRET: "known-local-secret" });
    output.record({
      type: "item.completed",
      item: {
        id: "item_1",
        type: "agent_message",
        text: 'known-local-secret Bearer abcdefghijklm "password": "local-key" https://user:pw@example.com',
      },
    });
    expect(output.snapshot?.entries[0].text).toBe(
      '[redacted] Bearer [redacted] "password": [redacted] https://[redacted]@example.com',
    );
  });

  it("bounds long output and preserves the saved thread ID when older entries are trimmed", () => {
    const output = createCodexProgress({});
    output.record({ type: "thread.started", thread_id: threadId });
    for (let index = 0; index < 10; index++) {
      output.record({
        type: "item.completed",
        item: {
          id: `item_${index}`,
          type: "agent_message",
          text: "x".repeat(codexOutputLimits.entryLength + 10),
        },
      });
    }
    expect(codexProgressSchema.safeParse(output.snapshot).success).toBe(true);
    expect(output.snapshot).toMatchObject({ threadId, truncated: true });
    expect(output.snapshot?.entries[0].id).toBe("item_4");
    expect(output.snapshot?.entries.at(-1)?.id).toBe("item_9");
  });

  it("requires a lease to send progress with a runner poll", () => {
    expect(
      runnerRequest.safeParse({
        action: "poll",
        instanceId,
        repositoryName: "owner/repo",
        readiness: "ready",
        progress: { revision: 1, threadId, entries: [], truncated: false },
      }).success,
    ).toBe(false);
  });
});
