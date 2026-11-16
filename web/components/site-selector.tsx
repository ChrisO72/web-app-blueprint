import { ChevronDownIcon, PlusIcon } from "@heroicons/react/16/solid";
import { CloseButton } from "@headlessui/react";
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownHeading,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSection,
} from "./ui-kit/dropdown";
import { SidebarItem } from "./ui-kit/sidebar";

type Site = { id: number; name: string };

export function SiteSelector({
  organizationName,
  sites,
  selectedSite,
  onAddSite,
}: {
  organizationName: string;
  sites: Site[];
  selectedSite?: Site;
  onAddSite: () => void;
}) {
  return (
    <Dropdown>
      <DropdownButton as={SidebarItem} aria-label="Choose a Site">
        <span className="min-w-0">
          <span className="block truncate">{selectedSite?.name ?? "Add site"}</span>
          <span className="block truncate text-xs/5 font-normal text-zinc-500 dark:text-zinc-400">
            {organizationName}
          </span>
        </span>
        <ChevronDownIcon data-slot="icon" />
      </DropdownButton>
      <DropdownMenu anchor="bottom start" className="max-w-80 min-w-64">
        <DropdownSection>
          <DropdownHeading className="break-words">{organizationName}</DropdownHeading>
          {sites.length ? (
            sites.map((site) => (
              <CloseButton
                as={DropdownItem}
                key={site.id}
                href={`/sites/${site.id}`}
                aria-current={selectedSite?.id === site.id ? "page" : undefined}
              >
                <DropdownLabel className="truncate">{site.name}</DropdownLabel>
              </CloseButton>
            ))
          ) : (
            <DropdownItem disabled>
              <DropdownLabel>No Sites yet</DropdownLabel>
            </DropdownItem>
          )}
        </DropdownSection>
        <DropdownDivider />
        <CloseButton as={DropdownItem} onClick={onAddSite}>
          <PlusIcon data-slot="icon" />
          <DropdownLabel>Add site</DropdownLabel>
        </CloseButton>
      </DropdownMenu>
    </Dropdown>
  );
}
