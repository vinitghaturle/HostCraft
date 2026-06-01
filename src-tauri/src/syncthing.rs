use std::process::{Child, Command as StdCommand, Stdio};
use std::sync::Mutex;
use tauri::{State, AppHandle, Manager};

pub struct SyncthingState {
    pub process: Mutex<Option<Child>>,
}

#[tauri::command]
pub async fn start_syncthing(
    state: State<'_, SyncthingState>,
    exe_path: String,
) -> Result<(), String> {
    let mut process_guard = state.process.lock().map_err(|_| "Mutex poisoned")?;
    
    if process_guard.is_some() {
        return Ok(()); // Already running
    }

    // Use the directory of the executable itself (or a subfolder) as the home directory
    let home_dir = std::path::Path::new(&exe_path).parent().unwrap().join("config");
    
    let mut cmd = StdCommand::new(&exe_path);
    cmd.args(["--no-browser", "--no-restart", "--home", home_dir.to_str().unwrap()])
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let child = cmd.spawn()
        .map_err(|e| format!("Failed to start Syncthing: {}", e))?;

    *process_guard = Some(child);
    Ok(())
}

#[tauri::command]
pub async fn stop_syncthing(state: State<'_, SyncthingState>) -> Result<(), String> {
    let mut process_guard = state.process.lock().map_err(|_| "Mutex poisoned")?;
    
    if let Some(mut child) = process_guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(())
}
