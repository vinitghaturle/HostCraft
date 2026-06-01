/**
 * GroupIdInput — Lets the user enter a Firestore group ID to connect to.
 * In Phase 6 this will be replaced with a proper invite code system.
 */

import { useState, type FormEvent } from "react";
import { getGroup } from "../lib/firestore";
import { useAppStore } from "../store/appStore";

export default function GroupIdInput() {
  const user = useAppStore((s) => s.user);
  const setGroupId = useAppStore((s) => s.setGroupId);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const inputVal = input.trim();
    if (!inputVal) return;

    setError(null);
    setLoading(true);

    try {
      let id = inputVal;
      // If it's 6 characters, first try to resolve it as an invite code
      if (inputVal.length === 6) {
        try {
          const { resolveInviteCode } = await import("../lib/invites");
          id = await resolveInviteCode(inputVal.toUpperCase());
        } catch (e) {
          // If it fails to resolve as an invite code, it might just be a 6-character Group ID!
          id = inputVal;
        }
      }
      
      const group = await getGroup(id);
      if (!group) {
        setError("Group not found. It may have been deleted or the code is invalid.");
        setLoading(false);
        return;
      }
      // Verify user is a member, if not, add them to the group
      if (!group.members?.[user!.uid]) {
        const { doc, updateDoc } = await import("firebase/firestore");
        const { db } = await import("../lib/firebase");
        
        await updateDoc(doc(db, "groups", id), {
          [`members.${user!.uid}`]: {
            role: "Player",
            name: user!.displayName || user!.email?.split("@")[0] || "Unknown"
          }
        });
      }
      setGroupId(id);
    } catch (err: any) {
      setError(err.message || "Failed to load group.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-[#1E293B] bg-[#0F172A]/60 backdrop-blur-md p-8">
        <h2 className="text-xl font-bold text-white mb-1">Connect to a World</h2>
        <p className="text-sm text-slate-400 mb-6">
          Enter the 6-character invite code or your full Group ID.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-medium uppercase tracking-wider">
              Invite Code or Group ID
            </label>
            <input
              id="group-id-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. ABC123 or your Group ID"
              required
              className="w-full px-4 py-3 rounded-xl bg-[#080B10]/80 border border-[#1E293B] text-white text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/25 transition-all font-mono"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5 text-red-300 text-xs flex items-center gap-2">
              <span className="shrink-0">⚠️</span>
              {error}
            </div>
          )}

          <button
            id="group-connect-btn"
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3.5 rounded-xl font-semibold tracking-wider text-[#080B10] bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 transition-all duration-300 transform active:scale-[0.97] disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 cursor-pointer"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                Connecting...
              </span>
            ) : "Connect"}
          </button>
        </form>
      </div>
    </div>
  );
}
