/**
 * RoleBadge — Displays the user's role (Owner / Host / Player) with distinct colors.
 */

import type { UserRole } from "../lib/firestore";

const roleConfig: Record<string, { bg: string; text: string; border: string; label: string }> = {
  Owner: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/20",
    label: "👑 Owner",
  },
  Host: {
    bg: "bg-cyan-500/10",
    text: "text-cyan-400",
    border: "border-cyan-500/20",
    label: "🖥️ Host",
  },
  Player: {
    bg: "bg-indigo-500/10",
    text: "text-indigo-400",
    border: "border-indigo-500/20",
    label: "🎮 Player",
  },
};

export default function RoleBadge({ role }: { role: UserRole }) {
  if (!role) return null;
  const cfg = roleConfig[role];
  if (!cfg) return null;

  return (
    <span
      className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      {cfg.label}
    </span>
  );
}
