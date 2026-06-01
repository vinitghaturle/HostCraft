/**
 * App Root — Phase 1
 *
 * Subscribes to Firebase Auth on mount.
 * Routes between AuthScreen / DashboardScreen based on auth state.
 * Shows a loading screen while waiting for Firebase to resolve.
 */

import { useState } from "react";
import { useAuthListener } from "./hooks/useAuthListener";
import { useAppStore } from "./store/appStore";
import AuthScreen from "./screens/AuthScreen";
import DashboardScreen from "./screens/DashboardScreen";
import LoadingScreen from "./components/LoadingScreen";
import SetupWizard from "./screens/SetupWizard";

function App() {
  const [wizardComplete, setWizardComplete] = useState(false);

  // Subscribe to Firebase auth state changes
  useAuthListener();

  const user = useAppStore((s) => s.user);
  const authLoading = useAppStore((s) => s.authLoading);

  // Still waiting for Firebase onAuthStateChanged to fire
  if (authLoading) {
    return <LoadingScreen />;
  }

  // Not signed in → show auth screen
  if (!user) {
    return <AuthScreen />;
  }
  
  // Signed in → show dashboard or wizard
  if (!wizardComplete) {
    return <SetupWizard onComplete={() => setWizardComplete(true)} />;
  }

  return <DashboardScreen />;
}

export default App;
