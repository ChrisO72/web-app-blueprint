import { describe, expect, it } from "vitest";
import { transition } from "~/shared/workflow";
import { components, connections, documents, traces } from "~/shared/blueprint";
import type { Issue } from "~/shared/workflow";
describe("issue delivery gates", () => {
  it("requires developer and product approval for high-risk product changes", () => {
    const issue = {
      step: "functional-review" as Issue["step"],
      risk: "high" as const,
      productFacing: true,
    };
    const developer = transition(issue, "pass");
    expect(developer.step).toBe("developer-approval");
    const product = transition({ ...issue, ...developer }, "pass");
    expect(product.step).toBe("product-approval");
    expect(transition({ ...issue, ...product }, "pass").step).toBe("update-main");
  });
  it("skips optional approvals for a low-risk internal change", () => {
    expect(
      transition({ step: "functional-review", risk: "low", productFacing: false }, "pass").step,
    ).toBe("update-main");
  });
  it.each(["checks", "testing", "production"] as const)(
    "returns %s failures to a new build and review cycle",
    (step) => {
      const issue = { step, risk: "high" as const, productFacing: true };
      const rebuild = transition(issue, "fail");
      expect(rebuild).toEqual({ step: "build", stage: "build", state: "open" });
      expect(transition({ ...issue, ...rebuild }, "pass").step).toBe("checks");
    },
  );
  it("requests plan revisions before build", () => {
    expect(
      transition({ step: "plan-review", risk: "low", productFacing: false }, "changes").step,
    ).toBe("plan");
  });
  it("closes an issue only after production verification", () => {
    expect(transition({ step: "testing", risk: "low", productFacing: false }, "pass").state).toBe(
      "open",
    );
    expect(transition({ step: "production", risk: "low", productFacing: false }, "pass")).toEqual({
      step: "done",
      stage: "done",
      state: "closed",
    });
    expect(() => transition({ step: "done", risk: "low", productFacing: false }, "pass")).toThrow();
  });
  it("rejects outcomes that do not apply to the current step", () => {
    expect(() =>
      transition({ step: "scope", risk: "low", productFacing: false }, "fail"),
    ).toThrow();
    expect(() =>
      transition({ step: "build", risk: "low", productFacing: false }, "changes"),
    ).toThrow();
  });
});
describe("blueprint reference integrity", () => {
  it("resolves every map, trace, and document reference", () => {
    const keys = new Set(components.map((c) => c.key));
    for (const pair of connections) for (const key of pair) expect(keys.has(key)).toBe(true);
    for (const trace of traces)
      for (const span of trace.spans) expect(keys.has(span.component)).toBe(true);
    const docs = new Set(documents.map((d) => d.key));
    for (const doc of documents) for (const key of doc.links) expect(docs.has(key)).toBe(true);
  });
});
