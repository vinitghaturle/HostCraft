use std::process::{Child, Command as StdCommand, Stdio};
use std::io::Write;
use std::sync::Mutex;
use tauri::{State, AppHandle, Manager};

pub struct PaperMcState {
    pub process: Mutex<Option<Child>>,
}

use std::io::{BufReader, BufRead};
use tauri::Emitter;

#[tauri::command]
pub async fn start_server(
    state: State<'_, PaperMcState>,
    app: AppHandle,
    jar_path: String,
    work_dir: String,
    java_path: Option<String>,
    memory_mb: Option<u32>,
) -> Result<(), String> {
    let mut process_guard = state.process.lock().map_err(|_| "Mutex poisoned")?;
    
    if process_guard.is_some() {
        return Err("Server is already running".to_string());
    }

    let java_cmd = java_path.unwrap_or_else(|| "java".to_string());
    let memory = memory_mb.unwrap_or(2048);
    let xmx = format!("-Xmx{}M", memory);
    let xms = format!("-Xms{}M", memory.min(512));

    let mut cmd = StdCommand::new(&java_cmd);
    cmd.args([&xmx, &xms, "-jar", &jar_path, "nogui"])
        .current_dir(&work_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to start PaperMC: {}", e))?;

    if let Some(stdout) = child.stdout.take() {
        let app_clone = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let _ = app_clone.emit("papermc-log", l);
                }
            }
        });
    }

    *process_guard = Some(child);
    Ok(())
}

#[tauri::command]
pub async fn stop_server(state: State<'_, PaperMcState>) -> Result<(), String> {
    let mut process_guard = state.process.lock().map_err(|_| "Mutex poisoned")?;
    
    if let Some(mut child) = process_guard.take() {
        if let Some(mut stdin) = child.stdin.take() {
            // Send the stop command to the Minecraft server
            let _ = stdin.write_all(b"stop\n");
            let _ = stdin.flush();
        }
        
        // Wait for the server to exit gracefully
        let _ = child.wait();
    }
    
    Ok(())
}

#[tauri::command]
pub async fn is_server_running(state: State<'_, PaperMcState>) -> Result<bool, String> {
    let mut process_guard = state.process.lock().map_err(|_| "Mutex poisoned")?;
    
    if let Some(child) = process_guard.as_mut() {
        match child.try_wait() {
            Ok(Some(_status)) => {
                // Process has exited
                *process_guard = None;
                Ok(false)
            }
            Ok(None) => {
                // Process is still running
                Ok(true)
            }
            Err(_) => {
                // Error checking status
                Ok(false)
            }
        }
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub async fn force_kill_stray_servers() -> Result<bool, String> {
    // Find java processes that have 'paper' in the command line and kill them.
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("powershell");
        cmd.args(["-Command", "$procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'java' -and $_.CommandLine -match 'paper' }; if ($procs) { $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Write-Output 'KILLED' }"]);
        
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
            
        let output = cmd.output()
            .map_err(|e| e.to_string())?;
            
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Ok(stdout.contains("KILLED"));
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        let output = std::process::Command::new("sh")
            .args(["-c", "pids=$(pgrep -f 'java.*paper'); if [ -n \"$pids\" ]; then kill -9 $pids; echo 'KILLED'; fi"])
            .output()
            .map_err(|e| e.to_string())?;
            
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Ok(stdout.contains("KILLED"));
    }
}
