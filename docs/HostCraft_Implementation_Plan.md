# HostCraft — Full Implementation Plan

> **How to use this doc:** Each phase ends with a concrete testable milestone. Complete and verify the milestone before moving to the next phase. Never start a new phase with broken tests from the previous one.

---

## Tech Stack Confirmed

| Layer | Technology |
|---|---|
| Desktop shell | Tauri (Rust + React) |
| UI | React + Tailwind CSS |
| Backend state / coordination | Firebase (Firestore + Auth) |
| World sync | Syncthing (controlled via its REST API) |
| Minecraft server | PaperMC (controlled via stdin/stdout process) |
| Networking / tunneling | Playit.gg (CLI agent, controlled as a subprocess) |
| Process management | Tauri `tauri-plugin-shell` / Rust `std::process` |

---

## Hard Concepts to Understand Before Coding

Read this section carefully. These are the places most people get stuck or corrupt worlds.

### 1. The Host Lock (most critical thing in the whole system)
Firebase has no native "atomic lock." You must use a **Firestore transaction** to do a compare-and-swap: read the `status` document, check that `host == null`, and write your username — all in one atomic operation. If you do a regular read-then-write (two separate calls), two hosts can both read `null` at the same time and both claim ownership. **Never use a non-transactional write for lock acquisition.**

### 2. Syncthing Pause/Resume Sequence
If Syncthing is running while PaperMC is writing chunk files, Syncthing can replicate a half-written region file to other hosts, causing corruption. The sequence must be:
```
Acquire Firebase lock → Pause Syncthing → Start PaperMC → [server runs] → Stop PaperMC → Wait for world save → Resume Syncthing → Wait for sync 100% → Release Firebase lock
```
If the user force-quits the app mid-session, Syncthing might resume before PaperMC has flushed. Handle this in crash recovery.

### 3. Syncthing REST API (not the GUI)
Syncthing exposes a local REST API at `http://127.0.0.1:8384`. You authenticate with an API key from its config file. The endpoints you need:
- `GET /rest/system/status` — is it running?
- `POST /rest/db/pause?folder=<id>` — pause a folder
- `POST /rest/db/resume?folder=<id>` — resume a folder
- `GET /rest/db/completion?folder=<id>` — sync percentage
- `POST /rest/config/devices` — add a new device (for host promotion)

### 4. PaperMC Process Control
PaperMC runs as a child process. You send commands by writing to its stdin (e.g., `stop\n`). You read server events from stdout. Never `kill -9` a running Minecraft server — always send `stop` and wait for the process to exit cleanly before letting Syncthing resume.

### 5. Playit.gg Tunnel Address
Playit.gg CLI registers a persistent agent and gives back a public address (e.g., `abcd.playit.gg:25565`). This address is stable for a given agent install. The first time it runs, it needs a one-time claim URL. After that it auto-starts. You need to:
- Detect if Playit is already claimed (check the agent secret file)
- If not: run it once, capture the claim URL, show it to the user
- Once claimed: start it as a background process and parse stdout for the assigned address

### 6. Tauri's Sidecar vs Shell Plugin
Tauri can bundle executables as **sidecars** (shipped with your app) or invoke system executables via the shell plugin. For HostCraft:
- **Sidecar:** Playit.gg CLI (you ship it)
- **Shell plugin:** Java, PaperMC jar (user-installed), Syncthing (user-installed or downloaded)
- All subprocess calls must be declared in `tauri.conf.json` under `allowlist.shell.scope`

### 7. Firebase Security Rules
If your Firestore rules are too open (`allow read, write: if true`), any user can claim the host lock. Rules must enforce:
- Only authenticated users in the `hosts` array can write to `status`
- Only the owner can write to `groups/{groupId}/hosts`
- Users cannot write their own role

### 8. Syncthing Device IDs
Syncthing identifies devices by a 63-character device ID (derived from a certificate). When promoting a host, you need to:
1. Get the new host's Syncthing device ID from their local Syncthing install
2. Add it to the shared folder on all existing hosts
3. This exchange must go through Firebase (send device ID, all peers add it)

### 9. Heartbeat Race Condition
The heartbeat timeout is 60 seconds. Two hosts might both detect a dead host at the same time and both try to acquire the lock. The atomic Firebase transaction handles this — only one write wins. The loser gets a `ABORTED` error from Firestore and must back off.

### 10. Cross-Platform Paths
Java, PaperMC, and Syncthing executables have different names and paths on Windows vs macOS vs Linux. Build a path resolver early. Example:
- Windows: `java.exe`, `syncthing.exe`
- macOS: `java`, `syncthing`
- Minecraft world dir: `%APPDATA%\\.minecraft\\saves` vs `~/Library/Application Support/minecraft/saves` vs `~/.minecraft/saves`

---

## Phase 0 — Project Scaffold & Tooling
**Estimated time: 1 day**

### Goal
Get a Tauri + React app running locally with Firebase connected. Nothing functional yet — just infrastructure.

### Tasks

1. **Scaffold the Tauri app**
   ```bash
   npm create tauri-app@latest hostcraft -- --template react-ts
   cd hostcraft
   npm install
   npm run tauri dev
   ```

2. **Add dependencies**
   ```bash
   npm install firebase
   npm install @tanstack/react-query
   npm install zustand
   npm install tailwindcss @tailwindcss/vite
   ```

3. **Set up Firebase project**
   - Create project in Firebase console
   - Enable Firestore (in test mode for now)
   - Enable Firebase Authentication (email/password + anonymous)
   - Copy config into `src/lib/firebase.ts`

4. **Configure Tauri allowlist** in `src-tauri/tauri.conf.json`:
   ```json
   {
     "tauri": {
       "allowlist": {
         "shell": {
           "execute": true,
           "sidecar": true,
           "scope": [
             { "name": "syncthing", "cmd": "syncthing" },
             { "name": "java", "cmd": "java" },
             { "name": "playit", "sidecar": true }
           ]
         },
         "fs": { "all": true },
         "path": { "all": true }
       }
     }
   }
   ```

5. **Create folder structure**
   ```
   src/
     lib/
       firebase.ts        ← Firebase init
       firestore.ts       ← Firestore queries
       syncthing.ts       ← Syncthing REST client
       papermc.ts         ← PaperMC process controller
       playit.ts          ← Playit.gg process controller
       hostlock.ts        ← Atomic lock logic
       heartbeat.ts       ← Heartbeat timer
     store/
       appStore.ts        ← Zustand global state
     components/
     screens/
   ```

### ✅ Phase 0 Milestone
- `npm run tauri dev` opens a desktop window
- Firebase writes a document to Firestore successfully (test it from the app)
- Window title shows "HostCraft"

---

## Phase 1 — Firebase Auth + Group Data Model
**Estimated time: 2 days**

### Goal
Users can sign in and see their group membership. No Minecraft functionality yet.

### Tasks

1. **Auth flow**
   - Sign in with email/password (MVP — no OAuth needed yet)
   - Store `uid` and `username` in Zustand store
   - Persist login across app restarts using Firebase's `onAuthStateChanged`

2. **Firestore data model** — create these documents manually in the console first, then implement reads:

   ```
   groups/{groupId}
     owner: "vin"
     name: "Survival World"
     hosts: { "vin": true, "alex": true }
     members: { "vin": true, "alex": true, "mike": true }

   groups/{groupId}/status (sub-document)
     online: false
     host: null
     address: null
     players: 0
     lastHeartbeat: null
   ```

3. **Real-time listener** — `onSnapshot` on `groups/{groupId}/status` to receive live updates when the server goes online/offline.

4. **Role detection** — derive `isOwner`, `isHost`, `isPlayer` from the group document + current uid.

5. **Basic UI shell** — just display:
   - World name
   - Online/offline status
   - Current host name (if online)
   - Your role badge

### ⚠️ Difficult Part
Firestore's real-time listener fires immediately when the app opens. Your UI must handle the initial `undefined` state (before the snapshot arrives) without flashing incorrect UI. Use a `loading` state.

### ✅ Phase 1 Milestone
- App shows "🌍 Survival World — 🔴 Offline" correctly
- Manually update `status.online = true` in Firebase console → app updates in real-time within 1 second
- Role badge shows "Owner", "Host", or "Player" correctly based on the group document

---

## Phase 2 — Host Lock (Firebase)
**Estimated time: 2 days**

### Goal
Implement atomic lock acquisition and release. No Minecraft yet — just the coordination logic.

### Tasks

1. **Implement `acquireLock()` in `hostlock.ts`**

   ```typescript
   import { runTransaction, doc, serverTimestamp } from "firebase/firestore";

   export async function acquireLock(groupId: string, userId: string): Promise<boolean> {
     const statusRef = doc(db, "groups", groupId, "status");
     try {
       await runTransaction(db, async (tx) => {
         const snap = await tx.get(statusRef);
         const data = snap.data();
         if (data?.host !== null && data?.host !== undefined) {
           throw new Error("LOCKED"); // someone else owns it
         }
         tx.update(statusRef, {
           host: userId,
           online: true,
           lastHeartbeat: serverTimestamp()
         });
       });
       return true;
     } catch (e: any) {
       if (e.message === "LOCKED") return false;
       throw e;
     }
   }
   ```

2. **Implement `releaseLock()`** — sets `host: null, online: false, address: null`

3. **Implement heartbeat** — `setInterval` every 15 seconds to update `lastHeartbeat`

4. **Implement stale lock detection** — on app start, check if `currentTime - lastHeartbeat > 60s` and `host !== null`. If so, treat lock as available.

5. **Wire up Start/Stop buttons** in the UI (buttons exist but do nothing else yet):
   - Start → `acquireLock()` → show success or "Server already hosted by [name]"
   - Stop → `releaseLock()`

6. **Write Firestore Security Rules:**
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /groups/{groupId} {
         allow read: if request.auth != null;
         allow write: if request.auth.uid == resource.data.owner;

         match /status {
           allow read: if request.auth != null;
           // Only current host or null-host can write (enforced via transaction)
           allow write: if request.auth != null
             && (resource.data.host == null
                 || resource.data.host == request.auth.token.email);
         }
       }
     }
   }
   ```

### ⚠️ Difficult Part
Testing the race condition: open two app instances simultaneously, click Start on both at exactly the same time. Only one should succeed. Test this manually. If both succeed you have a bug in your transaction.

### ✅ Phase 2 Milestone
- Click Start → `status.host` becomes your username in Firestore (verify in console)
- Click Start on a second account while first is running → shows "Already hosted by [name]"
- Click Stop → `status.host` becomes `null`
- Kill the app without clicking Stop → after 60 seconds, another user can acquire the lock (heartbeat timeout working)
- Two simultaneous lock attempts → only one wins (transaction working)

---

## Phase 3 — Syncthing Integration
**Estimated time: 3 days**

### Goal
HostCraft can control a locally running Syncthing instance: pause it, resume it, and check sync completion percentage.

### Tasks

1. **Syncthing REST client** in `src/lib/syncthing.ts`

   ```typescript
   const SYNCTHING_BASE = "http://127.0.0.1:8384";

   async function syncthingRequest(path: string, method = "GET", body?: object) {
     const apiKey = await getSyncthingApiKey(); // read from Syncthing config file
     const res = await fetch(`${SYNCTHING_BASE}${path}`, {
       method,
       headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
       body: body ? JSON.stringify(body) : undefined
     });
     return res.json();
   }

   export const pauseFolder = (folderId: string) =>
     syncthingRequest(`/rest/db/pause?folder=${folderId}`, "POST");

   export const resumeFolder = (folderId: string) =>
     syncthingRequest(`/rest/db/resume?folder=${folderId}`, "POST");

   export const getFolderCompletion = (folderId: string) =>
     syncthingRequest(`/rest/db/completion?folder=${folderId}`);
   // returns { completion: 83.4, ... }
   ```

2. **Get Syncthing API key** — read it from the Syncthing config XML file. Location:
   - Windows: `%LOCALAPPDATA%\Syncthing\config.xml`
   - macOS: `~/Library/Application Support/Syncthing/config.xml`
   - Linux: `~/.config/syncthing/config.xml`
   Use Tauri's `fs` plugin to read this file and parse `<apikey>` with a regex.

3. **Detect Syncthing running** — `GET /rest/system/ping`. If it fails, Syncthing is not running. Start it as a background process.

4. **Start/stop Syncthing** using Tauri's shell plugin.

5. **Poll sync completion** — when user opens the app, poll `getFolderCompletion` every 5 seconds and show a progress bar. Disable the Start button until completion == 100.

6. **First-time Syncthing setup** (deferred to Phase 6 — for now, assume Syncthing is manually configured)

### ⚠️ Difficult Parts
- **API key parsing:** Syncthing's config is XML. Parse it with a regex: `/<apikey>(.*?)<\/apikey>/`
- **CORS:** Syncthing's REST API by default blocks requests from non-localhost origins. Since Tauri renders in a WebView, `fetch()` from the WebView might be blocked. Use Tauri's Rust backend to proxy these HTTP calls instead of calling Syncthing from React directly.
- **Syncthing not installed:** Handle gracefully — show setup wizard (Phase 6).

### ✅ Phase 3 Milestone
- App shows sync completion percentage (e.g., "Synced: 83%")
- Start button is disabled when sync < 100%
- Start button becomes enabled when sync reaches 100%
- Manually pause Syncthing from its own GUI → app reflects "Synced: paused" state
- App can start and stop Syncthing as a subprocess

---

## Phase 4 — PaperMC Server Control
**Estimated time: 3 days**

### Goal
HostCraft can download, start, stop, and monitor a PaperMC server process. Full start/stop sequence working end-to-end (lock → pause sync → start MC → stop MC → resume sync → release lock).

### Tasks

1. **PaperMC download and setup**
   - Check if `paper-<version>.jar` exists in the app's data directory
   - If not: download from `https://api.papermc.io/v2/projects/paper/versions/<ver>/builds/<build>/downloads/paper-<ver>-<build>.jar`
   - Create `eula.txt` with `eula=true` (required by Mojang, user must agree to this in setup)
   - Create `server.properties` with sensible defaults

2. **PaperMC process controller** in `src-tauri/src/papermc.rs` (Rust side is cleaner for process management):

   ```rust
   use std::process::{Child, Command, Stdio};
   use std::io::Write;

   pub struct PaperMC {
       process: Option<Child>,
   }

   impl PaperMC {
       pub fn start(&mut self, jar_path: &str, java_path: &str) -> Result<(), String> {
           let child = Command::new(java_path)
               .args(["-Xmx2G", "-Xms512M", "-jar", jar_path, "--nogui"])
               .current_dir(/* server dir */)
               .stdin(Stdio::piped())
               .stdout(Stdio::piped())
               .stderr(Stdio::piped())
               .spawn()
               .map_err(|e| e.to_string())?;
           self.process = Some(child);
           Ok(())
       }

       pub fn stop(&mut self) -> Result<(), String> {
           if let Some(ref mut p) = self.process {
               if let Some(stdin) = p.stdin.as_mut() {
                   stdin.write_all(b"stop\n").ok();
               }
               p.wait().ok(); // wait for clean exit
           }
           self.process = None;
           Ok(())
       }
   }
   ```

3. **Expose PaperMC commands to frontend** via Tauri commands:
   ```rust
   #[tauri::command]
   async fn start_server(state: State<'_, AppState>) -> Result<(), String> { ... }

   #[tauri::command]
   async fn stop_server(state: State<'_, AppState>) -> Result<(), String> { ... }

   #[tauri::command]
   async fn is_server_running(state: State<'_, AppState>) -> Result<bool, String> { ... }
   ```

4. **Implement the full start sequence** in the frontend:
   ```
   1. Check syncCompletion == 100% (abort if not)
   2. acquireLock() (abort if returns false)
   3. pauseFolder(worldFolderId)
   4. invoke("start_server")
   5. startHeartbeat()
   6. Update UI to "Online" state
   7. Fetch and publish Playit address to Firestore (Phase 5)
   ```

5. **Implement the full stop sequence:**
   ```
   1. invoke("stop_server") — sends "stop" to MC stdin, waits for exit
   2. resumeFolder(worldFolderId)
   3. Poll syncCompletion until 100%
   4. stopHeartbeat()
   5. releaseLock()
   6. Update UI to "Offline" state
   ```

6. **Stdout reader** — stream PaperMC stdout to the Tauri frontend via Tauri events. Show a small log panel in UI so the host can see what the server is doing.

### ⚠️ Difficult Parts
- **Java detection:** Java 21 is required for recent PaperMC versions. Check if `java -version` works and what version it returns. If not found or wrong version, show setup wizard.
- **Server startup detection:** PaperMC takes 30–90 seconds to start. Parse stdout for the line `Done (X.XXXs)! For help, type "help"` to know when the server is actually ready.
- **Windows path escaping:** Java path with spaces (e.g., `C:\Program Files\Java`) must be quoted.
- **App crash during hosting:** If the Tauri app crashes while PaperMC is running, PaperMC becomes an orphan process. On startup, check for an orphaned PaperMC process (scan running processes for `paper-*.jar`) and kill it gracefully before Syncthing resumes.

### ✅ Phase 4 Milestone
- Click "Start Server" → PaperMC starts, log panel shows server output
- Console shows "Done!" → server is ready
- Open Minecraft client, add localhost server, connect successfully
- Click "Stop Server" → PaperMC receives `stop`, exits cleanly, Syncthing resumes, lock releases
- Force-kill the app → on relaunch, orphan detection cleans up, lock eventually releases via heartbeat timeout

---

## Phase 5 — Playit.gg Tunnel
**Estimated time: 2 days**

### Goal
Other players can join via a stable public address without port forwarding. The address is published to Firestore automatically.

### Tasks

1. **Bundle Playit CLI as a Tauri sidecar**
   - Download the correct binary for each OS from `https://github.com/playit-cloud/playit-agent/releases`
   - Add to `src-tauri/binaries/` with the correct Tauri naming convention: `playit-x86_64-pc-windows-msvc.exe`, `playit-x86_64-apple-darwin`, etc.
   - Declare in `tauri.conf.json` under `bundle.externalBin`

2. **First-run claim flow**
   - Run `playit --secret_path <path>` — if `secret_path` file doesn't exist, Playit prints a claim URL to stdout
   - Show this URL to the user as a clickable link: "Click here to activate your Playit.gg tunnel"
   - Poll until claimed (Playit starts accepting connections after claim)

3. **Start tunnel alongside server**
   - Launch Playit as a background sidecar when starting the server
   - Parse stdout for the public address line, which looks like: `[tcp:25565] tunnel-abc.playit.gg:25565`
   - Write this address to `groups/{groupId}/status.address` in Firestore

4. **Join button** — reads `status.address` from Firestore and copies it to clipboard. User pastes it into Minecraft's "Add Server" screen.

5. **Stop tunnel** when server stops.

### ⚠️ Difficult Parts
- **Playit stdout parsing is fragile.** Playit's output format may vary by version. Parse with a regex: `/(\S+\.playit\.gg:\d+)/`. Test across versions.
- **Playit account requirement:** Playit.gg requires a free account for persistent addresses. Handle the case where the user hasn't created one: show a link to `https://playit.gg`.
- **Firewall:** Some networks block tunnel outbound connections. Show an error if Playit can't connect, with a fallback message: "Your network may be blocking the tunnel. Try a different network or configure your firewall."

### ✅ Phase 5 Milestone
- Start server → Playit tunnel starts → public address appears in the app UI
- A player on a different network joins using the displayed address and connects successfully
- Stop server → Playit tunnel terminates
- Address is written to Firestore and visible to all group members in real-time

---

## Phase 6 — Setup Wizard & Dependency Installation
**Estimated time: 3 days**

### Goal
A new user installs HostCraft and the app installs everything they need automatically. Zero terminal usage.

### Tasks

1. **Wizard flow (multi-step screen)**

   ```
   Step 1: Sign In / Create Account
   Step 2: Enter display name
   Step 3: Join group (enter group invite code) OR Create group
   Step 4: Dependency check and install
     - Java 21 check → download if missing
     - Syncthing check → download if missing
     - PaperMC download (for hosts only)
   Step 5: (Hosts only) Playit claim
   Step 6: (Hosts only) Syncthing world sync
     - Show live sync progress bar
     - Wait for 100%
   Step 7: Done → go to main screen
   ```

2. **Java detection and download**
   - Run `java -version` and parse version number
   - If not found or < 21: download JDK 21 from Adoptium API
   - Windows: download MSI, run it silently (`msiexec /i java.msi /qn`)
   - macOS: download `.pkg`, run `sudo installer -pkg java.pkg -target /`
   - Show download progress bar (stream bytes, update percentage)

3. **Syncthing detection and download**
   - Check for `syncthing` binary in common locations
   - If not found: download from `https://github.com/syncthing/syncthing/releases`
   - Extract and place in app data directory
   - First run: `syncthing --generate <configDir>` to create initial config

4. **Group invite system** (Firebase)
   ```
   groups/{groupId}/invites/{code}
     createdBy: "vin"
     expiresAt: timestamp
     used: false
   ```
   Owner generates a 6-character code. New member enters it. App validates code, adds them to `members`.

5. **Syncthing device exchange** for new hosts
   - New host's app reads their local Syncthing device ID (from config)
   - Sends it to Firestore: `groups/{groupId}/hostRequests/{uid} = { deviceId: "..." }`
   - Owner's app sees pending request, approves it
   - All existing hosts' apps receive the new device ID and add it to their Syncthing folder via the REST API
   - New host's Syncthing begins receiving world files

### ⚠️ Difficult Parts
- **Silent Java install on macOS needs admin privileges.** Use `sudo` prompt via Tauri's dialog API, or ask user to run a helper script.
- **Syncthing generate config:** On first run you must call `syncthing --generate <dir>` before starting it, otherwise it generates the config in the wrong location.
- **Syncthing folder ID:** Every Syncthing folder has a unique ID (not the path). When you add the world folder to Syncthing via REST API, generate a stable folder ID and store it in Firestore so all hosts use the same ID.

### ✅ Phase 6 Milestone
- Install HostCraft on a fresh machine with no Minecraft tools
- Run the setup wizard from start to finish without opening a terminal
- After wizard completes, the main screen appears and shows the correct group state
- A second machine goes through the wizard as a host and successfully syncs the world from the first

---

## Phase 7 — Notifications & Member Management
**Estimated time: 2 days**

### Goal
All group members receive in-app notifications for server events. Owner can promote/demote hosts.

### Tasks

1. **In-app notification system**
   - Firestore listener on `groups/{groupId}/notifications` collection
   - When server starts: write `{ type: "server_started", by: "vin", at: timestamp }`
   - All clients receive it via `onSnapshot` and show a toast notification
   - Keep last 20 notifications, show in a feed

2. **Notification types**
   ```
   server_started  → "Vin started Survival World"
   server_stopped  → "Survival World is now offline"
   host_changed    → "Alex is now hosting"
   host_promoted   → "John is now a host"
   host_demoted    → "Mike is no longer a host"
   ```

3. **Members screen** (owner only)
   - List all group members with their role badge
   - Promote button → triggers host promotion flow (Phase 6 device exchange)
   - Demote button → removes Syncthing peer, deletes world replica locally, removes host role

4. **Host demotion flow**
   - Remove `hosts/{uid}` from group document
   - Write a `demotionRequest` to Firestore
   - All hosts remove the demoted device from their Syncthing folder via REST API
   - The demoted user's app detects the demotion, deletes local world files, removes Syncthing config

### ✅ Phase 7 Milestone
- Start server on Host A → all group members see "Vin started Survival World" toast within 2 seconds
- Owner promotes a player to host → setup wizard runs on that user's machine automatically
- Owner demotes a host → that user can no longer click Start, world files are deleted from their machine

---

## Phase 8 — Crash Recovery & Edge Cases
**Estimated time: 2 days**

### Goal
The system self-heals from all failure scenarios without manual intervention.

### Scenarios to Handle

**Scenario A: Host PC loses power**
- Heartbeat stops updating
- After 60 seconds, any host sees `currentTime - lastHeartbeat > 60` via their Firestore listener
- They display: "Previous host is unavailable. You can now host."
- They attempt lock acquisition (atomic transaction — only one winner)
- Winner verifies sync is 100%, then starts server

**Scenario B: App crashes with PaperMC still running**
- On next app launch: scan OS process list for running `java` process with PaperMC jar in args
- If found: send `stop` command (attach to its stdin via `/proc/<pid>/fd/0` on Linux, or use Windows API)
- If can't attach: force kill it (data loss risk — warn user)
- Resume Syncthing after MC exits
- Check sync completion, release stale lock

**Scenario C: Syncthing crashes during sync-after-shutdown**
- Lock is held, Syncthing not running, world may be un-synced
- On next launch: detect `status.host == self && status.online == false` — incomplete shutdown
- Restart Syncthing, wait for sync to complete, then release lock

**Scenario D: New host starts with stale world**
- Sync completion check before start prevents this
- Belt-and-suspenders: also check `lastModified` of world folder timestamp vs Firebase `lastServerStop` timestamp

**Scenario E: Two hosts both detect heartbeat timeout simultaneously**
- Both attempt `acquireLock()` at the same time
- Firestore transaction guarantees only one wins
- Loser gets an error, shows "Another host took over" message

### Implementation Tasks

1. **On-launch recovery check:**
   ```typescript
   async function runRecoveryCheck() {
     const status = await getGroupStatus();

     // Check for orphaned PaperMC process
     if (await isProcessRunning("paper")) {
       await killPaperMCGracefully();
       await syncthingResume();
     }

     // Check for stale lock held by self
     if (status.host === currentUser && !status.online) {
       await waitForSyncCompletion();
       await releaseLock();
     }

     // Check for expired foreign lock
     if (status.host !== null && isLockExpired(status.lastHeartbeat)) {
       // Lock is available to claim
       showToast("Previous host disconnected. Server is available.");
     }
   }
   ```

2. **Heartbeat watcher** — all online clients (not just hosts) run a check: every 30 seconds, compare `lastHeartbeat` to current time. If expired, update UI to show "Host disconnected."

### ✅ Phase 8 Milestone
- Force-kill the app while server is running → after 60s another host can start successfully with no corruption
- Relaunch app after crash → orphan detection runs, Syncthing resumes, lock clears
- Simulate two hosts claiming simultaneously → exactly one gets the server, the other sees an error

---

## Phase 9 — Polish, UI & Settings
**Estimated time: 3 days**

### Goal
The app feels like consumer software. All edge cases have proper UI feedback.

### Tasks

1. **Main screen (final design)**
   ```
   ┌─────────────────────────────┐
   │  🌍 Survival World          │
   │  🟢 Online · Hosted by Vin  │
   │  👥 4/20 players            │
   │                             │
   │       [ Join Server ]       │
   │    address: abc.playit.gg   │
   │                             │
   │  Sync: ████████░░ 83%      │ ← only shown when < 100% and is a host
   └─────────────────────────────┘
   ```

2. **State-based button rendering:**
   | Condition | Button shown |
   |---|---|
   | Player, server online | Join Server |
   | Player, server offline | Waiting for host… |
   | Host, server offline, sync 100% | Start Server |
   | Host, server offline, sync < 100% | Syncing… X% (disabled) |
   | Host, server online, I am host | Stop Server |
   | Host, server online, someone else hosting | Join Server |
   | Owner, server offline | Start Server + Manage Members |

3. **Settings screen**
   - Change display name
   - Minecraft version selector (downloads corresponding PaperMC build)
   - Java path override (for users with custom Java installs)
   - Server memory slider (512MB – 8GB Xmx)
   - Leave group

4. **Error states** — every async operation must show:
   - Loading state (spinner)
   - Success state
   - Error state with a human-readable message and a retry button

5. **Log panel** (for hosts) — collapsible panel showing PaperMC stdout in real-time

6. **First-run checklist** — show a green checklist as dependencies install during setup

### ✅ Phase 9 Milestone
- Show the app to a non-technical friend. They should be able to use it with zero explanation.
- All buttons are labeled clearly with no jargon
- Every error shows a human message, never a raw exception or stack trace
- The app works correctly after sleeping and waking the host machine

---

## Phase 10 — Build, Package & Distribution
**Estimated time: 2 days**

### Goal
Installable `.exe` / `.dmg` / `.deb` that works on a fresh machine.

### Tasks

1. **Tauri build config** — set app ID, version, icons, bundle targets in `tauri.conf.json`

2. **Code sign the app** (important for macOS especially)
   - macOS: Apple Developer certificate + `codesign` + notarization with `xcrun notarytool`
   - Windows: self-signed cert (free) or a paid cert from DigiCert (avoids SmartScreen warning)

3. **Embed Playit binary as sidecar** — Tauri will include it in the bundle automatically if declared correctly

4. **Auto-updater** — enable Tauri's built-in updater plugin. Point to a GitHub Releases endpoint.

5. **GitHub Actions CI** — build for all three platforms on push to `main`:
   ```yaml
   jobs:
     build:
       strategy:
         matrix:
           os: [windows-latest, macos-latest, ubuntu-latest]
       runs-on: ${{ matrix.os }}
       steps:
         - uses: tauri-apps/tauri-action@v0
   ```

6. **Environment variables in production** — Firebase config should not be hardcoded. Use Tauri's env injection or embed in the build.

### ✅ Phase 10 Milestone
- Build the app on all 3 platforms without errors
- Install the `.exe` on a fresh Windows VM with no existing tools → setup wizard runs and completes
- App launches and connects to Firebase correctly
- Auto-update check runs on launch

---

## Summary: Phase Order and Dependencies

```
Phase 0: Scaffold
    ↓
Phase 1: Firebase + Group State
    ↓
Phase 2: Host Lock (most critical — don't skip testing)
    ↓
Phase 3: Syncthing Control
    ↓
Phase 4: PaperMC Control ← full start/stop sequence lives here
    ↓
Phase 5: Playit Tunnel ← join functionality
    ↓
Phase 6: Setup Wizard ← onboarding new users/hosts
    ↓
Phase 7: Notifications + Member Management
    ↓
Phase 8: Crash Recovery
    ↓
Phase 9: Polish
    ↓
Phase 10: Build + Package
```

---

## What Can Go Wrong (and how to avoid it)

| Risk | Mitigation |
|---|---|
| Two hosts start simultaneously | Firestore transaction in Phase 2 — test this explicitly |
| World corruption from live sync | Pause Syncthing BEFORE starting PaperMC — enforce this in code order |
| Orphaned PaperMC after crash | Launch-time process scan in Phase 8 |
| Stale lock after crash | 60s heartbeat timeout in Phase 2 |
| New host gets partial world | Block Start until syncCompletion == 100% in Phase 3 |
| CORS blocking Syncthing REST calls | Proxy through Tauri Rust backend, not WebView fetch |
| Java version mismatch | Version check in setup wizard in Phase 6 |
| Playit address not parsed | Robust regex with fallback, tested across Playit versions |
| Lock held during failed shutdown | On-launch incomplete-shutdown recovery in Phase 8 |
| Windows path with spaces | Quote all executable paths in shell invocations |

---

## Suggested Dev Environment

- **Node.js 20+** and **Rust (stable)**
- **VS Code** with Tauri and rust-analyzer extensions
- **Two separate machines or VMs** for testing the lock contention and sync scenarios
- **Firebase Local Emulator Suite** for offline dev: `firebase emulators:start`
- Keep a dedicated test Minecraft account (non-paid accounts can't join servers — use a test account on both machines)
