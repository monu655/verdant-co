import { Headset, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";

export function ModeSwitch() {
  const base = "flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors sm:px-4";
  const on = "bg-forest-900 text-white shadow-card";
  const off = "text-muted hover:text-forest-900";
  return (
    <nav aria-label="View mode" className="flex rounded-full border border-line bg-canvas p-1">
      <NavLink to="/customer" className={({ isActive }) => `${base} ${isActive ? on : off}`}>
        <UserRound aria-hidden className="h-4 w-4" />Customer
      </NavLink>
      <NavLink to="/agent" className={({ isActive }) => `${base} ${isActive ? on : off}`}>
        <Headset aria-hidden className="h-4 w-4" />Agent
      </NavLink>
    </nav>
  );
}