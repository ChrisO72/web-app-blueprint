import type { ReactNode } from "react";
import { Link } from "react-router";

export function AppFrame({
  children,
  navigation,
}: {
  children: ReactNode;
  navigation?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="page-width flex min-h-20 flex-wrap items-center justify-between gap-x-8 gap-y-2 py-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            nimoh.net
          </Link>
          {navigation}
        </div>
      </header>
      {children}
      <footer className="page-width mt-auto border-t border-zinc-200 py-8 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        A little space to make things happen.
      </footer>
    </div>
  );
}
