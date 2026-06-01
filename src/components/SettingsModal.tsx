import React, { useState, useEffect } from "react";
import { updateProfile } from "firebase/auth";
import { doc, deleteDoc, updateDoc } from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { useAppStore } from "../store/appStore";

interface SettingsModalProps {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const user = useAppStore((s) => s.user);
  const groupId = useAppStore((s) => s.groupId);
  const role = useAppStore((s) => s.role);
  
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [memoryMb, setMemoryMb] = useState(2048);
  const [javaPath, setJavaPath] = useState("");
  
  const [isSaving, setIsSaving] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    const memStr = localStorage.getItem("hostcraft_memory_mb");
    if (memStr) setMemoryMb(parseInt(memStr, 10));
    
    const jp = localStorage.getItem("hostcraft_java_path");
    if (jp) setJavaPath(jp);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (auth.currentUser && displayName !== user?.displayName) {
        await updateProfile(auth.currentUser, { displayName });
        useAppStore.getState().setUser({
          uid: auth.currentUser.uid,
          email: auth.currentUser.email,
          displayName: displayName
        });
      }
      
      localStorage.setItem("hostcraft_memory_mb", memoryMb.toString());
      if (javaPath.trim()) {
        localStorage.setItem("hostcraft_java_path", javaPath.trim());
      } else {
        localStorage.removeItem("hostcraft_java_path");
      }
      
      onClose();
    } catch (e: any) {
      alert("Failed to save settings: " + e.message);
    }
    setIsSaving(false);
  };

  const handleLeaveGroup = async () => {
    if (!confirm("Are you sure you want to leave this group?")) return;
    setIsLeaving(true);
    try {
      if (groupId && user) {
        if (role === "Owner") {
          // If Owner, maybe delete group or just show warning?
          if (!confirm("You are the owner. Leaving will not delete the group, but you will lose owner access. Continue?")) {
            setIsLeaving(false);
            return;
          }
        }
        
        // Remove from members
        const { deleteField } = await import("firebase/firestore");
        await updateDoc(doc(db, "groups", groupId), {
          [`members.${user.uid}`]: deleteField()
        });
        
        // Remove locally
        localStorage.removeItem(`lastGroupId_${user.uid}`);
        useAppStore.getState().setGroupId(null);
      }
    } catch (e: any) {
      alert("Failed to leave group: " + e.message);
    }
    setIsLeaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080B10]/80 backdrop-blur-sm">
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          ✕
        </button>
        
        <h2 className="text-xl font-bold text-white mb-6">Settings</h2>
        
        <div className="space-y-5">
          {/* Display Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Display Name</label>
            <input 
              type="text" 
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-cyan-500 transition-colors"
              placeholder="Your username..."
            />
          </div>

          {/* Server Memory */}
          <div>
            <label className="flex justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              <span>Server Memory (RAM)</span>
              <span className="text-cyan-400">{memoryMb} MB</span>
            </label>
            <input 
              type="range" 
              min="512" 
              max="8192" 
              step="512"
              value={memoryMb}
              onChange={e => setMemoryMb(Number(e.target.value))}
              className="w-full accent-cyan-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span>512 MB</span>
              <span>8 GB</span>
            </div>
          </div>

          {/* Java Path Override */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Java Path Override (Optional)
            </label>
            <input 
              type="text" 
              value={javaPath}
              onChange={e => setJavaPath(e.target.value)}
              className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-cyan-500 transition-colors text-sm font-mono"
              placeholder="e.g. C:\Program Files\Java\jdk-21\bin\java.exe"
            />
            <p className="text-[10px] text-slate-500 mt-1">Leave empty to use the bundled Java installation.</p>
          </div>
          
          <div className="pt-4 border-t border-slate-800 flex gap-3">
            <button
              onClick={handleLeaveGroup}
              disabled={isLeaving}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              {isLeaving ? "Leaving..." : "Leave Group"}
            </button>
            <div className="flex-1"></div>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2 rounded-lg text-sm font-semibold bg-cyan-500 text-[#080B10] hover:bg-cyan-400 transition-colors flex items-center gap-2 shadow-lg shadow-cyan-500/20"
            >
              {isSaving ? (
                <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              ) : null}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
