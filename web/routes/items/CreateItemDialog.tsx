import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/web/components/ui-kit/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "~/web/components/ui-kit/dialog";
import { Field, Label } from "~/web/components/ui-kit/fieldset";
import { FieldError } from "~/web/components/field-error";
import { Input } from "~/web/components/ui-kit/input";
import { PlusIcon } from "@heroicons/react/24/outline";
import { FormError } from "~/web/components/form-error";
import { useFetcherToast } from "~/web/lib/use-fetcher-toast";
import type { action } from "./index";

export function CreateItemDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const fetcher = useFetcher<typeof action>();
  const actionData = fetcher.data;
  useFetcherToast(fetcher, { success: "Item created" });
  const isSubmitting = fetcher.state !== "idle";
  const formRef = useRef<HTMLFormElement>(null);

  // Reset form and close dialog on successful submission
  useEffect(() => {
    if (fetcher.state === "idle" && actionData?.success) {
      formRef.current?.reset();
      setIsOpen(false);
    }
  }, [fetcher.state, actionData]);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <PlusIcon data-slot="icon" />
        Create Item
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => {
          if (!isSubmitting) setIsOpen(false);
        }}
      >
        <DialogTitle>Create Item</DialogTitle>
        <DialogDescription>Add a new item to your list.</DialogDescription>
        <DialogBody>
          <fetcher.Form
            ref={formRef}
            method="post"
            id="create-item"
            className="grid grid-cols-1 gap-8"
          >
            <FormError actionData={actionData} />
            <Field>
              <Label>Title</Label>
              <Input
                type="text"
                name="title"
                placeholder="Enter item title"
                required
                disabled={isSubmitting}
                invalid={!!actionData?.fieldErrors?.title}
                autoFocus
              />
              <FieldError name="title" actionData={actionData} />
            </Field>
            <Field>
              <Label>Description</Label>
              <Input
                type="text"
                name="description"
                placeholder="Enter item description (optional)"
                disabled={isSubmitting}
                invalid={!!actionData?.fieldErrors?.description}
              />
              <FieldError name="description" actionData={actionData} />
            </Field>
          </fetcher.Form>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setIsOpen(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="create-item" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
