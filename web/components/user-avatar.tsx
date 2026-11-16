import { useState } from "react";
import clsx from "clsx";
import { Avatar } from "./ui-kit/avatar";

export type AvatarUser = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  avatarFileId: number | null;
};

export function getDisplayName(user: AvatarUser) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Guest";
}

export function UserAvatar({ user, className }: { user: AvatarUser; className?: string }) {
  const [failedSource, setFailedSource] = useState<string>();
  const source = user.avatarFileId ? `/account/avatar?v=${user.avatarFileId}` : undefined;
  const initials =
    [user.firstName, user.lastName]
      .filter(Boolean)
      .map((name) => name?.[0])
      .join("") ||
    user.email?.slice(0, 2) ||
    "G";
  return (
    <span
      className={clsx(
        "relative inline-grid shrink-0 overflow-hidden rounded-[20%] bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-white",
        className,
      )}
    >
      <Avatar square initials={initials} className="size-full" />
      {source && failedSource !== source && (
        <img
          src={source}
          alt=""
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailedSource(source)}
        />
      )}
    </span>
  );
}
