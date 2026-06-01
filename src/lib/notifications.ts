import { db } from "./firebase";
import { collection, addDoc, onSnapshot, query, orderBy, limit } from "firebase/firestore";

export interface AppNotification {
  id?: string;
  type: "server_started" | "server_stopped" | "player_joined" | "role_changed" | "system_message";
  by: string;
  at: number;
  message?: string;
}

/**
 * Write a new notification to the group's subcollection.
 */
export async function sendNotification(groupId: string, data: Omit<AppNotification, "id">) {
  const notifsRef = collection(db, "groups", groupId, "notifications");
  await addDoc(notifsRef, data);
}

/**
 * Subscribe to the latest 20 notifications for the given group.
 */
export function subscribeNotifications(
  groupId: string,
  onData: (notifications: AppNotification[]) => void
) {
  const q = query(
    collection(db, "groups", groupId, "notifications"),
    orderBy("at", "desc"),
    limit(20)
  );

  return onSnapshot(q, (snap) => {
    const list: AppNotification[] = [];
    snap.forEach((doc) => {
      list.push({ id: doc.id, ...doc.data() } as AppNotification);
    });
    onData(list);
  });
}
