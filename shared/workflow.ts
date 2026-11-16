import type { issues } from "~/db/schema/sites";
export type Issue = typeof issues.$inferSelect;
export const stepLabels = {
  scope: "Scope problem",
  plan: "Create implementation plan",
  risk: "Assess risk",
  "plan-review": "Review issue and plan",
  build: "Implement approved plan",
  checks: "Run automated checks",
  "code-review": "Review code",
  "functional-review": "Review functionality",
  "developer-approval": "Developer approval",
  "product-approval": "Product approval",
  "update-main": "Update from main",
  testing: "Deploy and verify testing",
  production: "Deploy and verify production",
  done: "Released",
} as const;
export function transition(
  issue: Pick<Issue, "step" | "risk" | "productFacing">,
  outcome: "pass" | "changes" | "fail",
) {
  const { step } = issue;
  if (step === "done") throw new Error("This issue is already released.");
  if (
    outcome === "changes" &&
    ![
      "plan-review",
      "code-review",
      "functional-review",
      "developer-approval",
      "product-approval",
    ].includes(step)
  )
    throw new Error("This step does not accept change requests.");
  if (outcome === "fail" && !["checks", "testing", "production"].includes(step))
    throw new Error("This step does not support a failure simulation.");
  let next: Issue["step"];
  if (outcome !== "pass") next = step === "plan-review" ? "plan" : "build";
  else {
    const sequence: Issue["step"][] = [
      "scope",
      "plan",
      "risk",
      "plan-review",
      "build",
      "checks",
      "code-review",
      "functional-review",
      ...(issue.risk === "high" ? ["developer-approval" as const] : []),
      ...(issue.productFacing ? ["product-approval" as const] : []),
      "update-main",
      "testing",
      "production",
      "done",
    ];
    next = sequence[sequence.indexOf(step) + 1];
    if (!next) throw new Error("Invalid workflow step.");
  }
  const stage: Issue["stage"] = ["scope", "plan", "risk", "plan-review"].includes(next)
    ? "prepare"
    : next === "build"
      ? "build"
      : ["update-main", "testing", "production"].includes(next)
        ? "deploy"
        : next === "done"
          ? "done"
          : "review";
  return { step: next, stage, state: next === "done" ? ("closed" as const) : ("open" as const) };
}
