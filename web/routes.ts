import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  // Auth routes (unprotected)
  route("login", "routes/auth/login.tsx"),
  route("forgot-password", "routes/auth/forgot-password.tsx"),
  route("reset-password", "routes/auth/reset-password.tsx"),
  route("signup", "routes/auth/signup.tsx"),
  route("logout", "routes/auth/logout.tsx"),
  route("check-email", "routes/auth/check-email.tsx"),
  route("confirm-email", "routes/auth/confirm-email.tsx"),

  route("webhooks/github", "routes/webhooks/github.ts"),

  // Protected routes
  layout("routes/layout.tsx", [
    index("routes/home.tsx"),
    layout("routes/control/layout.tsx", [
      route("control", "routes/control/index.tsx"),
      route("control/record", "routes/control/record.ts"),
      route("control/metrics", "routes/control/metrics.ts"),
      route("control/telemetry", "routes/control/telemetry.ts"),
      route("control/activity", "routes/control/activity.tsx"),
      route("control/activity/options", "routes/control/activity-options.ts"),
      route("control/issues", "routes/control/issues.tsx"),
      route("control/prs", "routes/control/prs.tsx"),
      route("control/actions", "routes/control/actions.tsx"),
      route("control/docs", "routes/control/docs.tsx"),
      route("control/settings", "routes/control/settings.tsx"),
    ]),
    route("account", "routes/account/index.tsx"),
    route("account/avatar", "routes/account/avatar.ts"),
    route("files", "routes/files/index.tsx"),
    route("files/:fileId/download", "routes/files/download.ts"),
    route("files/:fileId/preview", "routes/files/preview.ts"),
    route("items", "routes/items/index.tsx"),
    route("items/:item", "routes/items/item.tsx"),
    layout("routes/admin/layout.tsx", [
      route("admin", "routes/admin/index.tsx"),
      route("admin/users", "routes/admin/users.tsx"),
      route("admin/organizations", "routes/admin/organizations.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
