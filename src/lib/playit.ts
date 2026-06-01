import { Command } from "@tauri-apps/plugin-shell";
import { appDataDir, join } from "@tauri-apps/api/path";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAppStore } from "../store/appStore";

let playitCommand: any = null;

export async function startPlayitTunnel(groupId: string): Promise<void> {
  if (playitCommand) {
    console.log("Playit is already running.");
    return;
  }

  const appData = await appDataDir();
  const secretPath = await join(appData, "playit_secret.txt");

  console.log("Starting playit with secret path:", secretPath);

  // Tauri maps 'binaries/playit' to the specific executable for the platform
  const command = Command.sidecar("binaries/playit", ["--secret-path", secretPath]);

  command.stdout.on('data', (line) => {
    console.log("[Playit]", line);
    // Parse claim URL
    if (line.includes("https://playit.gg/claim/")) {
      const match = line.match(/(https:\/\/playit\.gg\/claim\/[a-zA-Z0-9]+)/);
      if (match) {
        useAppStore.getState().setPlayitClaimUrl(match[1]);
      }
    }
    
    // Ignore spammy ping logs, show agent/tunnel progress
    if (line.includes("agent") || line.includes("tunnel") || line.includes("Starting")) {
        useAppStore.getState().setPlayitStatus(line.trim());
    }
    
    // Parse tunnel address
    const tunnelMatch = line.match(/([a-zA-Z0-9.-]+\.playit\.gg:\d+)/);
    if (tunnelMatch && !line.includes("Starting tunnel")) {
       const address = tunnelMatch[1];
       console.log("Found playit address:", address);
       updateDoc(doc(db, "groups", groupId, "status", "status"), {
         address: address
       }).catch(console.error);
    }
  });

  command.stderr.on('data', (line) => {
    console.log("[Playit Log]", line);
    // Parse tunnel address from stderr logs (v1.0.5 behavior)
    const tunnelMatch = line.match(/([a-zA-Z0-9.-]+\.playit\.gg:\d+)/);
    if (tunnelMatch && !line.includes("Starting tunnel")) {
       const address = tunnelMatch[1];
       console.log("Found playit address in stderr:", address);
       updateDoc(doc(db, "groups", groupId, "status", "status"), {
         address: address
       }).catch(console.error);
    }
  });

  command.on('close', (data) => {
    console.log(`Playit closed with code ${data.code} and signal ${data.signal}`);
    playitCommand = null;
    useAppStore.getState().setPlayitClaimUrl(null);
  });

  playitCommand = await command.spawn();
}

export async function stopPlayitTunnel(): Promise<void> {
  if (playitCommand) {
    await playitCommand.kill();
    playitCommand = null;
    useAppStore.getState().setPlayitClaimUrl(null);
  }
}
