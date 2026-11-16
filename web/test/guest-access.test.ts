import { beforeEach, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { createGuest, getUserById } from "~/db/repositories/users";
import {
  authenticatedUserContext,
  requireAuth,
  requireRegistered,
  requireAdmin,
  readSessionUser,
} from "~/web/lib/session.server";
import { findRefreshTokenByHash } from "~/db/repositories/refreshTokens";
import {
  createTokens,
  verifyAccessToken,
  verifyRefreshToken,
  refreshAccessToken,
} from "~/web/lib/auth/tokens.server";
vi.mock("~/db/repositories/refreshTokens", () => ({ findRefreshTokenByHash: vi.fn() }));
vi.mock("~/db/repositories/users", () => ({ createGuest: vi.fn(), getUserById: vi.fn() }));
vi.mock("~/web/lib/auth/tokens.server", () => ({
  ACCESS_TOKEN_MAX_AGE: 900,
  REFRESH_TOKEN_MAX_AGE: 604800,
  createTokens: vi.fn(),
  verifyAccessToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
  hashRefreshToken: vi.fn(() => "digest"),
  refreshAccessToken: vi.fn(),
}));
const guest = {
  id: 7,
  organizationId: 11,
  isGuest: true,
  email: null,
  firstName: null,
  lastName: null,
  avatarFileId: null,
  emailConfirmedAt: null,
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};
beforeEach(() => {
  vi.resetAllMocks();
});
describe("guest session boundaries", () => {
  it("creates a guest only for authorized GET bootstrap", async () => {
    vi.mocked(createGuest).mockResolvedValue(guest);
    vi.mocked(createTokens).mockResolvedValue({ accessToken: "access", refreshToken: "refresh" });
    expect(await requireAuth(new Request("http://localhost/"), true)).toMatchObject({
      user: guest,
      newAccessToken: "access",
    });
    expect(createGuest).toHaveBeenCalledTimes(1);
  });
  it("does not create an account for anonymous mutations", async () => {
    await expect(
      requireAuth(new Request("http://localhost/sites", { method: "POST" }), true),
    ).rejects.toBeInstanceOf(Response);
    expect(createGuest).not.toHaveBeenCalled();
  });
  it("reuses an existing guest identity", async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({ userId: 7 });
    vi.mocked(getUserById).mockResolvedValue(guest);
    expect(
      (
        await requireAuth(
          new Request("http://localhost/", { headers: { Cookie: "accessToken=token" } }),
          true,
        )
      ).user.organizationId,
    ).toBe(11);
    expect(createGuest).not.toHaveBeenCalled();
  });
  it("preserves the guest while a signup form is open after access-token expiry", async () => {
    vi.mocked(verifyRefreshToken).mockReturnValue({ userId: 7 });
    vi.mocked(findRefreshTokenByHash).mockResolvedValue({
      id: 1,
      userId: 7,
      tokenHash: "digest",
      tokenId: null,
      issuedAt: null,
      previousTokenHash: null,
      previousValidUntil: null,
      expiresAt: new Date(Date.now() + 10000),
      createdAt: new Date(),
    });
    vi.mocked(getUserById).mockResolvedValue(guest);
    expect(
      await readSessionUser(
        new Request("http://localhost/signup", { headers: { Cookie: "refreshToken=token" } }),
      ),
    ).toEqual(guest);
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });
  it("blocks guest account settings and additional Sites", () => {
    const context = new RouterContextProvider();
    context.set(authenticatedUserContext, guest);
    expect(() => requireRegistered(context)).toThrow(Response);
    context.set(authenticatedUserContext, { ...guest, isGuest: false, email: "user@example.com" });
    expect(requireRegistered(context).id).toBe(7);
  });
  it("allows admin access and rejects ordinary users and viewers", () => {
    const context = new RouterContextProvider();
    const admin = { ...guest, isGuest: false, role: "admin" as const };
    context.set(authenticatedUserContext, admin);
    expect(requireAdmin(context).user).toEqual(admin);
    for (const role of ["user", "viewer"] as const) {
      context.set(authenticatedUserContext, { ...admin, role });
      expect(() => requireAdmin(context)).toThrow(Response);
    }
  });
});
