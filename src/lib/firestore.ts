/**
 * Firestore Queries — Phase 1
 *
 * Group document reads, real-time status listener via onSnapshot,
 * and the Phase 0 test write (kept for reference).
 */

import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GroupMember {
  role: "Owner" | "Host" | "Player";
  name: string;
}

/** Firestore shape of groups/{groupId} */
export interface GroupDocument {
  owner: string;
  name: string;
  hosts?: Record<string, boolean>; // deprecated
  members: Record<string, GroupMember | boolean>;
}

/** Firestore shape of groups/{groupId}/status/status */
export interface GroupStatus {
  online: boolean;
  host: string | null;
  address: string | null;
  players: number;
  lastHeartbeat: any; // Firestore Timestamp or null
}

// ─── Group Reads ────────────────────────────────────────────────────────────

/** Fetch the group document once. Returns null if it doesn't exist. */
export async function getGroup(
  groupId: string
): Promise<GroupDocument | null> {
  const snap = await getDoc(doc(db, "groups", groupId));
  return snap.exists() ? (snap.data() as GroupDocument) : null;
}

/** Fetch the status sub-document once. Returns null if it doesn't exist. */
export async function getGroupStatus(
  groupId: string
): Promise<GroupStatus | null> {
  const snap = await getDoc(doc(db, "groups", groupId, "status", "status"));
  return snap.exists() ? (snap.data() as GroupStatus) : null;
}

// ─── Real-Time Listener ─────────────────────────────────────────────────────

/**
 * Subscribe to live updates on groups/{groupId}/status/status.
 * Fires immediately with current data, then on every change.
 * Returns an unsubscribe function.
 */
export function subscribeGroupStatus(
  groupId: string,
  onData: (status: GroupStatus | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const statusRef = doc(db, "groups", groupId, "status", "status");
  return onSnapshot(
    statusRef,
    (snap) => {
      if (snap.exists()) {
        onData(snap.data() as GroupStatus);
      } else {
        onData(null);
      }
    },
    (error) => {
      console.error("[Firestore] Status listener error:", error);
      onError?.(error);
    }
  );
}

/**
 * Subscribe to live updates on the group document itself (for role changes, name, etc.).
 */
export function subscribeGroup(
  groupId: string,
  onData: (group: GroupDocument | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const groupRef = doc(db, "groups", groupId);
  return onSnapshot(
    groupRef,
    (snap) => {
      if (snap.exists()) {
        onData(snap.data() as GroupDocument);
      } else {
        onData(null);
      }
    },
    (error) => {
      console.error("[Firestore] Group listener error:", error);
      onError?.(error);
    }
  );
}

// ─── Role Derivation ────────────────────────────────────────────────────────

export type UserRole = "Owner" | "Host" | "Player" | null;

/**
 * Derive the user's role from the group document + current uid.
 * Priority: Owner > Host > Player (member but not host) > null (not a member).
 */
export function deriveRole(
  group: GroupDocument,
  uid: string
): UserRole {
  // Check the new structure first
  const memberData = group.members?.[uid];
  if (memberData && typeof memberData === "object" && "role" in memberData) {
    return memberData.role;
  }

  // Fallback to legacy structure
  if (group.owner === uid) return "Owner";
  if (group.hosts?.[uid]) return "Host";
  if (memberData) return "Player";
  return null;
}

// ─── Phase 0 Test Write (kept for reference) ────────────────────────────────

export async function testFirestoreWrite() {
  const testRef = doc(db, "tests", "phase0");
  await setDoc(testRef, {
    message: "Firebase initialized and connected successfully!",
    timestamp: new Date().toISOString(),
  });
  const snap = await getDoc(testRef);
  return snap.data();
}
