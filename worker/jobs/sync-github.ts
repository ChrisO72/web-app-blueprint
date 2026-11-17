import { createHash } from "node:crypto";
import { enqueueJob } from "../enqueue";
import { syncGithub } from "~/control/github-sync.server";
import type { RecordKind } from "~/integrations/github/records";

export const syncGithubJobName = "syncGithub" as const;
export type GitHubSyncJobData =
  | { kind: "full"; connectionId: string; syncId: string }
  | {
      kind: "record";
      connectionId: string;
      recordKind: RecordKind;
      githubId: number;
      number: number;
      deleted: boolean;
    };

export async function enqueueGithubSync(data: GitHubSyncJobData, deliveryId?: string) {
  if (data.kind === "record" && !deliveryId) throw new Error("GitHub delivery ID is required.");
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const job = await Promise.race([
      enqueueJob(syncGithubJobName, data, {
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
        jobId:
          data.kind === "full"
            ? `github-full-${data.syncId}`
            : `github-delivery-${createHash("sha256")
                .update(deliveryId ?? "")
                .digest("hex")}`,
        removeOnComplete: { age: 7 * 24 * 60 * 60 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      }),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(
          () => reject(new Error("GitHub job could not be queued in time.")),
          7500,
        );
      }),
    ]);
    if (deliveryId && (await job.getState()) === "failed") await job.retry();
  } finally {
    clearTimeout(deadline);
  }
}
export async function handleSyncGithubJob(data: GitHubSyncJobData) {
  await syncGithub(data);
}
