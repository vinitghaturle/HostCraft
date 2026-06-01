import { useState, type FormEvent } from "react";
import { signIn, signUp } from "../lib/auth";
import { useAppStore } from "../store/appStore";

export default function AuthScreen() {
  const setAuthError = useAppStore((s) => s.setAuthError);
  const authError = useAppStore((s) => s.authError);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        if (!displayName.trim()) {
          setAuthError("Display name is required.");
          setLoading(false);
          return;
        }
        await signUp(email, password, displayName.trim());
      }
    } catch (err: any) {
      setAuthError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full px-4 py-3 rounded-xl bg-[#080B10]/80 border border-[#1E293B] text-white text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/25 transition-all";
  const labelCls =
    "block text-xs text-slate-400 mb-1.5 font-medium uppercase tracking-wider";

  return (
    <div className="min-h-screen bg-[#080B10] text-[#E2E8F0] font-sans antialiased flex items-center justify-center relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-cyan-500/10 blur-[150px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 mb-4">
            <span className="text-3xl font-bold text-[#080B10]">H</span>
          </div>
          <h1 className="text-3xl font-bold tracking-wider bg-gradient-to-r from-white via-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            HostCraft
          </h1>
          <p className="text-xs text-emerald-400/80 tracking-widest uppercase font-semibold mt-1">
            Minecraft Co-Hosting Shell
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-[#1E293B] bg-[#0F172A]/60 backdrop-blur-md p-8">
          <h2 className="text-xl font-bold text-white mb-1">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="text-sm text-slate-400 mb-6">
            {mode === "signin"
              ? "Sign in to your HostCraft account."
              : "Set up your new HostCraft profile."}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === "signup" && (
              <div>
                <label className={labelCls}>Display Name</label>
                <input id="auth-displayname" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Alex" className={inputCls} />
              </div>
            )}

            <div>
              <label className={labelCls}>Email</label>
              <input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Password</label>
              <input id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className={inputCls} />
            </div>

            {authError && (
              <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5 text-red-300 text-xs flex items-center gap-2">
                <span className="w-4 h-4 shrink-0">⚠️</span>
                {authError}
              </div>
            )}

            <button id="auth-submit" type="submit" disabled={loading} className="w-full px-6 py-3.5 rounded-xl font-semibold tracking-wider text-[#080B10] bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 transition-all duration-300 transform active:scale-[0.97] disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 cursor-pointer mt-2">
              {loading ? (
                <>{mode === "signin" ? "Signing in…" : "Creating account…"}</>
              ) : mode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-400">
            {mode === "signin" ? (
              <>
                Don&apos;t have an account?{" "}
                <button id="auth-toggle-signup" type="button" onClick={() => { setMode("signup"); setAuthError(null); }} className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors cursor-pointer">Create one</button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button id="auth-toggle-signin" type="button" onClick={() => { setMode("signin"); setAuthError(null); }} className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors cursor-pointer">Sign in</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function friendlyError(code: string): string {
  const map: Record<string, string> = {
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Invalid email or password.",
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/too-many-requests": "Too many attempts. Wait a moment.",
    "auth/network-request-failed": "Network error. Check your connection.",
  };
  return map[code] || `Authentication failed (${code}).`;
}
