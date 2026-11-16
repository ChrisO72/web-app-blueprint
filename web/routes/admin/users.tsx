import type { Route } from "./+types/users";
import { listUsers, softDeleteUser, updateUser } from "~/db/repositories/users";
import { getOrganizationById, listOrganizations } from "~/db/repositories/organizations";
import { requireAdmin } from "~/web/lib/session.server";
import { Heading } from "~/web/components/ui-kit/heading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/web/components/ui-kit/table";
import { useFetcher } from "react-router";
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
} from "~/web/components/ui-kit/dropdown";
import { EllipsisHorizontalIcon } from "@heroicons/react/16/solid";
import { z } from "zod";
import { Select } from "~/web/components/ui-kit/select";
import { parseForm, type ActionData } from "~/web/lib/form";
import { useFetcherToast } from "~/web/lib/use-fetcher-toast";
import { FieldError } from "~/web/components/field-error";
import { FormError } from "~/web/components/form-error";
import { Field } from "~/web/components/ui-kit/fieldset";
import { Combobox, ComboboxLabel, ComboboxOption } from "~/web/components/ui-kit/combobox";

const ROLES = ["admin", "user", "viewer"] as const;

const deleteUserSchema = z.object({
  id: z.coerce.number({ message: "Invalid user ID" }).positive("Invalid user ID"),
});

const updateRoleSchema = z.object({
  id: z.coerce.number({ message: "Invalid user ID" }).positive("Invalid user ID"),
  role: z.enum(ROLES, { message: "Invalid role" }),
});

const updateOrganizationSchema = z.object({
  id: z.coerce.number({ message: "Invalid user ID" }).positive("Invalid user ID"),
  organizationId: z.coerce
    .number({ message: "Invalid organization ID" })
    .positive("Invalid organization ID"),
});

export async function loader({ context }: Route.LoaderArgs) {
  const { user: currentUser } = requireAdmin(context);
  const [users, organizations] = await Promise.all([listUsers(), listOrganizations()]);
  return { users, organizations, currentUserId: currentUser.id };
}

export async function action({ request, context }: Route.ActionArgs): Promise<ActionData> {
  const { user } = requireAdmin(context);

  const formData = await request.formData();

  if (request.method === "DELETE") {
    const { data, fieldErrors } = parseForm(formData, deleteUserSchema);
    if (fieldErrors) return { fieldErrors };
    if (data.id === user.id) {
      return { formError: "Cannot delete yourself." };
    }
    await softDeleteUser(data.id);
    return {};
  }

  if (request.method === "PATCH") {
    if (formData.has("role")) {
      const { data, fieldErrors } = parseForm(formData, updateRoleSchema);
      if (fieldErrors) return { fieldErrors };
      if (data.id === user.id) {
        return { formError: "Cannot change your own role." };
      }
      await updateUser(data.id, { role: data.role });
      return {};
    }

    const { data, fieldErrors } = parseForm(formData, updateOrganizationSchema);
    if (fieldErrors) return { fieldErrors };

    const organization = await getOrganizationById(data.organizationId);
    if (!organization) {
      return { fieldErrors: { organizationId: ["Organization not found"] } };
    }

    await updateUser(data.id, { organizationId: data.organizationId });
    return {};
  }

  return { formError: "Unsupported request method." };
}

export default function AdminUsersPage({ loaderData }: Route.ComponentProps) {
  const { users, organizations, currentUserId } = loaderData;
  const deleteFetcher = useFetcher<typeof action>();
  useFetcherToast(deleteFetcher, {
    success: "User deleted",
    fieldErrors: "toast",
  });

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <Heading>
          Users
          {users.length > 0 && (
            <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
              ({users.length} total)
            </span>
          )}
        </Heading>
      </div>

      <FormError actionData={deleteFetcher.data} />
      {users.length === 0 ? (
        <div className="rounded-lg bg-zinc-50 py-12 text-center dark:bg-zinc-900">
          <p className="text-zinc-500 dark:text-zinc-400">No users found.</p>
        </div>
      ) : (
        <div className="overflow-auto">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>ID</TableHeader>
                <TableHeader>Email</TableHeader>
                <TableHeader>Name</TableHeader>
                <TableHeader>Organization</TableHeader>
                <TableHeader>Role</TableHeader>
                <TableHeader>Created</TableHeader>
                <TableHeader>Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.id}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    {[u.firstName, u.lastName].filter(Boolean).join(" ") || "-"}
                  </TableCell>
                  <TableCell>
                    <OrganizationCombobox
                      userId={u.id}
                      currentOrganizationId={u.organizationId}
                      organizations={organizations}
                    />
                  </TableCell>
                  <TableCell>
                    <RoleSelect
                      userId={u.id}
                      currentRole={u.role}
                      disabled={u.id === currentUserId}
                    />
                  </TableCell>
                  <TableCell>{u.createdAt.toLocaleDateString()}</TableCell>
                  <TableCell>
                    <UserActions
                      disabled={u.id === currentUserId || deleteFetcher.state !== "idle"}
                      onDelete={() => {
                        void deleteFetcher.submit({ id: String(u.id) }, { method: "DELETE" });
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function OrganizationCombobox({
  userId,
  currentOrganizationId,
  organizations,
}: {
  userId: number;
  currentOrganizationId: number;
  organizations: Route.ComponentProps["loaderData"]["organizations"];
}) {
  const fetcher = useFetcher<typeof action>();
  useFetcherToast(fetcher, {
    success: "User organization updated",
    fieldErrors: "toast",
  });
  const optimisticOrganizationId = fetcher.formData
    ? Number(fetcher.formData.get("organizationId"))
    : currentOrganizationId;
  const selectedOrganization =
    organizations.find((organization) => organization.id === optimisticOrganizationId) ?? null;

  return (
    <Field>
      <Combobox
        options={organizations}
        value={selectedOrganization}
        by="id"
        displayValue={(organization) => organization?.name}
        filter={(organization, query) =>
          organization?.name.toLowerCase().includes(query.toLowerCase()) ?? false
        }
        onChange={(organization) => {
          if (!organization || organization.id === currentOrganizationId) return;
          fetcher.submit(
            { id: userId.toString(), organizationId: organization.id.toString() },
            { method: "PATCH" },
          );
        }}
        aria-label="Organization"
        className="min-w-48"
        disabled={fetcher.state !== "idle"}
      >
        {(organization) => (
          <ComboboxOption value={organization}>
            <ComboboxLabel>{organization.name}</ComboboxLabel>
          </ComboboxOption>
        )}
      </Combobox>
      <FormError actionData={fetcher.data} />
      <FieldError name="organizationId" actionData={fetcher.data} />
    </Field>
  );
}

function RoleSelect({
  userId,
  currentRole,
  disabled,
}: {
  userId: number;
  currentRole: string;
  disabled?: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  useFetcherToast(fetcher, {
    success: "User role updated",
    fieldErrors: "toast",
  });
  const optimisticRole = fetcher.formData ? (fetcher.formData.get("role") as string) : currentRole;

  return (
    <Field>
      <Select
        name="role"
        aria-label="Role"
        invalid={!!fetcher.data?.fieldErrors?.role}
        value={optimisticRole}
        disabled={disabled || fetcher.state !== "idle"}
        onChange={(e) => {
          fetcher.submit({ id: userId.toString(), role: e.target.value }, { method: "PATCH" });
        }}
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {role.charAt(0).toUpperCase() + role.slice(1)}
          </option>
        ))}
      </Select>
      <FormError actionData={fetcher.data} />
      <FieldError name="role" actionData={fetcher.data} />
    </Field>
  );
}

function UserActions({ disabled, onDelete }: { disabled: boolean; onDelete: () => void }) {
  return (
    <Dropdown>
      <DropdownButton plain aria-label="More options">
        <EllipsisHorizontalIcon data-slot="icon" />
      </DropdownButton>
      <DropdownMenu>
        <DropdownItem onClick={onDelete} disabled={disabled}>
          Delete
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
}
