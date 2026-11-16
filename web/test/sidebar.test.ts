import { beforeEach, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { getAuthenticatedUser } from "~/web/lib/session.server";
import { getOrganizationById } from "~/db/repositories/organizations";
import { listSites } from "~/db/repositories/sites";
import { loader } from "~/web/routes/layout";

vi.mock("~/web/lib/session.server", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("~/db/repositories/organizations", () => ({ getOrganizationById: vi.fn() }));
vi.mock("~/db/repositories/sites", () => ({ listSites: vi.fn() }));
vi.mock("~/db/repositories/settings", () => ({ getSiteSettings: vi.fn() }));
vi.mock("~/integrations/mail/client.server", () => ({ isEmailConfigured: false }));

beforeEach(() => vi.resetAllMocks());

describe("sidebar organization scope", () => {
  it.each(["admin", "user"] as const)(
    "loads only the %s's own organization and Sites",
    async (role) => {
      const timestamps = { createdAt: new Date(), updatedAt: new Date(), deletedAt: null };
      const user = {
        id: 7,
        organizationId: 11,
        isGuest: false,
        email: "user@example.com",
        firstName: null,
        lastName: null,
        avatarFileId: null,
        emailConfirmedAt: null,
        role,
        ...timestamps,
      };
      vi.mocked(getAuthenticatedUser).mockReturnValue(user);
      vi.mocked(getOrganizationById).mockResolvedValue({
        id: 11,
        name: "Our organization",
        description: null,
        ...timestamps,
      });
      vi.mocked(listSites).mockResolvedValue([
        {
          id: 99,
          name: "Blueprint",
          organizationId: 11,
          template: "blueprint",
          repositoryOwner: "example",
          repositoryName: "blueprint",
          ...timestamps,
        },
      ]);
      const data = await loader({
        request: new Request("http://localhost/sites/99"),
        url: new URL("http://localhost/sites/99"),
        context: new RouterContextProvider(),
        params: {},
        pattern: "/sites/:siteId",
      });
      expect(getOrganizationById).toHaveBeenCalledExactlyOnceWith(11);
      expect(listSites).toHaveBeenCalledExactlyOnceWith(11);
      expect(data).toEqual({
        user,
        organizationName: "Our organization",
        sites: [{ id: 99, name: "Blueprint" }],
      });
    },
  );
});
