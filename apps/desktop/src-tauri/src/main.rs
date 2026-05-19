use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::{fs, fs::OpenOptions};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder};
use url::Url;

const DEFAULT_API_PORT: u16 = 18787;
const DEFAULT_WEB_PORT: u16 = 18788;
const STARTUP_TIMEOUT_SECS: u64 = 90;

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

fn repo_root_from_manifest() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
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
    let resource_dir = app.path().resource_dir().ok()?;
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
        candidates.push(root.join("runtime").join("node").join("bin").join("node"));
        candidates.push(root.join("node").join("bin").join("node"));
    }
    candidates.push(PathBuf::from("node"));

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

fn pick_available_port(preferred: u16) -> std::io::Result<u16> {
    for offset in 0..=100 {
        let candidate = preferred.saturating_add(offset);
        if std::net::TcpListener::bind(("127.0.0.1", candidate)).is_ok() {
            return Ok(candidate);
        }
    }
    Err(io_error(format!(
        "Could not find an available localhost port near {preferred}."
    )))
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
    let localai_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| root.join("user-data"));
    let localai_data_dir_value = localai_data_dir.to_string_lossy().to_string();
    let logs_dir = localai_data_dir.join("logs");
    fs::create_dir_all(&logs_dir)
        .map_err(|error| io_error(format!("Failed to create PRISM log directory: {error}")))?;
    let api_log = logs_dir.join("api.log");
    let web_log = logs_dir.join("web.log");
    let qdrant_log = logs_dir.join("qdrant.log");
    let api_stdout = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&api_log)
        .map_err(|error| io_error(format!("Failed to open API log file: {error}")))?;
    let api_stderr = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&api_log)
        .map_err(|error| io_error(format!("Failed to open API log file: {error}")))?;
    let web_stdout = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&web_log)
        .map_err(|error| io_error(format!("Failed to open web log file: {error}")))?;
    let web_stderr = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&web_log)
        .map_err(|error| io_error(format!("Failed to open web log file: {error}")))?;
    let qdrant_stdout = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&qdrant_log)
        .map_err(|error| io_error(format!("Failed to open qdrant log file: {error}")))?;
    let qdrant_stderr = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&qdrant_log)
        .map_err(|error| io_error(format!("Failed to open qdrant log file: {error}")))?;
    let api_port = pick_available_port(DEFAULT_API_PORT)?;
    let web_port = pick_available_port(DEFAULT_WEB_PORT)?;
    let localai_api_origin = format!("http://127.0.0.1:{api_port}");
    let qdrant_url = "http://127.0.0.1:6333";
    let web_cwd = web
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| root.clone());
    let qdrant_storage_dir = localai_data_dir.join("Qdrant").join("storage");
    fs::create_dir_all(&qdrant_storage_dir)
        .map_err(|error| io_error(format!("Failed to create Qdrant data directory: {error}")))?;

    let mut qdrant_child = Command::new(&qdrant)
        .env(
            "QDRANT__STORAGE__STORAGE_PATH",
            qdrant_storage_dir.to_string_lossy().to_string(),
        )
        // Bind to localhost only so Windows Firewall never prompts the user.
        .env("QDRANT__SERVICE__HOST", "127.0.0.1")
        .stdin(Stdio::null())
        .stdout(Stdio::from(qdrant_stdout))
        .stderr(Stdio::from(qdrant_stderr))
        .spawn()
        .map_err(|error| io_error(format!("Failed to start bundled Qdrant: {error}")))?;

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
        .stdout(Stdio::from(api_stdout))
        .stderr(Stdio::from(api_stderr))
        .spawn()
        .map_err(|error| {
            let _ = qdrant_child.kill();
            io_error(format!("Failed to start Prism API: {error}"))
        })?;

    // Next.js standalone must bind to a specific host; default 0.0.0.0 can
    // trigger firewall prompts on Windows.  HOSTNAME=127.0.0.1 keeps it local.
    let web_child = Command::new(&node)
        .arg(&web)
        .current_dir(&web_cwd)
        .env("PORT", web_port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("API_PORT", api_port.to_string())
        .env("LOCALAI_API_ORIGIN", localai_api_origin)
        .env("PRISM_DESKTOP_MODE", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::from(web_stdout))
        .stderr(Stdio::from(web_stderr))
        .spawn()
        .map_err(|error| {
            let _ = api_child.kill();
            let _ = qdrant_child.kill();
            io_error(format!("Failed to start Prism web runtime: {error}"))
        })?;

    eprintln!("[PRISM] Runtime root: {}", root.display());
    eprintln!("[PRISM] Node binary:  {node}");
    eprintln!("[PRISM] API entry:    {}", api.display());
    eprintln!("[PRISM] Web entry:    {}", web.display());
    eprintln!("[PRISM] Web cwd:      {}", web_cwd.display());
    eprintln!("[PRISM] Qdrant:       {}", qdrant.display());
    eprintln!("[PRISM] Ports:        API={api_port}  Web={web_port}");

    *state
        .qdrant_child
        .lock()
        .map_err(|_| io_error("Qdrant process lock poisoned"))? = Some(qdrant_child);
    *state
        .api_child
        .lock()
        .map_err(|_| io_error("API process lock poisoned"))? = Some(api_child);
    *state
        .web_child
        .lock()
        .map_err(|_| io_error("Web process lock poisoned"))? = Some(web_child);

    Ok((api_port, web_port))
}

fn wait_for_web(web_port: u16, state: &RuntimeState) -> std::io::Result<()> {
    let start = Instant::now();
    let timeout_at = start + Duration::from_secs(STARTUP_TIMEOUT_SECS);
    let target = format!("127.0.0.1:{web_port}");
    eprintln!("[PRISM] Waiting for web runtime on {target} (timeout {STARTUP_TIMEOUT_SECS}s)...");
    while Instant::now() < timeout_at {
        if std::net::TcpStream::connect(&target).is_ok() {
            eprintln!("[PRISM] Web runtime ready after {:.1}s", start.elapsed().as_secs_f64());
            return Ok(());
        }
        // Fail fast if the web process exited instead of waiting the full timeout.
        if let Ok(mut guard) = state.web_child.lock() {
            if let Some(ref mut child) = *guard {
                if let Ok(Some(exit_status)) = child.try_wait() {
                    let elapsed = start.elapsed().as_secs_f64();
                    return Err(io_error(format!(
                        "Prism web runtime exited after {elapsed:.1}s with status {exit_status}. Check web.log in the app data directory."
                    )));
                }
            }
        }
        thread::sleep(Duration::from_millis(500));
    }
    // Check if API is also down — that would indicate a broader issue.
    let api_alive = std::net::TcpStream::connect(format!("127.0.0.1:{}", DEFAULT_API_PORT)).is_ok();
    eprintln!("[PRISM] Timeout reached. API alive: {api_alive}");
    Err(io_error(
        "Prism web runtime did not start in time (90s timeout). Check web.log in the app data directory.",
    ))
}

fn stop_runtime(state: &RuntimeState) {
    if let Ok(mut guard) = state.qdrant_child.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
        }
    }
    if let Ok(mut guard) = state.api_child.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
        }
    }
    if let Ok(mut guard) = state.web_child.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
        }
    }
}

fn main() {
    tauri::Builder::default()
        .manage(RuntimeState::new())
        .setup(|app| {
            let state: State<'_, RuntimeState> = app.state();
            let (_api_port, web_port) = start_runtime(&app.handle(), &state)?;
            wait_for_web(web_port, &state)?;
            let web_url = Url::parse(&format!("http://127.0.0.1:{web_port}"))
                .map_err(|error| io_error(format!("Invalid Prism web URL: {error}")))?;

            if let Some(window) = app.get_webview_window("main") {
                window.navigate(web_url.clone()).map_err(tauri::Error::from)?;
            } else {
                WebviewWindowBuilder::new(
                    app,
                    "main",
                    WebviewUrl::External(web_url.clone()),
                )
                .title("PRISM")
                .inner_size(1400.0, 948.0)
                .min_inner_size(948.0, 948.0)
                .resizable(true)
                .maximizable(true)
                .build()
                .map_err(tauri::Error::from)?;
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building PRISM")
        .run(|app_handle, event| match event {
            RunEvent::ExitRequested { .. } | RunEvent::Exit => {
                let state: State<'_, RuntimeState> = app_handle.state();
                stop_runtime(&state);
            }
            _ => {}
        });
}
