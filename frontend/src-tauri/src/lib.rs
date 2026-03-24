use std::{
    net::{SocketAddr, TcpStream},
    path::PathBuf,
    sync::Mutex,
    time::Duration,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, WindowEvent,
};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

/// Windows Job Object that auto-kills the backend when this process dies
/// (handles force-kill from IDE, crash, etc. where ExitRequested never fires).
#[cfg(target_os = "windows")]
mod win_job {
    use std::ffi::c_void;
    use windows_sys::Win32::{
        Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
        System::{
            JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
                SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            },
            Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE},
        },
    };

    pub struct JobGuard(*mut c_void);

    unsafe impl Send for JobGuard {}
    unsafe impl Sync for JobGuard {}

    impl Drop for JobGuard {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }

    pub fn assign_child_to_job(pid: u32) -> Option<JobGuard> {
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() || job == INVALID_HANDLE_VALUE {
                return None;
            }

            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

            if SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                (&info as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            ) == 0
            {
                CloseHandle(job);
                return None;
            }

            let process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
            if process.is_null() || process == INVALID_HANDLE_VALUE {
                CloseHandle(job);
                return None;
            }

            let ok = AssignProcessToJobObject(job, process);
            CloseHandle(process);
            if ok == 0 {
                CloseHandle(job);
                return None;
            }

            log::info!("Backend PID {pid} bound to Job Object (kill-on-close)");
            Some(JobGuard(job))
        }
    }
}

struct BackendProcess(Mutex<Option<CommandChild>>);

const BACKEND_ADDR: &str = "127.0.0.1:7000";

fn write_console_line(message: &str, is_stderr: bool) {
    if is_stderr {
        eprintln!("{message}");
    } else {
        println!("{message}");
    }
}

fn log_backend_output(level: log::Level, chunk: &[u8]) {
    let text = String::from_utf8_lossy(chunk);

    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        write_console_line(
            &format!("[backend] {line}"),
            matches!(level, log::Level::Warn | log::Level::Error),
        );
        log::log!(level, "[backend] {line}");
    }
}

#[tauri::command]
fn frontend_log(level: String, message: String) {
    let normalized_level = level.trim().to_uppercase();
    let trimmed_message = message.trim();

    if trimmed_message.is_empty() {
        return;
    }

    let console_line = format!("[frontend/{normalized_level}] {trimmed_message}");

    match normalized_level.as_str() {
        "ERROR" | "CRITICAL" => {
            write_console_line(&console_line, true);
            log::error!("{console_line}");
        }
        "WARNING" | "WARN" => {
            write_console_line(&console_line, true);
            log::warn!("{console_line}");
        }
        "DEBUG" | "TRACE" => {
            write_console_line(&console_line, false);
            log::debug!("{console_line}");
        }
        _ => {
            write_console_line(&console_line, false);
            log::info!("{console_line}");
        }
    }
}

fn is_backend_listening() -> bool {
    let addr: SocketAddr = match BACKEND_ADDR.parse() {
        Ok(addr) => addr,
        Err(_) => return false,
    };

    TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok()
}

/// Kill any process listening on the backend port so we can spawn a fresh one.
fn kill_process_on_port(port: u16) {
    #[cfg(target_os = "windows")]
    {
        // netstat -ano | findstr :7000 → extract PID, then taskkill
        let output = std::process::Command::new("cmd")
            .args([
                "/C",
                &format!("netstat -ano | findstr :{port} | findstr LISTENING"),
            ])
            .output();

        if let Ok(output) = output {
            let text = String::from_utf8_lossy(&output.stdout);
            let mut killed_pids = std::collections::HashSet::new();
            for line in text.lines() {
                if let Some(pid_str) = line.split_whitespace().last() {
                    if let Ok(pid) = pid_str.parse::<u32>() {
                        if pid > 0 && killed_pids.insert(pid) {
                            log::info!(
                                "Killing orphaned backend process (PID {pid}) on port {port}"
                            );
                            let _ = std::process::Command::new("taskkill")
                                .args(["/PID", &pid.to_string(), "/T", "/F"])
                                .output();
                        }
                    }
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = std::process::Command::new("lsof")
            .args(["-ti", &format!(":{port}")])
            .output();

        if let Ok(output) = output {
            let text = String::from_utf8_lossy(&output.stdout);
            for pid_str in text.split_whitespace() {
                if let Ok(pid) = pid_str.parse::<u32>() {
                    if pid > 0 {
                        log::info!("Killing orphaned backend process (PID {pid}) on port {port}");
                        let _ = std::process::Command::new("kill")
                            .args(["-9", &pid.to_string()])
                            .output();
                    }
                }
            }
        }
    }

    // Brief wait for the port to free up
    std::thread::sleep(Duration::from_millis(500));
}

fn backend_command(project_root: &std::path::Path) -> (PathBuf, Vec<String>) {
    let python_path = if cfg!(target_os = "windows") {
        project_root
            .join(".venv")
            .join("Scripts")
            .join("python.exe")
    } else {
        project_root.join(".venv").join("bin").join("python")
    };

    if python_path.exists() {
        return (
            python_path,
            vec!["run.py".to_string(), "--serve".to_string()],
        );
    }

    (
        PathBuf::from("uv"),
        vec![
            "run".to_string(),
            "python".to_string(),
            "run.py".to_string(),
            "--serve".to_string(),
        ],
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![frontend_log])
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            // Spawn the Python backend process
            let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../..")
                .canonicalize()
                .unwrap_or_else(|_| std::env::current_dir().unwrap());

            // Kill any orphaned backend from a previous session
            if is_backend_listening() {
                log::info!("Killing orphaned backend on {}", BACKEND_ADDR);
                kill_process_on_port(7000);
            }

            // Always spawn a fresh backend so we own the process
            let (command_path, command_args) = backend_command(&project_root);

            match app
                .shell()
                .command(command_path)
                .args(command_args)
                .current_dir(&project_root)
                .spawn()
            {
                Ok((mut rx, child)) => {
                    tauri::async_runtime::spawn(async move {
                        while let Some(event) = rx.recv().await {
                            match event {
                                CommandEvent::Stdout(bytes) => {
                                    log_backend_output(log::Level::Info, &bytes);
                                }
                                CommandEvent::Stderr(bytes) => {
                                    log_backend_output(log::Level::Warn, &bytes);
                                }
                                CommandEvent::Error(message) => {
                                    log::error!("[backend] {message}");
                                }
                                CommandEvent::Terminated(payload) => {
                                    log::info!(
                                        "[backend] process exited with code {:?} and signal {:?}",
                                        payload.code,
                                        payload.signal
                                    );
                                }
                                _ => {}
                            }
                        }
                    });

                    #[cfg(target_os = "windows")]
                    if let Some(guard) = win_job::assign_child_to_job(child.pid()) {
                        app.manage(guard);
                    }

                    *app.state::<BackendProcess>().0.lock().unwrap() = Some(child);
                    log::info!("Backend process spawned from {:?}", project_root);
                }
                Err(e) => log::warn!("Failed to spawn backend process: {e}"),
            }

            // Build tray context menu
            let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

            let handle = app.handle().clone();
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("Trading Agent")
                .on_menu_event(move |_tray, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = handle.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(w) = handle.get_webview_window("main") {
                            let _ = w.hide();
                        }
                    }
                    "quit" => handle.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            // In packaged builds, intercept window close and minimize to tray.
            RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested { api, .. },
                ..
            } if label == "main" && !cfg!(debug_assertions) => {
                api.prevent_close();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            // Kill backend on actual quit
            RunEvent::ExitRequested { .. } => {
                if let Some(child) = app.state::<BackendProcess>().0.lock().unwrap().take() {
                    let _ = child.kill();
                    log::info!("Backend process terminated");
                }
            }
            _ => {}
        });
}
