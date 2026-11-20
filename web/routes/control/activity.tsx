import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { z } from "zod";
import {
  createTask,
  findTaskSubmission,
  listTasks,
  matchesTaskSelection,
} from "~/control/db/repositories/tasks.server";
import { documentLabel } from "~/control/docs";
import { loadRepositorySkills } from "~/control/docs.server";
import { publicError } from "~/control/github.server";
import { parseControlPage, recordPageSizeOptions } from "~/control/pagination";
import { repositorySkillPath, taskTargetKinds } from "~/control/tasks";
import { DetailsFields, DetailsPanel, DetailsPanelBody } from "~/web/components/details-panel";
import { Badge } from "~/web/components/ui-kit/badge";
import { Button } from "~/web/components/ui-kit/button";
import { Heading } from "~/web/components/ui-kit/heading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/web/components/ui-kit/table";
import { Text } from "~/web/components/ui-kit/text";
import { parseForm, type ActionData } from "~/web/lib/form";
import { requireAdmin } from "~/web/lib/session.server";
import { useDetailsSelection } from "~/web/lib/use-details-selection";
import { Pagination } from "~/web/routes/items/Pagination";
import { RunTaskDialog } from "./RunTaskDialog";
import { requireControlPost } from "./request.server";
import type { Route } from "./+types/activity";

const submissionSchema = z.object({
  id: z.uuid(),
  connectionId: z.uuid(),
  targetKind: z.enum(taskTargetKinds, { error: "Select an issue or pull request." }),
  targetId: z.coerce.number().int().positive({ error: "Select an issue or pull request." }),
  skillPath: z.string().max(1024).regex(repositorySkillPath, "Select a repository skill."),
});
const createdAtFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export async function loader({ context, request }: Route.LoaderArgs) {
  const { user } = requireAdmin(context);
  const { page, pageSize } = parseControlPage(new URL(request.url).searchParams);
  return listTasks(user.organizationId, page, pageSize);
}

export async function action({
  context,
  request,
}: Route.ActionArgs): Promise<ActionData & { success?: true }> {
  const { user } = requireAdmin(context);
  requireControlPost(request);
  const { data, fieldErrors } = parseForm(await request.formData(), submissionSchema);
  if (fieldErrors) return { fieldErrors, formError: "Check the task details and try again." };

  const owner = { organizationId: user.organizationId, createdByUserId: user.id };
  const reusedId = {
    formError: "This submission already saved a different task. Reopen the dialog.",
  };

  try {
    const existing = await findTaskSubmission(owner, data.id);
    if (existing) return matchesTaskSelection(existing, data) ? { success: true } : reusedId;
  } catch {
    return { formError: "Could not save the task. Please try again." };
  }

  let catalog;
  try {
    catalog = await loadRepositorySkills(data.connectionId);
  } catch (error) {
    return { formError: publicError(error) };
  }
  const skill = catalog.skills.find(({ path }) => path === data.skillPath);
  if (!skill)
    return {
      fieldErrors: { skillPath: ["This skill is no longer available. Reopen the dialog."] },
    };

  try {
    const { outcome } = await createTask({
      ...data,
      ...owner,
      repositoryId: catalog.repositoryId,
      skillSha: skill.sha,
    });
    switch (outcome) {
      case "created":
        return { success: true };
      case "connection":
        return { formError: "The repository connection changed. Reopen the task dialog." };
      case "target":
        return { fieldErrors: { targetId: ["This GitHub record is no longer available."] } };
      case "conflict":
        return reusedId;
    }
  } catch {
    return { formError: "Could not save the task. Please try again." };
  }
}

export function meta() {
  return [{ title: "Activity · Control" }];
}

export default function Activity({ loaderData }: Route.ComponentProps) {
  const { tasks, page, pageSize, totalCount, totalPages } = loaderData;
  const { selected, open, select, close } = useDetailsSelection(tasks, (task) => task.id);
  const [params, setParams] = useSearchParams();
  const goToFirstPage = useCallback(() => {
    if (!params.has("page") || params.get("page") === "1") return;
    const firstPage = new URLSearchParams(params);
    firstPage.delete("page");
    setParams(firstPage, { replace: true, preventScrollReset: true });
  }, [params, setParams]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <Heading>Activity</Heading>
        <RunTaskDialog onCreated={goToFirstPage} />
      </header>
      {tasks.length ? (
        <>
          <div className="mt-4 min-h-0 min-w-0 overflow-auto rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/2.5">
            <Table bleed dense className="mx-0! [--gutter:--spacing(4)]">
              <TableHead>
                <TableRow>
                  <TableHeader scope="col">Issue or pull request</TableHeader>
                  <TableHeader scope="col">Skill</TableHeader>
                  <TableHeader scope="col">Status</TableHeader>
                  <TableHeader scope="col">Created (UTC)</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {tasks.map((task) => {
                  const createdAt = new Date(task.createdAt);
                  return (
                    <TableRow
                      key={task.id}
                      onOpen={() => select(task)}
                      title={`View task for #${task.targetNumber} ${task.targetTitle}`}
                    >
                      <TableCell className="w-full min-w-56 whitespace-normal">
                        <div className="font-medium wrap-anywhere">{task.targetTitle}</div>
                        <div className="text-xs/5 wrap-anywhere text-zinc-500 dark:text-zinc-400">
                          {task.repositoryName} · {task.targetKind === "issue" ? "Issue" : "PR"} #
                          {task.targetNumber}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-56 min-w-24 wrap-anywhere whitespace-normal">
                        {documentLabel(task.skillPath) ?? task.skillPath}
                      </TableCell>
                      <TableCell>
                        <Badge className="rounded-full! px-2! capitalize">{task.status}</Badge>
                      </TableCell>
                      <TableCell className="text-zinc-500 tabular-nums dark:text-zinc-400">
                        <time dateTime={createdAt.toISOString()}>
                          {createdAtFormat.format(createdAt)}
                        </time>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="shrink-0 overflow-x-auto">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalCount={totalCount}
              limit={pageSize}
              pageSizeOptions={recordPageSizeOptions}
            />
          </div>
        </>
      ) : (
        <Text className="mt-6" role="status">
          No tasks yet.
        </Text>
      )}
      <DetailsPanel
        open={open}
        onClose={close}
        title={selected ? `#${selected.targetNumber} ${selected.targetTitle}` : "Task details"}
        description={
          selected &&
          `${selected.repositoryName} · ${selected.targetKind === "issue" ? "Issue" : "Pull request"}`
        }
        actions={
          selected && (
            <Button href={selected.targetUrl} target="_blank" rel="noreferrer">
              Open in GitHub ↗
            </Button>
          )
        }
      >
        <DetailsPanelBody>
          {selected && (
            <DetailsFields
              fields={[
                {
                  label: "Status",
                  value: (
                    <Badge className="rounded-full! px-2! capitalize">{selected.status}</Badge>
                  ),
                },
                { label: "Skill", value: selected.skillPath },
                {
                  label: "Created (UTC)",
                  value: createdAtFormat.format(new Date(selected.createdAt)),
                },
              ]}
            />
          )}
        </DetailsPanelBody>
      </DetailsPanel>
    </div>
  );
}
