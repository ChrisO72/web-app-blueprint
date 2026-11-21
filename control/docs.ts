export function docsUrl(path: string) {
  return "/control/docs?" + new URLSearchParams({ path });
}

export type DocFolder = { name: string; path: string; files: string[]; folders: DocFolder[] };
export function documentTree(paths: string[]): DocFolder {
  const root: DocFolder = { name: "", path: "", files: [], folders: [] };
  for (const path of paths) {
    const segments = path.split("/");
    let parent = root;
    for (const name of segments.slice(0, -1)) {
      let folder = parent.folders.find((child) => child.name === name);
      if (!folder) {
        folder = {
          name,
          path: parent.path ? parent.path + "/" + name : name,
          folders: [],
          files: [],
        };
        parent.folders.push(folder);
      }
      parent = folder;
    }
    parent.files.push(path);
  }
  function organize(folder: DocFolder): DocFolder {
    const rank = (path: string) => {
      const name = path.split("/").at(-1)?.toLowerCase();
      return name === "readme.md" ? 0 : name === "agents.md" ? 1 : 2;
    };
    folder.files.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    folder.folders = folder.folders.map(organize).sort((a, b) => a.name.localeCompare(b.name));
    if (folder.path === ".agents/skills") return { ...folder, name: "Agent skills" };
    if (folder.path && !folder.files.length && folder.folders.length === 1) {
      const child = folder.folders[0];
      return {
        ...child,
        name: child.path === ".agents/skills" ? child.name : folder.name + "/" + child.name,
      };
    }
    return folder;
  }
  return organize(root);
}

export function documentLabel(path: string) {
  const segments = path.split("/");
  if (path.startsWith(".agents/skills/") && segments.at(-1) === "SKILL.md") return segments.at(-2);
  return segments.at(-1);
}

export function documentLink(
  href: string,
  current: string,
  paths: string[],
  repository: string,
  branch: string,
) {
  // External destinations have already passed the Markdown renderer's protocol filter.
  if (!href || /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//")) return href;
  const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");
  const base = new URL("https://repository.invalid/" + encodePath(current));
  try {
    const target = new URL(href, base);
    if (target.origin !== base.origin) return "";
    const path = decodeURIComponent(target.pathname.slice(1));
    if (paths.includes(path)) return docsUrl(path) + target.hash;
    const kind =
      !path || path.endsWith("/") || paths.some((file) => file.startsWith(path + "/"))
        ? "tree"
        : "blob";
    return (
      repository +
      "/" +
      kind +
      "/" +
      encodePath(branch) +
      "/" +
      encodePath(path) +
      target.search +
      target.hash
    );
  } catch {
    return "";
  }
}
