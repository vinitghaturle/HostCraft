import { useEffect } from "react";
import { useAppStore } from "../store/appStore";
import { getFolderCompletion, startSyncthingProcess } from "../lib/syncthing";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { requestDeviceSync, addRemoteDeviceAndFolder } from "../lib/devices";

export function useSyncthingListener() {
  const groupId = useAppStore((s) => s.groupId);
  const user = useAppStore((s) => s.user);
  const setSyncPercentage = useAppStore((s) => s.setSyncPercentage);
  const setIsSyncing = useAppStore((s) => s.setIsSyncing);

  useEffect(() => {
    if (!groupId || !user) return;

    let isMounted = true;
    let timer: number | null = null;
    let unsubscribeDevice: (() => void) | null = null;

    const initDeviceExchange = async () => {
      try {
        await startSyncthingProcess();
        const myDeviceId = await requestDeviceSync(groupId, user.uid);
        
        if (isMounted) {
          unsubscribeDevice = onSnapshot(
            doc(db, "groups", groupId, "devices", myDeviceId),
            async (snap) => {
              if (snap.exists()) {
                const data = snap.data();
                if (data.approved && data.ownerDeviceId) {
                  console.log("Device approved! Syncing with owner:", data.ownerDeviceId);
                  await addRemoteDeviceAndFolder(data.ownerDeviceId, groupId);
                }
              }
            }
          );
        }
      } catch (e) {
        console.error("Device exchange error:", e);
      }
    };

    const poll = async () => {
      try {
        // Get completion status for this group's folder
        const data = await getFolderCompletion(groupId);
        if (isMounted && data) {
          const completion = data.completion ?? 100;
          setSyncPercentage(completion);
          // 100% means we are fully synced. Less means syncing.
          // Syncthing API returns 100 for completed folders.
          setIsSyncing(completion < 100);
        }
      } catch (e) {
        // On error, we might just assume 0% or ignore.
      }
    };

    initDeviceExchange();
    poll();
    timer = window.setInterval(poll, 5000);

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
      if (unsubscribeDevice) unsubscribeDevice();
    };
  }, [groupId, user, setSyncPercentage, setIsSyncing]);
}
