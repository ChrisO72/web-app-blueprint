import {
  ArrowRightStartOnRectangleIcon,
  ChevronDownIcon,
  Cog8ToothIcon,
} from "@heroicons/react/16/solid";
import { useSubmit } from "react-router";
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownHeader,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "./ui-kit/dropdown";
import { ThemeToggle, useTheme } from "./theme-toggle";
import { getDisplayName, type AvatarUser } from "./user-avatar";

export function AccountMenu({ user }: { user: AvatarUser }) {
  const submit = useSubmit();
  const { theme, selectTheme } = useTheme();
  return (
    <Dropdown>
      <DropdownButton as="button" aria-label="Account menu" className="nav-link gap-1">
        Account
        <ChevronDownIcon aria-hidden="true" className="size-3.5" />
      </DropdownButton>
      <DropdownMenu
        anchor="bottom end"
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
        <DropdownHeader>
          <p className="text-sm font-medium">{getDisplayName(user)}</p>
          <p className="max-w-64 truncate text-xs text-zinc-500 dark:text-zinc-400">{user.email}</p>
        </DropdownHeader>
        <DropdownDivider />
        <ThemeToggle theme={theme} onSelect={selectTheme} />
        <DropdownDivider />
        <DropdownItem href="/account">
          <Cog8ToothIcon data-slot="icon" />
          <DropdownLabel>Account settings</DropdownLabel>
        </DropdownItem>
        <DropdownDivider />
        <DropdownItem onClick={() => submit(null, { method: "post", action: "/logout" })}>
          <ArrowRightStartOnRectangleIcon data-slot="icon" />
          <DropdownLabel>Sign out</DropdownLabel>
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
}
