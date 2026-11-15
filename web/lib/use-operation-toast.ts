import { useEffect, useMemo, useRef } from "react";
import { useToast } from "~/web/components/toast";

/** One notification for a multi-step operation, cleaned up if its owner leaves while pending. */
export function useOperationToast() {
  const toast = useToast();
  const id = useRef<string | undefined>(undefined);
  const pending = useRef(false);

  useEffect(
    () => () => {
      if (pending.current && id.current) toast.dismiss(id.current);
      pending.current = false;
    },
    [toast],
  );

  return useMemo(
    () => ({
      loading(message: string) {
        pending.current = true;
        id.current = toast.loading(message, { id: id.current });
      },
      success(message: string) {
        pending.current = false;
        id.current = toast.success(message, { id: id.current });
      },
      error(message: string) {
        pending.current = false;
        id.current = toast.error(message, { id: id.current });
      },
      dismiss() {
        pending.current = false;
        if (id.current) toast.dismiss(id.current);
      },
    }),
    [toast],
  );
}
