/**
 * Global Zustand Store — Phase 1
 *
 * Holds auth state, group metadata, live server status,
 * role derivation, and loading/error flags for the UI.
 */

import { create } from "zustand";
import type { GroupDocument, GroupStatus, UserRole } from "../lib/firestore";

// ─── State Shape ────────────────────────────────────────────────────────────

interface UserState {
  uid: string;
  email: string | null;
  displayName: string | null;
}

interface AppState {
  // ── Auth ───────────────────────────────────────────────
  user: UserState | null;
  authLoading: boolean; // true until onAuthStateChanged fires
  authError: string | null;

  // ── Group Metadata ─────────────────────────────────────
  groupId: string | null;
  group: GroupDocument | null;
  groupLoading: boolean;

  // ── Live Server Status ─────────────────────────────────
  status: GroupStatus | null;
  statusLoading: boolean;

  // ── Derived ────────────────────────────────────────────
  role: UserRole;

  // ── Sync (placeholder for future phases) ───────────────
  syncPercentage: number;
  isSyncing: boolean;

  // ── Actions ────────────────────────────────────────────
  setUser: (user: UserState | null) => void;
  setAuthLoading: (loading: boolean) => void;
  setAuthError: (error: string | null) => void;

  setGroupId: (groupId: string | null) => void;
  setGroup: (group: GroupDocument | null) => void;
  setGroupLoading: (loading: boolean) => void;

  setStatus: (status: GroupStatus | null) => void;
  setStatusLoading: (loading: boolean) => void;

  setRole: (role: UserRole) => void;

  setSyncPercentage: (pct: number) => void;
  setIsSyncing: (isSyncing: boolean) => void;

  // ── Playit ─────────────────────────────────────────────
  playitClaimUrl: string | null;
  setPlayitClaimUrl: (url: string | null) => void;
  playitStatus: string | null;
  setPlayitStatus: (status: string | null) => void;

  /** Convenience: reset everything on sign-out */
  reset: () => void;
}

// ─── Default values ─────────────────────────────────────────────────────────

const initialState = {
  user: null,
  authLoading: true, // starts true — waiting for Firebase to resolve
  authError: null,

  groupId: null,
  group: null,
  groupLoading: false,

  status: null,
  statusLoading: false,

  role: null as UserRole,

  syncPercentage: 100,
  isSyncing: false,
  
  playitClaimUrl: null,
  playitStatus: null,
};

// ─── Store ──────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  setUser: (user) => set({ user }),
  setAuthLoading: (authLoading) => set({ authLoading }),
  setAuthError: (authError) => set({ authError }),

  setGroupId: (groupId) => set({ groupId }),
  setGroup: (group) => set({ group }),
  setGroupLoading: (groupLoading) => set({ groupLoading }),

  setStatus: (status) => set({ status }),
  setStatusLoading: (statusLoading) => set({ statusLoading }),

  setRole: (role) => set({ role }),

  setSyncPercentage: (syncPercentage) => set({ syncPercentage }),
  setIsSyncing: (isSyncing) => set({ isSyncing }),

  setPlayitClaimUrl: (playitClaimUrl) => set({ playitClaimUrl }),
  setPlayitStatus: (playitStatus) => set({ playitStatus }),

  reset: () => set(initialState),
}));
