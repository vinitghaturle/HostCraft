import { runTransaction, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

const HEARTBEAT_INTERVAL_MS = 15000; // 15 seconds
const STALE_LOCK_TIMEOUT_MS = 60000; // 60 seconds
let heartbeatTimer: number | null = null;

export async function acquireLock(groupId: string, userId: string): Promise<boolean> {
  const statusRef = doc(db, "groups", groupId, "status", "status");
  
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(statusRef);
      const data = snap.data();
      
      const now = Date.now();
      // toMillis() works if it's a Firestore Timestamp, otherwise fallback to 0
      const lastHeartbeat = data?.lastHeartbeat?.toMillis?.() || 0;
      const isStale = (now - lastHeartbeat) > STALE_LOCK_TIMEOUT_MS;

      // Lock is held by someone else and it's not stale
      if (data?.host && data.host !== userId && !isStale) {
        throw new Error("LOCKED");
      }

      tx.update(statusRef, {
        host: userId,
        online: true,
        lastHeartbeat: serverTimestamp()
      });
    });
    
    startHeartbeat(groupId);
    return true;
  } catch (e: any) {
    if (e.message === "LOCKED") return false;
    throw e;
  }
}

export async function releaseLock(groupId: string, userId: string): Promise<void> {
  stopHeartbeat();
  const statusRef = doc(db, "groups", groupId, "status", "status");
  
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(statusRef);
    if (snap.data()?.host === userId) {
      tx.update(statusRef, { 
        host: null, 
        online: false 
      });
    }
  });
}

function startHeartbeat(groupId: string) {
  stopHeartbeat();
  const statusRef = doc(db, "groups", groupId, "status", "status");
  
  heartbeatTimer = window.setInterval(async () => {
    try {
      await updateDoc(statusRef, {
        lastHeartbeat: serverTimestamp()
      });
    } catch (e) {
      console.error("[Heartbeat] Update failed", e);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

export function stopHeartbeat() {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
