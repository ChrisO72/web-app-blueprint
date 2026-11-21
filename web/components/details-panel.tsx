import { Fragment, type ReactNode } from "react";
import { XMarkIcon } from "@heroicons/react/16/solid";
import { Button } from "./ui-kit/button";
import { DialogDescription, DialogTitle } from "./ui-kit/dialog";
import { Drawer } from "./ui-kit/drawer";
import { DescriptionDetails, DescriptionList, DescriptionTerm } from "./ui-kit/description-list";

export function DetailsPanel({
  open,
  onClose,
  title,
  description,
  header,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  header?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Drawer open={open} onClose={onClose}>
      <div className="shrink-0 border-b border-zinc-950/10 p-6 dark:border-white/10">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="wrap-anywhere">{title}</DialogTitle>
            {description && (
              <DialogDescription className="wrap-anywhere">{description}</DialogDescription>
            )}
          </div>
          <Button plain onClick={onClose} aria-label="Close details" data-autofocus>
            <XMarkIcon data-slot="icon" />
          </Button>
        </div>
        {header}
      </div>
      {children}
      {actions && (
        <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-zinc-950/10 p-6 dark:border-white/10">
          {actions}
        </div>
      )}
    </Drawer>
  );
}

export function DetailsPanelBody({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">{children}</div>;
}

export function DetailsFields({ fields }: { fields: { label: string; value: ReactNode }[] }) {
  return (
    <DescriptionList>
      {fields.map(({ label, value }) => (
        <Fragment key={label}>
          <DescriptionTerm>{label}</DescriptionTerm>
          <DescriptionDetails className="min-w-0 wrap-anywhere whitespace-pre-wrap">
            {value ?? "—"}
          </DescriptionDetails>
        </Fragment>
      ))}
    </DescriptionList>
  );
}
