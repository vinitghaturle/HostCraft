/**
 * useAuthListener — Phase 1
 *
 * Custom hook that:
 * 1. Subscribes to Firebase onAuthStateChanged on mount
 * 2. Updates Zustand store with user info + loading flags
 * 3. Cleans up on unmount
 */

import { useEffect } from "react";
import { onAuthStateChange } from "../lib/auth";
import { useAppStore } from "../store/appStore";

export function useAuthListener() {
  const setUser = useAppStore((s) => s.setUser);
  const setAuthLoading = useAppStore((s) => s.setAuthLoading);

  useEffect(() => {
    const unsub = onAuthStateChange((firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
        });
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });

    return unsub;
  }, [setUser, setAuthLoading]);
}
