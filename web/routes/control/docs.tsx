import { useCallback, useEffect, useState } from "react";
import {
  Link,
  useBeforeUnload,
  useBlocker,
  useFetcher,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import clsx from "clsx";
import { z } from "zod";
import { ArrowLeftIcon, PencilSquareIcon } from "@heroicons/react/16/solid";
import { loadDocuments, proposeDocument } from "~/control/docs.server";
import { docsUrl } from "~/control/docs";
import { publicError } from "~/control/github.server";
import { DocsNavigator } from "~/control/components/docs-navigator";
import { DocumentMarkdown } from "~/control/components/document-markdown";
import { Button } from "~/web/components/ui-kit/button";
import { Field, Label } from "~/web/components/ui-kit/fieldset";
import { Input } from "~/web/components/ui-kit/input";
import { Textarea } from "~/web/components/ui-kit/textarea";
import { Heading } from "~/web/components/ui-kit/heading";
import { FormError } from "~/web/components/form-error";
import { FieldError } from "~/web/components/field-error";
import { parseForm, type ActionData } from "~/web/lib/form";
import { requireAdmin } from "~/web/lib/session.server";
import { requireControlPost } from "./request.server";
import type { Route } from "./+types/docs";

const proposalSchema = z.object({
  connectionId: z.uuid(),
  repositoryId: z.coerce.number().int().positive(),
  branch: z.string().min(1),
  path: z.string().regex(/\.md$/i),
  sha: z.string().regex(/^[0-9a-f]{40}$/),
  operation: z.uuid(),
  source: z.string(),
  title: z.string().trim().min(1, "Enter a pull request title.").max(256),
});

export async function loader({ context, request }: Route.LoaderArgs) {
  requireAdmin(context);
  const params = new URL(request.url).searchParams;
  try {
    return {
      data: await loadDocuments(params.get("path")),
      filesOpen: params.get("view") === "files",
      error: null,
    };
  } catch (error) {
    return { data: null, filesOpen: false, error: publicError(error) };
  }
}

export async function action({
  context,
  request,
}: Route.ActionArgs): Promise<ActionData & { pullUrl?: string }> {
  requireAdmin(context);
  requireControlPost(request);
  const { data, fieldErrors } = parseForm(await request.formData(), proposalSchema);
  if (fieldErrors) return { fieldErrors, formError: "Check the proposal details and try again." };
  try {
    return { pullUrl: await proposeDocument(data) };
  } catch (error) {
    return { formError: publicError(error) };
  }
}

// The action changes a proposal branch. Keep the published snapshot and any failed draft in place.
export function shouldRevalidate({
  formMethod,
  formAction,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (formMethod === "POST" && formAction?.split("?")[0] === "/control/docs") return false;
  return defaultShouldRevalidate;
}

export function meta() {
  return [{ title: "Docs · Control" }];
}

type DocsData = Awaited<ReturnType<typeof loadDocuments>>;
type Document = NonNullable<DocsData["document"]>;
type ReaderProps = { data: DocsData; file: Document };
const discardMessage = "Discard your changes to this document?";

function Editor({
  data,
  file,
  onClose,
  onSuccess,
}: ReaderProps & { onClose: () => void; onSuccess: (url: string) => void }) {
  const [base] = useState(() => ({
    sha: file.sha,
    source: file.source,
    connectionId: data.connectionId,
    repositoryId: data.repositoryId,
    branch: data.branch,
    path: file.path,
    operation: crypto.randomUUID(),
  }));
  const defaultTitle = "Update " + file.path;
  const [title, setTitle] = useState(defaultTitle);
  const [source, setSource] = useState(base.source);
  const [preview, setPreview] = useState(false);
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const dirty = source !== base.source || title !== defaultTitle;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm(discardMessage)) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useBeforeUnload(
    useCallback(
      (event) => {
        if (dirty) {
          event.preventDefault();
          event.returnValue = "";
        }
      },
      [dirty],
    ),
  );
  useEffect(() => {
    if (fetcher.data?.pullUrl) onSuccess(fetcher.data.pullUrl);
  }, [fetcher.data, onSuccess]);
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && source !== base.source)
          void fetcher.submit(
            { ...base, repositoryId: String(base.repositoryId), source, title },
            { method: "post" },
          );
      }}
    >
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-500/20 bg-white py-3 dark:bg-gray-950">
        <div className="flex gap-1 rounded-lg bg-zinc-500/10 p-1">
          {["Write", "Preview"].map((name, index) => (
            <button
              key={name}
              type="button"
              aria-pressed={preview === Boolean(index)}
              className={clsx(
                "rounded-md px-3 py-1 text-sm",
                preview === Boolean(index) && "bg-white font-medium shadow-sm dark:bg-zinc-700",
              )}
              onClick={() => setPreview(name === "Preview")}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            plain
            type="button"
            disabled={busy}
            onClick={() => {
              if (!dirty || window.confirm(discardMessage)) onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy || source === base.source}>
            {busy ? "Opening…" : "Open pull request"}
          </Button>
        </div>
      </div>
      <FormError actionData={fetcher.data} />
      <Field>
        <Label>Pull request title</Label>
        <Input
          required
          maxLength={256}
          value={title}
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
        />
        <FieldError name="title" actionData={fetcher.data} />
      </Field>
      {preview ? (
        <DocumentMarkdown {...data} path={file.path} source={source} />
      ) : (
        <Textarea
          aria-label="Markdown source"
          autoFocus
          rows={22}
          className="font-mono"
          value={source}
          disabled={busy}
          spellCheck={false}
          onChange={(event) => setSource(event.target.value)}
        />
      )}
    </form>
  );
}

function Reader({ data, file }: ReaderProps) {
  const [editing, setEditing] = useState(false);
  const [pullUrl, setPullUrl] = useState("");
  const onSuccess = useCallback((url: string) => {
    setPullUrl(url);
    setEditing(false);
  }, []);
  return (
    <>
      <Link
        className="mb-4 inline-flex shrink-0 items-center gap-1 self-start text-sm md:hidden"
        to={docsUrl(file.path) + "&view=files"}
      >
        <ArrowLeftIcon className="size-4" />
        Back to files
      </Link>
      <header className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-500/20 pb-3">
        <div className="min-w-0">
          <p className="mb-1 text-xs text-zinc-500">{data.branch}</p>
          <h2 className="font-mono text-sm font-medium break-all">{file.path}</h2>
        </div>
        {!editing && (
          <Button
            outline
            onClick={() => {
              setPullUrl("");
              setEditing(true);
            }}
          >
            <PencilSquareIcon data-slot="icon" />
            Edit
          </Button>
        )}
      </header>
      <div key={editing ? "editor" : "document"} className="min-h-0 flex-1 overflow-auto">
        {pullUrl && (
          <p role="status" className="mb-4 text-sm">
            Changes proposed.{" "}
            <a className="underline" href={pullUrl} target="_blank" rel="noreferrer">
              View pull request
            </a>
          </p>
        )}
        {editing ? (
          <Editor data={data} file={file} onClose={() => setEditing(false)} onSuccess={onSuccess} />
        ) : (
          <DocumentMarkdown {...data} path={file.path} source={file.source} />
        )}
      </div>
    </>
  );
}

export default function Docs({ loaderData: { data, error, filesOpen } }: Route.ComponentProps) {
  const file = data?.document;
  const showFiles = filesOpen || !file;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col text-zinc-950 dark:text-white">
      <Heading className="shrink-0">Docs</Heading>
      {error && (
        <div className="mt-4 min-h-0 space-y-2 overflow-y-auto">
          <FormError actionData={{ formError: error }} />
          <Link className="text-sm underline" to="/control/settings">
            Control Settings
          </Link>
        </div>
      )}
      {data && (
        <div className="mt-5 grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)] gap-6 border-t border-zinc-500/20 pt-4 md:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]">
          <aside
            className={clsx(
              !showFiles && "hidden",
              "min-h-0 overflow-y-auto md:block md:border-r md:border-zinc-500/20 md:pr-4",
            )}
          >
            <DocsNavigator paths={data.paths} selected={file?.path} />
          </aside>
          <section
            key={file && [data.connectionId, data.branch, file.path, filesOpen].join(":")}
            className={clsx(
              file && showFiles ? "hidden md:flex" : "flex",
              "min-h-0 min-w-0 flex-col",
            )}
          >
            {file ? (
              <Reader data={data} file={file} />
            ) : (
              <p className="text-sm text-zinc-500">{data.message}</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
