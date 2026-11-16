import { Form, Link, useNavigation } from "react-router";
import { z } from "zod";
import { advanceIssue, getWorkspace } from "~/db/repositories/issues";
import { getAuthenticatedUser } from "~/web/lib/session.server";
import { parseForm } from "~/web/lib/form";
import { Heading, Subheading } from "~/web/components/ui-kit/heading";
import { Button } from "~/web/components/ui-kit/button";
import { Input } from "~/web/components/ui-kit/input";
import { FormError } from "~/web/components/form-error";
import { SystemMap } from "~/web/components/system-map";
import { DetailLayout } from "~/web/components/detail-layout";
import { components, documents, traces } from "~/shared/blueprint";
import { stepLabels } from "~/shared/workflow";
import { Badge } from "~/web/components/ui-kit/badge";
import { Field, Label } from "~/web/components/ui-kit/fieldset";
import { Navbar, NavbarItem, NavbarSection } from "~/web/components/ui-kit/navbar";
import { Text, TextLink } from "~/web/components/ui-kit/text";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/web/components/ui-kit/table";
import type { Route } from "./+types/workspace";
const views = ["health", "io", "activity", "wiki", "issues", "pulls"] as const;
export async function loader({ context, params, request }: Route.LoaderArgs) {
  const id = Number(params.siteId);
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    (params.view && !views.includes(params.view as (typeof views)[number]))
  )
    throw new Response("Not found", { status: 404 });
  const workspace = await getWorkspace(getAuthenticatedUser(context).organizationId, id);
  if (!workspace) throw new Response("Not found", { status: 404 });
  if (params.view === "issues" && !workspace.issues.some((i) => i.number === Number(params.number)))
    throw new Response("Issue not found", { status: 404 });
  if (
    params.view === "pulls" &&
    !workspace.pullRequests.some((p) => p.number === Number(params.number))
  )
    throw new Response("PR not found", { status: 404 });
  const query = Object.fromEntries(new URL(request.url).searchParams);
  return { ...workspace, view: params.view ?? "overview", number: Number(params.number), query };
}
export async function action({ context, params, request }: Route.ActionArgs) {
  const user = getAuthenticatedUser(context);
  const { data, fieldErrors } = parseForm(
    await request.formData(),
    z.object({
      number: z.coerce.number().int().positive(),
      version: z.coerce.number().int().nonnegative(),
      outcome: z.enum(["pass", "changes", "fail"]),
    }),
  );
  if (fieldErrors) return { formError: "Invalid workflow action." };
  try {
    await advanceIssue(
      user.organizationId,
      Number(params.siteId),
      data.number,
      data.version,
      data.outcome,
    );
    return {};
  } catch (error) {
    return {
      formError: error instanceof Error ? error.message : "The action could not be completed.",
    };
  }
}
function Copy({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-sm/7">
      {text
        .split("\n")
        .filter(Boolean)
        .map((line, i) =>
          line.startsWith("## ") ? (
            <Subheading level={3} key={i} className="pt-3">
              {line.slice(3)}
            </Subheading>
          ) : (
            <Text key={i}>{line}</Text>
          ),
        )}
    </div>
  );
}
function Stage({ value }: { value: string }) {
  return (
    <Badge
      color={
        value === "prepare"
          ? "blue"
          : value === "build"
            ? "emerald"
            : value === "review"
              ? "amber"
              : "violet"
      }
    >
      {value === "review" ? "Review & test" : value}
    </Badge>
  );
}
export default function Workspace({ loaderData: d, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const base = `/sites/${d.site.id}`;
  const component = components.find((c) => c.key === d.query.component);
  const trace = traces.find((t) => t.id === d.query.trace) ?? traces[0];
  const doc = documents.find((doc) => doc.key === d.query.doc);
  const pr = d.view === "pulls" ? d.pullRequests.find((p) => p.number === d.number) : undefined;
  const issue = d.issues.find((i) => (pr ? i.id === pr.issueId : i.number === d.number));
  const rows = d.query.status ? d.tasks.filter((t) => t.status === d.query.status) : d.tasks;
  const taskLink = (task: (typeof d.tasks)[number]) => {
    const p = d.pullRequests.find((p) => p.id === task.pullRequestId);
    const i = d.issues.find((i) => i.id === task.issueId);
    return p
      ? `${base}/pulls/${p.number}#task-${task.id}`
      : `${base}/issues/${i?.number}#task-${task.id}`;
  };
  const activity = (limit?: number) =>
    rows.length ? (
      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Task</TableHeader>
              <TableHeader>Stage</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.slice(0, limit).map((task) => (
              <TableRow key={task.id} href={taskLink(task)} title={task.title}>
                <TableCell className="min-w-40 whitespace-normal">
                  <span className="font-medium">{task.title}</span>
                  <span className="mt-1 block text-zinc-500 dark:text-zinc-400">
                    Issue #{d.issues.find((i) => i.id === task.issueId)?.number} · {task.status} ·{" "}
                    {task.actor}
                  </span>
                </TableCell>
                <TableCell>
                  <Stage value={task.stage} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    ) : (
      <div className="mt-4 rounded-lg bg-zinc-50 py-12 text-center dark:bg-zinc-900">
        <Text>No tasks in this filter.</Text>
      </div>
    );
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <Heading>{d.site.name}</Heading>
        <span className="text-xs text-zinc-500">
          {d.site.repositoryOwner}/{d.site.repositoryName} · Example repository
        </span>
      </div>
      <Text className="mt-2 mb-6">
        Interactive demo · telemetry, GitHub records, agent results, and releases are simulated.
      </Text>
      <FormError actionData={actionData} />
      {d.view === "overview" && (
        <>
          <div className="grid gap-6 border-b border-zinc-950/10 pb-6 sm:grid-cols-3 dark:border-white/10">
            <Link to={`${base}/health`}>
              <p className="text-sm text-zinc-500">Health</p>
              <p className="mt-2 text-3xl font-semibold">18/21</p>
              <p className="mt-2 text-xs text-amber-600">Email delivery needs attention</p>
            </Link>
            <Link to={`${base}/io`}>
              <p className="text-sm text-zinc-500">I/O</p>
              <p className="mt-2 text-3xl font-semibold">
                300 <span className="text-sm font-normal">req/s</span>
              </p>
              <p className="mt-2 text-xs text-zinc-500">p95 142 ms</p>
            </Link>
            <Link to={`${base}/io`}>
              <p className="text-sm text-zinc-500">Throughput · last hour</p>
              <svg
                viewBox="0 0 240 65"
                role="img"
                aria-label="Example throughput varied between 180 and 320 requests per second"
                className="mt-2 h-16 w-full"
              >
                {[
                  32, 40, 27, 45, 38, 50, 41, 36, 55, 48, 42, 51, 45, 39, 52, 46, 56, 48, 42, 50,
                ].map((h, i) => (
                  <rect
                    key={i}
                    x={i * 12}
                    y={65 - h}
                    width="7"
                    height={h}
                    className="fill-zinc-400 dark:fill-zinc-600"
                  />
                ))}
              </svg>
            </Link>
          </div>
          <div className="mt-6 grid gap-8 xl:grid-cols-[2fr_3fr]">
            <section className="min-w-0">
              <Subheading>Recent activity</Subheading>
              {activity(5)}
              <Text className="mt-4">
                <TextLink href={`${base}/activity`}>All activity →</TextLink>
              </Text>
            </section>
            <section className="min-w-0">
              <Subheading>Connected system</Subheading>
              <SystemMap href={(key) => `${base}/health?component=${key}`} />
              <Text>
                <TextLink href={`${base}/issues/349`}>
                  Start here: investigate delayed confirmation emails →
                </TextLink>
              </Text>
            </section>
          </div>
        </>
      )}
      {d.view === "health" && (
        <DetailLayout
          label="Component telemetry"
          closeHref={`${base}/health`}
          panel={
            component && (
              <>
                <div className="flex justify-between">
                  <Subheading>{component.name}</Subheading>
                  <Button
                    plain
                    aria-label="Close telemetry panel"
                    href={`${base}/health`}
                    preventScrollReset
                  >
                    ✕
                  </Button>
                </div>
                <p className="my-4 text-2xl">{component.metric}</p>
                <Text>{component.detail}</Text>
                <Text className="mt-4">
                  {component.checks ? `${component.checks} checks passing` : component.source}
                </Text>
                <Subheading className="mt-6">Related traces</Subheading>
                {traces
                  .filter((t) => t.spans.some((s) => s.component === component.key))
                  .map((t) => (
                    <TextLink
                      className="my-3 block text-sm underline"
                      key={t.id}
                      href={`${base}/io?trace=${t.id}`}
                    >
                      {t.name} · {t.status}
                    </TextLink>
                  ))}
                <Subheading className="mt-6">Issues</Subheading>
                {d.issues
                  .filter(
                    (i) =>
                      i.componentKey === component.key ||
                      (component.key === "queue" && i.number === 349),
                  )
                  .map((i) => (
                    <TextLink
                      key={i.id}
                      className="my-3 block text-sm underline"
                      href={`${base}/issues/${i.number}`}
                    >
                      #{i.number} · {i.title}
                    </TextLink>
                  ))}
              </>
            )
          }
        >
          <section className="min-w-0">
            <Subheading>Application health</Subheading>
            <SystemMap
              selected={component?.key}
              href={(key) => `${base}/health?component=${key}`}
            />
          </section>
        </DetailLayout>
      )}
      {d.view === "io" && (
        <>
          <Form method="get" className="mb-6 flex max-w-lg gap-3">
            <Field className="grow">
              <Label>Search by trace ID</Label>
              <Input name="q" defaultValue={d.query.q} />
            </Field>
            <Button type="submit" className="self-end">
              Search
            </Button>
          </Form>
          <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
            <ul>
              {traces
                .filter((t) => !d.query.q || t.id.includes(d.query.q))
                .map((t) => (
                  <li key={t.id}>
                    <Link
                      aria-current={trace.id === t.id ? "true" : undefined}
                      className="my-2 block rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                      to={`${base}/io?trace=${t.id}`}
                    >
                      <span className="block font-medium">{t.name}</span>
                      <span className="text-xs break-all text-zinc-500">
                        {t.id} · {t.status}
                      </span>
                    </Link>
                  </li>
                ))}
              {d.query.q && !traces.some((t) => t.id.includes(d.query.q)) && (
                <li className="text-sm text-zinc-500">No matching trace.</li>
              )}
            </ul>
            <div className="min-w-0">
              <Subheading>{trace.name}</Subheading>
              <SystemMap trace={trace} href={(key) => `${base}/health?component=${key}`} />
              <div className="overflow-x-auto">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Span</TableHeader>
                      <TableHeader className="text-right">Duration</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {trace.spans.map((span, i) => (
                      <TableRow key={i}>
                        <TableCell className="w-full min-w-40 whitespace-normal">
                          {i + 1}. {span.name}
                          <span
                            className="mt-2 block h-1 rounded bg-zinc-300 dark:bg-zinc-600"
                            style={{
                              width: `${Math.max(3, (span.ms / Math.max(...trace.spans.map((s) => s.ms))) * 100)}%`,
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-right text-zinc-500 dark:text-zinc-400">
                          {span.ms.toLocaleString()} ms
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {trace.status === "error" && (
                <TextLink href={`${base}/issues/349`} className="mt-4 block text-sm underline">
                  Investigate issue #349 →
                </TextLink>
              )}
            </div>
          </div>
        </>
      )}
      {d.view === "activity" && (
        <>
          <Navbar
            aria-label="Activity filters"
            className="mb-6 overflow-x-auto border-b border-zinc-950/10 dark:border-white/10"
          >
            <NavbarSection>
              {["", "queued", "completed", "failed"].map((status) => (
                <NavbarItem
                  current={(d.query.status ?? "") === status}
                  aria-current={(d.query.status ?? "") === status ? "page" : undefined}
                  className="shrink-0 capitalize"
                  key={status}
                  href={`${base}/activity${status ? `?status=${status}` : ""}`}
                >
                  {status || "All"}
                </NavbarItem>
              ))}
            </NavbarSection>
          </Navbar>
          {activity()}
          <Subheading className="mt-10">Issues</Subheading>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Issue</TableHeader>
                  <TableHeader>Stage</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {d.issues.map((i) => (
                  <TableRow
                    key={i.id}
                    href={`${base}/issues/${i.number}`}
                    title={`Issue #${i.number}: ${i.title}`}
                  >
                    <TableCell className="font-medium whitespace-normal">
                      #{i.number} · {i.title}
                    </TableCell>
                    <TableCell>
                      <Stage value={i.stage} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      {d.view === "wiki" && (
        <>
          <Form method="get" className="mb-6 flex max-w-lg gap-3">
            <Field className="grow">
              <Label>Search Wiki</Label>
              <Input name="q" defaultValue={d.query.q} />
            </Field>
            <Button type="submit" className="self-end">
              Search
            </Button>
          </Form>
          <DetailLayout
            label="Wiki document"
            closeHref={`${base}/wiki${d.query.q ? `?q=${encodeURIComponent(d.query.q)}` : ""}`}
            panel={
              doc && (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <Subheading>{doc.title}</Subheading>
                    <Button
                      plain
                      aria-label="Close Wiki panel"
                      href={`${base}/wiki${d.query.q ? `?q=${encodeURIComponent(d.query.q)}` : ""}`}
                      preventScrollReset
                    >
                      ✕
                    </Button>
                  </div>
                  <Text className="my-4">{doc.body}</Text>
                  <div className="flex flex-wrap gap-4">
                    {doc.links.map((key) => (
                      <TextLink
                        key={key}
                        className="text-sm underline"
                        href={`${base}/wiki?doc=${key}`}
                        preventScrollReset
                      >
                        {documents.find((n) => n.key === key)?.title}
                      </TextLink>
                    ))}
                    {doc.key === "decisions" && (
                      <TextLink className="text-sm underline" href={`${base}/issues/349`}>
                        Issue #349
                      </TextLink>
                    )}
                  </div>
                </>
              )
            }
          >
            <div className="grid gap-8 sm:grid-cols-[200px_minmax(0,1fr)]">
              <ul>
                {documents
                  .filter(
                    (n) =>
                      !d.query.q ||
                      `${n.title} ${n.body}`.toLowerCase().includes(d.query.q.toLowerCase()),
                  )
                  .map((n) => (
                    <li key={n.key}>
                      <TextLink
                        href={`${base}/wiki?doc=${n.key}`}
                        preventScrollReset
                        className="my-3 block text-sm underline"
                      >
                        {n.title}
                      </TextLink>
                    </li>
                  ))}
              </ul>
              <div>
                <svg
                  viewBox="0 0 650 380"
                  role="group"
                  aria-label="Connected blueprint documentation"
                  className="w-full"
                >
                  {documents.flatMap((n) =>
                    n.links.map((key) => {
                      const other = documents.find((o) => o.key === key)!;
                      return (
                        <line
                          key={`${n.key}-${key}`}
                          x1={n.x}
                          y1={n.y}
                          x2={other.x}
                          y2={other.y}
                          className="stroke-zinc-300 dark:stroke-zinc-700"
                        />
                      );
                    }),
                  )}
                  {documents.map((n) => (
                    <Link key={n.key} to={`${base}/wiki?doc=${n.key}`} preventScrollReset>
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r="8"
                        className={doc?.key === n.key ? "fill-blue-500" : "fill-zinc-500"}
                      />
                      <text
                        x={n.x}
                        y={n.y + 24}
                        textAnchor="middle"
                        className="fill-zinc-700 text-[12px] dark:fill-zinc-300"
                      >
                        {n.title}
                      </text>
                    </Link>
                  ))}
                </svg>
              </div>
            </div>
          </DetailLayout>
        </>
      )}
      {(d.view === "issues" || d.view === "pulls") && issue && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Subheading>
              {pr ? `PR #${pr.number}` : `Issue #${issue.number}`} · {pr?.title ?? issue.title}
            </Subheading>
            <Stage value={issue.stage} />
          </div>
          <p className="mt-3 text-sm text-zinc-500">
            {pr
              ? `${pr.state} · revision ${pr.revision} · ${pr.branch}`
              : `${issue.state} · ${issue.risk} risk${issue.productFacing ? " · product approval required" : ""}`}
          </p>
          {pr && (
            <>
              <TextLink
                href={`${base}/issues/${issue.number}`}
                className="mt-3 block text-sm underline"
              >
                Linked issue #{issue.number}
              </TextLink>
              <Text className="my-4">{pr.preview}</Text>
            </>
          )}
          <div className="grid gap-10 lg:grid-cols-[3fr_2fr]">
            <section className="min-w-0">
              <Copy text={pr?.body ?? issue.body} />
              {!pr && (
                <div className="mt-5 space-y-3 text-sm">
                  {issue.componentKey && (
                    <TextLink
                      className="block underline"
                      href={`${base}/health?component=${issue.componentKey}`}
                    >
                      Component telemetry →
                    </TextLink>
                  )}
                  {issue.traceKey && (
                    <TextLink
                      className="block underline"
                      href={`${base}/io?trace=${issue.traceKey}`}
                    >
                      Source trace →
                    </TextLink>
                  )}
                  {d.pullRequests
                    .filter((p) => p.issueId === issue.id)
                    .map((p) => (
                      <TextLink
                        key={p.id}
                        className="block underline"
                        href={`${base}/pulls/${p.number}`}
                      >
                        PR #{p.number} · {p.state} · revision {p.revision}
                      </TextLink>
                    ))}
                </div>
              )}
            </section>
            <section className="self-start rounded-lg border border-zinc-950/10 p-6 dark:border-white/10">
              <Subheading>{stepLabels[issue.step]}</Subheading>
              <Text className="my-4">
                Advance the guided simulation. Reviews and approvals apply to the current build
                revision.
              </Text>
              {issue.step !== "done" && (
                <Form method="post" className="flex flex-wrap gap-3">
                  <input type="hidden" name="number" value={issue.number} />
                  <input type="hidden" name="version" value={issue.version} />
                  <Button type="submit" name="outcome" value="pass" disabled={busy}>
                    {issue.step.includes("approval") || issue.step === "plan-review"
                      ? "Simulate approval"
                      : "Run demo step"}
                  </Button>
                  {[
                    "plan-review",
                    "code-review",
                    "functional-review",
                    "developer-approval",
                    "product-approval",
                  ].includes(issue.step) && (
                    <Button outline type="submit" name="outcome" value="changes" disabled={busy}>
                      Request changes
                    </Button>
                  )}
                  {["checks", "testing", "production"].includes(issue.step) && (
                    <Button outline type="submit" name="outcome" value="fail" disabled={busy}>
                      Simulate failure
                    </Button>
                  )}
                </Form>
              )}
            </section>
          </div>
          <Subheading className="mt-10">Tasks and evidence</Subheading>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {d.tasks
              .filter((t) => t.issueId === issue.id && (!pr || t.pullRequestId === pr.id))
              .map((t) => (
                <section key={t.id} id={`task-${t.id}`} className="scroll-mt-8 py-5">
                  <div className="flex justify-between gap-4 text-sm font-medium">
                    <span>
                      {t.title} · {t.status}
                      {t.revision ? ` · revision ${t.revision}` : ""}
                    </span>
                    <Stage value={t.stage} />
                  </div>
                  <Text className="mt-2">{t.result}</Text>
                  {t.evidence && <p className="mt-2 text-xs text-zinc-500">{t.evidence}</p>}
                </section>
              ))}
          </div>
          <Subheading className="mt-6">Comments and decisions</Subheading>
          {d.comments
            .filter((c) => c.issueId === issue.id && (!pr || c.pullRequestId === pr.id))
            .map((c) => (
              <div key={c.id} className="border-b border-zinc-200 py-4 dark:border-zinc-800">
                <p className="text-xs font-medium">
                  {c.author}
                  {c.revision ? ` · revision ${c.revision}` : ""}
                </p>
                <Text className="mt-2">{c.body}</Text>
              </div>
            ))}
        </>
      )}
    </>
  );
}
