// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

mod papermc;
mod syncthing;
use std::sync::Mutex;
use papermc::{start_server, stop_server, is_server_running, force_kill_stray_servers, PaperMcState};
use syncthing::{start_syncthing, stop_syncthing, SyncthingState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PaperMcState {
            process: Mutex::new(None),
        })
        .manage(SyncthingState {
            process: Mutex::new(None),
        })
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            start_server,
            stop_server,
            is_server_running,
            force_kill_stray_servers,
            start_syncthing,
            stop_syncthing
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
