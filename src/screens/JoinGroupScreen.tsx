import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function JoinGroupScreen() {
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const user = useAppStore((s) => s.user);
  const setGroupId = useAppStore((s) => s.setGroupId);

  async function handleJoin() {
    if (!inviteCode.trim() || !user) return;
    setLoading(true);
    setError("");

    try {
      // In a real app, you'd look up the group by invite code.
      // For simplicity, we assume the invite code IS the groupId here.
      const groupRef = doc(db, "groups", inviteCode.trim());
      const groupSnap = await getDoc(groupRef);

      if (!groupSnap.exists()) {
        setError("Group not found");
        setLoading(false);
        return;
      }

      await updateDoc(groupRef, {
        members: arrayUnion(user.uid)
      });

      setGroupId(inviteCode.trim());
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  }

  return (
    <div className="p-6 bg-[#080B10]/60 border border-[#1E293B] rounded-2xl mt-8">
      <h3 className="text-sm font-bold text-white mb-2">Join an Existing Group</h3>
      <p className="text-xs text-slate-400 mb-4">Enter the group code provided by your friend.</p>
      
      <div className="flex gap-2">
        <input 
          type="text" 
          placeholder="Group Code"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          className="flex-1 bg-[#0F172A] border border-[#1E293B] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500"
        />
        <button 
          onClick={handleJoin}
          disabled={loading || !inviteCode.trim()}
          className="px-6 py-3 rounded-xl bg-cyan-500 text-[#080B10] font-bold hover:bg-cyan-400 disabled:opacity-50 transition-colors"
        >
          {loading ? "Joining..." : "Join"}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  );
}
