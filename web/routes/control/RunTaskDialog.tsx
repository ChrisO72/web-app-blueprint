import { PlayIcon } from "@heroicons/react/16/solid";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import {
  defaultTaskEffort,
  defaultTaskModel,
  taskEffortLabels,
  taskEfforts,
  taskModelLabels,
  taskModels,
  taskTargetSearch,
  type TaskSkill,
  type TaskTarget,
} from "~/control/tasks";
import { FieldError } from "~/web/components/field-error";
import { FormError } from "~/web/components/form-error";
import { Button } from "~/web/components/ui-kit/button";
import {
  Combobox,
  ComboboxDescription,
  ComboboxLabel,
  ComboboxOption,
} from "~/web/components/ui-kit/combobox";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "~/web/components/ui-kit/dialog";
import { Field, Label } from "~/web/components/ui-kit/fieldset";
import { Select } from "~/web/components/ui-kit/select";
import { Text, TextLink } from "~/web/components/ui-kit/text";
import { useFetcherToast } from "~/web/lib/use-fetcher-toast";
import type { action } from "./activity";
import type { loader as optionsLoader } from "./activity-options";

const optionsUrl = "/control/activity/options";
const emptyTargets: TaskTarget[] = [];
const emptySkills: TaskSkill[] = [];

function targetLabel(target: TaskTarget) {
  return `#${target.number} ${target.title}`;
}

function PickerError({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      <Text role="status">{error}</Text>
      <Button plain type="button" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}

export function RunTaskDialog({
  runnerEnabled,
  onCreated,
}: {
  runnerEnabled: boolean;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [submissionId, setSubmissionId] = useState("");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<(TaskTarget & { connectionId: string }) | null>(null);
  const [skill, setSkill] = useState<TaskSkill | null>(null);
  const targetFetcher = useFetcher<typeof optionsLoader>();
  const skillFetcher = useFetcher<typeof optionsLoader>();
  const creation = useFetcher<typeof action>();
  const busy = creation.state !== "idle";
  useFetcherToast(creation, { success: runnerEnabled ? "Task queued" : "Task created" });

  const { load: loadTargets } = targetFetcher;
  const targetUrl = optionsUrl + "?" + new URLSearchParams({ q: query });
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void loadTargets(targetUrl), query ? 200 : 0);
    return () => window.clearTimeout(timer);
  }, [open, query, targetUrl, loadTargets]);

  useEffect(() => {
    if (open && !busy && creation.data?.success) {
      setOpen(false);
      onCreated();
    }
  }, [open, busy, creation.data, onCreated]);

  const targetResult =
    targetFetcher.data?.kind === "targets" && targetFetcher.data.query === query
      ? targetFetcher.data
      : undefined;
  const skillResult = skillFetcher.data?.kind === "skills" ? skillFetcher.data : undefined;
  const targetLoading = !targetResult || targetFetcher.state !== "idle";
  const skillLoading = !skillResult || skillFetcher.state !== "idle";
  const disconnected = targetResult && "disconnected" in targetResult;
  const targetOptions =
    !targetLoading && targetResult && "targets" in targetResult ? targetResult : null;
  const skillOptions = skillResult?.skills ?? emptySkills;
  const skillConnectionId = skillResult?.connectionId;
  const connectionChanged =
    skillConnectionId &&
    ((targetOptions && targetOptions.connectionId !== skillConnectionId) ||
      (target && target.connectionId !== skillConnectionId));
  const canCreate =
    target &&
    skill &&
    skillConnectionId === target.connectionId &&
    !skillLoading &&
    !connectionChanged &&
    !disconnected;

  function loadSkills() {
    void skillFetcher.load(optionsUrl + "?kind=skills");
  }

  function resetSubmission() {
    setSubmissionId(crypto.randomUUID());
    creation.reset();
  }

  function openDialog() {
    setTarget(null);
    setSkill(null);
    setQuery("");
    targetFetcher.reset();
    skillFetcher.reset();
    resetSubmission();
    setOpen(true);
    loadSkills();
  }

  return (
    <>
      <Button onClick={openDialog}>
        <PlayIcon data-slot="icon" />
        Run task
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
      >
        <DialogTitle>Run task</DialogTitle>
        <DialogDescription>Choose a GitHub issue or pull request and a skill.</DialogDescription>
        <DialogBody>
          <creation.Form
            id="control-create-task"
            method="post"
            action="/control/activity"
            className="space-y-5"
            onSubmit={(event) => {
              if (busy || !canCreate) event.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={submissionId} />
            <input type="hidden" name="connectionId" value={target?.connectionId ?? ""} />
            <input type="hidden" name="targetKind" value={target?.kind ?? ""} />
            <input type="hidden" name="targetId" value={target?.githubId ?? ""} />
            <input type="hidden" name="skillPath" value={skill?.path ?? ""} />
            <FormError actionData={creation.data} />
            <Field>
              <Label>Issue or pull request</Label>
              <Combobox
                options={targetOptions?.targets ?? emptyTargets}
                value={target}
                by={(a, b) => a?.kind === b?.kind && a?.githubId === b?.githubId}
                displayValue={(item) => (item ? targetLabel(item) : "")}
                onChange={(item) => {
                  if (item && !targetOptions) return;
                  if (
                    item?.kind === target?.kind &&
                    item?.githubId === target?.githubId &&
                    targetOptions?.connectionId === target?.connectionId
                  )
                    return;
                  setTarget(
                    item && targetOptions
                      ? { ...item, connectionId: targetOptions.connectionId }
                      : null,
                  );
                  resetSubmission();
                }}
                onQueryChange={(value) => setQuery(taskTargetSearch.parse(value))}
                aria-label="Issue or pull request"
                placeholder="Search by title or #number"
                invalid={Boolean(creation.data?.fieldErrors?.targetId)}
                disabled={busy || disconnected}
                autoFocus
              >
                {(item) => (
                  <ComboboxOption value={item}>
                    <ComboboxLabel>{targetLabel(item)}</ComboboxLabel>
                    <ComboboxDescription>
                      {item.kind === "issue" ? "Issue" : "PR"}
                    </ComboboxDescription>
                  </ComboboxOption>
                )}
              </Combobox>
              <FieldError name="targetId" actionData={creation.data} />
              {targetLoading && <Text role="status">Loading GitHub records…</Text>}
              {!targetLoading && disconnected && (
                <Text role="status">
                  Connect a repository in{" "}
                  <TextLink href="/control/settings">Control Settings</TextLink>.
                </Text>
              )}
              {!targetLoading && targetResult?.error && (
                <PickerError error={targetResult.error} retry={() => void loadTargets(targetUrl)} />
              )}
              {targetOptions && !targetOptions.targets.length && (
                <Text role="status">
                  {query
                    ? "No issues or pull requests match your search."
                    : "No synced issues or pull requests yet."}
                </Text>
              )}
            </Field>
            <Field>
              <Label>Skill</Label>
              <Combobox
                options={skillLoading ? emptySkills : skillOptions}
                value={skill}
                by="path"
                displayValue={(item) => item?.name}
                onChange={(item) => {
                  if (item?.path === skill?.path) return;
                  setSkill(item);
                  resetSubmission();
                }}
                aria-label="Skill"
                placeholder="Search repository skills"
                invalid={Boolean(creation.data?.fieldErrors?.skillPath)}
                disabled={busy || skillLoading || !skillOptions.length || disconnected}
              >
                {(item) => (
                  <ComboboxOption value={item}>
                    <ComboboxLabel>{item.name}</ComboboxLabel>
                  </ComboboxOption>
                )}
              </Combobox>
              <FieldError name="skillPath" actionData={creation.data} />
              {!disconnected && skillLoading && (
                <Text role="status">Loading repository skills…</Text>
              )}
              {!disconnected && !skillLoading && skillResult?.error && (
                <PickerError error={skillResult.error} retry={loadSkills} />
              )}
              {!disconnected && !skillLoading && skillResult?.skills && !skillOptions.length && (
                <Text role="status">No repository skills found on the default branch.</Text>
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <Label>Model</Label>
                <Select
                  name="model"
                  defaultValue={defaultTaskModel}
                  onChange={resetSubmission}
                  disabled={busy}
                >
                  {taskModels.map((model) => (
                    <option key={model} value={model}>
                      {taskModelLabels[model]}
                    </option>
                  ))}
                </Select>
                <FieldError name="model" actionData={creation.data} />
              </Field>
              <Field>
                <Label>Effort</Label>
                <Select
                  name="effort"
                  defaultValue={defaultTaskEffort}
                  onChange={resetSubmission}
                  disabled={busy}
                >
                  {taskEfforts.map((effort) => (
                    <option key={effort} value={effort}>
                      {taskEffortLabels[effort]}
                    </option>
                  ))}
                </Select>
                <FieldError name="effort" actionData={creation.data} />
              </Field>
            </div>
            {!disconnected && connectionChanged && (
              <Text role="status">The repository connection changed. Reopen the task dialog.</Text>
            )}
          </creation.Form>
        </DialogBody>
        <DialogActions>
          <Button plain type="button" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="control-create-task" disabled={busy || !canCreate}>
            {runnerEnabled ? (busy ? "Queuing…" : "Run task") : busy ? "Creating…" : "Create task"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
