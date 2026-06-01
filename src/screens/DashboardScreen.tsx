import { useState, useEffect } from "react";
import { useAppStore } from "../store/appStore";
import { signOutUser } from "../lib/auth";
import { useGroupListener } from "../hooks/useGroupListener";
import { useSyncthingListener } from "../hooks/useSyncthingListener";
import StatusBadge from "../components/StatusBadge";
import RoleBadge from "../components/RoleBadge";
import GroupIdInput from "../components/GroupIdInput";
import { startPaperMC, stopPaperMC, forceKillStrayServers } from "../lib/papermc";
import { pauseFolder, resumeFolder, getFolderCompletion } from "../lib/syncthing";
import { subscribeNotifications, sendNotification, type AppNotification } from "../lib/notifications";
import SettingsModal from "../components/SettingsModal";
import LogPanel from "../components/LogPanel";

export default function DashboardScreen() {
  const user = useAppStore((s) => s.user);
  const groupId = useAppStore((s) => s.groupId);
  const group = useAppStore((s) => s.group);
  const status = useAppStore((s) => s.status);
  const role = useAppStore((s) => s.role);
  const groupLoading = useAppStore((s) => s.groupLoading);
  const statusLoading = useAppStore((s) => s.statusLoading);
  
  const syncPercentage = useAppStore((s) => s.syncPercentage);
  const isSyncing = useAppStore((s) => s.isSyncing);
  const playitClaimUrl = useAppStore((s) => s.playitClaimUrl);
  const playitStatus = useAppStore((s) => s.playitStatus);

  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [copyingAddress, setCopyingAddress] = useState(false);
  const [pendingDevices, setPendingDevices] = useState<any[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (groupId) {
      const saved = localStorage.getItem(`lastInviteCode_${groupId}`);
      if (saved) setInviteCode(saved);
      else setInviteCode(null);
    }
  }, [groupId]);

  // Activate real-time listeners
  useGroupListener();
  useSyncthingListener();

  // On mount, kill any stray paper processes (Scenario B)
  useEffect(() => {
    forceKillStrayServers().catch(console.error);
  }, []);

  // Detect stale lock (Scenario A)
  const [isStale, setIsStale] = useState(false);
  useEffect(() => {
    if (!status?.online || !status?.lastHeartbeat) {
      setIsStale(false);
      return;
    }
    const checkStale = () => {
      const last = status.lastHeartbeat?.toMillis?.() || 0;
      setIsStale(Date.now() - last > 60000);
    };
    checkStale();
    const interval = setInterval(checkStale, 5000);
    return () => clearInterval(interval);
  }, [status?.online, status?.lastHeartbeat]);

  // Listen for unapproved devices (Owner only)
  useEffect(() => {
    if (role !== "Owner" || !groupId) return;
    
    let unsub: (() => void) | undefined;
    const init = async () => {
      const { collection, query, where, onSnapshot } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");
      const q = query(
        collection(db, "groups", groupId, "devices"),
        where("approved", "==", false)
      );
      unsub = onSnapshot(q, (snap) => {
        const devices: any[] = [];
        snap.forEach((doc) => devices.push({ id: doc.id, ...doc.data() }));
        setPendingDevices(devices);
      });
    };
    init();
    return () => { if (unsub) unsub(); };
  }, [role, groupId]);

  // Listen for notifications
  useEffect(() => {
    if (!groupId) return;
    const unsub = subscribeNotifications(groupId, setNotifications);
    return () => unsub();
  }, [groupId]);

  const handleSignOut = async () => {
    useAppStore.getState().reset();
    await signOutUser();
  };

  // If no groupId is set, show the group input
  if (!groupId) {
    return (
      <div className="min-h-screen bg-[#080B10] text-[#E2E8F0] font-sans antialiased flex flex-col relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-cyan-500/10 blur-[150px] pointer-events-none" />
        <Header user={user} onSignOut={handleSignOut} />
        <main className="flex-1 flex flex-col items-center justify-center z-10 px-6 gap-8">
          <GroupIdInput />
          
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-slate-500">Or create a new group for testing</p>
            <button
              onClick={async () => {
                if (!user) return;
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                let newGroupId = '';
                for (let i = 0; i < 6; i++) {
                  newGroupId += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                const { doc, setDoc } = await import("firebase/firestore");
                const { db } = await import("../lib/firebase");
                
                // 1. Create main group document
                await setDoc(doc(db, "groups", newGroupId), {
                  name: "My Test World",
                  owner: user.uid,
                  members: {
                    [user.uid]: {
                      role: "Owner",
                      name: user.displayName || user.email?.split("@")[0] || "Unknown"
                    }
                  }
                });

                // 2. Create the status sub-document
                await setDoc(doc(db, "groups", newGroupId, "status", "status"), {
                  online: false,
                  host: null,
                  address: null,
                  players: 0,
                  lastHeartbeat: null
                });

                // 3. Join the group
                useAppStore.getState().setGroupId(newGroupId);
              }}
              className="px-6 py-2 rounded-xl text-sm font-semibold border border-cyan-500/20 text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 transition-colors cursor-pointer"
            >
              Create Test Group
            </button>
          </div>
        </main>
      </div>
    );
  }

  const isLoading = groupLoading || statusLoading;
  const worldName = group?.name ?? "Loading…";
  const isOnline = status?.online ?? false;
  const hostName = status?.host ?? null;
  const playerCount = status?.players ?? 0;
  const address = status?.address ?? null;

  return (
    <div className="min-h-screen bg-[#080B10] text-[#E2E8F0] font-sans antialiased flex flex-col relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-cyan-500/10 blur-[150px] pointer-events-none" />

      <Header user={user} onSignOut={handleSignOut} />

      <main className="flex-1 max-w-2xl mx-auto w-full px-8 py-12 flex flex-col justify-center z-10">
        {isLoading ? (
          <LoadingPulse />
        ) : !group ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <span className="text-3xl">⚠️</span>
            </div>
            <h2 className="text-xl font-bold text-white">Group Not Found</h2>
            <p className="text-sm text-slate-400 max-w-md text-center">
              We couldn't find a group with ID <span className="font-mono text-white">{groupId}</span>. It may have been deleted, or the ID is incorrect.
            </p>
            <button
              onClick={() => useAppStore.getState().setGroupId(null)}
              className="mt-4 px-6 py-2.5 rounded-xl text-sm font-semibold border border-emerald-500/20 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors cursor-pointer"
            >
              Try Another Group
            </button>
          </div>
        ) : (
          <>
            {/* World Card */}
            <div className="rounded-2xl border border-[#1E293B] bg-[#0F172A]/60 backdrop-blur-md p-8 mb-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">🌍</span>
                    <h2 className="text-2xl font-bold text-white">{worldName}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge online={isOnline} hostName={hostName} />
                    {/* Sync Status Badge */}
                    <div className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      Synced: {syncPercentage.toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowSettings(true)}
                    className="p-2 rounded-xl border border-slate-700 bg-[#080B10]/50 text-slate-400 hover:text-white hover:border-cyan-500/50 hover:bg-cyan-500/10 transition-colors shadow-sm"
                    title="Settings"
                  >
                    ⚙️
                  </button>
                  <RoleBadge role={role} />
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <Stat label="Players" value={isOnline ? `${playerCount}` : "—"} icon="👥" />
                <Stat label="Host" value={hostName ?? "None"} icon="🖥️" />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 mb-6">
                {isStale && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-sm flex items-center gap-3">
                    <span className="text-xl">⚠️</span>
                    <div>
                      <p className="font-bold">Previous host is unavailable.</p>
                      <p className="opacity-80">You can force start the server to take over hosting.</p>
                    </div>
                  </div>
                )}
                <div className="flex gap-3">
                  {(!isOnline || isStale) && (role === "Owner" || role === "Host") && (
                  <button
                    onClick={async () => {
                      if (isSyncing || isStarting) return;
                      if (!user || !groupId) return;
                      setIsStarting(true);
                      try {
                        const { acquireLock } = await import("../lib/hostlock");
                        const success = await acquireLock(groupId, user.displayName || user.email || user.uid);
                        if (!success) {
                          alert("Server is already hosted by someone else!");
                          setIsStarting(false);
                          return;
                        }
                        
                        // Phase 4: Pause Syncthing -> Start PaperMC
                        console.log("Pausing Syncthing folder...");
                        await pauseFolder(groupId).catch(() => console.warn("Failed to pause, maybe not set up yet"));
                        
                        console.log("Starting PaperMC...");
                        await startPaperMC();
                        console.log("Server started!");

                        // Notify
                        await sendNotification(groupId, {
                          type: "server_started",
                          by: user.displayName || user.email?.split("@")[0] || "Unknown",
                          at: Date.now()
                        });

                        // Phase 5: Start Playit Tunnel
                        console.log("Starting Playit Tunnel...");
                        const { startPlayitTunnel } = await import("../lib/playit");
                        await startPlayitTunnel(groupId);
                        
                      } catch (err) {
                        console.error(err);
                        alert("Error starting server: " + err);
                      }
                      setIsStarting(false);
                    }}
                    disabled={isSyncing || isStarting}
                    className={`flex-1 py-3 rounded-xl font-bold transition-colors shadow-lg ${
                      isSyncing || isStarting
                        ? "bg-emerald-500/30 text-emerald-900 cursor-not-allowed"
                        : "bg-emerald-500 hover:bg-emerald-400 text-[#080B10] shadow-emerald-500/20"
                    }`}
                  >
                    {isStarting ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-emerald-900/20 border-t-emerald-900 rounded-full animate-spin" />
                        Starting...
                      </span>
                    ) : isSyncing ? (
                      "Syncing..."
                    ) : (
                      "Start Server"
                    )}
                  </button>
                )}
                {isOnline && !isStale && hostName === (user?.displayName || user?.email || user?.uid) && (
                  <button
                    onClick={async () => {
                      if (!user || !groupId || isStopping) return;
                      setIsStopping(true);
                      try {
                        console.log("Stopping Playit Tunnel...");
                        const { stopPlayitTunnel } = await import("../lib/playit");
                        await stopPlayitTunnel();

                        console.log("Stopping PaperMC...");
                        await stopPaperMC();

                        // Notify
                        await sendNotification(groupId, {
                          type: "server_stopped",
                          by: user?.displayName || user?.email?.split("@")[0] || "Unknown",
                          at: Date.now()
                        });

                        console.log("Resuming Syncthing folder...");
                        await resumeFolder(groupId).catch(() => console.warn("Failed to resume"));
                        
                        console.log("Waiting for sync to reach 100%...");
                        // Poll sync completion until 100%
                        let syncAttempts = 0;
                        while (syncAttempts < 15) { // Max 30 seconds wait
                          const data = await getFolderCompletion(groupId).catch(() => null);
                          // If we get data and it's 100%, we're done. 
                          // If we don't get data (e.g., Syncthing not configured yet), we just timeout eventually.
                          if (data && data.completion >= 100) break;
                          await new Promise(r => setTimeout(r, 2000));
                          syncAttempts++;
                        }

                        const { releaseLock } = await import("../lib/hostlock");
                        await releaseLock(groupId, user.displayName || user.email || user.uid);
                      } catch (err) {
                        console.error(err);
                        alert("Error stopping server: " + err);
                      }
                      setIsStopping(false);
                    }}
                    disabled={isStopping}
                    className={`flex-1 py-3 rounded-xl font-bold transition-colors shadow-lg ${
                      isStopping
                        ? "bg-red-500/30 text-red-900 cursor-not-allowed"
                        : "bg-red-500 hover:bg-red-400 text-[#080B10] shadow-red-500/20"
                    }`}
                  >
                    {isStopping ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-red-900/20 border-t-red-900 rounded-full animate-spin" />
                        Stopping...
                      </span>
                    ) : (
                      "Stop Server"
                    )}
                  </button>
                )}
                {isOnline && !isStale && hostName !== (user?.displayName || user?.email || user?.uid) && (
                  <button
                    disabled
                    className="flex-1 py-3 rounded-xl bg-[#1E293B] text-slate-500 font-bold cursor-not-allowed"
                  >
                    Hosted by {hostName}
                  </button>
                )}
                </div>
              </div>

              {/* Playit Status */}
              {isOnline && playitStatus && hostName === (user?.displayName || user?.email || user?.uid) && (
                <div className="p-4 mb-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                  <p className="text-xs text-slate-400 font-semibold mb-2">Playit.gg Terminal</p>
                  <div className="px-3 py-2 rounded bg-slate-900 border border-slate-800">
                    <p className="text-xs text-cyan-400 font-mono break-all">{playitStatus}</p>
                  </div>
                </div>
              )}

              {/* Playit Claim URL */}
              {isOnline && playitClaimUrl && hostName === (user?.displayName || user?.email || user?.uid) && (
                <div className="p-4 mb-6 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <p className="text-xs text-amber-500 font-semibold mb-2">⚠️ Playit.gg Action Required</p>
                  <p className="text-sm text-slate-300 mb-3">You need to claim this tunnel to get a persistent public address.</p>
                  <a href={playitClaimUrl} target="_blank" rel="noreferrer" className="inline-block px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-[#080B10] hover:bg-amber-400 transition-colors">
                    Claim Tunnel
                  </a>
                </div>
              )}

              {/* Address */}
              {isOnline && address && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] text-cyan-500 uppercase tracking-widest font-semibold mb-1">Server Address</p>
                    <p className="text-lg text-cyan-50 font-mono font-medium">{address}</p>
                    <p className="text-xs text-slate-400 mt-1">Use this address to connect in Minecraft.</p>
                  </div>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(address);
                      setCopyingAddress(true);
                      setTimeout(() => setCopyingAddress(false), 2000);
                    }} 
                    className="px-5 py-2.5 rounded-xl text-sm font-bold bg-cyan-500 text-[#080B10] hover:bg-cyan-400 transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 cursor-pointer w-full sm:w-auto"
                  >
                    {copyingAddress ? "Copied! ✓" : "Copy Address"}
                  </button>
                </div>
              )}
              {isOnline && !address && hostName === (user?.displayName || user?.email || user?.uid) && (
                <div className="p-4 rounded-xl bg-[#080B10]/60 border border-[#1E293B]">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-2">Manual Tunnel Address</p>
                  <p className="text-xs text-slate-400 mb-3">Playit doesn't broadcast the address automatically. Paste your tunnel address from playit.gg below:</p>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      id="manual-address"
                      placeholder="e.g. bold-water.auto.playit.gg:12345"
                      className="flex-1 bg-[#0F172A] border border-[#1E293B] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                    />
                    <button 
                      onClick={async () => {
                        const val = (document.getElementById('manual-address') as HTMLInputElement).value;
                        if (!val) return;
                        try {
                          const { doc, updateDoc } = await import("firebase/firestore");
                          const { db } = await import("../lib/firebase");
                          await updateDoc(doc(db, "groups", groupId!, "status", "status"), { address: val });
                        } catch (e) {
                          console.error("Failed to update address", e);
                        }
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-500 text-[#080B10] hover:bg-cyan-400 transition-colors cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Pending Devices */}
            {role === "Owner" && pendingDevices.length > 0 && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 mb-6">
                <h3 className="text-sm font-bold text-amber-500 mb-4 flex items-center gap-2">
                  <span className="text-base">🔔</span> Pending Device Approvals
                </h3>
                <div className="flex flex-col gap-3">
                  {pendingDevices.map(device => (
                    <div key={device.id} className="flex items-center justify-between p-3 rounded-xl bg-[#0F172A]/80 border border-[#1E293B]">
                      <div>
                        <p className="text-xs text-slate-300 font-medium">User: {device.uid}</p>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">{device.deviceId.substring(0, 16)}...</p>
                      </div>
                      <button 
                        disabled={approvingId === device.deviceId}
                        onClick={async () => {
                          setApprovingId(device.deviceId);
                          try {
                            const { approveDevice } = await import("../lib/devices");
                            await approveDevice(groupId!, device.deviceId);
                          } catch (e: any) {
                            alert("Failed to approve device: " + (e.message || String(e)));
                            console.error(e);
                          } finally {
                            setApprovingId(null);
                          }
                        }}
                        className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-[#080B10] hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {approvingId === device.deviceId ? (
                          <span className="flex items-center justify-center gap-2">
                            <div className="w-3 h-3 border-2 border-[#080B10]/20 border-t-[#080B10] rounded-full animate-spin" />
                            Approving...
                          </span>
                        ) : "Approve"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Group Info */}
            <div className="rounded-2xl border border-[#1E293B] bg-[#0F172A]/40 backdrop-blur-md p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-0.5">Group ID</p>
                <p className="text-xs text-slate-400 font-mono mb-3">{groupId}</p>
                {role === "Owner" && (
                  <div className="flex flex-col gap-2 mt-3">
                    <button 
                      onClick={async () => {
                        try {
                          const { createInviteCode } = await import("../lib/invites");
                          const code = await createInviteCode(groupId, user!.uid);
                          setInviteCode(code);
                          localStorage.setItem(`lastInviteCode_${groupId}`, code);
                        } catch (e: any) {
                          alert(`Failed to generate invite code: ${e.message}`);
                          console.error("Invite Code Error:", e);
                        }
                      }}
                      className="px-3 py-1.5 w-fit rounded-lg text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors cursor-pointer"
                    >
                      Generate Invite Code
                    </button>
                    {inviteCode && (
                      <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-[#080B10]/60 border border-indigo-500/20">
                        <p className="text-sm text-indigo-300 font-mono tracking-widest">{inviteCode}</p>
                        <button 
                          onClick={() => navigator.clipboard.writeText(inviteCode)}
                          className="px-2 py-1 rounded text-[10px] uppercase font-bold bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition-colors cursor-pointer ml-auto"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={() => setShowMembersModal(true)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors cursor-pointer h-fit">
                  Members
                </button>
                <button onClick={() => useAppStore.getState().setGroupId(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20 hover:bg-slate-500/20 transition-colors cursor-pointer h-fit">
                  Change Group
                </button>
              </div>
            </div>

            {/* Log Panel */}
            {isOnline && !isStale && hostName === (user?.displayName || user?.email || user?.uid) && (
              <LogPanel />
            )}

            {/* Notification Feed */}
            {notifications.length > 0 && (
              <div className="mt-6 rounded-2xl border border-[#1E293B] bg-[#0F172A]/40 backdrop-blur-md p-6">
                <h3 className="text-sm font-bold text-white mb-4">Recent Activity</h3>
                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                  {notifications.map((n) => (
                    <div key={n.id} className="text-xs text-slate-400 flex items-start gap-2">
                      <span className="mt-0.5">{n.type === "server_started" ? "🟢" : n.type === "server_stopped" ? "🔴" : "💬"}</span>
                      <span>
                        <strong className="text-slate-300">{n.by}</strong> 
                        {n.type === "server_started" ? " started the server" : 
                         n.type === "server_stopped" ? " stopped the server" : 
                         n.type === "role_changed" ? " was updated" : " joined the game"}
                        <span className="text-[10px] text-slate-500 ml-2">{new Date(n.at).toLocaleTimeString()}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {showMembersModal && group && groupId && (
        <MembersModal 
          groupId={groupId}
          group={group}
          currentUserRole={role}
          onClose={() => setShowMembersModal(false)}
        />
      )}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}

      <footer className="border-t border-[#1E293B] bg-[#080B10] px-8 py-4 flex items-center justify-between text-xs text-slate-500 z-10">
        <div>Phase 1 — Firebase Auth + Group Data Model</div>
        <div>Signed in as {user?.displayName || user?.email}</div>
      </footer>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function Header({ user, onSignOut }: { user: any; onSignOut: () => void }) {
  return (
    <header className="border-b border-[#1E293B] bg-[#0F172A]/40 backdrop-blur-md px-8 py-4 flex items-center justify-between z-10">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <span className="text-xl font-bold text-[#080B10]">H</span>
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-wider bg-gradient-to-r from-white via-emerald-400 to-cyan-400 bg-clip-text text-transparent">HostCraft</h1>
          <p className="text-[10px] text-emerald-400/80 tracking-widest uppercase font-semibold">Minecraft Co-Hosting Shell</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right mr-2 hidden sm:block">
          <p className="text-sm text-white font-medium">{user?.displayName || "User"}</p>
          <p className="text-[10px] text-slate-500">{user?.email}</p>
        </div>
        <button id="sign-out-btn" onClick={onSignOut} className="px-4 py-2 rounded-xl text-xs font-semibold border border-red-500/20 text-red-400 bg-red-500/5 hover:bg-red-500/10 transition-colors cursor-pointer">
          Sign Out
        </button>
      </div>
    </header>
  );
}

function LoadingPulse() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <div className="w-12 h-12 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
      <p className="text-sm text-slate-400">Loading group data…</p>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="p-4 rounded-xl bg-[#080B10]/60 border border-[#1E293B]">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{icon}</span>
        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">{label}</span>
      </div>
      <p className="text-lg font-bold text-white">{value}</p>
    </div>
  );
}

function MembersModal({ groupId, group, currentUserRole, onClose }: { groupId: string; group: any; currentUserRole: string | null; onClose: () => void }) {
  const members = Object.entries(group.members || {}).map(([uid, data]: [string, any]) => {
    if (typeof data === "boolean") return { uid, role: "Player", name: "Unknown" };
    return { uid, ...data };
  });

  const handleRoleChange = async (uid: string, newRole: string) => {
    if (currentUserRole !== "Owner") return;
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");
      
      await updateDoc(doc(db, "groups", groupId), {
        [`members.${uid}.role`]: newRole
      });
      
      await sendNotification(groupId, {
        type: "role_changed",
        by: "Owner",
        at: Date.now()
      });
    } catch (e: any) {
      alert("Failed to update role: " + e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#0F172A] border border-[#1E293B] rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Group Members</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        
        <div className="flex flex-col gap-3 max-h-96 overflow-y-auto custom-scrollbar pr-2">
          {members.map(m => (
            <div key={m.uid} className="flex items-center justify-between p-3 rounded-xl bg-[#080B10]/80 border border-[#1E293B]">
              <div>
                <p className="text-sm text-slate-200 font-medium">{m.name}</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">{m.uid}</p>
              </div>
              
              {currentUserRole === "Owner" && m.uid !== group.owner ? (
                <select 
                  value={m.role}
                  onChange={(e) => handleRoleChange(m.uid, e.target.value)}
                  className="bg-[#0F172A] border border-[#1E293B] text-xs text-slate-300 rounded px-2 py-1 outline-none"
                >
                  <option value="Player">Player</option>
                  <option value="Host">Host</option>
                </select>
              ) : (
                <RoleBadge role={m.role as any} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
