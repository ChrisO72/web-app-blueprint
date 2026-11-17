import { DelayedError } from "bullmq";
import { GitHubApiError } from "~/integrations/github/client.server";
import { handleSyncGithubJob, syncGithubJobName, type GitHubSyncJobData } from "./sync-github";
import type { Job } from "bullmq";
import { consumeJob } from "~/telemetry/queue.server";
import {
  expirePendingFileUploadJobName,
  handleExpirePendingFileUploadJob,
  type ExpirePendingFileUploadJobData,
} from "./expire-pending-file-upload";
import {
  handleSendConfirmationEmailJob,
  sendConfirmationEmailJobName,
  type SendConfirmationEmailJobData,
} from "./send-confirmation-email";
import {
  handleSendPasswordResetEmailJob,
  sendPasswordResetEmailJobName,
  type SendPasswordResetEmailJobData,
} from "./send-password-reset-email";

export type JobData = {
  [syncGithubJobName]: GitHubSyncJobData;
  [expirePendingFileUploadJobName]: ExpirePendingFileUploadJobData;
  [sendConfirmationEmailJobName]: SendConfirmationEmailJobData;
  [sendPasswordResetEmailJobName]: SendPasswordResetEmailJobData;
};

export type JobName = keyof JobData;

type TypedJob = {
  [Name in JobName]: Job<JobData[Name], void, Name>;
}[JobName];

export async function processJob(job: Job<JobData[JobName], void, JobName>, token?: string) {
  const known = [
    syncGithubJobName,
    expirePendingFileUploadJobName,
    sendConfirmationEmailJobName,
    sendPasswordResetEmailJobName,
  ].includes(job.name);
  return consumeJob(
    known ? job.name : "unknown",
    String(job.id ?? "unknown"),
    job.attemptsMade + 1,
    job.opts.telemetry?.omitContext ? undefined : job.opts.telemetry?.metadata,
    async () => {
      const typedJob = job as TypedJob;
      switch (typedJob.name) {
        case syncGithubJobName:
          try {
            await handleSyncGithubJob(typedJob.data);
          } catch (error) {
            if (error instanceof GitHubApiError && error.retryAfterMs > 0) {
              await job.moveToDelayed(Date.now() + error.retryAfterMs, token);
              throw new DelayedError();
            }
            throw error;
          }
          break;
        case expirePendingFileUploadJobName:
          await handleExpirePendingFileUploadJob(typedJob.data);
          break;
        case sendConfirmationEmailJobName:
          await handleSendConfirmationEmailJob(typedJob.data);
          break;
        case sendPasswordResetEmailJobName:
          await handleSendPasswordResetEmailJob(typedJob.data);
          break;
        default:
          throw new Error("Unknown job name");
      }
    },
  );
}
