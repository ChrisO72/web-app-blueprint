import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { sites, issues, tasks, pullRequests, comments } from "../schema/sites";
import { issueBody } from "~/shared/blueprint";
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function seedSite(tx: Transaction, organizationId: number, name = "Blueprint") {
  const [site] = await tx.insert(sites).values({ organizationId, name }).returning();
  const scope = { organizationId, siteId: site.id };
  const examples = [
    {
      number: 349,
      title: "Confirmation emails delayed by immediate retries",
      step: "scope" as const,
      stage: "prepare" as const,
      risk: "high" as const,
      productFacing: true,
    },
    {
      number: 355,
      title: "Improve account profile validation",
      step: "build" as const,
      stage: "build" as const,
      risk: "low" as const,
      productFacing: false,
    },
    {
      number: 389,
      title: "Review private avatar access",
      step: "code-review" as const,
      stage: "review" as const,
      risk: "high" as const,
      productFacing: false,
    },
    {
      number: 322,
      title: "Release clearer queue diagnostics",
      step: "update-main" as const,
      stage: "deploy" as const,
      risk: "low" as const,
      productFacing: false,
    },
  ];
  for (const example of examples) {
    const [issue] = await tx
      .insert(issues)
      .values({
        ...scope,
        ...example,
        body:
          example.number === 349
            ? issueBody
            : `## Scope\n${example.title}.\n\n## Acceptance criteria\nFollow repository rules and pass configured checks.\n\n## Plan\nMake the focused change, review the result, and release.\n\n## References\nBlueprint Wiki.`,
        componentKey: example.number === 349 ? "worker" : "api",
        traceKey: example.number === 349 ? "trace-confirmation-349" : null,
      })
      .returning();
    let prId: number | undefined;
    if ([389, 322].includes(example.number)) {
      const [pr] = await tx
        .insert(pullRequests)
        .values({
          ...scope,
          issueId: issue.id,
          number: example.number + 100,
          title: example.title,
          branch: `demo/issue-${example.number}`,
          body: "Summary: focused blueprint improvement.\nValidation: configured checks passed (simulated).\nDecision: follow repository ownership rules.\nReferences: issue and Wiki.",
          preview: "Example preview environment · ready (simulated)",
        })
        .returning();
      prId = pr.id;
    }
    await tx.insert(tasks).values({
      ...scope,
      issueId: issue.id,
      pullRequestId: prId,
      revision: prId ? 1 : null,
      stage: issue.stage,
      title: example.number === 349 ? "Scope problem" : example.title,
      status: example.number === 355 ? "failed" : "queued",
      result:
        example.number === 355
          ? "Example check failure: validation message needs revision."
          : "Waiting for the next demo action.",
    });
    await tx.insert(comments).values({
      ...scope,
      issueId: issue.id,
      author: "Demo maintainer",
      body: "Follow the issue through the workflow. All evidence and actions in this workspace are simulated.",
    });
  }
  const [released] = await tx
    .insert(issues)
    .values({
      ...scope,
      number: 301,
      title: "Add storage ownership checks",
      body: "Private files are scoped to the current organization. Released after review.",
      stage: "done",
      step: "done",
      state: "closed",
    })
    .returning();
  await tx.insert(tasks).values({
    ...scope,
    issueId: released.id,
    stage: "deploy",
    title: "Verify production release",
    status: "completed",
    result: "Production verification passed. Issue closed (simulated).",
    evidence: "Storage ownership checks passed.",
  });
  return site;
}
export async function listSites(organizationId: number) {
  return db
    .select()
    .from(sites)
    .where(and(eq(sites.organizationId, organizationId), isNull(sites.deletedAt)))
    .orderBy(asc(sites.id));
}
export async function getSite(
  organizationId: number,
  siteId: number,
): Promise<typeof sites.$inferSelect | null> {
  const [site] = await db
    .select()
    .from(sites)
    .where(
      and(eq(sites.organizationId, organizationId), eq(sites.id, siteId), isNull(sites.deletedAt)),
    );
  return site ?? null;
}
export async function createSite(organizationId: number, name: string) {
  return db.transaction((tx) => seedSite(tx, organizationId, name));
}
