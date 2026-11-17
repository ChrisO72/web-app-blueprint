import * as Headless from "@headlessui/react";
import type { ReactNode } from "react";
import { DialogToastViewport } from "../toast";

export function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Headless.Dialog open={open} onClose={onClose} className="relative z-50">
      <Headless.DialogBackdrop transition className="fixed inset-0 bg-zinc-950/25 transition-opacity duration-200 data-closed:opacity-0 motion-reduce:transition-none dark:bg-zinc-950/50" />
      <Headless.DialogPanel transition className="fixed inset-y-0 right-0 flex h-dvh w-full max-w-3xl flex-col bg-white shadow-xl transition-transform duration-200 ease-out data-closed:translate-x-full motion-reduce:transition-none dark:bg-zinc-900">
        {children}
      </Headless.DialogPanel>
      <Headless.Portal><DialogToastViewport /></Headless.Portal>
    </Headless.Dialog>
  );
}
