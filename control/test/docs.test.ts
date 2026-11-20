import { describe, expect, it } from "vitest";
import { documentLabel, documentLink, documentTree, docsUrl } from "../docs";

const paths = [
  "web/AGENTS.md",
  "web/auth.md",
  "web/README.md",
  "control/README.md",
  "README.md",
  ".agents/skills/README.md",
  ".agents/skills/blueprint-build/SKILL.md",
  "guides/dev/local/setup.md",
];

describe("documentation navigation", () => {
  it("preserves folder identity, file priority, and hidden agent skills", () => {
    const root = documentTree(paths);
    expect(root.files).toEqual(["README.md"]);
    expect(root.folders.find((folder) => folder.path === "web")?.files).toEqual([
      "web/README.md",
      "web/AGENTS.md",
      "web/auth.md",
    ]);
    expect(root.folders.find((folder) => folder.path === "control")?.files).toEqual([
      "control/README.md",
    ]);
    expect(root.folders.find((folder) => folder.name === "Agent skills")).toMatchObject({
      files: [".agents/skills/README.md"],
      folders: [{ files: [".agents/skills/blueprint-build/SKILL.md"] }],
    });
    expect(documentLabel(".agents/skills/blueprint-build/SKILL.md")).toBe("blueprint-build");
    expect(root.folders.some((folder) => folder.name === "guides/dev/local")).toBe(true);
  });

  const link = (href: string) =>
    documentLink(href, "web/README.md", paths, "https://github.com/org/repo", "main");
  it("resolves adjacent, parent, root, and same-file heading links", () => {
    expect(link("auth.md")).toBe(docsUrl("web/auth.md"));
    expect(link("../README.md#checks")).toBe(docsUrl("README.md") + "#checks");
    expect(link("#configuration")).toBe(docsUrl("web/README.md") + "#configuration");
    expect(link("/control/README.md")).toBe(docsUrl("control/README.md"));
    expect(link("../.agents/skills/README.md")).toBe(docsUrl(".agents/skills/README.md"));
  });
  it("routes code and directories to GitHub and preserves external links", () => {
    expect(link("routes.ts")).toBe("https://github.com/org/repo/blob/main/web/routes.ts");
    expect(link("../control/")).toBe("https://github.com/org/repo/tree/main/control/");
    expect(link("https://example.org/")).toBe("https://example.org/");
    expect(link("%zz")).toBe("");
  });
});
