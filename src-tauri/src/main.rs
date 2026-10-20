#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Value};
use std::{path::PathBuf, sync::Mutex};
use tauri::{Manager, State};

struct SmokeReport(Mutex<Option<PathBuf>>);

#[tauri::command]
fn media_runtime_path(app: tauri::AppHandle) -> Result<String, String> {
    let path = app.path().resource_dir().map_err(|e| e.to_string())?
        .join("media").join("ffmpeg-core.wasm");
    if !path.is_file() { return Err("The bundled offline media runtime is missing".into()); }
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn runtime_info() -> Value {
    json!({
        "application": "BitCrush",
        "version": env!("CARGO_PKG_VERSION"),
        "platform": std::env::consts::OS,
        "architecture": std::env::consts::ARCH,
        "smokeTest": std::env::args().any(|arg| arg == "--smoke-test"),
    })
}

#[tauri::command]
fn complete_smoke_test(
    report: Value,
    state: State<'_, SmokeReport>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let path = state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or_else(|| "No desktop smoke test was requested".to_owned())?;
    let success = report
        .get("passed")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let result = json!({ "runtime": runtime_info(), "webview": report });
    std::fs::write(
        path,
        serde_json::to_vec_pretty(&result).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    app.exit(if success { 0 } else { 1 });
    Ok(())
}

fn smoke_path() -> Option<PathBuf> {
    let mut args = std::env::args();
    while let Some(arg) = args.next() {
        if arg == "--smoke-test" {
            return args.next().map(PathBuf::from);
        }
    }
    None
}

fn main() {
    tauri::Builder::default()
        .manage(SmokeReport(Mutex::new(smoke_path())))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![runtime_info, media_runtime_path, complete_smoke_test])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if smoke_path().is_some() {
                    window.hide()?;
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Unable to start BitCrush");
}
