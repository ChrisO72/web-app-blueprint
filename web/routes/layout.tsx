import { useState } from "react";
import { Outlet, redirect, useParams } from "react-router";
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
import { Navbar, NavbarItem, NavbarSpacer, NavbarSection } from "../components/ui-kit/navbar";
import { Text } from "../components/ui-kit/text";
import { AccountMenu } from "../components/account-menu";
import { SiteSelector } from "../components/site-selector";
import { CreateSiteDialog } from "../components/create-site-dialog";
import {
  authenticatedUserContext,
  getAuthenticatedUser,
  requireAuth,
  setAuthCookies,
} from "../lib/session.server";
import { isEmailConfigured } from "~/integrations/mail/client.server";
import { getSiteSettings } from "~/db/repositories/settings";
import { getOrganizationById } from "~/db/repositories/organizations";
import { listSites } from "~/db/repositories/sites";
import type { Route } from "./+types/layout";
export const middleware: Route.MiddlewareFunction[] = [
  async ({ request, context }, next) => {
    const { user, newAccessToken, newRefreshToken } = await requireAuth(request, true);
    if (
      !user.isGuest &&
      isEmailConfigured &&
      (await getSiteSettings()).requireMailConfirmation &&
      !user.emailConfirmedAt
    )
      throw redirect(`/check-email?email=${encodeURIComponent(user.email ?? "")}`);
    context.set(authenticatedUserContext, user);
    const response = await next();
    const alreadySet = response.headers
      .getSetCookie()
      .some((cookie) => cookie.startsWith("accessToken=") || cookie.startsWith("refreshToken="));
    if (newAccessToken && newRefreshToken && !alreadySet)
      for (const cookie of await setAuthCookies(newAccessToken, newRefreshToken))
        response.headers.append("Set-Cookie", cookie);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  },
];
export async function loader({ context }: Route.LoaderArgs) {
  const user = getAuthenticatedUser(context);
  const [organization, sites] = await Promise.all([
    getOrganizationById(user.organizationId),
    listSites(user.organizationId),
  ]);
  return {
    user,
    organizationName: organization?.name ?? "Your organization",
    sites: sites.map(({ id, name }) => ({ id, name })),
  };
}
export default function Layout({
  loaderData: { user, organizationName, sites },
}: Route.ComponentProps) {
  const { siteId, view } = useParams();
  const [addingSite, setAddingSite] = useState(false);
  const selectedSite = sites.find((site) => site.id === Number(siteId)) ?? sites[0];
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-zinc-950 focus:outline-2 focus:outline-blue-500"
      >
        Skip to content
      </a>
      <SidebarLayout
        fullWidth={!!siteId && (!view || view === "health")}
        navbar={
          <Navbar aria-label="Account navigation">
            <NavbarSpacer />
            <NavbarSection>
              {user.isGuest ? (
                <>
                  <NavbarItem href="/login">Sign in</NavbarItem>
                  <NavbarItem href="/signup">Sign up</NavbarItem>
                </>
              ) : (
                <AccountMenu user={user} mobile />
              )}
            </NavbarSection>
          </Navbar>
        }
        sidebar={
          <Sidebar aria-label="Main navigation">
            <SidebarHeader>
              <div className="px-2 py-1">
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">nimoh.net</h2>
              </div>
              <SiteSelector
                organizationName={organizationName}
                sites={sites}
                selectedSite={selectedSite}
                onAddSite={() => setAddingSite(true)}
              />
            </SidebarHeader>
            <SidebarBody>
              {selectedSite && (
                <SidebarSection>
                  {[
                    ["overview", "Overview"],
                    ["io", "I/O"],
                    ["activity", "Activity"],
                    ["wiki", "Wiki"],
                  ].map(([key, label]) => {
                    const current =
                      siteId === String(selectedSite.id) &&
                      (key === "activity"
                        ? ["activity", "issues", "pulls"].includes(view ?? "")
                        : (view ?? "overview") === key);
                    return (
                      <SidebarItem
                        key={key}
                        href={`/sites/${selectedSite.id}${key === "overview" ? "" : `/${key}`}`}
                        current={current}
                        aria-current={current ? "page" : undefined}
                      >
                        <SidebarLabel>{label}</SidebarLabel>
                      </SidebarItem>
                    );
                  })}
                </SidebarSection>
              )}
            </SidebarBody>
            {user.isGuest ? (
              <SidebarFooter>
                <Text className="px-2">Guest workspace</Text>
                <SidebarItem href="/login">
                  <SidebarLabel>Sign in</SidebarLabel>
                </SidebarItem>
                <SidebarItem href="/signup">
                  <SidebarLabel>Save your workspace</SidebarLabel>
                </SidebarItem>
              </SidebarFooter>
            ) : (
              <SidebarFooter className="max-lg:hidden">
                <AccountMenu user={user} />
              </SidebarFooter>
            )}
          </Sidebar>
        }
      >
        <div id="main" tabIndex={-1} className="outline-none">
          <Outlet />
        </div>
      </SidebarLayout>
      {addingSite && <CreateSiteDialog guest={user.isGuest} onClose={() => setAddingSite(false)} />}
    </>
  );
}
