import { Outlet } from "react-router";
import { ControlNav } from "./control-nav";

export default function ControlLayout() {
  return (
    <div>
      <ControlNav />
      <Outlet />
    </div>
  );
}
