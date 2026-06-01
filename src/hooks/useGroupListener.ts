/**
 * useGroupListener — Phase 1
 *
 * Custom hook that:
 * 1. Fetches the group document once on mount (or when groupId changes)
 * 2. Subscribes to real-time status updates via onSnapshot
 * 3. Derives the user's role from the group document
 * 4. Cleans up listeners on unmount / groupId change
 */

import { useEffect } from "react";
import {
  subscribeGroupStatus,
  subscribeGroup,
  deriveRole,
} from "../lib/firestore";
import { useAppStore } from "../store/appStore";

export function useGroupListener() {
  const user = useAppStore((s) => s.user);
  const groupId = useAppStore((s) => s.groupId);

  const setGroup = useAppStore((s) => s.setGroup);
  const setGroupLoading = useAppStore((s) => s.setGroupLoading);
  const setStatus = useAppStore((s) => s.setStatus);
  const setStatusLoading = useAppStore((s) => s.setStatusLoading);
  const setRole = useAppStore((s) => s.setRole);

  useEffect(() => {
    if (!groupId || !user) {
      setGroup(null);
      setStatus(null);
      setRole(null);
      return;
    }

    setGroupLoading(true);
    setStatusLoading(true);

    // Subscribe to the group document (for role derivation + metadata)
    const unsubGroup = subscribeGroup(
      groupId,
      (groupData) => {
        setGroup(groupData);
        setGroupLoading(false);
        // Re-derive role whenever group doc updates
        if (groupData) {
          const role = deriveRole(groupData, user.uid);
          setRole(role);
        } else {
          setRole(null);
        }
      },
      (error) => {
        console.error("[useGroupListener] Group error:", error);
        setGroupLoading(false);
      }
    );

    // Subscribe to the status sub-document (real-time server state)
    const unsubStatus = subscribeGroupStatus(
      groupId,
      async (statusData) => {
        setStatus(statusData);
        setStatusLoading(false);
        
        // Stale lock detection
        if (statusData?.host && statusData.lastHeartbeat) {
          const now = Date.now();
          const lastHeartbeat = statusData.lastHeartbeat.toMillis?.() || 0;
          if (now - lastHeartbeat > 60000) { // 60 seconds
            const { releaseLock } = await import("../lib/hostlock");
            console.log("[useGroupListener] Stale lock detected, releasing...");
            await releaseLock(groupId, statusData.host);
          }
        }
      },
      (error) => {
        console.error("[useGroupListener] Status error:", error);
        setStatusLoading(false);
      }
    );

    return () => {
      unsubGroup();
      unsubStatus();
    };
  }, [
    groupId,
    user,
    setGroup,
    setGroupLoading,
    setStatus,
    setStatusLoading,
    setRole,
  ]);
}
