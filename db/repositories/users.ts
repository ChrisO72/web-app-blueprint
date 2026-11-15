import { and, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  type InsertUser,
  type SelectUser,
  users,
  refreshTokens,
  passwordResetTokens,
} from "../schema/auth";
import { organizations } from "../schema/organizations";
import { files } from "../schema/files";

const userColumns = {
  id: users.id,
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  avatarFileId: users.avatarFileId,
  emailConfirmedAt: users.emailConfirmedAt,
  role: users.role,
  organizationId: users.organizationId,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  deletedAt: users.deletedAt,
};

export type User = Pick<SelectUser, keyof typeof userColumns>;

export async function registerUser(data: Pick<InsertUser, "email" | "passwordHash" | "firstName">) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('blueprint:registration'))`);
    const [{ value }] = await tx.select({ value: count() }).from(users);
    const [organization] = await tx
      .insert(organizations)
      .values({ name: `${data.firstName || data.email}'s Organization`.slice(0, 255) })
      .returning({ id: organizations.id });
    const [user] = await tx
      .insert(users)
      .values({
        ...data,
        email: data.email.toLowerCase(),
        organizationId: organization.id,
        role: value === 0 ? "admin" : "user",
      })
      .returning(userColumns);
    return user;
  });
}

export async function getUserById(id: number) {
  const [user] = await db
    .select(userColumns)
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  return user ?? null;
}

export async function getUserByEmail(email: string) {
  const [user] = await db
    .select(userColumns)
    .from(users)
    .where(and(eq(users.email, email.toLowerCase()), isNull(users.deletedAt)))
    .limit(1);
  return user ?? null;
}

export async function updateUser(id: number, data: Partial<InsertUser>) {
  return await db
    .update(users)
    .set({
      ...data,
    })
    .where(eq(users.id, id))
    .returning(userColumns);
}

export async function softDeleteUser(id: number) {
  return await db
    .update(users)
    .set({
      deletedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning(userColumns);
}

export async function listUsers() {
  return await db.select(userColumns).from(users).where(isNull(users.deletedAt));
}

export async function getUsersByOrganizationId(organizationId: number) {
  return await db
    .select(userColumns)
    .from(users)
    .where(and(eq(users.organizationId, organizationId), isNull(users.deletedAt)));
}

export async function getUserCredentialsByEmail(email: string) {
  const [user] = await db
    .select({ ...userColumns, passwordHash: users.passwordHash })
    .from(users)
    .where(and(eq(users.email, email.toLowerCase()), isNull(users.deletedAt)))
    .limit(1);
  return user ?? null;
}

export async function updateUserProfile(
  id: number,
  organizationId: number,
  data: Pick<InsertUser, "firstName" | "lastName">,
) {
  const [user] = await db
    .update(users)
    .set(data)
    .where(and(eq(users.id, id), eq(users.organizationId, organizationId), isNull(users.deletedAt)))
    .returning(userColumns);
  return user ?? null;
}

export async function getUserCredentialsById(id: number, organizationId: number) {
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(and(eq(users.id, id), eq(users.organizationId, organizationId), isNull(users.deletedAt)))
    .limit(1);
  return user ?? null;
}

export async function changeUserPassword(
  id: number,
  organizationId: number,
  previousHash: string,
  passwordHash: string,
) {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .update(users)
      .set({ passwordHash })
      .where(
        and(
          eq(users.id, id),
          eq(users.organizationId, organizationId),
          eq(users.passwordHash, previousHash),
          isNull(users.deletedAt),
        ),
      )
      .returning({ id: users.id });
    if (!user) return false;
    await tx.delete(refreshTokens).where(eq(refreshTokens.userId, id));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, id));
    return true;
  });
}

// Lock the account before attaching a confirmed upload so concurrent edits cannot
// retire a photo that a newer request has just selected.
export async function replaceUserAvatar(
  id: number,
  organizationId: number,
  expectedAvatarId: number | null,
  fileId: number | null,
  actualSize?: number,
) {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ avatarFileId: users.avatarFileId })
      .from(users)
      .where(
        and(eq(users.id, id), eq(users.organizationId, organizationId), isNull(users.deletedAt)),
      )
      .for("update");
    if (!user) return false;
    if (user.avatarFileId === fileId) return true;
    if (user.avatarFileId !== expectedAvatarId) return false;

    if (fileId !== null) {
      const [file] = await tx
        .update(files)
        .set({ status: "ready", actualSize })
        .where(
          and(
            eq(files.id, fileId),
            eq(files.organizationId, organizationId),
            eq(files.uploadedByUserId, id),
            eq(files.purpose, "avatar"),
            eq(files.status, "pending"),
            isNull(files.deletedAt),
          ),
        )
        .returning({ id: files.id });
      if (!file) return false;
    }

    await tx.update(users).set({ avatarFileId: fileId }).where(eq(users.id, id));
    if (user.avatarFileId !== null) {
      await tx
        .update(files)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(files.id, user.avatarFileId),
            eq(files.organizationId, organizationId),
            eq(files.uploadedByUserId, id),
            eq(files.purpose, "avatar"),
            isNull(files.deletedAt),
          ),
        );
    }
    return true;
  });
}
