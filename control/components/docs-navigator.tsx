import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import clsx from "clsx";
import { ChevronRightIcon, DocumentTextIcon, FolderIcon } from "@heroicons/react/16/solid";
import { documentLabel, documentTree, docsUrl, type DocFolder } from "../docs";

function FileRow({ path, selected }: { path: string; selected?: string }) {
  const active = path === selected;
  return (
    <Link
      to={docsUrl(path)}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm break-all",
        active
          ? "bg-blue-50 font-medium text-blue-800 dark:bg-blue-400/15 dark:text-blue-200"
          : "hover:bg-zinc-500/10",
      )}
    >
      <DocumentTextIcon className="size-4 shrink-0 opacity-60" />
      {documentLabel(path)}
    </Link>
  );
}

function FolderRow({ folder, selected }: { folder: DocFolder; selected?: string }) {
  const contains = selected?.startsWith(folder.path + "/") ?? false;
  const [open, setOpen] = useState(contains || folder.path === ".agents/skills");
  useEffect(() => {
    if (contains) setOpen(true);
  }, [contains, selected]);
  // A conventional skill has one SKILL.md. Give it a single named row.
  if (
    folder.path.startsWith(".agents/skills/") &&
    folder.files.length === 1 &&
    !folder.folders.length &&
    folder.files[0].endsWith("/SKILL.md")
  )
    return <FileRow path={folder.files[0]} selected={selected} />;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-left text-sm font-medium hover:bg-zinc-500/10"
      >
        <ChevronRightIcon className={clsx("size-3 shrink-0 opacity-60", open && "rotate-90")} />
        <FolderIcon className="size-4 shrink-0 text-zinc-400" />
        {folder.name}
      </button>
      {open && (
        <div className="ml-3 border-l border-zinc-500/20 pl-2">
          <FolderContents folder={folder} selected={selected} />
        </div>
      )}
    </div>
  );
}
function FolderContents({ folder, selected }: { folder: DocFolder; selected?: string }) {
  return (
    <>
      {folder.files.map((path) => (
        <FileRow key={path} path={path} selected={selected} />
      ))}
      {folder.folders.map((child) => (
        <FolderRow key={child.path} folder={child} selected={selected} />
      ))}
    </>
  );
}
export function DocsNavigator({ paths, selected }: { paths: string[]; selected?: string }) {
  const tree = useMemo(() => documentTree(paths), [paths]);
  return (
    <nav aria-label="Documentation files" className="space-y-0.5">
      <FolderContents folder={tree} selected={selected} />
    </nav>
  );
}
