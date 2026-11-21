import clsx from "clsx";
import { common, createLowlight } from "lowlight";
import type { ReactNode } from "react";
import "./syntax-code.css";

const highlighter = createLowlight(common);
highlighter.registerAlias("ini", "dotenv");

type Token = ReturnType<typeof highlighter.highlight>["children"][number];

function renderTokens(tokens: Token[]): ReactNode {
  return tokens.map((token, index) => {
    if (token.type === "text") return token.value;
    if (token.type !== "element") return null;

    const classes = token.properties.className;
    return (
      <span key={index} className={Array.isArray(classes) ? classes.join(" ") : undefined}>
        {renderTokens(token.children)}
      </span>
    );
  });
}

export function SyntaxCode({
  language,
  className,
  children,
}: {
  language: string;
  className?: string;
  children: string;
}) {
  const normalizedLanguage = language.toLowerCase();
  return (
    <code className={clsx("control-code", className)}>
      {highlighter.registered(normalizedLanguage)
        ? renderTokens(highlighter.highlight(normalizedLanguage, children).children)
        : children}
    </code>
  );
}
