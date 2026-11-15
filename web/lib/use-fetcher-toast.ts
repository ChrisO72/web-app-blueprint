import { useEffect, useRef } from "react";
import type { FetcherWithComponents } from "react-router";
import type { ActionData } from "~/web/lib/form";
import { useOperationToast } from "~/web/lib/use-operation-toast";

/** Show mutation feedback, optionally replacing a loading toast with the result. */
export function useFetcherToast(
  fetcher: Pick<FetcherWithComponents<ActionData>, "state" | "data">,
  messages: { loading?: string; success: string; fieldErrors?: "inline" | "toast" },
) {
  const operation = useOperationToast();
  const pending = useRef(false);

  useEffect(() => {
    if (fetcher.state === "submitting" && !pending.current) {
      pending.current = true;
      if (messages.loading) operation.loading(messages.loading);
      else operation.dismiss();
    }
    if (fetcher.state !== "idle" || !pending.current) return;
    pending.current = false;

    if (fetcher.data?.formError) {
      operation.error(fetcher.data.formError);
    } else if (fetcher.data?.fieldErrors && messages.fieldErrors === "toast") {
      const error = Object.values(fetcher.data.fieldErrors).flat().find(Boolean);
      if (error) operation.error(error);
      else operation.dismiss();
    } else if (!fetcher.data || fetcher.data.fieldErrors) {
      // Validation guidance stays next to the form fields.
      operation.dismiss();
    } else {
      operation.success(messages.success);
    }
  }, [
    fetcher.state,
    fetcher.data,
    messages.loading,
    messages.success,
    messages.fieldErrors,
    operation,
  ]);
}
