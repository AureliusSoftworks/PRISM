use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::{fs, fs::OpenOptions};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

trait CommandNoWindow {
    fn no_window(&mut self) -> &mut Self;
}
impl CommandNoWindow for Command {
    fn no_window(&mut self) -> &mut Self {
        #[cfg(target_os = "windows")]
        self.creation_flags(0x08000000);
        self
    }
}

use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use url::Url;

const DEFAULT_API_PORT: u16 = 19787;
const DEFAULT_WEB_PORT: u16 = 19788;
const STARTUP_TIMEOUT_SECS: u64 = 90;

/// Strip the `\\?\` extended-length path prefix that Rust's `canonicalize()`
/// adds on Windows.  Node.js / Next.js choke on these prefixed paths.
fn clean_path(path: PathBuf) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let s = path.to_string_lossy();
        if let Some(stripped) = s.strip_prefix(r"\\?\") {
            return PathBuf::from(stripped);
        }
    }
    path
}

struct RuntimeState {
    qdrant_child: Mutex<Option<Child>>,
    api_child: Mutex<Option<Child>>,
    web_child: Mutex<Option<Child>>,
}

impl RuntimeState {
    fn new() -> Self {
        Self {
            qdrant_child: Mutex::new(None),
            api_child: Mutex::new(None),
            web_child: Mutex::new(None),
        }
    }
}

struct AppLifecycleState {
    is_quitting: Mutex<bool>,
}

impl AppLifecycleState {
    fn new() -> Self {
        Self {
            is_quitting: Mutex::new(false),
        }
    }
}

fn repo_root_from_manifest() -> PathBuf {
    clean_path(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("..")
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR"))),
    )
}

fn has_local_node_binary(root: &Path) -> bool {
    if cfg!(target_os = "windows") {
        root.join("runtime").join("node").join("node.exe").exists() || root.join("node").join("node.exe").exists()
    } else {
        root.join("runtime").join("node").join("bin").join("node").exists()
            || root.join("node").join("bin").join("node").exists()
    }
}

fn has_runtime_artifacts(root: &Path) -> bool {
    api_entrypoint(root).is_some()
        && web_entrypoint(root).is_some()
        && has_local_node_binary(root)
        && qdrant_binary(root).is_some()
}

fn bundled_runtime_root(app: &AppHandle) -> Option<PathBuf> {
    let resource_dir = clean_path(app.path().resource_dir().ok()?);
    let direct = resource_dir.join("runtime");
    if has_runtime_artifacts(&direct) {
        return Some(direct);
    }

    // Tauri normalizes parent traversals (`../`) in resource paths into `_up_` folders.
    let mut up_prefix = resource_dir.clone();
    for _ in 0..5 {
        up_prefix = up_prefix.join("_up_");
        let candidate = up_prefix.join("runtime");
        if has_runtime_artifacts(&candidate) {
            return Some(candidate);
        }
    }

    None
}

fn runtime_root(app: &AppHandle) -> PathBuf {
    if let Ok(custom) = std::env::var("PRISM_DESKTOP_RUNTIME_ROOT") {
        return PathBuf::from(custom);
    }
    if let Some(bundled_runtime) = bundled_runtime_root(app) {
        return bundled_runtime;
    }
    repo_root_from_manifest()
}

fn node_binary(root: &Path) -> String {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if cfg!(target_os = "windows") {
        candidates.push(root.join("runtime").join("node").join("node.exe"));
        candidates.push(root.join("node").join("node.exe"));
    } else {
        // Finder-launched apps often have a minimal PATH. Probe common absolute
        // install paths first so desktop startup does not depend on shell PATH.
        candidates.push(PathBuf::from("/opt/homebrew/bin/node"));
        candidates.push(PathBuf::from("/usr/local/bin/node"));
        candidates.push(PathBuf::from("/usr/bin/node"));
        // Keep PATH-based lookup as a final host-runtime fallback.
        candidates.push(PathBuf::from("node"));
        candidates.push(root.join("runtime").join("node").join("bin").join("node"));
        candidates.push(root.join("node").join("bin").join("node"));
    }
    if cfg!(target_os = "windows") {
        candidates.push(PathBuf::from("node"));
    }

    candidates
        .into_iter()
        .find(|path| path == Path::new("node") || path.exists())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "node".to_string())
}

fn api_entrypoint(root: &Path) -> Option<PathBuf> {
    let candidates = [
        root.join("runtime").join("apps").join("api").join("dist").join("server.js"),
        root.join("apps").join("api").join("dist").join("server.js"),
    ];
    candidates.into_iter().find(|p| p.exists())
}

fn web_entrypoint(root: &Path) -> Option<PathBuf> {
    let candidates = [
        root.join("runtime")
            .join("apps")
            .join("web")
            .join(".next")
            .join("standalone")
            .join("apps")
            .join("web")
            .join("server.js"),
        root.join("apps")
            .join("web")
            .join(".next")
            .join("standalone")
            .join("apps")
            .join("web")
            .join("server.js"),
    ];
    candidates.into_iter().find(|p| p.exists())
}

fn qdrant_binary(root: &Path) -> Option<PathBuf> {
    let candidates = if cfg!(target_os = "windows") {
        vec![
            root.join("runtime").join("qdrant").join("qdrant.exe"),
            root.join("qdrant").join("qdrant.exe"),
        ]
    } else {
        vec![
            root.join("runtime").join("qdrant").join("qdrant"),
            root.join("qdrant").join("qdrant"),
        ]
    };
    candidates.into_iter().find(|p| p.exists())
}

fn io_error(message: impl Into<String>) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::Other, message.into())
}

fn pick_available_port(preferred: u16, forbidden: &[u16]) -> std::io::Result<u16> {
    for offset in 0..=100 {
        let candidate = preferred.saturating_add(offset);
        if forbidden.contains(&candidate) {
            continue;
        }
        // Probe via wildcard bind so ports already held by 0.0.0.0 listeners
        // are treated as occupied. This avoids false positives that can let the
        // desktop shell open while child runtimes fail to bind and render blank.
        if std::net::TcpListener::bind(("0.0.0.0", candidate)).is_ok() {
            return Ok(candidate);
        }
    }
    Err(io_error(format!(
        "Could not find an available localhost port near {preferred}."
    )))
}

/// Emit a boot log line to the splash screen.
fn emit_log(app: &AppHandle, source: &str, line: &str) {
    let _ = app.emit("prism-log", serde_json::json!({ "source": source, "line": line }));
}

/// Emit a service status update to the splash screen.
fn emit_status(app: &AppHandle, service: &str, state: &str) {
    let _ = app.emit("prism-status", serde_json::json!({ "service": service, "state": state }));
}

/// Spawn a background thread that reads lines from `reader`, writes them to
/// `log_file`, and forwards each line to the splash screen via Tauri events.
fn spawn_log_tee(
    reader: impl std::io::Read + Send + 'static,
    mut log_file: std::fs::File,
    app: AppHandle,
    source: &'static str,
) {
    thread::spawn(move || {
        let buf = BufReader::new(reader);
        for line in buf.lines() {
            match line {
                Ok(line) => {
                    let _ = writeln!(log_file, "{line}");
                    emit_log(&app, source, &line);
                }
                Err(_) => break,
            }
        }
    });
}

fn start_runtime(app: &AppHandle, state: &RuntimeState) -> std::io::Result<(u16, u16)> {
    let root = runtime_root(app);
    let node = node_binary(&root);
    let api = api_entrypoint(&root).ok_or_else(|| {
        io_error("PRISM could not find apps/api/dist/server.js. Build runtime artifacts first.")
    })?;
    let web = web_entrypoint(&root).ok_or_else(|| {
        io_error(
            "PRISM could not find apps/web/.next/standalone/apps/web/server.js. Build the web standalone runtime first.",
        )
    })?;
    let qdrant = qdrant_binary(&root).ok_or_else(|| {
        io_error("PRISM could not find bundled qdrant binary in runtime/qdrant.")
    })?;
    let localai_data_dir = clean_path(
        app.path()
            .app_data_dir()
            .unwrap_or_else(|_| root.join("user-data")),
    );
    let localai_data_dir_value = localai_data_dir.to_string_lossy().to_string();
    let logs_dir = localai_data_dir.join("logs");
    fs::create_dir_all(&logs_dir)
        .map_err(|error| io_error(format!("Failed to create PRISM log directory: {error}")))?;

    let api_log    = logs_dir.join("api.log");
    let web_log    = logs_dir.join("web.log");
    let qdrant_log = logs_dir.join("qdrant.log");

    // Qdrant: both streams go to file (very verbose, not useful on splash).
    let qdrant_stdout_file = OpenOptions::new().create(true).append(true).open(&qdrant_log)
        .map_err(|e| io_error(format!("Failed to open qdrant log: {e}")))?;
    let qdrant_stderr_file = qdrant_stdout_file.try_clone()
        .map_err(|e| io_error(format!("Failed to clone qdrant log handle: {e}")))?;

    // API: stdout piped to splash + file; stderr to file only.
    let api_stdout_file = OpenOptions::new().create(true).append(true).open(&api_log)
        .map_err(|e| io_error(format!("Failed to open api log: {e}")))?;
    let api_stderr_file = api_stdout_file.try_clone()
        .map_err(|e| io_error(format!("Failed to clone api log handle: {e}")))?;

    // Web: stdout piped to splash + file; stderr to file only.
    let web_stdout_file = OpenOptions::new().create(true).append(true).open(&web_log)
        .map_err(|e| io_error(format!("Failed to open web log: {e}")))?;
    let web_stderr_file = web_stdout_file.try_clone()
        .map_err(|e| io_error(format!("Failed to clone web log handle: {e}")))?;

    let api_port = pick_available_port(DEFAULT_API_PORT, &[])?;
    let web_port = pick_available_port(DEFAULT_WEB_PORT, &[api_port])?;
    let localai_api_origin = format!("http://127.0.0.1:{api_port}");
    let qdrant_url = "http://127.0.0.1:6333";
    let web_cwd = web
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| root.clone());
    let qdrant_storage_dir = localai_data_dir.join("Qdrant").join("storage");
    fs::create_dir_all(&qdrant_storage_dir)
        .map_err(|error| io_error(format!("Failed to create Qdrant data directory: {error}")))?;

    emit_log(app, "prism", &format!("Runtime root: {}", root.display()));
    emit_log(app, "prism", &format!("Ports: API={api_port}  Web={web_port}"));

    // ── Qdrant ──
    emit_status(app, "qdrant", "starting");
    let mut qdrant_child = Command::new(&qdrant)
        .env("QDRANT__STORAGE__STORAGE_PATH", qdrant_storage_dir.to_string_lossy().to_string())
        .env("QDRANT__SERVICE__HOST", "127.0.0.1")
        .stdin(Stdio::null())
        .stdout(Stdio::from(qdrant_stdout_file))
        .stderr(Stdio::from(qdrant_stderr_file))
        .no_window()
        .spawn()
        .map_err(|e| io_error(format!("Failed to start bundled Qdrant: {e}")))?;
    emit_status(app, "qdrant", "running");
    emit_log(app, "qdrant", &format!("Started (pid {})", qdrant_child.id()));

    // ── API ──
    emit_status(app, "api", "starting");
    let mut api_child = Command::new(&node)
        .arg(&api)
        .current_dir(&root)
        .env("API_PORT", api_port.to_string())
        .env("API_HOST", "127.0.0.1")
        .env("WEB_PORT", web_port.to_string())
        .env("LOCALAI_DATA_DIR", localai_data_dir_value.clone())
        .env("QDRANT_URL", qdrant_url)
        .env("PRISM_DESKTOP_MODE", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::from(api_stderr_file))
        .no_window()
        .spawn()
        .map_err(|e| {
            let _ = qdrant_child.kill();
            io_error(format!("Failed to start Prism API: {e}"))
        })?;

    if let Some(stdout) = api_child.stdout.take() {
        spawn_log_tee(stdout, api_stdout_file, app.clone(), "api");
    }
    emit_status(app, "api", "running");

    // ── Web ──
    emit_status(app, "web", "starting");
    let mut web_child = Command::new(&node)
        .arg(&web)
        .current_dir(&web_cwd)
        .env("PORT", web_port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("API_PORT", api_port.to_string())
        .env("LOCALAI_API_ORIGIN", localai_api_origin)
        .env("PRISM_DESKTOP_MODE", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::from(web_stderr_file))
        .no_window()
        .spawn()
        .map_err(|e| {
            let _ = api_child.kill();
            let _ = qdrant_child.kill();
            io_error(format!("Failed to start Prism web runtime: {e}"))
        })?;

    if let Some(stdout) = web_child.stdout.take() {
        spawn_log_tee(stdout, web_stdout_file, app.clone(), "web");
    }
    emit_status(app, "web", "running");

    eprintln!("[PRISM] Runtime root: {}", root.display());
    eprintln!("[PRISM] Node binary:  {node}");
    eprintln!("[PRISM] API entry:    {}", api.display());
    eprintln!("[PRISM] Web entry:    {}", web.display());
    eprintln!("[PRISM] Web cwd:      {}", web_cwd.display());
    eprintln!("[PRISM] Qdrant:       {}", qdrant.display());
    eprintln!("[PRISM] Ports:        API={api_port}  Web={web_port}");

    *state.qdrant_child.lock().map_err(|_| io_error("Qdrant process lock poisoned"))? = Some(qdrant_child);
    *state.api_child.lock().map_err(|_| io_error("API process lock poisoned"))? = Some(api_child);
    *state.web_child.lock().map_err(|_| io_error("Web process lock poisoned"))? = Some(web_child);

    Ok((api_port, web_port))
}

fn wait_for_api(api_port: u16, state: &RuntimeState, app: &AppHandle) -> std::io::Result<()> {
    let start = Instant::now();
    let timeout_at = start + Duration::from_secs(STARTUP_TIMEOUT_SECS);
    let target = format!("127.0.0.1:{api_port}");
    emit_log(app, "prism", &format!("Waiting for API on {target}…"));
    eprintln!("[PRISM] Waiting for API runtime on {target} (timeout {STARTUP_TIMEOUT_SECS}s)...");
    while Instant::now() < timeout_at {
        if std::net::TcpStream::connect(&target).is_ok() {
            let elapsed = start.elapsed().as_secs_f64();
            eprintln!("[PRISM] API runtime ready after {elapsed:.1}s");
            emit_log(app, "prism", &format!("API ready ({elapsed:.1}s)"));
            emit_status(app, "api", "ready");
            return Ok(());
        }
        if let Ok(mut guard) = state.api_child.lock() {
            if let Some(ref mut child) = *guard {
                if let Ok(Some(exit_status)) = child.try_wait() {
                    let elapsed = start.elapsed().as_secs_f64();
                    emit_status(app, "api", "error");
                    emit_log(app, "prism", &format!("API exited after {elapsed:.1}s: {exit_status}"));
                    return Err(io_error(format!(
                        "Prism API exited after {elapsed:.1}s with status {exit_status}. Check api.log in the app data directory."
                    )));
                }
            }
        }
        thread::sleep(Duration::from_millis(500));
    }
    emit_status(app, "api", "error");
    Err(io_error(
        "Prism API did not start in time (90s timeout). Check api.log in the app data directory.",
    ))
}

fn wait_for_web(web_port: u16, api_port: u16, state: &RuntimeState, app: &AppHandle) -> std::io::Result<()> {
    let start = Instant::now();
    let timeout_at = start + Duration::from_secs(STARTUP_TIMEOUT_SECS);
    let target = format!("127.0.0.1:{web_port}");
    emit_log(app, "prism", &format!("Waiting for web on {target}…"));
    eprintln!("[PRISM] Waiting for web runtime on {target} (timeout {STARTUP_TIMEOUT_SECS}s)...");
    while Instant::now() < timeout_at {
        if std::net::TcpStream::connect(&target).is_ok() {
            let elapsed = start.elapsed().as_secs_f64();
            eprintln!("[PRISM] Web runtime ready after {elapsed:.1}s");
            emit_log(app, "prism", &format!("Web ready ({elapsed:.1}s)"));
            emit_status(app, "web", "ready");
            return Ok(());
        }
        if let Ok(mut guard) = state.web_child.lock() {
            if let Some(ref mut child) = *guard {
                if let Ok(Some(exit_status)) = child.try_wait() {
                    let elapsed = start.elapsed().as_secs_f64();
                    emit_status(app, "web", "error");
                    emit_log(app, "prism", &format!("Web exited after {elapsed:.1}s: {exit_status}"));
                    return Err(io_error(format!(
                        "Prism web runtime exited after {elapsed:.1}s with status {exit_status}. Check web.log in the app data directory."
                    )));
                }
            }
        }
        thread::sleep(Duration::from_millis(500));
    }
    let api_alive = std::net::TcpStream::connect(format!("127.0.0.1:{api_port}")).is_ok();
    eprintln!("[PRISM] Timeout reached. API alive: {api_alive}");
    emit_status(app, "web", "error");
    Err(io_error(
        "Prism web runtime did not start in time (90s timeout). Check web.log in the app data directory.",
    ))
}

fn stop_runtime(state: &RuntimeState) {
    if let Ok(mut guard) = state.qdrant_child.lock() {
        if let Some(mut child) = guard.take() { let _ = child.kill(); }
    }
    if let Ok(mut guard) = state.api_child.lock() {
        if let Some(mut child) = guard.take() { let _ = child.kill(); }
    }
    if let Ok(mut guard) = state.web_child.lock() {
        if let Some(mut child) = guard.take() { let _ = child.kill(); }
    }
}

fn is_app_quitting(app_handle: &AppHandle) -> bool {
    let lifecycle: State<'_, AppLifecycleState> = app_handle.state();
    lifecycle.is_quitting.lock().map(|g| *g).unwrap_or(false)
}

fn mark_app_quitting(app_handle: &AppHandle) {
    let lifecycle: State<'_, AppLifecycleState> = app_handle.state();
    let _ = lifecycle.is_quitting.lock().map(|mut g| *g = true);
}

fn show_main_window(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let tray_menu = MenuBuilder::new(app)
        .text("restore", "Restore Prism")
        .separator()
        .text("exit", "Exit Prism")
        .build()?;
    let mut tray_builder = TrayIconBuilder::with_id("prism-tray")
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .tooltip("Prism")
        .on_menu_event(|app_handle, event| match event.id().as_ref() {
            "restore" => show_main_window(app_handle),
            "exit" => { mark_app_quitting(app_handle); app_handle.exit(0); }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }
    #[cfg(target_os = "macos")]
    {
        tray_builder = tray_builder.icon_as_template(true);
    }
    tray_builder.build(app)?;
    Ok(())
}

fn main() {
    let app = match tauri::Builder::default()
        .manage(RuntimeState::new())
        .manage(AppLifecycleState::new())
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if is_app_quitting(&window.app_handle()) { return; }
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            let state: State<'_, RuntimeState> = app.state();
            let app_handle = app.handle().clone();

            let (api_port, web_port) = match start_runtime(&app_handle, &state) {
                Ok(ports) => ports,
                Err(error) => {
                    eprintln!("[PRISM] Runtime startup failed: {error}");
                    emit_log(&app_handle, "prism", &format!("Startup failed: {error}"));
                    return Ok(());
                }
            };

            if let Err(error) = wait_for_api(api_port, &state, &app_handle) {
                eprintln!("[PRISM] API readiness failed: {error}");
                return Ok(());
            }
            if let Err(error) = wait_for_web(web_port, api_port, &state, &app_handle) {
                eprintln!("[PRISM] Web readiness failed: {error}");
                return Ok(());
            }

            let web_url = match Url::parse(&format!("http://127.0.0.1:{web_port}")) {
                Ok(url) => url,
                Err(error) => {
                    eprintln!("[PRISM] Invalid web URL: {error}");
                    return Ok(());
                }
            };

            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = window.navigate(web_url.clone()) {
                    eprintln!("[PRISM] Window navigate failed: {error}");
                }
            } else if let Err(error) = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(web_url.clone()),
            )
            .title("PRISM")
            .inner_size(1400.0, 948.0)
            .min_inner_size(948.0, 760.0)
            .resizable(true)
            .maximizable(true)
            .build() {
                eprintln!("[PRISM] Window build failed: {error}");
            }
            setup_tray(app)?;

            Ok(())
        })
        .build(tauri::generate_context!()) {
        Ok(app) => app,
        Err(error) => {
            eprintln!("[PRISM] Failed to start desktop app: {error}");
            return;
        }
    };

    app.run(|app_handle, event| match event {
        RunEvent::ExitRequested { api, .. } => {
            if is_app_quitting(&app_handle) {
                let state: State<'_, RuntimeState> = app_handle.state();
                stop_runtime(&state);
                return;
            }
            api.prevent_exit();
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.hide();
            }
        }
        RunEvent::Exit => {
            let state: State<'_, RuntimeState> = app_handle.state();
            stop_runtime(&state);
        }
        _ => {}
    });
}
