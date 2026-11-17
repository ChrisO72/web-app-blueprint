import { useLocation } from "react-router";
import { Navbar, NavbarItem, NavbarSection } from "~/web/components/ui-kit/navbar";

const tabs = [
  { name: "Overview", href: "/control" },
  { name: "Activity", href: "/control/activity" },
  { name: "Issues", href: "/control/issues" },
  { name: "PRs", href: "/control/prs" },
  { name: "Actions", href: "/control/actions" },
  { name: "Settings", href: "/control/settings" },
] as const;

export function ControlNav() {
  const { pathname } = useLocation();

  return (
    <Navbar className="mb-6 border-b border-zinc-950/10 dark:border-white/10">
      <NavbarSection>
        {tabs.map((tab) => {
          const current =
            tab.href === "/control" ? pathname === "/control" : pathname.startsWith(tab.href);
          return (
            <NavbarItem key={tab.href} href={tab.href} current={current}>
              {tab.name}
            </NavbarItem>
          );
        })}
      </NavbarSection>
    </Navbar>
  );
}
