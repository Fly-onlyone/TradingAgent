use std::{
    env, fs,
    net::{SocketAddr, TcpStream},
    path::PathBuf,
    process::Command,
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use reqwest::blocking::Client;
use serde_json::{json, Value};
use tauri::{
    menu::{Menu, MenuItem},
    path::BaseDirectory,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Position, RunEvent, Size,
    WindowEvent,
};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

// ---------------------------------------------------------------------------
// Constants (overridable via env vars where noted)
// ---------------------------------------------------------------------------

const APP_NAME: &str = "Trading agent";

/// Max time (ms) to wait for backend TCP health check response.
const BACKEND_HEALTH_TIMEOUT_MS: u64 = 5000;

/// Max time (ms) to wait for backend to become ready after spawn.
const BACKEND_STARTUP_TIMEOUT_MS: u64 = 30000;

/// Interval (ms) between health-check polls during startup.
const BACKEND_POLL_INTERVAL_MS: u64 = 500;

/// How many times to retry spawning the backend before giving up.
const BACKEND_SPAWN_MAX_RETRIES: u32 = 3;

/// Time (ms) to wait for graceful shutdown via HTTP before escalating.
const BACKEND_SHUTDOWN_GRACEFUL_WAIT_MS: u64 = 2000;

/// Time (ms) to wait after direct kill before escalating to taskkill.
const BACKEND_SHUTDOWN_POST_KILL_WAIT_MS: u64 = 500;

/// Poll interval (ms) while waiting for backend process to terminate.
const BACKEND_SHUTDOWN_POLL_INTERVAL_MS: u64 = 100;

/// Debounce interval (ms) for persisting window geometry changes.
const WINDOW_STATE_PERSIST_DEBOUNCE_MS: u64 = 500;

const WINDOW_STATE_FILE_NAME: &str = "window-state.json";
const APP_ENV_FILE_NAME: &str = ".env";
#[cfg(target_os = "windows")]
const BACKEND_RUNTIME_EXE: &str = "trading-agent-backend.exe";
#[cfg(not(target_os = "windows"))]
const BACKEND_RUNTIME_EXE: &str = "trading-agent-backend";
const BACKEND_ENV_TEMPLATE_NAME: &str = ".env";

// ---------------------------------------------------------------------------
// Windows Job Object — auto-kill backend when this process dies
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Application state
// ---------------------------------------------------------------------------

struct BackendState {
    child: Mutex<Option<CommandChild>>,
    terminated: Mutex<bool>,
    healthy: Mutex<bool>,
    shutdown_in_progress: Mutex<bool>,
    startup_failure_reported: Mutex<bool>,
    #[cfg(target_os = "windows")]
    job_guard: Mutex<Option<win_job::JobGuard>>,
}

#[derive(Debug, Default, Clone, Copy)]
struct WindowGeometry {
    position: Option<(i32, i32)>,
    size: Option<(u32, u32)>,
    persist_revision: u64,
    persist_worker_running: bool,
}

#[derive(Debug, Default)]
struct WindowStateCache(Mutex<WindowGeometry>);

// ---------------------------------------------------------------------------
// Shutdown escalation types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ShutdownEscalation {
    Graceful,
    DirectKill,
    ForceTaskkill,
}

// ---------------------------------------------------------------------------
// Helper: env-overridable u64 constant
// ---------------------------------------------------------------------------

fn env_u64(key: &str, default: u64) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

// ---------------------------------------------------------------------------
// Port & command helpers (preserved from Tasks 2+3)
// ---------------------------------------------------------------------------

fn backend_port() -> u16 {
    std::env::var("BACKEND_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(if cfg!(debug_assertions) { 7001 } else { 7000 })
}

fn backend_url() -> String {
    format!("http://127.0.0.1:{}", backend_port())
}

fn tray_tooltip() -> String {
    if cfg!(debug_assertions) {
        format!("{APP_NAME} (dev)")
    } else {
        APP_NAME.to_string()
    }
}

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

struct BackendCommand {
    path: PathBuf,
    args: Vec<String>,
    cwd: PathBuf,
    envs: Vec<(String, String)>,
}

#[derive(Debug, Clone, serde::Serialize)]
struct StartupFailurePayload {
    code: String,
    message: String,
    detail: Option<String>,
    recoverable: bool,
}

impl StartupFailurePayload {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            detail: None,
            recoverable: true,
        }
    }

    fn with_detail(mut self, detail: impl Into<String>) -> Self {
        let detail = detail.into();
        if !detail.trim().is_empty() {
            self.detail = Some(detail);
        }
        self
    }

    fn non_recoverable(mut self) -> Self {
        self.recoverable = false;
        self
    }
}

#[derive(Debug, serde::Deserialize)]
struct BackendPreflightResult {
    ok: bool,
    code: Option<String>,
    message: Option<String>,
    detail: Option<String>,
}

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap_or_else(|_| std::env::current_dir().unwrap())
}

fn app_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn app_env_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join(APP_ENV_FILE_NAME))
}

fn report_startup_failure_once(app: &AppHandle, payload: StartupFailurePayload) {
    let should_emit = match app.state::<BackendState>().startup_failure_reported.lock() {
        Ok(mut reported) => {
            if *reported {
                false
            } else {
                *reported = true;
                true
            }
        }
        Err(_) => true,
    };

    if !should_emit {
        return;
    }

    log::error!(
        "Desktop backend startup failure [{}]: {}",
        payload.code,
        payload.message
    );

    if let Some(detail) = &payload.detail {
        log::error!("Startup failure detail: {detail}");
    }

    let _ = app.emit("backend-startup-failure", payload);
}

fn bundled_backend_exe(app: &AppHandle) -> Result<PathBuf, String> {
    let resource_path = app
        .path()
        .resolve(BACKEND_RUNTIME_EXE, BaseDirectory::Resource)
        .map_err(|e| format!("Cannot resolve bundled backend executable: {e}"))?;
    if resource_path.exists() {
        return Ok(resource_path);
    }

    let executable_dir = env::current_exe()
        .map_err(|e| format!("Cannot resolve desktop executable path: {e}"))?
        .parent()
        .map(PathBuf::from)
        .ok_or_else(|| "Desktop executable path has no parent directory".to_string())?;
    let sibling_path = executable_dir.join(BACKEND_RUNTIME_EXE);
    if sibling_path.exists() {
        return Ok(sibling_path);
    }

    Err(format!(
        "Bundled backend executable not found at {} or {}",
        resource_path.display(),
        sibling_path.display()
    ))
}

fn ensure_packaged_env_file(app: &AppHandle) -> Result<PathBuf, String> {
    let env_file = app_env_file_path(app)?;
    if env_file.exists() {
        return Ok(env_file);
    }

    let template_path = app
        .path()
        .resolve(BACKEND_ENV_TEMPLATE_NAME, BaseDirectory::Resource)
        .map_err(|e| format!("Cannot resolve bundled env template: {e}"))?;
    let template = fs::read_to_string(&template_path).map_err(|e| {
        format!(
            "Cannot read bundled backend config template {}: {e}",
            template_path.display()
        )
    })?;
    fs::write(&env_file, template).map_err(|e| {
        format!(
            "Cannot seed desktop config file {}: {e}",
            env_file.display()
        )
    })?;

    Ok(env_file)
}

fn backend_port_socket() -> SocketAddr {
    SocketAddr::from(([127, 0, 0, 1], backend_port()))
}

fn is_backend_port_accepting_connections() -> bool {
    TcpStream::connect_timeout(&backend_port_socket(), Duration::from_millis(200)).is_ok()
}

fn ensure_backend_port_available() -> Result<(), StartupFailurePayload> {
    if !is_backend_port_accepting_connections() {
        return Ok(());
    }

    let detail = if is_backend_healthy() {
        format!(
            "Another process is already responding on {}.",
            backend_url()
        )
    } else {
        format!(
            "Port {} is already open but the backend health check did not respond successfully.",
            backend_port()
        )
    };

    Err(StartupFailurePayload::new(
        "backend_port_in_use",
        format!("Backend port {} is already in use.", backend_port()),
    )
    .with_detail(detail))
}

fn run_packaged_backend_preflight(launch: &BackendCommand) -> Result<(), StartupFailurePayload> {
    let mut command = Command::new(&launch.path);
    command.arg("--preflight").current_dir(&launch.cwd);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    for (key, value) in &launch.envs {
        command.env(key, value);
    }

    let output = command.output().map_err(|error| {
        StartupFailurePayload::new(
            "backend_preflight_spawn_failed",
            "Failed to run the packaged backend preflight.",
        )
        .with_detail(error.to_string())
        .non_recoverable()
    })?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    let result = serde_json::from_str::<BackendPreflightResult>(&stdout).map_err(|error| {
        StartupFailurePayload::new(
            "backend_preflight_invalid_output",
            "The packaged backend preflight returned invalid output.",
        )
        .with_detail(format!(
            "stdout={stdout}\nstderr={stderr}\nparse_error={error}"
        ))
        .non_recoverable()
    })?;

    if result.ok {
        return Ok(());
    }

    Err(StartupFailurePayload::new(
        result.code.as_deref().unwrap_or("backend_preflight_failed"),
        result
            .message
            .unwrap_or_else(|| "The packaged backend preflight failed.".to_string()),
    )
    .with_detail(result.detail.unwrap_or(stderr))
    .non_recoverable())
}

fn backend_command(app: &AppHandle) -> Result<BackendCommand, StartupFailurePayload> {
    let mut envs = vec![
        ("TAURI_APP".to_string(), "1".to_string()),
        ("BACKEND_PORT".to_string(), backend_port().to_string()),
    ];

    if !cfg!(debug_assertions) {
        let executable = bundled_backend_exe(app).map_err(|error| {
            StartupFailurePayload::new(
                "missing_backend_runtime",
                "Bundled backend executable is missing.",
            )
            .with_detail(error)
            .non_recoverable()
        })?;
        let env_file = ensure_packaged_env_file(app).map_err(|error| {
            StartupFailurePayload::new(
                "invalid_packaged_env",
                "The packaged desktop .env file could not be prepared.",
            )
            .with_detail(error)
            .non_recoverable()
        })?;

        envs.push(("APP_ENV_FILE".to_string(), env_file.display().to_string()));

        return Ok(BackendCommand {
            path: executable,
            args: vec![],
            cwd: app_config_dir(app).map_err(|error| {
                StartupFailurePayload::new(
                    "invalid_app_config_dir",
                    "The desktop app config directory could not be prepared.",
                )
                .with_detail(error)
                .non_recoverable()
            })?,
            envs,
        });
    }

    let project_root = project_root();
    let python_path = if cfg!(target_os = "windows") {
        project_root
            .join(".venv")
            .join("Scripts")
            .join("python.exe")
    } else {
        project_root.join(".venv").join("bin").join("python")
    };

    // Dev builds: --watch for auto-reload on Python file changes
    // Release builds: --serve for direct uvicorn without reload
    let mode = if cfg!(debug_assertions) {
        "--watch"
    } else {
        "--serve"
    };

    if python_path.exists() {
        return Ok(BackendCommand {
            path: python_path,
            args: vec!["run.py".to_string(), mode.to_string()],
            cwd: project_root,
            envs,
        });
    }

    Ok(BackendCommand {
        path: PathBuf::from("uv"),
        args: vec![
            "run".to_string(),
            "python".to_string(),
            "run.py".to_string(),
            mode.to_string(),
        ],
        cwd: project_root,
        envs,
    })
}

fn spawn_backend_once(app_handle: &AppHandle) -> Result<(), StartupFailurePayload> {
    if let Ok(mut guard) = app_handle.state::<BackendState>().terminated.lock() {
        *guard = false;
    }
    if let Ok(mut guard) = app_handle.state::<BackendState>().healthy.lock() {
        *guard = false;
    }
    if let Ok(mut guard) = app_handle
        .state::<BackendState>()
        .startup_failure_reported
        .lock()
    {
        *guard = false;
    }

    let launch = backend_command(app_handle)?;
    ensure_backend_port_available()?;

    if !cfg!(debug_assertions) {
        run_packaged_backend_preflight(&launch)?;
    }

    let mut command = app_handle
        .shell()
        .command(&launch.path)
        .args(&launch.args)
        .current_dir(&launch.cwd);

    for (key, value) in &launch.envs {
        command = command.env(key, value);
    }

    let (mut rx, child) = command.spawn().map_err(|error| {
        StartupFailurePayload::new(
            "backend_spawn_failed",
            "Failed to spawn the bundled backend process.",
        )
        .with_detail(error.to_string())
    })?;
    let pid = child.pid();

    let handle = app_handle.clone();
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
                    if let Ok(mut guard) = handle.state::<BackendState>().terminated.lock() {
                        *guard = true;
                    }
                    let shutdown_in_progress = handle
                        .state::<BackendState>()
                        .shutdown_in_progress
                        .lock()
                        .map(|guard| *guard)
                        .unwrap_or(false);
                    let became_healthy = handle
                        .state::<BackendState>()
                        .healthy
                        .lock()
                        .map(|guard| *guard)
                        .unwrap_or(false);
                    if !shutdown_in_progress && !became_healthy {
                        let failure = StartupFailurePayload::new(
                            "backend_exited_early",
                            "The bundled backend exited before it became healthy.",
                        )
                        .with_detail(format!(
                            "exit_code={:?}, signal={:?}. Check the desktop logs for backend startup errors.",
                            payload.code, payload.signal
                        ));
                        report_startup_failure_once(&handle, failure);
                    }
                }
                _ => {}
            }
        }
    });

    #[cfg(target_os = "windows")]
    if let Some(guard) = win_job::assign_child_to_job(pid) {
        *app_handle.state::<BackendState>().job_guard.lock().unwrap() = Some(guard);
    }

    *app_handle.state::<BackendState>().child.lock().unwrap() = Some(child);
    log::info!(
        "Backend process spawned (PID {pid}) from {} with cwd {}",
        launch.path.display(),
        launch.cwd.display()
    );

    let health_handle = app_handle.clone();
    std::thread::spawn(move || {
        if wait_for_backend_ready() {
            if let Ok(mut guard) = health_handle.state::<BackendState>().healthy.lock() {
                *guard = true;
            }
            log::info!("Backend is healthy and ready");
        } else {
            log::warn!(
                "Backend did not become healthy within {}ms",
                env_u64("BACKEND_STARTUP_TIMEOUT_MS", BACKEND_STARTUP_TIMEOUT_MS)
            );
            let payload = StartupFailurePayload::new(
                "backend_health_timeout",
                "The bundled backend did not become healthy before the startup timeout elapsed.",
            )
            .with_detail(format!(
                "health_url={}/health, timeout_ms={}",
                backend_url(),
                env_u64("BACKEND_STARTUP_TIMEOUT_MS", BACKEND_STARTUP_TIMEOUT_MS)
            ));
            report_startup_failure_once(&health_handle, payload);
            let _ = health_handle.emit("backend-health-timeout", ());
        }
    });

    Ok(())
}

// ---------------------------------------------------------------------------
// Backend health check
// ---------------------------------------------------------------------------

fn is_backend_healthy() -> bool {
    let timeout = Duration::from_millis(env_u64(
        "BACKEND_HEALTH_TIMEOUT_MS",
        BACKEND_HEALTH_TIMEOUT_MS,
    ));
    Client::builder()
        .timeout(timeout)
        .build()
        .ok()
        .and_then(|c| c.get(format!("{}/health", backend_url())).send().ok())
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// Block until the backend responds to health checks or the timeout elapses.
/// Returns `true` if the backend became healthy.
fn wait_for_backend_ready() -> bool {
    let startup_timeout = env_u64("BACKEND_STARTUP_TIMEOUT_MS", BACKEND_STARTUP_TIMEOUT_MS);
    let poll_interval = env_u64("BACKEND_POLL_INTERVAL_MS", BACKEND_POLL_INTERVAL_MS);
    let mut waited = 0u64;

    while waited < startup_timeout {
        if is_backend_healthy() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(poll_interval));
        waited += poll_interval;
    }

    false
}

// ---------------------------------------------------------------------------
// Backend spawn with retry logic
// ---------------------------------------------------------------------------

fn should_retry_startup_failure(payload: &StartupFailurePayload) -> bool {
    matches!(payload.code.as_str(), "backend_spawn_failed")
}

fn spawn_backend(app: &tauri::App) {
    let max_retries = BACKEND_SPAWN_MAX_RETRIES;
    let app_handle = app.handle().clone();

    for attempt in 1..=max_retries {
        match spawn_backend_once(&app_handle) {
            Ok(()) => {
                log::info!("Backend startup succeeded on attempt {attempt}");
                return;
            }
            Err(payload) => {
                log::warn!(
                    "Backend startup failed on attempt {attempt}/{max_retries}: [{}] {}",
                    payload.code,
                    payload.message
                );
                if attempt < max_retries && should_retry_startup_failure(&payload) {
                    let delay = Duration::from_millis(1000 * u64::from(attempt));
                    log::info!("Retrying in {}ms...", delay.as_millis());
                    std::thread::sleep(delay);
                } else {
                    log::error!(
                        "Backend startup failed; the desktop app will remain in startup error state."
                    );
                    report_startup_failure_once(&app_handle, payload);
                    return;
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Graceful shutdown with escalation
// ---------------------------------------------------------------------------

fn begin_shutdown(state: &BackendState) -> bool {
    if let Ok(mut guard) = state.shutdown_in_progress.lock() {
        if *guard {
            return false;
        }
        *guard = true;
        return true;
    }
    false
}

fn is_backend_terminated(state: &BackendState) -> bool {
    state.terminated.lock().map(|guard| *guard).unwrap_or(false)
}

fn wait_for_backend_termination(state: &BackendState, timeout_ms: u64) -> bool {
    let mut waited_ms = 0;
    while waited_ms <= timeout_ms {
        if is_backend_terminated(state) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(BACKEND_SHUTDOWN_POLL_INTERVAL_MS));
        waited_ms += BACKEND_SHUTDOWN_POLL_INTERVAL_MS;
    }
    is_backend_terminated(state)
}

fn determine_shutdown_escalation(
    terminated_after_graceful_wait: bool,
    tracked_child_available: bool,
    terminated_after_direct_kill_wait: bool,
) -> ShutdownEscalation {
    if terminated_after_graceful_wait {
        ShutdownEscalation::Graceful
    } else if tracked_child_available && terminated_after_direct_kill_wait {
        ShutdownEscalation::DirectKill
    } else {
        ShutdownEscalation::ForceTaskkill
    }
}

#[cfg(target_os = "windows")]
fn run_taskkill(args: &[&str], label: &str) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    match std::process::Command::new("taskkill")
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        Ok(output) => {
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                log::warn!("taskkill failed ({label}): {}", stderr.trim());
            }
        }
        Err(error) => {
            log::warn!("Failed to run taskkill ({label}): {error}");
        }
    }
}

#[cfg(target_os = "windows")]
fn force_kill_backend_processes(tracked_pid: Option<u32>) {
    if let Some(pid) = tracked_pid {
        let pid_str = pid.to_string();
        run_taskkill(&["/F", "/T", "/PID", &pid_str], "tracked-pid");
    }

    // Kill any python processes that might be the backend
    // (run.py spawns python subprocesses)
    run_taskkill(
        &["/F", "/T", "/FI", "WINDOWTITLE eq run.py*"],
        "run-py-filter",
    );
    run_taskkill(
        &["/F", "/T", "/IM", BACKEND_RUNTIME_EXE],
        "sidecar-image-name",
    );
}

#[cfg(not(target_os = "windows"))]
fn force_kill_backend_processes(_tracked_pid: Option<u32>) {}

fn stop_backend(app: &AppHandle, run_event: &str, reason: &str) {
    let state = app.state::<BackendState>();
    if !begin_shutdown(&state) {
        return;
    }

    let mut tracked_pid: Option<u32> = None;

    // Grab PID before taking the child so force_kill can use it as a fallback.
    if let Ok(child_guard) = state.child.lock() {
        if let Some(child) = child_guard.as_ref() {
            tracked_pid = Some(child.pid());
        }
    }

    let shutdown_started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|v| v.as_millis())
        .unwrap_or(0)
        .to_string();

    // Tier 1: Send graceful shutdown request via HTTP (best-effort, 1s timeout).
    // The backend doesn't have a /shutdown endpoint, but sending a signal-style
    // request lets us attempt graceful teardown. We try POST first, fall back to
    // just letting the process exit.
    if let Ok(client) = Client::builder()
        .timeout(Duration::from_millis(1000))
        .build()
    {
        // Try a graceful approach: POST to /health as a no-op that confirms connectivity,
        // then immediately proceed to kill. The HTTP call mainly serves as a "still alive?" check.
        let _ = client.get(format!("{}/health", backend_url())).send();

        log::info!(
            "Shutdown initiated (event={run_event}, reason={reason}, pid={tracked_pid:?}, \
             started_at={shutdown_started_at})"
        );
    }

    // Tier 2: Wait for graceful termination (process may have exited from SIGTERM/Job Object).
    let terminated_after_graceful_wait =
        wait_for_backend_termination(&state, BACKEND_SHUTDOWN_GRACEFUL_WAIT_MS);
    let mut tracked_child_available = false;
    let mut terminated_after_direct_kill_wait = false;

    if !terminated_after_graceful_wait {
        // Tier 2b: Direct kill via tracked child handle.
        if let Ok(mut child_guard) = state.child.lock() {
            if let Some(child) = child_guard.take() {
                tracked_child_available = true;
                if let Err(error) = child.kill() {
                    log::warn!("Failed to kill tracked backend process: {error}");
                } else {
                    log::warn!("Graceful backend shutdown timed out; killed tracked process");
                }
            }
        }

        if tracked_child_available {
            terminated_after_direct_kill_wait =
                wait_for_backend_termination(&state, BACKEND_SHUTDOWN_POST_KILL_WAIT_MS);
        }
    }

    // Tier 3: Escalation to OS-level taskkill if still alive.
    match determine_shutdown_escalation(
        terminated_after_graceful_wait,
        tracked_child_available,
        terminated_after_direct_kill_wait,
    ) {
        ShutdownEscalation::Graceful => {
            log::info!("Backend exited after graceful shutdown");
        }
        ShutdownEscalation::DirectKill => {
            log::warn!("Backend exited after direct process kill");
        }
        ShutdownEscalation::ForceTaskkill => {
            log::warn!("Backend still running; using taskkill fallback");
            force_kill_backend_processes(tracked_pid);
        }
    }
}

// ---------------------------------------------------------------------------
// Backend restart (for tray menu)
// ---------------------------------------------------------------------------

fn restart_backend(app: &AppHandle) {
    // Reset shutdown state so we can shut down and re-spawn.
    if let Ok(mut guard) = app.state::<BackendState>().shutdown_in_progress.lock() {
        *guard = false;
    }

    // Kill existing backend
    stop_backend(app, "restart", "tray_menu");

    // Reset state for fresh spawn
    if let Ok(mut guard) = app.state::<BackendState>().shutdown_in_progress.lock() {
        *guard = false;
    }
    if let Ok(mut guard) = app.state::<BackendState>().terminated.lock() {
        *guard = false;
    }

    // Re-spawn in a background thread (spawn_backend needs &tauri::App which we
    // don't have here, so we replicate the core spawn logic).
    let app_handle = app.clone();
    std::thread::spawn(move || {
        if let Err(payload) = spawn_backend_once(&app_handle) {
            log::error!(
                "Failed to restart backend: [{}] {}",
                payload.code,
                payload.message
            );
            report_startup_failure_once(&app_handle, payload);
        }
    });
}

// ---------------------------------------------------------------------------
// Run task (for tray menu)
// ---------------------------------------------------------------------------

fn run_task(_app: &AppHandle) {
    let url = format!("{}/api/v1/agent/tasks/run-now-local", backend_url());
    std::thread::spawn(move || {
        let client = reqwest::blocking::Client::new();
        match client
            .post(&url)
            .timeout(std::time::Duration::from_secs(10))
            .send()
        {
            Ok(resp) => {
                if resp.status().is_success() {
                    log::info!("Task started successfully");
                } else {
                    log::warn!("Failed to start task: {}", resp.status());
                }
            }
            Err(e) => {
                log::error!("Failed to reach backend for task run: {e}");
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Window state persistence (local JSON file)
// ---------------------------------------------------------------------------

fn window_state_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut dir = app_config_dir(app)?;
    dir.push(WINDOW_STATE_FILE_NAME);
    Ok(dir)
}

fn read_window_state(app: &AppHandle) -> Value {
    match window_state_file_path(app) {
        Ok(path) => match fs::read_to_string(&path) {
            Ok(contents) => serde_json::from_str(&contents).unwrap_or(json!({})),
            Err(_) => json!({}),
        },
        Err(_) => json!({}),
    }
}

fn write_window_state(app: &AppHandle, state: &Value) {
    if let Ok(path) = window_state_file_path(app) {
        if let Ok(serialized) = serde_json::to_string_pretty(state) {
            let _ = fs::write(path, serialized);
        }
    }
}

fn saved_window_position(state: &Value) -> Option<(i32, i32)> {
    let x = state.get("x").and_then(Value::as_i64).map(|v| v as i32);
    let y = state.get("y").and_then(Value::as_i64).map(|v| v as i32);
    x.zip(y)
}

fn saved_window_size(state: &Value) -> Option<(u32, u32)> {
    let w = state
        .get("width")
        .and_then(Value::as_u64)
        .map(|v| v as u32)
        .filter(|v| *v > 0);
    let h = state
        .get("height")
        .and_then(Value::as_u64)
        .map(|v| v as u32)
        .filter(|v| *v > 0);
    w.zip(h)
}

fn saved_window_maximized(state: &Value) -> bool {
    state
        .get("maximized")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

/// Check if a window rectangle intersects at least one monitor.
fn position_intersects_any_monitor(
    pos: (i32, i32),
    size: Option<(u32, u32)>,
    monitors: &[tauri::Monitor],
) -> bool {
    if monitors.is_empty() {
        return true; // can't validate, assume ok
    }

    monitors.iter().any(|m| {
        let mp = m.position();
        let ms = m.size();

        match size {
            Some((ww, wh)) => {
                let wx_end = i64::from(pos.0) + i64::from(ww);
                let wy_end = i64::from(pos.1) + i64::from(wh);
                let mx_end = i64::from(mp.x) + i64::from(ms.width);
                let my_end = i64::from(mp.y) + i64::from(ms.height);

                i64::from(pos.0) < mx_end
                    && i64::from(mp.x) < wx_end
                    && i64::from(pos.1) < my_end
                    && i64::from(mp.y) < wy_end
            }
            None => {
                let mx_end = i64::from(mp.x) + i64::from(ms.width);
                let my_end = i64::from(mp.y) + i64::from(ms.height);

                i64::from(pos.0) >= i64::from(mp.x)
                    && i64::from(pos.0) < mx_end
                    && i64::from(pos.1) >= i64::from(mp.y)
                    && i64::from(pos.1) < my_end
            }
        }
    })
}

fn restore_window_state(app: &AppHandle) {
    let state = read_window_state(app);

    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    // Restore size first, then position (position validation needs size)
    if let Some((w, h)) = saved_window_size(&state) {
        if let Err(e) = window.set_size(Size::Physical(PhysicalSize::new(w, h))) {
            log::warn!("Failed to restore window size {w}x{h}: {e}");
        }
    }

    if let Some(pos) = saved_window_position(&state) {
        let size = saved_window_size(&state);

        // Validate position is on a connected monitor
        match window.available_monitors() {
            Ok(monitors) if !monitors.is_empty() => {
                if !position_intersects_any_monitor(pos, size, &monitors) {
                    log::warn!(
                        "Saved window position ({},{}) is off-screen; centering instead",
                        pos.0,
                        pos.1
                    );
                    let _ = window.center();
                } else if let Err(e) =
                    window.set_position(Position::Physical(PhysicalPosition::new(pos.0, pos.1)))
                {
                    log::warn!("Failed to restore window position: {e}");
                }
            }
            _ => {
                let _ =
                    window.set_position(Position::Physical(PhysicalPosition::new(pos.0, pos.1)));
            }
        }
    }

    // Restore maximized state last
    if saved_window_maximized(&state) {
        let _ = window.maximize();
    }
}

fn persist_window_state_now(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let is_maximized = window.is_maximized().unwrap_or(false);

    let mut state = read_window_state(app);
    let obj = state.as_object_mut().unwrap();
    obj.insert("maximized".to_string(), json!(is_maximized));

    // Only save geometry when not maximized (maximized geometry is the full screen)
    if !is_maximized {
        if let Ok(size) = window.inner_size() {
            obj.insert("width".to_string(), json!(size.width));
            obj.insert("height".to_string(), json!(size.height));
        }
        if let Ok(pos) = window.outer_position() {
            obj.insert("x".to_string(), json!(pos.x));
            obj.insert("y".to_string(), json!(pos.y));
        }
    }

    write_window_state(app, &state);
}

fn cache_window_position(app: &AppHandle, x: i32, y: i32) {
    if let Ok(mut cache) = app.state::<WindowStateCache>().0.lock() {
        cache.position = Some((x, y));
    }
}

fn cache_window_size(app: &AppHandle, width: u32, height: u32) {
    if let Ok(mut cache) = app.state::<WindowStateCache>().0.lock() {
        cache.size = Some((width, height));
    }
}

fn schedule_debounced_window_persist(app: &AppHandle) {
    let should_spawn = match app.state::<WindowStateCache>().0.lock() {
        Ok(mut cache) => {
            cache.persist_revision = cache.persist_revision.saturating_add(1);
            if cache.persist_worker_running {
                false
            } else {
                cache.persist_worker_running = true;
                true
            }
        }
        Err(_) => false,
    };

    if !should_spawn {
        return;
    }

    let app_handle = app.clone();
    std::thread::spawn(move || loop {
        let observed = match app_handle.state::<WindowStateCache>().0.lock() {
            Ok(cache) => cache.persist_revision,
            Err(_) => return,
        };

        std::thread::sleep(Duration::from_millis(WINDOW_STATE_PERSIST_DEBOUNCE_MS));

        let should_persist = match app_handle.state::<WindowStateCache>().0.lock() {
            Ok(mut cache) => {
                if cache.persist_revision == observed {
                    cache.persist_worker_running = false;
                    true
                } else {
                    false
                }
            }
            Err(_) => return,
        };

        if should_persist {
            persist_window_state_now(&app_handle);
            return;
        }
    });
}

// ---------------------------------------------------------------------------
// Helper: show main window
// ---------------------------------------------------------------------------

fn start_with_window_open(app: &AppHandle) -> bool {
    let state = read_window_state(app);
    state
        .get("start_with_window_open")
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

#[tauri::command]
fn get_start_with_window_open(app: AppHandle) -> bool {
    start_with_window_open(&app)
}

#[tauri::command]
fn set_start_with_window_open(app: AppHandle, enabled: bool) {
    let mut state = read_window_state(&app);
    if let Some(obj) = state.as_object_mut() {
        obj.insert("start_with_window_open".to_string(), json!(enabled));
    }
    write_window_state(&app, &state);
}

fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            frontend_log,
            get_start_with_window_open,
            set_start_with_window_open,
        ])
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
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
        .manage(BackendState {
            child: Mutex::new(None),
            terminated: Mutex::new(false),
            healthy: Mutex::new(false),
            shutdown_in_progress: Mutex::new(false),
            startup_failure_reported: Mutex::new(false),
            #[cfg(target_os = "windows")]
            job_guard: Mutex::new(None),
        })
        .manage(WindowStateCache::default())
        .setup(|app| {
            // Restore window state before showing
            restore_window_state(&app.handle());

            // Show window based on user preference (default: open)
            if start_with_window_open(&app.handle()) {
                show_main_window(&app.handle());
            }

            // Spawn the Python backend process (with retry logic)
            spawn_backend(app);

            // Build enhanced tray menu
            let show_item = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let restart_item = MenuItem::with_id(
                app,
                "restart_backend",
                "Restart Backend",
                true,
                None::<&str>,
            )?;
            let run_task_item = MenuItem::with_id(app, "run_task", "Run Task", true, None::<&str>)?;
            let separator = MenuItem::with_id(app, "sep", "---", false, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &show_item,
                    &restart_item,
                    &run_task_item,
                    &separator,
                    &quit_item,
                ],
            )?;

            let handle = app.handle().clone();
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip(&tray_tooltip())
                .show_menu_on_left_click(false)
                .on_menu_event(move |_tray, event| match event.id.as_ref() {
                    "show" => {
                        show_main_window(&handle);
                    }
                    "restart_backend" => {
                        restart_backend(&handle);
                    }
                    "run_task" => {
                        run_task(&handle);
                    }
                    "quit" => {
                        stop_backend(&handle, "menu_exit", "tray_menu");
                        handle.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(&tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                WindowEvent::Moved(position) => {
                    cache_window_position(&window.app_handle(), position.x, position.y);
                    schedule_debounced_window_persist(&window.app_handle());
                }
                WindowEvent::Resized(size) => {
                    cache_window_size(&window.app_handle(), size.width, size.height);
                    schedule_debounced_window_persist(&window.app_handle());
                }
                WindowEvent::Focused(_) => {
                    // Persist display state (maximized) on focus changes
                    persist_window_state_now(&window.app_handle());
                }
                _ => {}
            }
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
                persist_window_state_now(app);
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            // Kill backend on actual quit
            RunEvent::ExitRequested { .. } => {
                persist_window_state_now(app);
                stop_backend(app, "exit_requested", "app_run_event");
            }
            _ => {}
        });
}
