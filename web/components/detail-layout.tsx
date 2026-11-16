import * as Headless from "@headlessui/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { DialogToastViewport } from "./toast";

export function DetailLayout({
  children,
  panel,
  label,
  closeHref,
}: {
  children: ReactNode;
  panel: ReactNode;
  label: string;
  closeHref: string;
}) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const transition = { duration: reduceMotion ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <>
      {children}
      <AnimatePresence initial={false}>
        {panel && (
          <Headless.Dialog
            as={motion.div}
            key="detail-panel"
            static
            open
            onClose={() => void navigate(closeHref, { preventScrollReset: true })}
            aria-label={label}
            className="relative z-40"
            initial="closed"
            animate="open"
            exit="closed"
          >
            <Headless.DialogBackdrop
              as={motion.div}
              className="fixed inset-0 bg-zinc-950/25 dark:bg-zinc-950/50"
              variants={{
                closed: { opacity: 0, transition },
                open: { opacity: 1, transition },
              }}
            />
            <div className="fixed inset-0 flex justify-end">
              <Headless.DialogPanel
                as={motion.div}
                className="h-dvh w-full max-w-lg overflow-y-auto overscroll-contain border-l border-zinc-950/10 bg-white p-6 wrap-break-word shadow-xl sm:rounded-l-xl dark:border-white/10 dark:bg-zinc-900"
                variants={{
                  closed: { x: reduceMotion ? 0 : "100%", transition },
                  open: { x: 0, transition },
                }}
              >
                {panel}
              </Headless.DialogPanel>
            </div>
            <Headless.Portal>
              <DialogToastViewport />
            </Headless.Portal>
          </Headless.Dialog>
        )}
      </AnimatePresence>
    </>
  );
}
