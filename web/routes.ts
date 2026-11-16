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

  // Protected routes
  layout("routes/layout.tsx", [
    index("routes/home.tsx"),
    route("account", "routes/account/index.tsx"),
    route("account/avatar", "routes/account/avatar.ts"),
    route("sites/new", "routes/sites/new.ts"),
    route("sites/:siteId/:view?/:number?", "routes/sites/workspace.tsx"),
    layout("routes/admin/layout.tsx", [
      route("admin", "routes/admin/index.tsx"),
      route("admin/users", "routes/admin/users.tsx"),
      route("admin/organizations", "routes/admin/organizations.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
