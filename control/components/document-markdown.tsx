import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import rehypeSlug from "rehype-slug";
import { Link, useLocation } from "react-router";
import { useEffect } from "react";
import { documentLink } from "../docs";
import "./document-markdown.css";

export type MarkdownContext = {
  path: string;
  paths: string[];
  repositoryUrl: string;
  branch: string;
};

export function DocumentMarkdown({
  source,
  path,
  paths,
  repositoryUrl,
  branch,
}: MarkdownContext & { source: string }) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    try {
      document
        .getElementById("docs-heading-" + decodeURIComponent(hash.slice(1)))
        ?.scrollIntoView();
    } catch {
      /* A malformed fragment has no matching heading. */
    }
  }, [path, hash]);
  return (
    <article className="control-markdown">
      <Markdown
        skipHtml
        remarkPlugins={[remarkFrontmatter, remarkGfm]}
        rehypePlugins={[[rehypeSlug, { prefix: "docs-heading-" }]]}
        components={{
          a: ({ href, children, title }) => {
            const link = documentLink(href ?? "", path, paths, repositoryUrl, branch);
            if (!link) return <span>{children}</span>;
            return link.startsWith("/control/docs?") ? (
              <Link to={link} title={title}>
                {children}
              </Link>
            ) : (
              <a href={link} title={title} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
          img: ({ src, alt }) => {
            if (typeof src !== "string" || !src) return null;
            if (/^https?:\/\//i.test(src))
              return <img src={src} alt={alt ?? ""} loading="lazy" referrerPolicy="no-referrer" />;
            const link = documentLink(src, path, paths, repositoryUrl, branch);
            return (
              <a href={link} target="_blank" rel="noreferrer">
                {alt || src}
              </a>
            );
          },
        }}
      >
        {source}
      </Markdown>
    </article>
  );
}
