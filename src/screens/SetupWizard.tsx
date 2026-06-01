import { useState, useEffect } from "react";
import { Command } from "@tauri-apps/plugin-shell";
import { BaseDirectory, exists, mkdir, writeTextFile } from "@tauri-apps/plugin-fs";
import { appLocalDataDir, join } from "@tauri-apps/api/path";

export default function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState("Checking requirements...");
  const [logs, setLogs] = useState<string[]>([]);

  const appendLog = (line: string) => {
    if (!line.trim()) return;
    setLogs((prev) => [...prev, line].slice(-15)); // Keep last 15 lines
  };

  async function runCommandWithLogs(cmd: string, args: string[]) {
    return new Promise<void>(async (resolve, reject) => {
      try {
        const command = Command.create(cmd, args);
        command.on('close', data => {
          if (data.code === 0) resolve();
          else reject(new Error(`Command ${cmd} failed with code ${data.code}`));
        });
        command.on('error', error => reject(error));
        command.stdout.on('data', line => appendLog(line));
        command.stderr.on('data', line => appendLog(line));
        await command.spawn();
      } catch (err) {
        reject(err);
      }
    });
  }

  useEffect(() => {
    runChecks();
  }, []);

  async function runChecks() {
    setStep(1);
    setStatus("Checking Java 21...");
    const hasJava = await checkJava();
    
    if (!hasJava) {
      setStatus("Java 21 not found. Please install it.");
      await downloadJava();
    }

    setStep(2);
    setStatus("Checking Syncthing...");
    const hasSync = await checkSyncthing();
    if (!hasSync) {
      setStatus("Downloading Syncthing...");
      await downloadSyncthing();
    }

    setStep(3);
    setStatus("Checking PaperMC...");
    const hasPaper = await checkPaperMC();
    if (!hasPaper) {
      setStatus("Downloading PaperMC...");
      await downloadPaperMC();
    }

    setStep(4);
    setStatus("Setup Complete!");
    setTimeout(onComplete, 1000);
  }

  async function checkJava() {
    try {
      // First check global java
      const globalOutput = await Command.create("java", ["-version"]).execute();
      if (globalOutput.stderr.includes("21.") || globalOutput.stdout.includes("21.")) return true;
    } catch {}

    try {
      // Check local portable java
      const localDataDir = await appLocalDataDir();
      const javaPath = await join(localDataDir, "jre", "bin", "java.exe");
      if (await exists(javaPath)) return true;
    } catch {}
    
    return false;
  }

  async function downloadJava() {
    try {
      setStatus("Downloading Java 21 Portable (this may take a minute)...");
      const localDataDir = await appLocalDataDir();
      const zipPath = await join(localDataDir, "java21.zip");
      const jrePath = await join(localDataDir, "jre");
      
      await runCommandWithLogs("curl", [
        "-L", 
        "-#",
        "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.3%2B9/OpenJDK21U-jre_x64_windows_hotspot_21.0.3_9.zip", 
        "-o", 
        zipPath
      ]);

      setStatus("Extracting Java 21...");
      const extractedPath = await join(localDataDir, "jdk-21.0.3+9-jre");
      await runCommandWithLogs("tar", ["-xvf", zipPath, "-C", localDataDir]);
      
      const { rename } = await import("@tauri-apps/plugin-fs");
      // If user had a partial extraction, remove the old jre folder to avoid rename failing
      try {
        const { remove } = await import("@tauri-apps/plugin-fs");
        await remove(jrePath, { recursive: true });
      } catch (e) {} // ignore if doesn't exist
      
      await rename(extractedPath, jrePath);
    } catch (e) {
      console.error("Failed to download Java", e);
    }
  }

  async function checkSyncthing() {
    return await exists("syncthing/syncthing.exe", { baseDir: BaseDirectory.AppLocalData });
  }

  async function downloadSyncthing() {
    try {
      setStatus("Downloading Syncthing...");
      const localDataDir = await appLocalDataDir();
      const zipPath = await join(localDataDir, "syncthing.zip");
      const destPath = await join(localDataDir, "syncthing");
      const extractedPath = await join(localDataDir, "syncthing-windows-amd64-v1.27.7");
      
      await runCommandWithLogs("curl", [
        "-L", 
        "-#",
        "https://github.com/syncthing/syncthing/releases/download/v1.27.7/syncthing-windows-amd64-v1.27.7.zip", 
        "-o", 
        zipPath
      ]);

      setStatus("Extracting Syncthing...");
      await runCommandWithLogs("tar", ["-xvf", zipPath, "-C", localDataDir]);
      
      // Rename extracted folder to 'syncthing'
      const { rename, remove } = await import("@tauri-apps/plugin-fs");
      try { await remove(destPath, { recursive: true }); } catch (e) {}
      await rename(extractedPath, destPath);
    } catch (e) {
      console.error("Failed to setup syncthing", e);
    }
  }

  async function checkPaperMC() {
    return await exists("mc_server/paper.jar", { baseDir: BaseDirectory.AppLocalData });
  }

  async function downloadPaperMC() {
    try {
      setStatus("Downloading PaperMC...");
      const localDataDir = await appLocalDataDir();
      const mcPath = await join(localDataDir, "mc_server");
      
      if (!(await exists(mcPath))) {
        await mkdir(mcPath, { recursive: true });
      }
      
      const jarPath = await join(mcPath, "paper.jar");
      await runCommandWithLogs("curl", [
        "-L", 
        "-#",
        "https://api.papermc.io/v2/projects/paper/versions/1.21.1/builds/130/downloads/paper-1.21.1-130.jar", 
        "-o", 
        jarPath
      ]);
      
      await writeTextFile("mc_server/eula.txt", "eula=true", { baseDir: BaseDirectory.AppLocalData });
    } catch (e) {
      console.error("Failed to setup paper", e);
    }
  }

  return (
    <div className="min-h-screen bg-[#080B10] text-slate-300 flex items-center justify-center p-8">
      <div className="w-full max-w-md bg-[#0F172A] rounded-3xl p-8 border border-[#1E293B] shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-6">HostCraft Setup</h2>
        <p className="text-sm text-slate-400 mb-6">{status}</p>
        
        <div className="w-full bg-slate-800 rounded-full h-2 mb-6">
          <div className="bg-cyan-500 h-2 rounded-full transition-all duration-500" style={{ width: `${(step / 4) * 100}%` }}></div>
        </div>

        {/* Terminal Logs */}
        <div className="w-full bg-black/50 border border-slate-700 rounded-lg p-4 h-48 overflow-y-auto font-mono text-xs text-green-400 flex flex-col-reverse">
          {logs.length === 0 ? (
            <span className="text-slate-500">Waiting for output...</span>
          ) : (
            [...logs].reverse().map((log, i) => (
              <div key={i} className="whitespace-pre-wrap break-words">{log}</div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
