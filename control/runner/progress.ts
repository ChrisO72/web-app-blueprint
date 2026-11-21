import { z } from "zod";
import {
  codexOutputIdSchema,
  codexOutputLimits,
  codexThreadIdSchema,
  type CodexProgress,
} from "../runner-protocol";

export const codexEventSchema = z.object({
  type: z.string(),
  thread_id: z.string().optional(),
  item: z
    .object({
      id: codexOutputIdSchema,
      type: z.string(),
      text: z.string().optional(),
      status: z.string().optional(),
      exit_code: z.number().nullable().optional(),
    })
    .optional(),
  message: z.string().optional(),
  error: z.object({ message: z.string() }).optional(),
});
export type CodexEvent = z.infer<typeof codexEventSchema>;
type OutputEntry = CodexProgress["entries"][number];

const toolLabels = {
  command_execution: ["Running a command", "Command finished", "Command failed"],
  file_change: ["Updating files", "Files updated", "File update failed"],
  mcp_tool_call: ["Calling a tool", "Tool finished", "Tool failed"],
  web_search: ["Searching the web", "Web search finished", "Web search failed"],
} as const;

function cleanText(value: string, secrets: string[]) {
  let text = value;
  for (const secret of secrets) text = text.replaceAll(secret, "[redacted]");
  text = text
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/gi,
      "[redacted]",
    )
    .replace(/\b(Bearer|Basic)\s+[\w.~+/-]{8,}=*/gi, "$1 [redacted]")
    .replace(
      /\b(?:sk-[\w-]{10,}|gh[pousr]_[\w]+|github_pat_[\w]+|xox[baprs]-[\w-]+)\b/gi,
      "[redacted]",
    )
    .replace(
      /(\b[\w-]*(?:secret|token|password|api[_-]?key)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;`]+)/gi,
      "$1[redacted]",
    )
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@")
    .replaceAll("\0", "")
    .trim();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const clipped =
    text.length > codexOutputLimits.entryLength
      ? text.slice(0, codexOutputLimits.entryLength - 1) + "…"
      : text;
  return decoder.decode(encoder.encode(clipped));
}

function outputEntry(event: CodexEvent, secrets: string[]): OutputEntry | undefined {
  const item = event.item;
  if (!item) return;
  if (event.type === "item.completed" && item.type === "agent_message" && item.text) {
    const text = cleanText(item.text, secrets);
    if (text) return { id: item.id, kind: "message", text };
  }
  if (!Object.hasOwn(toolLabels, item.type)) return;
  const labels = toolLabels[item.type as keyof typeof toolLabels];
  const failed = item.status === "failed" || (item.exit_code != null && item.exit_code !== 0);
  if (event.type === "item.started") return { id: item.id, kind: "tool", text: labels[0] };
  if (event.type === "item.completed") {
    return { id: item.id, kind: "tool", text: failed ? labels[2] : labels[1] };
  }
}

export function createCodexProgress(env: NodeJS.ProcessEnv) {
  const secrets = Object.entries(env)
    .flatMap(([key, value]) =>
      value &&
      value.length >= 8 &&
      /secret|token|password|api_?key|access_?key|database_url/i.test(key)
        ? [value]
        : [],
    )
    .sort((a, b) => b.length - a.length);
  let current: CodexProgress = { revision: 0, entries: [], truncated: false };

  return {
    get snapshot() {
      return current.revision ? current : undefined;
    },
    record(event: CodexEvent) {
      if (event.type === "thread.started") {
        const thread = codexThreadIdSchema.safeParse(event.thread_id);
        if (thread.success && !current.threadId) {
          current = { ...current, revision: current.revision + 1, threadId: thread.data };
        }
        return;
      }
      const entry = outputEntry(event, secrets);
      if (!entry) return;
      const existing = current.entries.findIndex(({ id }) => id === entry.id);
      if (existing >= 0 && current.entries[existing].text === entry.text) return;
      const updated = [...current.entries];
      if (existing >= 0) updated[existing] = entry;
      else updated.push(entry);

      let length = 0;
      let start = updated.length;
      while (
        start > 0 &&
        updated.length - start < codexOutputLimits.entries &&
        length + updated[start - 1].text.length <= codexOutputLimits.textLength
      ) {
        start--;
        length += updated[start].text.length;
      }
      current = {
        ...current,
        revision: current.revision + 1,
        entries: updated.slice(start),
        truncated: current.truncated || start > 0,
      };
    },
  };
}
