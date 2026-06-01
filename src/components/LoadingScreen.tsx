/**
 * LoadingScreen — Full-screen spinner shown while Firebase Auth resolves.
 */
export default function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#080B10] text-[#E2E8F0] font-sans antialiased flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-cyan-500/10 blur-[150px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
          <span className="text-3xl font-bold text-[#080B10]">H</span>
        </div>
        <div className="w-10 h-10 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
        <p className="text-sm text-slate-400">Initializing HostCraft…</p>
      </div>
    </div>
  );
}
