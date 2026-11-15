import { useEffect, useRef } from "react";
import type { FetcherWithComponents } from "react-router";
import { useToast } from "~/web/components/toast";
import type { ActionData } from "~/web/lib/form";

/** Connect a mutation fetcher to one loading toast, then replace it with its result. */
export function useFetcherToast(
  fetcher: Pick<FetcherWithComponents<ActionData>, "state" | "data">,
  messages: { loading: string; success: string },
) {
  const toast = useToast();
  const pending = useRef(false);
  const id = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (fetcher.state === "submitting" && !pending.current) {
      pending.current = true;
      id.current = toast.loading(messages.loading, { id: id.current });
    }
    if (fetcher.state !== "idle" || !pending.current) return;
    pending.current = false;

    if (fetcher.data?.formError) {
      toast.error(fetcher.data.formError, { id: id.current });
    } else if (!fetcher.data || fetcher.data.fieldErrors) {
      // Validation guidance stays next to the form fields.
      if (id.current) toast.dismiss(id.current);
    } else {
      toast.success(messages.success, { id: id.current });
    }
  }, [fetcher.state, fetcher.data, messages.loading, messages.success, toast]);

  useEffect(
    () => () => {
      if (pending.current && id.current) toast.dismiss(id.current);
      pending.current = false;
    },
    [toast],
  );
}
