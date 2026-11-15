import { Outlet, useLocation } from "react-router";
import { SidebarLayout } from "../components/ui-kit/sidebar-layout";
import {
  Sidebar,
  SidebarBody,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarFooter,
} from "../components/ui-kit/sidebar";
import { Navbar, NavbarSpacer, NavbarSection } from "../components/ui-kit/navbar";
import { AccountMenu } from "../components/account-menu";
import {
  authenticatedUserContext,
  getAuthenticatedUser,
  requireAuth,
  setAuthCookies,
} from "../lib/session.server";
import type { Route } from "./+types/layout";

export const middleware: Route.MiddlewareFunction[] = [
  async ({ request, context }, next) => {
    const { user, newAccessToken, newRefreshToken } = await requireAuth(request);
    context.set(authenticatedUserContext, user);

    const response = await next();

    const actionSetAuthCookies = response.headers
      .getSetCookie()
      .some((cookie) => cookie.startsWith("accessToken=") || cookie.startsWith("refreshToken="));
    if (newAccessToken && newRefreshToken && !actionSetAuthCookies) {
      const cookies = await setAuthCookies(newAccessToken, newRefreshToken);
      cookies.forEach((cookie) => response.headers.append("Set-Cookie", cookie));
    }

    return response;
  },
];

export function loader({ context }: Route.LoaderArgs) {
  const user = getAuthenticatedUser(context);

  return { user };
}

export default function Layout({ loaderData }: Route.ComponentProps) {
  const location = useLocation();
  const { user } = loaderData;
  const pathname = location.pathname || "/";

  return (
    <SidebarLayout
      navbar={
        <Navbar>
          <NavbarSpacer />
          <NavbarSection>
            <AccountMenu user={user} mobile />
          </NavbarSection>
        </Navbar>
      }
      sidebar={
        <Sidebar>
          <SidebarHeader>
            <div className="px-2 py-1">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Cool App Name</h2>
            </div>
          </SidebarHeader>
          <SidebarBody>
            <SidebarSection>
              <SidebarItem href="/" current={pathname === "/"}>
                <SidebarLabel>Dashboard</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/files" current={pathname.startsWith("/files")}>
                <SidebarLabel>Files</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/items" current={pathname.startsWith("/items")}>
                <SidebarLabel>Items</SidebarLabel>
              </SidebarItem>
              {user.role === "admin" && (
                <SidebarItem href="/admin" current={pathname.startsWith("/admin")}>
                  <SidebarLabel>Admin</SidebarLabel>
                </SidebarItem>
              )}
            </SidebarSection>
          </SidebarBody>
          <SidebarFooter className="max-lg:hidden">
            <AccountMenu user={user} />
          </SidebarFooter>
        </Sidebar>
      }
    >
      <Outlet />
    </SidebarLayout>
  );
}
