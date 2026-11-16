import { createContext, createCookie, redirect, type RouterContextProvider } from "react-router";
import {
  createTokens,
  verifyRefreshToken,
  hashRefreshToken,
  ACCESS_TOKEN_MAX_AGE,
  REFRESH_TOKEN_MAX_AGE,
  refreshAccessToken,
  verifyAccessToken,
} from "./auth/tokens.server";
import { env } from "~/web/env.server";
import { getUserById, createGuest, type User } from "~/db/repositories/users";

import { findRefreshTokenByHash } from "~/db/repositories/refreshTokens";

const isProduction = env.NODE_ENV === "production";

export const authenticatedUserContext = createContext<User>();

export const accessTokenCookie = createCookie("accessToken", {
  httpOnly: true,
  sameSite: "lax",
  secure: isProduction,
  path: "/",
  maxAge: ACCESS_TOKEN_MAX_AGE,
});

export const refreshTokenCookie = createCookie("refreshToken", {
  httpOnly: true,
  sameSite: "lax",
  secure: isProduction,
  path: "/",
  maxAge: REFRESH_TOKEN_MAX_AGE,
});

async function readAuthCookies(request: Request) {
  const cookieHeader = request.headers.get("Cookie");
  const [accessToken, refreshToken] = await Promise.all([
    accessTokenCookie.parse(cookieHeader) as Promise<string | null>,
    refreshTokenCookie.parse(cookieHeader) as Promise<string | null>,
  ]);
  return { accessToken, refreshToken };
}

export async function readAccessTokenCookie(request: Request): Promise<string | null> {
  return (await accessTokenCookie.parse(request.headers.get("Cookie"))) as string | null;
}

export async function readRefreshTokenCookie(request: Request): Promise<string | null> {
  return (await refreshTokenCookie.parse(request.headers.get("Cookie"))) as string | null;
}

export async function requireAuth(request: Request, allowGuestCreation = false) {
  const { accessToken, refreshToken } = await readAuthCookies(request);

  let userId: number | null = null;
  let newAccessToken: string | null = null;
  let newRefreshToken: string | null = null;

  if (accessToken) {
    const payload = verifyAccessToken(accessToken);
    if (payload) userId = payload.userId;
  }

  if (userId === null && refreshToken) {
    const result = await refreshAccessToken(refreshToken);
    if (result) {
      userId = result.user.id;
      newAccessToken = result.accessToken;
      newRefreshToken = result.refreshToken;
    }
  }

  if (userId === null) {
    if (!allowGuestCreation || request.method !== "GET") throw redirect("/login");
    const guest = await createGuest();
    const tokens = await createTokens(guest.id);
    return {
      user: guest,
      newAccessToken: tokens.accessToken,
      newRefreshToken: tokens.refreshToken,
    };
  }

  const user = await getUserById(userId);
  if (!user) {
    // Session was valid but the user record is gone (deleted while logged in).
    // Treat it as a logout: clear cookies and bounce to login.
    const cookies = await clearAuthCookies();
    throw redirect("/login", {
      headers: cookies.map((cookie) => ["Set-Cookie", cookie] as [string, string]),
    });
  }

  return { user, newAccessToken, newRefreshToken };
}

export function getAuthenticatedUser(context: Readonly<RouterContextProvider>) {
  return context.get(authenticatedUserContext);
}

export function requireAdmin(context: Readonly<RouterContextProvider>) {
  const user = getAuthenticatedUser(context);
  if (user.role !== "admin") {
    throw redirect("/");
  }
  return { user };
}

export async function setAuthCookies(accessToken: string, refreshToken: string): Promise<string[]> {
  return Promise.all([
    accessTokenCookie.serialize(accessToken),
    refreshTokenCookie.serialize(refreshToken),
  ]);
}

export async function clearAuthCookies(): Promise<string[]> {
  return Promise.all([
    accessTokenCookie.serialize("", { maxAge: 0 }),
    refreshTokenCookie.serialize("", { maxAge: 0 }),
  ]);
}

export function requireRegistered(context: Readonly<RouterContextProvider>) {
  const user = getAuthenticatedUser(context);
  if (user.isGuest) throw redirect("/signup");
  return user;
}
export async function readSessionUser(request: Request) {
  const { accessToken, refreshToken } = await readAuthCookies(request);
  const payload = accessToken ? verifyAccessToken(accessToken) : null;
  if (payload) return getUserById(payload.userId);
  if (refreshToken) {
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) return null;
    const stored = await findRefreshTokenByHash(hashRefreshToken(refreshToken));
    if (stored?.userId === payload.userId) return getUserById(payload.userId);
  }
  return null;
}
