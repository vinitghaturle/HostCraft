import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, writeFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const PAPER_VERSION = "1.20.4";
const PAPER_BUILD = "496"; // A stable build for 1.20.4
const PAPER_JAR_NAME = `paper-${PAPER_VERSION}-${PAPER_BUILD}.jar`;
const DOWNLOAD_URL = `https://api.papermc.io/v2/projects/paper/versions/${PAPER_VERSION}/builds/${PAPER_BUILD}/downloads/${PAPER_JAR_NAME}`;

export async function getServerDir(): Promise<string> {
  const appData = await appDataDir();
  const serverDir = await join(appData, "server");
  
  if (!(await exists("server", { baseDir: BaseDirectory.AppData }))) {
    await mkdir("server", { baseDir: BaseDirectory.AppData, recursive: true });
  }
  return serverDir;
}

export async function setupPaperMC(): Promise<string> {
  const serverDir = await getServerDir();
  const jarPath = await join(serverDir, PAPER_JAR_NAME);

  // Check if jar exists
  const jarExists = await exists(`server/${PAPER_JAR_NAME}`, { baseDir: BaseDirectory.AppData });
  if (!jarExists) {
    console.log("Downloading PaperMC...");
    const response = await tauriFetch(DOWNLOAD_URL);
    if (!response.ok) throw new Error("Failed to download PaperMC");
    
    const arrayBuffer = await response.arrayBuffer();
    await writeFile(`server/${PAPER_JAR_NAME}`, new Uint8Array(arrayBuffer), { baseDir: BaseDirectory.AppData });
    console.log("Download complete.");
  }

  // Create eula.txt
  const eulaExists = await exists("server/eula.txt", { baseDir: BaseDirectory.AppData });
  if (!eulaExists) {
    await writeFile("server/eula.txt", new TextEncoder().encode("eula=true\n"), { baseDir: BaseDirectory.AppData });
  }

  return jarPath;
}

export async function startPaperMC(): Promise<void> {
  const jarPath = await setupPaperMC();
  const workDir = await getServerDir();
  const localDataDir = await appDataDir();
  // Wait, I should use appLocalDataDir here because SetupWizard uses it for java21
  const { appLocalDataDir } = await import("@tauri-apps/api/path");
  const localDir = await appLocalDataDir();
  
  // Custom Java Path
  const customJava = localStorage.getItem("hostcraft_java_path");
  const javaPath = customJava || await join(localDir, "jre", "bin", "java.exe");
  
  const { exists } = await import("@tauri-apps/plugin-fs");
  const hasLocalJava = customJava ? await exists(customJava) : await exists(javaPath);
  
  // Memory
  const memStr = localStorage.getItem("hostcraft_memory_mb");
  const memoryMb = memStr ? parseInt(memStr, 10) : 2048;

  console.log("Starting PaperMC...");
  await invoke("start_server", { 
    jarPath, 
    workDir,
    javaPath: hasLocalJava ? javaPath : "java",
    memoryMb
  });
}

export async function stopPaperMC(): Promise<void> {
  console.log("Stopping PaperMC...");
  await invoke("stop_server");
}

export async function isPaperMCRunning(): Promise<boolean> {
  return await invoke("is_server_running");
}

export async function forceKillStrayServers(): Promise<boolean> {
  console.log("Checking for stray PaperMC servers...");
  const killed = await invoke<boolean>("force_kill_stray_servers");
  if (killed) {
    console.log("Killed a stray PaperMC server process.");
  }
  return killed;
}
