import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { expect, it } from "vitest";
import { DocumentMarkdown } from "../components/document-markdown";

it("highlights tagged Markdown fences and preserves plain code", () => {
  const source = [
    "Inline `const`",
    "",
    "```ts",
    'const name: string = "<example>";',
    "```",
    "",
    "```dotenv",
    'HOST="localhost"',
    "```",
    "",
    "```unregistered-language",
    "const raw = true;",
    "```",
  ].join("\n");

  const markup = renderToStaticMarkup(
    <MemoryRouter>
      <DocumentMarkdown
        source={source}
        path="README.md"
        paths={["README.md"]}
        repositoryUrl="https://github.com/org/repo"
        branch="main"
      />
    </MemoryRouter>,
  );

  expect(markup).toContain("<code>const</code>");
  expect(markup).toContain('<span class="hljs-keyword">const</span>');
  expect(markup).toContain("&lt;example&gt;");
  expect(markup).toContain('<span class="hljs-attr">HOST</span>');
  expect(markup).toContain(
    '<code class="control-code language-unregistered-language">const raw = true;\n</code>',
  );
});
