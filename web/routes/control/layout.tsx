import clsx from "clsx";
import { Outlet, useLocation } from "react-router";
import { ControlNav } from "./control-nav";

export default function ControlLayout() {
  const { pathname } = useLocation();
  const hasScrollableContent = [
    "/control/prs",
    "/control/issues",
    "/control/actions",
    "/control/docs",
    "/control/activity",
  ].includes(pathname.replace(/\/$/, ""));

  return (
    <div
      className={clsx(
        hasScrollableContent &&
          "flex h-[calc(100dvh-8rem)] min-w-0 flex-col lg:h-[calc(100dvh-6rem)]",
      )}
    >
      <div className="shrink-0 overflow-x-auto">
        <ControlNav />
      </div>
      <Outlet />
    </div>
  );
}
