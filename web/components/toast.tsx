import {
  CheckCircleIcon,
  InformationCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export type ToastOptions = {
  /** Reuse an ID to replace an existing toast in place. */
  id?: string;
  description?: string;
  /** Pass an icon element, or null to hide the icon. */
  icon?: ReactNode;
  /** Any CSS color, including a Tailwind variable such as var(--color-blue-500). */
  color?: CSSProperties["color"];
  /** Milliseconds; null keeps the toast until dismissed or replaced. */
  duration?: number | null;
  /** Reserve assertive announcements for urgent, time-sensitive information. */
  priority?: "polite" | "assertive";
};

type Notification = ToastOptions & {
  id: string;
  message: string;
  duration: number | null;
};

type ToastApi = {
  show: (message: string, options?: ToastOptions) => string;
  success: (message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  loading: (message: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);
const VISIBLE_LIMIT = 3;

export function useToast(): ToastApi {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast must be used within ToastProvider");
  return toast;
}

/** Decorative spinner; its containing control or notification supplies the accessible label. */
export function ToastSpinner() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="size-5 motion-safe:animate-spin"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <path
          key={index}
          d="M10 2.5v3"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          opacity={(index + 1) / 8}
          transform={`rotate(${index * 45} 10 10)`}
        />
      ))}
    </svg>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pagePaused, setPagePaused] = useState(false);
  const prefix = useId();
  const sequence = useRef(0);

  const dismiss = useCallback((id: string) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id));
  }, []);

  const show = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = options.id ?? `${prefix}-${++sequence.current}`;
      const notification: Notification = {
        icon: <InformationCircleIcon />,
        ...options,
        message,
        id,
        duration: options.duration === undefined ? 5000 : options.duration,
      };
      setNotifications((current) => {
        const index = current.findIndex((entry) => entry.id === id);
        if (index === -1) return [...current, notification];
        return current.map((entry) => (entry.id === id ? notification : entry));
      });
      return id;
    },
    [prefix],
  );

  const toast = useMemo<ToastApi>(
    () => ({
      show,
      success: (message, options) =>
        show(message, {
          icon: <CheckCircleIcon />,
          color: "var(--color-green-500)",
          ...options,
        }),
      error: (message, options) =>
        show(message, {
          icon: <XCircleIcon />,
          color: "var(--color-red-500)",
          duration: null,
          ...options,
        }),
      loading: (message, options) =>
        show(message, { icon: <ToastSpinner />, duration: null, ...options }),
      dismiss,
    }),
    [show, dismiss],
  );

  useEffect(() => {
    const update = () => setPagePaused(document.hidden || !document.hasFocus());
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
    };
  }, []);

  const visible = notifications.slice(0, VISIBLE_LIMIT);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Keep live regions mounted before inserting messages. Only visible toasts are announced. */}
      {(["polite", "assertive"] as const).map((priority) => (
        <div key={priority} aria-live={priority} aria-relevant="additions text" className="sr-only">
          {visible
            .filter((entry) => (entry.priority ?? "polite") === priority)
            .map((entry) => (
              <p key={entry.id}>
                {entry.message}
                {entry.description ? `. ${entry.description}` : ""}
              </p>
            ))}
        </div>
      ))}
      <section
        aria-label="Notifications"
        tabIndex={-1}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-0 sm:w-96 sm:justify-end sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <ol className="flex w-full max-w-sm flex-col gap-3">
          <AnimatePresence initial={false}>
            {visible.map((notification) => (
              <ToastCard
                key={notification.id}
                notification={notification}
                pagePaused={pagePaused}
                dismiss={dismiss}
              />
            ))}
          </AnimatePresence>
        </ol>
      </section>
    </ToastContext.Provider>
  );
}

function ToastCard({
  notification,
  pagePaused,
  dismiss,
}: {
  notification: Notification;
  pagePaused: boolean;
  dismiss: ToastApi["dismiss"];
}) {
  const reduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(notification.duration);
  const paused = pagePaused || hovered || focused;

  useEffect(() => {
    remaining.current = notification.duration;
  }, [notification]);

  useEffect(() => {
    if (paused || remaining.current === null) return;
    const started = Date.now();
    const timer = window.setTimeout(() => dismiss(notification.id), Math.max(0, remaining.current));
    return () => {
      window.clearTimeout(timer);
      if (remaining.current !== null) {
        remaining.current = Math.max(0, remaining.current - (Date.now() - started));
      }
    };
  }, [notification, paused, dismiss]);

  return (
    <motion.li
      layout={!reduceMotion}
      initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      className="pointer-events-auto flex items-start gap-3 rounded-2xl bg-white/95 p-4 shadow-[0_4px_24px_-4px_rgb(0_0_0/0.16)] ring-1 ring-zinc-950/8 backdrop-blur-xl dark:bg-zinc-900/95 dark:ring-white/15 forced-colors:outline"
    >
      {notification.icon !== null && (
        <span
          aria-hidden="true"
          style={{ color: notification.color }}
          className="mt-0.5 shrink-0 text-zinc-500 dark:text-zinc-400 [&>svg]:size-5"
        >
          {notification.icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm/6 font-medium break-words text-zinc-950 dark:text-white">
          {notification.message}
        </p>
        {notification.description && (
          <p className="mt-0.5 text-sm/5 break-words text-zinc-600 dark:text-zinc-400">
            {notification.description}
          </p>
        )}
      </div>
      <button
        type="button"
        aria-label={`Dismiss notification: ${notification.message}`}
        onClick={(event) => {
          // Preserve keyboard focus when the dismiss button is removed.
          if (event.detail === 0) event.currentTarget.closest("section")?.focus();
          dismiss(notification.id);
        }}
        className="relative -m-1 flex size-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition before:absolute before:size-11 hover:bg-zinc-950/5 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:hover:bg-white/10 dark:hover:text-zinc-200"
      >
        <XMarkIcon aria-hidden="true" className="size-4" />
      </button>
    </motion.li>
  );
}
