import { db } from "./firebase";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";

/**
 * Creates a short 6-character invite code for a group.
 */
export async function createInviteCode(groupId: string, createdBy: string): Promise<string> {
  // Use easily readable characters (exclude 0, O, I, 1, etc.)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  await setDoc(doc(db, "invites", code), {
    groupId,
    createdBy,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 // 24 hours
  });
  
  return code;
}

/**
 * Resolves a 6-character invite code to a groupId.
 * Returns the groupId if valid, or throws an error if invalid/expired.
 */
export async function resolveInviteCode(code: string): Promise<string> {
  const cleanCode = code.trim().toUpperCase();
  if (cleanCode.length !== 6) {
    throw new Error("Invite code must be 6 characters.");
  }

  const snap = await getDoc(doc(db, "invites", cleanCode));
  if (!snap.exists()) {
    throw new Error("Invalid or expired invite code.");
  }
  
  const data = snap.data();
  if (data.expiresAt < Date.now()) {
    await deleteDoc(snap.ref); // cleanup expired
    throw new Error("This invite code has expired.");
  }
  
  return data.groupId;
}
