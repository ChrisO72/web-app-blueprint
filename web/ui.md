# UI components and styling

Read this when building or changing interfaces. Use the existing Catalyst-style primitives in
[components/ui-kit/](components/ui-kit/) for buttons, dialogs, tables, dropdowns, headings, and fields.

## Component pattern

```tsx
import { PlusIcon } from "@heroicons/react/16/solid";
import { Button } from "~/web/components/ui-kit/button";
import { Heading } from "~/web/components/ui-kit/heading";

type ItemsHeaderProps = { onCreate: () => void };

export function ItemsHeader({ onCreate }: ItemsHeaderProps) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <Heading>Items</Heading>
      <Button onClick={onCreate}>
        <PlusIcon data-slot="icon" /> New item
      </Button>
    </div>
  );
}
```

Use [routes/items/index.tsx](routes/items/index.tsx) for the table, pagination, and action-menu
example. The [route guide](routes.md#route-module-template) owns the form and validation template.

## Styling

- Tailwind v4 tokens live in [app.css](app.css); there is no `tailwind.config.js`.
- Use `clsx` for conditional class composition.
- Use `@heroicons/react` icons with `data-slot="icon"` so primitives style them correctly.
- Use the shared `FormError` and `FieldError` components for action errors; details are in
  [form validation](routes.md#validation).

## Toast notifications

The root app mounts `ToastProvider`. Use `useToast` from [components/toast.tsx](components/toast.tsx)
for brief action feedback. Success and ordinary notifications dismiss after five seconds; errors
and loading notifications stay until dismissed or replaced. Timers pause on hover, keyboard focus,
and while the window is inactive. Up to three notifications appear at once; additional messages queue.

```tsx
const toast = useToast();
toast.success("Changes saved"); // Green check
toast.error("Changes could not be saved", { description: "Please try again." }); // Red cross

const id = toast.loading("Uploading…"); // Built-in spinner
// When the operation completes, replace the loading notification in place:
toast.success("Upload complete", { id });

toast.show("Invitation sent", {
  icon: <PaperAirplaneIcon data-slot="icon" />,
  color: "var(--color-blue-500)", // Any CSS color
  duration: 6000, // Milliseconds; null disables automatic dismissal
});
toast.dismiss(id);
```

Every helper accepts the same options, including `icon`, `color`, `description`, `duration`, and
`id`. Pass `icon: null` to omit the icon, or supply `ToastSpinner` as a custom icon. Reusing an ID
replaces the message and resets its timer. Routine messages use polite screen-reader announcements;
reserve `priority: "assertive"` for urgent information. Motion respects reduced-motion preferences.

For a mutation fetcher that returns `ActionData` (no error fields means success), use
`useFetcherToast(fetcher, { loading: "Saving…", success: "Changes saved" })` from
[lib/use-fetcher-toast.ts](lib/use-fetcher-toast.ts). Field validation stays inline; form errors
also appear in a persistent toast. Keep `FormError` and `FieldError` in the form so recovery
guidance stays available. For frequent autosaves, prefer a quiet status beside the editor.
