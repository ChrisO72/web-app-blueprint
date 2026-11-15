import { Link } from "react-router";

const sections = [
  {
    title: "Files",
    href: "/files",
    description: "Keep the things you need close by. Upload, find, and manage your files.",
    action: "Browse files",
  },
  {
    title: "Items",
    href: "/items",
    description: "Give your ideas a place to land. Keep track of what you’re working on.",
    action: "View items",
  },
  {
    title: "Account",
    href: "/account",
    description: "A few details that make this space yours. Manage your profile and preferences.",
    action: "Your account",
  },
];

export default function Home() {
  return (
    <>
      <section className="py-4 sm:py-5">
        <h1 className="max-w-2xl text-4xl/tight font-semibold tracking-tight sm:text-5xl/tight">
          Site
        </h1>
        <p className="mt-6 max-w-2xl text-lg/8 text-zinc-600 dark:text-zinc-400">
          A complete web app that build and maintains itself
        </p>
      </section>
      <section
        aria-labelledby="your-space"
        className="mt-16 border-t border-zinc-200 pt-10 sm:mt-20 dark:border-zinc-800"
      >
        <h2 id="your-space" className="text-2xl font-semibold tracking-tight">
          Your space
        </h2>
        <div className="mt-8 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {sections.map((section) => (
            <div key={section.href}>
              <h3 className="font-medium">{section.title}</h3>
              <p className="mt-3 text-base/7 text-zinc-600 dark:text-zinc-400">
                {section.description}
              </p>
              <Link
                to={section.href}
                className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-950 dark:decoration-zinc-700 dark:hover:decoration-white"
              >
                {section.action} <span aria-hidden="true">→</span>
              </Link>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
