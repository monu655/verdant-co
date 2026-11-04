import { Headset, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";

export function ModeSwitch() {
  const base = "flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors";
  return (
    <nav aria-label="View mode" className="flex rounded-lg border border-line bg-white p-0.5 shadow-card">
      <NavLink to="/customer" className={({ isActive }) => `${base} ${isActive ? "bg-forest-900 text-white" : "text-muted hover:text-forest-900"}`}>
        <UserRound aria-hidden className="h-4 w-4" />Customer
      </NavLink>
      <NavLink to="/agent" className={({ isActive }) => `${base} ${isActive ? "bg-forest-900 text-white" : "text-muted hover:text-forest-900"}`}>
        <Headset aria-hidden className="h-4 w-4" />Agent
      </NavLink>
    </nav>
  );
}
