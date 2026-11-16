import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { issues, pullRequests, tasks, comments, sites } from "../schema/sites";
import { getSite } from "./sites";
import { stepLabels, transition } from "~/shared/workflow";

export async function getWorkspace(organizationId: number, siteId: number) {
  const site = await getSite(organizationId, siteId);
  if (!site) return null;
  const [issueRows, prs, taskRows, commentRows] = await Promise.all([
    db
      .select()
      .from(issues)
      .where(
        and(
          eq(issues.organizationId, organizationId),
          eq(issues.siteId, siteId),
          isNull(issues.deletedAt),
        ),
      )
      .orderBy(desc(issues.number)),
    db
      .select()
      .from(pullRequests)
      .where(
        and(
          eq(pullRequests.organizationId, organizationId),
          eq(pullRequests.siteId, siteId),
          isNull(pullRequests.deletedAt),
        ),
      ),
    db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, organizationId),
          eq(tasks.siteId, siteId),
          isNull(tasks.deletedAt),
        ),
      )
      .orderBy(desc(tasks.id)),
    db
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.organizationId, organizationId),
          eq(comments.siteId, siteId),
          isNull(comments.deletedAt),
        ),
      )
      .orderBy(desc(comments.id)),
  ]);
  return { site, issues: issueRows, pullRequests: prs, tasks: taskRows, comments: commentRows };
}
export async function advanceIssue(
  organizationId: number,
  siteId: number,
  number: number,
  version: number,
  outcome: "pass" | "changes" | "fail",
) {
  if (!(await getSite(organizationId, siteId))) throw new Error("Site not found.");
  return db.transaction(async (tx) => {
    const [issue] = await tx
      .select()
      .from(issues)
      .where(
        and(
          eq(issues.organizationId, organizationId),
          eq(issues.siteId, siteId),
          eq(issues.number, number),
          isNull(issues.deletedAt),
        ),
      )
      .for("update");
    if (!issue) throw new Error("Issue not found.");
    if (issue.version !== version) throw new Error("This issue changed. Refresh and try again.");
    const next = transition(issue, outcome);
    const scope = { organizationId, siteId, issueId: issue.id };
    let [pr] = await tx
      .select()
      .from(pullRequests)
      .where(
        and(
          eq(pullRequests.organizationId, organizationId),
          eq(pullRequests.siteId, siteId),
          eq(pullRequests.issueId, issue.id),
          isNull(pullRequests.deletedAt),
        ),
      )
      .orderBy(desc(pullRequests.id));
    if (issue.step === "build") {
      if (!pr || pr.state === "merged") {
        // Serialize PR numbering across issues within the same Site.
        await tx
          .select({ id: sites.id })
          .from(sites)
          .where(and(eq(sites.id, siteId), eq(sites.organizationId, organizationId)))
          .for("update");
        const [latest] = await tx
          .select({ number: pullRequests.number })
          .from(pullRequests)
          .where(
            and(eq(pullRequests.siteId, siteId), eq(pullRequests.organizationId, organizationId)),
          )
          .orderBy(desc(pullRequests.number))
          .limit(1);
        [pr] = await tx
          .insert(pullRequests)
          .values({
            ...scope,
            number: (latest?.number ?? 400) + 1,
            title: issue.title,
            branch: `demo/issue-${number}-v${version}`,
            body: `## Summary\n${issue.title}\n\n## How to validate\nRun configured project checks and inspect the acceptance criteria in issue #${number}.\n\n## Decisions\nFollow Wiki repository and retry guidance; preserve organization scoping.\n\n## Preview\nExample environment ready (simulated).`,
            preview: "Example preview environment · ready (simulated)",
          })
          .returning();
      } else {
        [pr] = await tx
          .update(pullRequests)
          .set({ revision: pr.revision + 1 })
          .where(
            and(
              eq(pullRequests.id, pr.id),
              eq(pullRequests.organizationId, organizationId),
              eq(pullRequests.siteId, siteId),
              isNull(pullRequests.deletedAt),
            ),
          )
          .returning();
      }
    }
    const actor = ["plan-review", "developer-approval", "product-approval"].includes(issue.step)
      ? ("human" as const)
      : ("agent" as const);
    const details: Partial<Record<typeof issue.step, string>> = {
      scope:
        "Scoped the delay to worker retries after mail-provider timeouts. Account creation stays outside delivery retries.",
      plan: "Plan: bound retries to three attempts, use exponential backoff, and preserve the stable job identifier. Acceptance: responsive signup, no duplicate mail, and recorded final failure.",
      risk: `Risk: ${issue.risk}. ${issue.productFacing ? "Product approval is required because delivery affects signup." : "Internal behavior change."}`,
      checks:
        "Simulated formatting, lint, typecheck, and focused unit checks passed for this revision.",
      "code-review":
        "Reviewed organization scoping, retry bounds, repository rules, and validation coverage for this revision.",
      "functional-review":
        "Simulated functional evidence matches the issue acceptance criteria. No live request or browser test was executed.",
      "update-main":
        "Simulated updating the branch from main. The PR is ready for merge and deployment to testing.",
      testing: "Simulated merge to main, deployment to testing, and verification passed.",
      production: "Simulated production promotion and verification passed. The issue is closed.",
    };
    const result =
      outcome === "pass"
        ? `${details[issue.step] ?? `${stepLabels[issue.step]} passed.`} Next: ${stepLabels[next.step]}.`
        : issue.step === "production"
          ? "Production verification failed. Rolled back; a fix PR is required."
          : issue.step === "testing"
            ? "Testing verification failed. A fix PR is required."
            : "Changes requested. Return for revision; previous reviews do not approve the next build.";
    await tx
      .update(tasks)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(tasks.issueId, issue.id),
          eq(tasks.organizationId, organizationId),
          eq(tasks.siteId, siteId),
          eq(tasks.status, "queued"),
          isNull(tasks.deletedAt),
        ),
      );
    const [task] = await tx
      .insert(tasks)
      .values({
        ...scope,
        pullRequestId: pr?.id,
        revision: pr?.revision,
        title: stepLabels[issue.step],
        stage: issue.stage,
        actor,
        status: outcome === "fail" ? "failed" : "completed",
        result,
        evidence: `Simulated evidence for issue #${number}${pr ? `, PR #${pr.number} revision ${pr.revision}` : ""}. Sources: issue acceptance criteria and Blueprint Wiki.`,
      })
      .returning();
    await tx.insert(comments).values({
      ...scope,
      pullRequestId: pr?.id,
      revision: pr?.revision,
      taskId: task.id,
      author: actor === "human" ? "Demo visitor" : "Demo agent",
      body: result,
    });
    if (pr && issue.step === "testing")
      await tx
        .update(pullRequests)
        .set({ state: "merged" })
        .where(
          and(
            eq(pullRequests.id, pr.id),
            eq(pullRequests.organizationId, organizationId),
            eq(pullRequests.siteId, siteId),
            isNull(pullRequests.deletedAt),
          ),
        );
    await tx
      .update(issues)
      .set({
        ...next,
        version: version + 1,
        ...(issue.step === "plan"
          ? {
              body:
                issue.body.split("\n\n## Current plan revision")[0] +
                `\n\n## Current plan revision\nRevision ${version + 1}: follow the scoped acceptance criteria and resolve prior issue comments before building.`,
            }
          : {}),
      })
      .where(
        and(
          eq(issues.id, issue.id),
          eq(issues.organizationId, organizationId),
          eq(issues.siteId, siteId),
          isNull(issues.deletedAt),
        ),
      );
    if (next.step !== "done")
      await tx.insert(tasks).values({
        ...scope,
        pullRequestId: pr?.id,
        revision: pr?.revision,
        title: stepLabels[next.step],
        stage: next.stage,
        status: "queued",
      });
    return next;
  });
}
