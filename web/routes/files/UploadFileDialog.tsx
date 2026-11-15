import { captureException } from "@sentry/react-router";
import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { FormError } from "~/web/components/form-error";
import { FieldError } from "~/web/components/field-error";
import { useOperationToast } from "~/web/lib/use-operation-toast";
import { Button } from "~/web/components/ui-kit/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "~/web/components/ui-kit/dialog";
import { Description, ErrorMessage, Field, Label } from "~/web/components/ui-kit/fieldset";
import type { FileActionData } from "./index";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function UploadFileDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [clientError, setClientError] = useState<string>();
  const [phase, setPhase] = useState<"idle" | "prepare" | "finish">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedFileRef = useRef<File | undefined>(undefined);
  const handledPreparationRef = useRef<FileActionData | undefined>(undefined);
  const handledFinishRef = useRef<FileActionData | undefined>(undefined);
  const uploadAbort = useRef<AbortController | null>(null);
  const prepareFetcher = useFetcher<FileActionData>();
  const finishFetcher = useFetcher<FileActionData>();
  const operation = useOperationToast();

  useEffect(() => () => uploadAbort.current?.abort(), []);

  const busy = isUploading || prepareFetcher.state !== "idle" || finishFetcher.state !== "idle";

  useEffect(() => {
    if (
      prepareFetcher.state !== "idle" ||
      !prepareFetcher.data ||
      handledPreparationRef.current === prepareFetcher.data
    )
      return;
    handledPreparationRef.current = prepareFetcher.data;

    if (prepareFetcher.data?.formError || prepareFetcher.data?.fieldErrors) {
      setIsUploading(false);
      if (prepareFetcher.data.formError) operation.error(prepareFetcher.data.formError);
      else operation.dismiss();
      return;
    }

    const prepared = prepareFetcher.data?.prepared;
    const selectedFile = selectedFileRef.current;
    if (!prepared || !selectedFile) return;
    const controller = new AbortController();
    uploadAbort.current = controller;

    void (async () => {
      try {
        const uploadData = new FormData();
        for (const [name, value] of Object.entries(prepared.fields)) {
          uploadData.append(name, value);
        }
        uploadData.append("file", selectedFile);

        const response = await fetch(prepared.url, {
          method: "POST",
          body: uploadData,
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Object storage returned ${response.status}`);
        }

        const confirmData = new FormData();
        confirmData.set("intent", "confirm");
        confirmData.set("fileId", prepared.fileId.toString());
        setPhase("finish");
        void finishFetcher.submit(confirmData, { method: "POST" });
      } catch (error) {
        if (controller.signal.aborted) return;
        captureException(error);
        setClientError("The file could not be uploaded. Please try again.");
        operation.error("The file could not be uploaded. Please try again.");
        setIsUploading(false);
        setPhase("finish");

        const failData = new FormData();
        failData.set("intent", "fail");
        failData.set("fileId", prepared.fileId.toString());
        void finishFetcher.submit(failData, { method: "POST" });
      }
    })();
  }, [finishFetcher, prepareFetcher.data, prepareFetcher.state, operation]);

  useEffect(() => {
    if (
      finishFetcher.state !== "idle" ||
      !finishFetcher.data ||
      handledFinishRef.current === finishFetcher.data
    )
      return;
    handledFinishRef.current = finishFetcher.data;
    setIsUploading(false);

    if (finishFetcher.data.intent === "confirm" && finishFetcher.data.success) {
      operation.success("File uploaded");
      fileInputRef.current?.form?.reset();
      selectedFileRef.current = undefined;
      setClientError(undefined);
      setIsOpen(false);
    } else if (finishFetcher.data.formError) {
      operation.error(finishFetcher.data.formError);
    } else if (finishFetcher.data.fieldErrors) {
      operation.dismiss();
    }
  }, [finishFetcher.data, finishFetcher.state, operation]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setClientError(undefined);
    setPhase("idle");

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setClientError("Choose a file to upload.");
      return;
    }
    if (file.size === 0) {
      setClientError("The selected file is empty.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setClientError("Files must be 25 MB or smaller.");
      return;
    }

    selectedFileRef.current = file;
    setIsUploading(true);
    setPhase("prepare");
    operation.loading("Uploading file…");

    const prepareData = new FormData();
    prepareData.set("intent", "prepare");
    prepareData.set("filename", file.name);
    prepareData.set("contentType", file.type || "application/octet-stream");
    prepareData.set("size", file.size.toString());
    void prepareFetcher.submit(prepareData, { method: "POST" });
  };

  const closeDialog = () => {
    if (!busy) setIsOpen(false);
  };

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <ArrowUpTrayIcon data-slot="icon" />
        Upload file
      </Button>

      <Dialog open={isOpen} onClose={closeDialog}>
        <DialogTitle>Upload a private file</DialogTitle>
        <DialogDescription>
          The file uploads directly to private S3 storage and is available only to your
          organization.
        </DialogDescription>
        <DialogBody>
          <prepareFetcher.Form id="upload-file" method="post" onSubmit={handleSubmit}>
            <div className="space-y-6">
              <FormError
                actionData={
                  phase === "prepare"
                    ? prepareFetcher.data
                    : phase === "finish"
                      ? finishFetcher.data
                      : undefined
                }
              />
              {clientError && <ErrorMessage>{clientError}</ErrorMessage>}
              <Field>
                <Label htmlFor="private-file">File</Label>
                <input
                  ref={fileInputRef}
                  id="private-file"
                  name="file"
                  type="file"
                  required
                  disabled={busy}
                  className="block w-full rounded-lg border border-zinc-950/10 bg-transparent px-3 py-2 text-sm text-zinc-950 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-950 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white disabled:opacity-50 dark:border-white/10 dark:text-white dark:file:bg-white dark:file:text-zinc-950"
                />
                <Description>Maximum size: 25 MB.</Description>
                {phase === "prepare" &&
                  (["filename", "contentType", "size"] as const).map((name) => (
                    <FieldError key={name} name={name} actionData={prepareFetcher.data} />
                  ))}
                {phase === "finish" && <FieldError name="fileId" actionData={finishFetcher.data} />}
              </Field>
            </div>
          </prepareFetcher.Form>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={closeDialog} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="upload-file" disabled={busy}>
            {busy ? "Uploading..." : "Upload"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
