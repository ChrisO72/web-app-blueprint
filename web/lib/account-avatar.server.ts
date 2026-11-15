import { randomUUID } from "node:crypto";
import { createFile, getOwnedAvatarFile, markFileFailed } from "~/db/repositories/files";
import { replaceUserAvatar, type User } from "~/db/repositories/users";
import {
  createFileUpload,
  createStorageKey,
  inspectStoredFile,
} from "~/integrations/storage/objects.server";
import { enqueueJob } from "~/worker/enqueue";
import {
  expirePendingFileUploadJobName,
  PENDING_FILE_UPLOAD_TTL_MS,
} from "~/worker/jobs/expire-pending-file-upload";

import { AVATAR_CONTENT_TYPES, MAX_AVATAR_BYTES } from "./avatar";

async function scheduleCleanup(organizationId: number, fileId: number) {
  await enqueueJob(
    expirePendingFileUploadJobName,
    { organizationId, fileId },
    {
      delay: PENDING_FILE_UPLOAD_TTL_MS,
      attempts: 3,
      backoff: { type: "exponential", delay: 1_000 },
      jobId: `avatar-cleanup-${fileId}-${randomUUID()}`,
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );
}

export async function prepareAvatar(
  user: User,
  filename: string,
  contentType: string,
  size: number,
) {
  const file = await createFile({
    organizationId: user.organizationId,
    uploadedByUserId: user.id,
    purpose: "avatar",
    storageKey: createStorageKey(user.organizationId),
    originalFilename: filename,
    contentType,
    expectedSize: size,
  });
  if (!file) throw new Error("Avatar upload could not be prepared");
  try {
    await scheduleCleanup(user.organizationId, file.id);
    const upload = await createFileUpload(file.storageKey, contentType, size);
    return { fileId: file.id, url: upload.url, fields: upload.fields };
  } catch (error) {
    await markFileFailed(file.id, user.organizationId);
    throw error;
  }
}

export async function confirmAvatar(user: User, fileId: number) {
  const file = await getOwnedAvatarFile(fileId, user.organizationId, user.id);
  if (!file) return false;
  if (file.status === "ready") {
    return replaceUserAvatar(user.id, user.organizationId, user.avatarFileId, file.id);
  }
  if (file.status !== "pending") return false;
  const stored = await inspectStoredFile(file.storageKey);
  if (
    stored.size !== file.expectedSize ||
    stored.contentType !== file.contentType ||
    !AVATAR_CONTENT_TYPES.some((type) => type === stored.contentType) ||
    stored.size < 1 ||
    stored.size > MAX_AVATAR_BYTES
  ) {
    await markFileFailed(file.id, user.organizationId);
    return false;
  }
  // Schedule before retiring the old photo. If the account changed concurrently,
  // cleanup sees an active ready file and leaves it alone.
  if (user.avatarFileId !== null) await scheduleCleanup(user.organizationId, user.avatarFileId);
  return replaceUserAvatar(user.id, user.organizationId, user.avatarFileId, file.id, stored.size);
}

export async function removeAvatar(user: User) {
  if (user.avatarFileId !== null) await scheduleCleanup(user.organizationId, user.avatarFileId);
  return replaceUserAvatar(user.id, user.organizationId, user.avatarFileId, null);
}

export async function failAvatar(user: User, fileId: number) {
  const file = await getOwnedAvatarFile(fileId, user.organizationId, user.id);
  if (!file || file.status !== "pending") return false;
  await markFileFailed(file.id, user.organizationId);
  return true;
}
