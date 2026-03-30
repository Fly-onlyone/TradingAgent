use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

struct BuildProcess {
    child: Mutex<Option<CommandChild>>,
    start_time: Mutex<Option<Instant>>,
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildOptions {
    pub release: bool,
    pub wix_installer: bool,
    pub strip_symbols: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildOutputEvent {
    pub line: String,
    pub stream: String, // "stdout" | "stderr"
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildProgressEvent {
    pub step: u32,
    pub total_steps: u32,
    pub label: String,
    pub percent: u32,
    pub elapsed_secs: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildCompleteEvent {
    pub success: bool,
    pub message: String,
    pub elapsed_secs: f64,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Resolves the parent Trading agent project root (../../ from this crate).
fn project_root() -> Result<PathBuf, String> {
    let crate_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    crate_dir
        .join("..") // tools/build-gui
        .join("..") // tools
        .join("..") // project root
        .canonicalize()
        .map_err(|e| format!("Cannot resolve project root: {e}"))
}

fn frontend_dir() -> Result<PathBuf, String> {
    let root = project_root()?;
    let dir = root.join("frontend");
    if dir.exists() {
        Ok(dir)
    } else {
        Err(format!("frontend/ directory not found at {}", dir.display()))
    }
}

// ---------------------------------------------------------------------------
// Commands: Version Management
// ---------------------------------------------------------------------------

/// Reads the current version from frontend/package.json.
#[tauri::command]
fn read_version() -> Result<String, String> {
    let pkg_path = frontend_dir()?.join("package.json");
    let content = std::fs::read_to_string(&pkg_path)
        .map_err(|e| format!("Cannot read {}: {e}", pkg_path.display()))?;
    let json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {e}"))?;
    json["version"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "No \"version\" field in package.json".to_string())
}

/// Syncs the given version string to all three version files.
#[tauri::command]
fn sync_versions(version: String) -> Result<(), String> {
    // Validate semver-ish format
    let re = regex::Regex::new(r"^\d+\.\d+\.\d+(-[\w.]+)?$").unwrap();
    if !re.is_match(&version) {
        return Err(format!(
            "Invalid version format \"{version}\". Expected X.Y.Z or X.Y.Z-prerelease"
        ));
    }

    let frontend = frontend_dir()?;

    // 1) frontend/package.json
    {
        let path = frontend.join("package.json");
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Cannot read {}: {e}", path.display()))?;
        let mut json: serde_json::Value =
            serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {e}"))?;
        json["version"] = serde_json::Value::String(version.clone());
        let output = serde_json::to_string_pretty(&json).map_err(|e| format!("JSON write: {e}"))?;
        std::fs::write(&path, output + "\n")
            .map_err(|e| format!("Cannot write {}: {e}", path.display()))?;
    }

    // 2) frontend/src-tauri/tauri.conf.json
    {
        let path = frontend.join("src-tauri").join("tauri.conf.json");
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Cannot read {}: {e}", path.display()))?;
        let mut json: serde_json::Value =
            serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {e}"))?;
        json["version"] = serde_json::Value::String(version.clone());
        let output = serde_json::to_string_pretty(&json).map_err(|e| format!("JSON write: {e}"))?;
        std::fs::write(&path, output + "\n")
            .map_err(|e| format!("Cannot write {}: {e}", path.display()))?;
    }

    // 3) frontend/src-tauri/Cargo.toml
    {
        let path = frontend.join("src-tauri").join("Cargo.toml");
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Cannot read {}: {e}", path.display()))?;
        let mut doc = content
            .parse::<toml_edit::DocumentMut>()
            .map_err(|e| format!("Invalid TOML: {e}"))?;
        doc["package"]["version"] = toml_edit::value(&version);
        std::fs::write(&path, doc.to_string())
            .map_err(|e| format!("Cannot write {}: {e}", path.display()))?;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Commands: Run Installer
// ---------------------------------------------------------------------------

/// Finds and launches the most recently built installer (.msi or .exe in bundle/).
#[tauri::command]
fn run_installer() -> Result<String, String> {
    let frontend = frontend_dir()?;
    let bundle_dir = frontend
        .join("src-tauri")
        .join("target")
        .join("release")
        .join("bundle");

    if !bundle_dir.exists() {
        return Err("Bundle directory not found. Has a build completed?".to_string());
    }

    // Search msi/ and nsis/ subdirs for installer files
    let mut candidates: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();
    for subdir in &["msi", "nsis"] {
        let dir = bundle_dir.join(subdir);
        if !dir.exists() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                if ext == "msi" || ext == "exe" {
                    if let Ok(meta) = path.metadata() {
                        if let Ok(modified) = meta.modified() {
                            candidates.push((path, modified));
                        }
                    }
                }
            }
        }
    }

    if candidates.is_empty() {
        return Err("No installer found in bundle/msi or bundle/nsis".to_string());
    }

    // Pick the most recently modified installer
    candidates.sort_by(|a, b| b.1.cmp(&a.1));
    let installer_path = &candidates[0].0;

    // Launch the installer via Windows shell (open/run)
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &installer_path.display().to_string()])
        .spawn()
        .map_err(|e| format!("Failed to launch installer: {e}"))?;

    Ok(installer_path.display().to_string())
}

// ---------------------------------------------------------------------------
// Commands: Build
// ---------------------------------------------------------------------------

/// Detects the current build step from a line of build output.
fn detect_build_step(line: &str) -> Option<(u32, &'static str)> {
    let lower = line.to_lowercase();

    if lower.contains("running beforebuildcommand")
        || lower.contains("vite")
            && (lower.contains("building") || lower.contains("build for production"))
    {
        return Some((1, "Building frontend..."));
    }
    if lower.contains("compiling app_lib") || lower.contains("compiling app ") {
        return Some((3, "Compiling Rust backend..."));
    }
    if lower.contains("compiling") && !lower.contains("app_lib") && !lower.contains("app ") {
        return Some((2, "Compiling Rust dependencies..."));
    }
    if lower.contains("finished") && lower.contains("release") {
        return Some((4, "Rust compilation finished"));
    }
    if lower.contains("bundling") || lower.contains("creating bundle") || lower.contains("wix") {
        return Some((5, "Creating installer bundle..."));
    }
    None
}

/// Starts the Tauri build process, streaming output via events.
#[tauri::command]
async fn start_build(app: AppHandle, options: BuildOptions) -> Result<(), String> {
    let frontend = frontend_dir()?;
    let state = app.state::<BuildProcess>();

    // Prevent double-builds
    {
        let guard = state.child.lock().unwrap();
        if guard.is_some() {
            return Err("A build is already in progress".to_string());
        }
    }

    // Record start time
    *state.start_time.lock().unwrap() = Some(Instant::now());

    // Build the command: bun run tauri:build [--debug]
    let mut args = vec!["run".to_string(), "tauri:build".to_string()];
    if !options.release {
        args.push("--debug".to_string());
    }

    // We pass extra cargo/rustc flags via env vars
    let mut env_vars: Vec<(String, String)> = Vec::new();

    if options.strip_symbols && options.release {
        // CARGO_PROFILE_RELEASE_STRIP = "symbols"
        env_vars.push((
            "CARGO_PROFILE_RELEASE_STRIP".to_string(),
            "symbols".to_string(),
        ));
    }

    if !options.wix_installer {
        // Skip the WiX bundler: --bundles none (Tauri v2 CLI flag)
        args.push("--bundles".to_string());
        args.push("nsis".to_string());
    }

    let mut command = app.shell().command("bun").args(&args).current_dir(&frontend);

    for (key, val) in &env_vars {
        command = command.env(key, val);
    }

    let (mut rx, child) = command
        .spawn()
        .map_err(|e| format!("Failed to spawn build process: {e}"))?;

    *state.child.lock().unwrap() = Some(child);

    let app_handle = app.clone();
    let start = Instant::now();

    tauri::async_runtime::spawn(async move {
        let mut current_step: u32 = 0;
        let total_steps: u32 = 5;

        while let Some(event) = rx.recv().await {
            let elapsed = start.elapsed().as_secs_f64();

            match event {
                CommandEvent::Stdout(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    for line in text.lines() {
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            continue;
                        }

                        // Detect step changes
                        if let Some((step, label)) = detect_build_step(trimmed) {
                            if step > current_step {
                                current_step = step;
                                let percent =
                                    ((current_step as f64 / total_steps as f64) * 100.0) as u32;
                                let _ = app_handle.emit(
                                    "build-progress",
                                    BuildProgressEvent {
                                        step: current_step,
                                        total_steps,
                                        label: label.to_string(),
                                        percent,
                                        elapsed_secs: elapsed,
                                    },
                                );
                            }
                        }

                        let _ = app_handle.emit(
                            "build-output",
                            BuildOutputEvent {
                                line: trimmed.to_string(),
                                stream: "stdout".to_string(),
                            },
                        );
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    for line in text.lines() {
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            continue;
                        }

                        // Also check stderr for step detection (cargo writes to stderr)
                        if let Some((step, label)) = detect_build_step(trimmed) {
                            if step > current_step {
                                current_step = step;
                                let percent =
                                    ((current_step as f64 / total_steps as f64) * 100.0) as u32;
                                let _ = app_handle.emit(
                                    "build-progress",
                                    BuildProgressEvent {
                                        step: current_step,
                                        total_steps,
                                        label: label.to_string(),
                                        percent,
                                        elapsed_secs: elapsed,
                                    },
                                );
                            }
                        }

                        let _ = app_handle.emit(
                            "build-output",
                            BuildOutputEvent {
                                line: trimmed.to_string(),
                                stream: "stderr".to_string(),
                            },
                        );
                    }
                }
                CommandEvent::Error(msg) => {
                    let _ = app_handle.emit(
                        "build-output",
                        BuildOutputEvent {
                            line: format!("ERROR: {msg}"),
                            stream: "stderr".to_string(),
                        },
                    );
                }
                CommandEvent::Terminated(payload) => {
                    let elapsed = start.elapsed().as_secs_f64();
                    let success = payload.code == Some(0);
                    let message = if success {
                        "Build completed successfully!".to_string()
                    } else {
                        format!(
                            "Build failed with exit code {:?}",
                            payload.code.unwrap_or(-1)
                        )
                    };

                    // Emit 100% on success
                    if success {
                        let _ = app_handle.emit(
                            "build-progress",
                            BuildProgressEvent {
                                step: total_steps,
                                total_steps,
                                label: "Build complete!".to_string(),
                                percent: 100,
                                elapsed_secs: elapsed,
                            },
                        );
                    }

                    let _ = app_handle.emit(
                        "build-complete",
                        BuildCompleteEvent {
                            success,
                            message,
                            elapsed_secs: elapsed,
                        },
                    );

                    // Clear child handle
                    if let Some(state) = app_handle.try_state::<BuildProcess>() {
                        *state.child.lock().unwrap() = None;
                        *state.start_time.lock().unwrap() = None;
                    }
                }
                _ => {}
            }
        }
    });

    Ok(())
}

/// Kills the running build process.
#[tauri::command]
fn cancel_build(app: AppHandle) -> Result<(), String> {
    let state = app.state::<BuildProcess>();
    let mut guard = state.child.lock().unwrap();
    if let Some(child) = guard.take() {
        child.kill().map_err(|e| format!("Failed to kill build: {e}"))?;
        *state.start_time.lock().unwrap() = None;
        let _ = app.emit(
            "build-complete",
            BuildCompleteEvent {
                success: false,
                message: "Build cancelled by user".to_string(),
                elapsed_secs: 0.0,
            },
        );
        Ok(())
    } else {
        Err("No build is running".to_string())
    }
}

// ---------------------------------------------------------------------------
// App Entry
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_version,
            sync_versions,
            run_installer,
            start_build,
            cancel_build,
        ])
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .manage(BuildProcess {
            child: Mutex::new(None),
            start_time: Mutex::new(None),
        })
        .run(tauri::generate_context!())
        .expect("error while running build-gui");
}
