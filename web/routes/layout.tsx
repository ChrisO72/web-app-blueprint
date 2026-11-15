import { NavLink, Outlet } from "react-router";
import { AppFrame } from "../components/app-frame";
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
  const { user } = loaderData;

  return (
    <AppFrame
      navigation={
        <nav
          aria-label="Main navigation"
          className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm"
        >
          <NavLink to="/" end className="nav-link">
            Home
          </NavLink>
          <NavLink to="/files" className="nav-link">
            Files
          </NavLink>
          <NavLink to="/items" className="nav-link">
            Items
          </NavLink>
          {user.role === "admin" && (
            <NavLink to="/admin" className="nav-link">
              Admin
            </NavLink>
          )}
          <AccountMenu user={user} />
        </nav>
      }
    >
      <main id="main" tabIndex={-1} className="page-width py-12 outline-none sm:py-20">
        <Outlet />
      </main>
    </AppFrame>
  );
}
