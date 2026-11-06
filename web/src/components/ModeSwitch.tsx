import { Headset, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";

/** Customer / Agent switch. `iconsOnPhones` hides the words below 480px to make room in a busy header. */
export function ModeSwitch({ iconsOnPhones = false }: { iconsOnPhones?: boolean }) {
  const base = `flex h-9 items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors ${iconsOnPhones ? "w-10 min-[480px]:w-auto min-[480px]:px-4" : "px-3.5 sm:px-4"}`;
  const on = "bg-forest-900 text-white shadow-card";
  const off = "text-muted hover:text-forest-900";
  const word = iconsOnPhones ? "hidden min-[480px]:inline" : "";
  return (
    <nav aria-label="View mode" className="flex shrink-0 rounded-full border border-line bg-canvas p-1">
      <NavLink to="/customer" aria-label="Customer view" className={({ isActive }) => `${base} ${isActive ? on : off}`}>
        <UserRound aria-hidden className="h-4 w-4" /><span className={word}>Customer</span>
      </NavLink>
      <NavLink to="/agent" aria-label="Agent view" className={({ isActive }) => `${base} ${isActive ? on : off}`}>
        <Headset aria-hidden className="h-4 w-4" /><span className={word}>Agent</span>
      </NavLink>
    </nav>
  );
}
