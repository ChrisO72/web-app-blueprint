# Routes and forms

Read this when adding a route, loader, action, or form. For session and permission rules, see [auth.md](auth.md).

## Routing

Route table lives in [routes.ts](routes.ts). Add new routes there with `route()`, `index()`, and `layout()` from `@react-router/dev/routes`:

```ts
import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  route("login", "routes/auth/login.tsx"),
  layout("routes/layout.tsx", [
    index("routes/home.tsx"),
    route("sites/new", "routes/sites/new.ts"),
  ]),
] satisfies RouteConfig;
```

## Route module template

Route modules export a `loader`, an `action`, and a default component as needed. Types come from the generated `./+types/<name>` module.

```tsx
import type { Route } from "./+types/index";
import { Form, redirect, useActionData } from "react-router";
import { z } from "zod";
import { FieldError } from "~/web/components/field-error";
import { FormError } from "~/web/components/form-error";
import { Field, Label } from "~/web/components/ui-kit/fieldset";
import { Input } from "~/web/components/ui-kit/input";
import { getAuthenticatedUser } from "~/web/lib/session.server";
import { parseForm, type ActionData } from "~/web/lib/form";
import { createSite } from "~/db/repositories/sites";

const createSiteSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
});

export async function loader({ context }: Route.LoaderArgs) {
  const user = getAuthenticatedUser(context);
  return { user };
}

export async function action({
  request,
  context,
}: Route.ActionArgs): Promise<ActionData | Response> {
  const user = getAuthenticatedUser(context);

  const formData = await request.formData();
  const { data, fieldErrors } = parseForm(formData, createSiteSchema);
  if (fieldErrors) return { fieldErrors };

  await createSite(user.organizationId, data.title);
  return redirect(".");
}

export default function Page() {
  const actionData = useActionData<ActionData>();
  return (
    <Form method="POST">
      <FormError actionData={actionData} />
      <Field>
        <Label>Title</Label>
        <Input name="title" invalid={!!actionData?.fieldErrors?.title} />
        <FieldError name="title" actionData={actionData} />
      </Field>
    </Form>
  );
}
```

## Data access

Routes import from [db/repositories/](../db/repositories/).

```ts
import { listSites } from "~/db/repositories/sites";

const sites = await listSites(user.organizationId);
```

Multi-org: scope every query by `organizationId` (read it from the authenticated user). See the [repository guide](../db/repositories/repository.md).

## Validation

Zod for every form/action input. Parse with `parseForm` from [lib/form.ts](lib/form.ts) (action template above). Actions return the shared `ActionData` shape — `{ fieldErrors?, formError? }` — so every form renders the same way:

- `<FormError actionData={actionData} />` from [components/form-error.tsx](components/form-error.tsx) at the top of the `<Form>` for top-level errors (e.g. "Invalid email or password").
- `<FieldError name="..." actionData={actionData} />` from [components/field-error.tsx](components/field-error.tsx) next to each `<Input>`, with `invalid={!!actionData?.fieldErrors?.<name>}` on the input.

If an action also needs to return successful data alongside, intersect with the extra fields (`type MyActionData = ActionData & { resentAt?: string }`) — never reuse `formError`/`fieldErrors` for non-error state.
