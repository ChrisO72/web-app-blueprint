import {
  ArrowRightStartOnRectangleIcon,
  ChevronUpIcon,
  Cog8ToothIcon,
  CommandLineIcon,
  ShieldCheckIcon,
} from "@heroicons/react/16/solid";
import { useSubmit } from "react-router";
import type { User } from "~/db/repositories/users";
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "./ui-kit/dropdown";
import { ThemeToggle, useTheme } from "./theme-toggle";
import { NavbarItem } from "./ui-kit/navbar";
import { SidebarItem } from "./ui-kit/sidebar";
import { getDisplayName, UserAvatar, type AvatarUser } from "./user-avatar";

export function AccountMenu({
  user,
  mobile = false,
}: {
  user: AvatarUser & Pick<User, "role">;
  mobile?: boolean;
}) {
  const submit = useSubmit();
  const { theme, selectTheme } = useTheme();
  return (
    <Dropdown>
      {mobile ? (
        <DropdownButton as={NavbarItem} aria-label="Account menu">
          <UserAvatar user={user} className="size-8" />
        </DropdownButton>
      ) : (
        <DropdownButton as={SidebarItem} aria-label="Account menu">
          <span className="flex min-w-0 items-center gap-3">
            <UserAvatar user={user} className="size-10" />
            <span className="min-w-0">
              <span className="block truncate text-sm/5 font-medium text-zinc-950 dark:text-white">
                {getDisplayName(user)}
              </span>
              <span className="block truncate text-xs/5 font-normal text-zinc-500 dark:text-zinc-400">
                {user.email}
              </span>
            </span>
          </span>
          <ChevronUpIcon data-slot="icon" />
        </DropdownButton>
      )}
      <DropdownMenu
        anchor={mobile ? "bottom end" : "top start"}
        className="min-w-64"
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          const option = event.currentTarget.querySelector<HTMLButtonElement>(
            "[data-theme-option][data-focus]",
          );
          if (option) {
            // Menu.Items normally closes after keyboard activation, even when
            // the item's click handler prevents its default close behavior.
            event.preventDefault();
            option.click();
          }
        }}
      >
        <ThemeToggle theme={theme} onSelect={selectTheme} />
        <DropdownDivider />
        <DropdownItem href="/account">
          <Cog8ToothIcon data-slot="icon" />
          <DropdownLabel>Account settings</DropdownLabel>
        </DropdownItem>
        {user.role === "admin" && (
          <>
            <DropdownDivider />
            <DropdownItem href="/admin">
              <ShieldCheckIcon data-slot="icon" />
              <DropdownLabel>Admin</DropdownLabel>
            </DropdownItem>
            <DropdownItem href="/control">
              <CommandLineIcon data-slot="icon" />
              <DropdownLabel>Control</DropdownLabel>
            </DropdownItem>
          </>
        )}
        <DropdownDivider />
        <DropdownItem onClick={() => submit(null, { method: "post", action: "/logout" })}>
          <ArrowRightStartOnRectangleIcon data-slot="icon" />
          <DropdownLabel>Sign out</DropdownLabel>
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
}
