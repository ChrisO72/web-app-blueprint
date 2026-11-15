import { NavLink } from "react-router";

const tabs = [
  { name: "Settings", href: "/admin" },
  { name: "Users", href: "/admin/users" },
  { name: "Organizations", href: "/admin/organizations" },
] as const;

export function AdminNav() {
  return (
    <nav
      aria-label="Administration"
      className="mb-10 flex flex-wrap gap-x-6 border-b border-zinc-200 pb-3 text-sm dark:border-zinc-800"
    >
      {tabs.map((tab) => (
        <NavLink key={tab.href} to={tab.href} end={tab.href === "/admin"} className="nav-link">
          {tab.name}
        </NavLink>
      ))}
    </nav>
  );
}
