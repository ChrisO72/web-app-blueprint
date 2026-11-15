import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { FieldError } from "~/web/components/field-error";
import { FormError } from "~/web/components/form-error";
import { Button } from "~/web/components/ui-kit/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "~/web/components/ui-kit/dialog";
import { ErrorMessage, Field, Label } from "~/web/components/ui-kit/fieldset";
import { Text } from "~/web/components/ui-kit/text";
import { UserAvatar, type AvatarUser } from "~/web/components/user-avatar";
import { AVATAR_CONTENT_TYPES, MAX_AVATAR_BYTES } from "~/web/lib/avatar";
import { SettingsRow } from "./account-forms";
import type { AccountActionData } from "./index";
import { useFetcherToast } from "~/web/lib/use-fetcher-toast";
import { useOperationToast } from "~/web/lib/use-operation-toast";

export function ProfilePhotoForm({
  user,
  storageEnabled,
}: {
  user: AvatarUser;
  storageEnabled: boolean;
}) {
  const removeFetcher = useFetcher<AccountActionData>();
  useFetcherToast(removeFetcher, {
    success: "Profile photo removed",
  });
  const [isOpen, setIsOpen] = useState(false);
  const [showRemovalError, setShowRemovalError] = useState(false);
  const removing = removeFetcher.state !== "idle";
  const hasPhoto = user.avatarFileId !== null;

  return (
    <div className="border-b border-zinc-950/10 dark:border-white/10">
      <SettingsRow title="Profile photo" description="Choose a photo to personalize your account.">
        <div className="flex flex-wrap items-center gap-6">
          <UserAvatar user={user} className="size-20" />
          {storageEnabled && (
            <div className="flex flex-wrap gap-3">
              {hasPhoto && (
                <Button
                  outline
                  type="button"
                  disabled={removing}
                  onClick={() => {
                    setShowRemovalError(true);
                    void removeFetcher.submit(
                      { intent: "avatar-remove" },
                      { method: "post", action: "/account" },
                    );
                  }}
                >
                  {removing ? "Removing…" : "Remove"}
                </Button>
              )}
              <Button
                outline
                type="button"
                disabled={removing}
                onClick={() => {
                  setShowRemovalError(false);
                  setIsOpen(true);
                }}
              >
                {hasPhoto ? "Change" : "Set photo"}
              </Button>
            </div>
          )}
        </div>
        {!storageEnabled && <Text className="mt-4">Profile photos are currently unavailable.</Text>}
        {storageEnabled && showRemovalError && removeFetcher.data?.formError && (
          <div className="mt-4">
            <FormError actionData={removeFetcher.data} />
          </div>
        )}
        {isOpen && (
          <ProfilePhotoDialog
            hasPhoto={hasPhoto}
            onClose={() => setIsOpen(false)}
            onSuccess={() => {
              setIsOpen(false);
            }}
          />
        )}
      </SettingsRow>
    </div>
  );
}

function ProfilePhotoDialog({
  hasPhoto,
  onClose,
  onSuccess,
}: {
  hasPhoto: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const inputId = useId();
  const prepareFetcher = useFetcher<AccountActionData>();
  const finishFetcher = useFetcher<AccountActionData>();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedFile = useRef<File | null>(null);
  const handledPreparation = useRef<AccountActionData | undefined>(undefined);
  const handledFinish = useRef<AccountActionData | undefined>(undefined);
  const uploadAbort = useRef<AbortController | null>(null);
  const operation = useOperationToast();
  useEffect(() => () => uploadAbort.current?.abort(), []);
  const [uploading, setUploading] = useState(false);
  const [clientError, setClientError] = useState<string>();
  const [phase, setPhase] = useState<"idle" | "prepare" | "finish">("idle");
  const busy = uploading || prepareFetcher.state !== "idle" || finishFetcher.state !== "idle";

  useEffect(() => {
    if (
      prepareFetcher.state !== "idle" ||
      !prepareFetcher.data ||
      handledPreparation.current === prepareFetcher.data
    )
      return;
    handledPreparation.current = prepareFetcher.data;
    if (prepareFetcher.data?.formError || prepareFetcher.data?.fieldErrors) {
      setUploading(false);
      if (prepareFetcher.data.formError) operation.error(prepareFetcher.data.formError);
      else operation.dismiss();
      return;
    }
    const prepared = prepareFetcher.data?.prepared;
    const file = selectedFile.current;
    if (!prepared || !file) return;
    const controller = new AbortController();
    uploadAbort.current = controller;

    void (async () => {
      try {
        const body = new FormData();
        for (const [name, value] of Object.entries(prepared.fields)) body.append(name, value);
        body.append("file", file);
        const response = await fetch(prepared.url, {
          method: "POST",
          body,
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Photo upload failed");
        setPhase("finish");
        await finishFetcher.submit(
          { intent: "avatar-confirm", fileId: String(prepared.fileId) },
          { method: "post", action: "/account" },
        );
      } catch {
        if (controller.signal.aborted) return;
        setClientError("The photo could not be uploaded. Please try again.");
        operation.error("The photo could not be uploaded. Please try again.");
        setPhase("finish");
        await finishFetcher.submit(
          { intent: "avatar-fail", fileId: String(prepared.fileId) },
          { method: "post", action: "/account" },
        );
      } finally {
        if (!controller.signal.aborted) setUploading(false);
      }
    })();
  }, [prepareFetcher.state, prepareFetcher.data, finishFetcher, operation]);

  useEffect(() => {
    if (
      finishFetcher.state !== "idle" ||
      !finishFetcher.data ||
      handledFinish.current === finishFetcher.data
    )
      return;
    handledFinish.current = finishFetcher.data;
    if (finishFetcher.data.success && finishFetcher.data.intent === "avatar-confirm") {
      operation.success("Profile photo updated");
      onSuccess();
    } else if (finishFetcher.data.formError) {
      operation.error(finishFetcher.data.formError);
    } else if (finishFetcher.data.fieldErrors) {
      operation.dismiss();
    }
  }, [finishFetcher.state, finishFetcher.data, onSuccess, operation]);

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setClientError(undefined);
    setPhase("idle");
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setClientError("Choose a photo to upload.");
      return;
    }
    if (!AVATAR_CONTENT_TYPES.some((type) => type === file.type)) {
      setClientError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (!file.size || file.size > MAX_AVATAR_BYTES) {
      setClientError("Choose a photo between 1 byte and 5 MiB.");
      return;
    }
    selectedFile.current = file;
    setUploading(true);
    setPhase("prepare");
    operation.loading("Updating profile photo…");
    void prepareFetcher.submit(
      {
        intent: "avatar-prepare",
        filename: file.name,
        contentType: file.type,
        size: String(file.size),
      },
      { method: "post", action: "/account" },
    );
  }

  const closeDialog = () => {
    if (!busy) onClose();
  };

  return (
    <Dialog open onClose={closeDialog}>
      <DialogTitle>{hasPhoto ? "Change profile photo" : "Set profile photo"}</DialogTitle>
      <DialogDescription>Choose a JPEG, PNG, or WebP image up to 5 MiB.</DialogDescription>
      <DialogBody>
        <form
          id={inputId}
          onSubmit={upload}
          className="space-y-4"
          aria-label="Upload profile photo"
          aria-busy={busy}
        >
          <FormError
            actionData={
              phase === "prepare"
                ? prepareFetcher.data
                : phase === "finish"
                  ? finishFetcher.data
                  : undefined
            }
          />
          <Field>
            <Label htmlFor={`${inputId}-file`}>Choose a photo</Label>
            <input
              id={`${inputId}-file`}
              ref={inputRef}
              type="file"
              accept={AVATAR_CONTENT_TYPES.join(",")}
              disabled={busy}
              onChange={() => {
                setClientError(undefined);
                setPhase("idle");
              }}
              className="mt-3 block w-full rounded-lg text-sm text-zinc-500 file:mr-4 file:cursor-pointer file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-white"
            />
            {clientError && <ErrorMessage>{clientError}</ErrorMessage>}
            {phase === "prepare" &&
              (["filename", "contentType", "size"] as const).map((name) => (
                <FieldError key={name} name={name} actionData={prepareFetcher.data} />
              ))}
            {phase === "finish" && <FieldError name="fileId" actionData={finishFetcher.data} />}
          </Field>
        </form>
      </DialogBody>
      <DialogActions>
        <Button plain type="button" onClick={closeDialog} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" form={inputId} disabled={busy}>
          {busy ? "Uploading…" : "Upload photo"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
