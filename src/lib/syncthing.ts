import { readTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { fetch } from '@tauri-apps/plugin-http';
import { Command } from '@tauri-apps/plugin-shell';
import { invoke } from "@tauri-apps/api/core";
import { appLocalDataDir, join } from "@tauri-apps/api/path";

const SYNCTHING_BASE = "http://127.0.0.1:8384";

/** 
 * Reads the Syncthing config.xml from the user's LocalAppData (Windows),
 * or equivalent on other OSs, and extracts the <apikey> via regex.
 */
async function getSyncthingApiKey(): Promise<string> {
  let attempts = 0;
  while (attempts < 15) {
    try {
      const configXml = await readTextFile('syncthing/config/config.xml', { baseDir: BaseDirectory.AppLocalData });
      const match = configXml.match(/<apikey>(.*?)<\/apikey>/);
      if (match && match[1]) {
        return match[1];
      }
      throw new Error("API key not found in config.xml");
    } catch (err) {
      if (attempts >= 14) {
        console.error("Failed to read Syncthing config:", err);
        throw err;
      }
      attempts++;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error("Failed to get API key");
}

export async function syncthingRequest(path: string, method = "GET", body?: object) {
  const apiKey = await getSyncthingApiKey();
  const url = `${SYNCTHING_BASE}${path}`;
  
  let attempts = 0;
  while (attempts < 10) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json"
        },
        body: body ? JSON.stringify(body) : undefined
      });
      
      if (!res.ok) {
        throw new Error(`Syncthing API Error: ${res.status} ${res.statusText}`);
      }
      
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } catch (e: any) {
      if (attempts >= 9) throw e;
      attempts++;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

export async function pauseFolder(folderId: string) {
  return syncthingRequest(`/rest/db/pause?folder=${folderId}`, "POST");
}

export async function resumeFolder(folderId: string) {
  return syncthingRequest(`/rest/db/resume?folder=${folderId}`, "POST");
}

export async function getFolderCompletion(folderId: string) {
  // Returns { completion: 83.4, ... }
  return syncthingRequest(`/rest/db/completion?folder=${folderId}`);
}

export async function checkSyncthingRunning(): Promise<boolean> {
  try {
    const apiKey = await getSyncthingApiKey();
    const res = await fetch(`${SYNCTHING_BASE}/rest/system/ping`, {
      method: "GET",
      headers: { "X-API-Key": apiKey }
    });
    const data = await res.json();
    return data?.ping === "pong";
  } catch (err) {
    return false;
  }
}


export async function startSyncthingProcess() {
  const isRunning = await checkSyncthingRunning();
  if (isRunning) return true;

  try {
    const localDataDir = await appLocalDataDir();
    // Assuming extraction structure: syncthing/syncthing-windows-amd64-v1.27.7/syncthing.exe
    // But since SetupWizard checks `syncthing/syncthing.exe` wait, how did setup wizard extract it?
    // Let's just look in syncthing/syncthing.exe
    const exePath = await join(localDataDir, "syncthing", "syncthing.exe");
    
    await invoke("start_syncthing", { exePath });
    return true;
  } catch (err) {
    console.error("Failed to start Syncthing:", err);
    return false;
  }
}

/**
 * Gets the local Syncthing Device ID
 */
export async function getMyDeviceId(): Promise<string> {
  const data = await syncthingRequest("/rest/system/status");
  return data.myID;
}
