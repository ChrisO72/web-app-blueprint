import { useEffect } from "react";
import { useFetcher, useNavigate } from "react-router";
import type { action } from "~/web/routes/sites/new";
import { useFetcherToast } from "~/web/lib/use-fetcher-toast";
import { FormError } from "./form-error";
import { FieldError } from "./field-error";
import { Button } from "./ui-kit/button";
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from "./ui-kit/dialog";
import { Field, Label } from "./ui-kit/fieldset";
import { Input } from "./ui-kit/input";
import { Text } from "./ui-kit/text";

export function CreateSiteDialog({ guest, onClose }: { guest: boolean; onClose: () => void }) {
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const busy = fetcher.state !== "idle";
  useFetcherToast(fetcher, { success: "Site created" });

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.siteId) {
      onClose();
      void navigate(`/sites/${fetcher.data.siteId}`);
    }
  }, [fetcher.state, fetcher.data, navigate, onClose]);

  return (
    <Dialog
      open
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <DialogTitle>Add site</DialogTitle>
      <DialogDescription>
        Create a demo workspace for understanding, improving, and operating software with AI agents.
      </DialogDescription>
      <DialogBody>
        {guest ? (
          <Text>Sign up to keep your progress and create more Sites.</Text>
        ) : (
          <fetcher.Form method="post" action="/sites/new" id="create-site" className="space-y-4">
            <FormError actionData={fetcher.data} />
            <Field>
              <Label>Site name</Label>
              <Input
                name="name"
                required
                maxLength={100}
                data-autofocus
                invalid={!!fetcher.data?.fieldErrors?.name}
                disabled={busy}
              />
              <FieldError name="name" actionData={fetcher.data} />
            </Field>
          </fetcher.Form>
        )}
      </DialogBody>
      <DialogActions>
        <Button plain type="button" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        {guest ? (
          <Button href="/signup">Sign up</Button>
        ) : (
          <Button type="submit" form="create-site" disabled={busy}>
            {busy ? "Creating…" : "Add site"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
