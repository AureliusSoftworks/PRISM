#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::{fs, fs::OpenOptions};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
// Windows Job Object with KILL_ON_JOB_CLOSE: when PRISM.exe exits or is
// forcefully terminated by an installer, Windows automatically kills every
// child process (node.exe, qdrant.exe, etc.) assigned to the job, releasing
// file locks before the installer overwrites the runtime binaries.
#[cfg(target_os = "windows")]
mod win_job {
    use std::ffi::c_void;
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;
    use std::sync::OnceLock;

    // Mirror of Win32 JOBOBJECT_BASIC_LIMIT_INFORMATION (64-bit layout).
    // repr(C) inserts the same padding the C compiler would.
    #[repr(C)]
    struct BasicLimitInfo {
        per_process_user_time_limit: i64,
        per_job_user_time_limit: i64,
        limit_flags: u32,
        minimum_working_set_size: usize,
        maximum_working_set_size: usize,
        active_process_limit: u32,
        affinity: usize,
        priority_class: u32,
        scheduling_class: u32,
    }

    const KILL_ON_JOB_CLOSE: u32 = 0x2000;
    const JOB_OBJECT_BASIC_LIMIT_INFORMATION: i32 = 2;

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateJobObjectW(lp_attrs: *const c_void, lp_name: *const u16) -> *mut c_void;
        fn SetInformationJobObject(
            h_job: *mut c_void, info_class: i32,
            info: *const c_void, info_len: u32,
        ) -> i32;
        fn AssignProcessToJobObject(h_job: *mut c_void, h_process: *mut c_void) -> i32;
    }

    // Raw pointer wrapper that is Send + Sync: we only write once (OnceLock)
    // and thereafter only read the handle value for Win32 calls.
    struct JobHandle(*mut c_void);
    unsafe impl Send for JobHandle {}
    unsafe impl Sync for JobHandle {}

    static CHILD_JOB: OnceLock<JobHandle> = OnceLock::new();

    pub fn init() {
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() { return; }
            let info = BasicLimitInfo {
                per_process_user_time_limit: 0,
                per_job_user_time_limit: 0,
                limit_flags: KILL_ON_JOB_CLOSE,
                minimum_working_set_size: 0,
                maximum_working_set_size: 0,
                active_process_limit: 0,
                affinity: 0,
                priority_class: 0,
                scheduling_class: 0,
            };
            if SetInformationJobObject(
                job, JOB_OBJECT_BASIC_LIMIT_INFORMATION,
                std::ptr::addr_of!(info) as *const c_void,
                std::mem::size_of::<BasicLimitInfo>() as u32,
            ) == 0 { return; }
            let _ = CHILD_JOB.set(JobHandle(job));
        }
    }

    pub fn assign(child: &Child) {
        if let Some(j) = CHILD_JOB.get() {
            unsafe { let _ = AssignProcessToJobObject(j.0, child.as_raw_handle()); }
        }
    }
}

#[cfg(target_os = "windows")]
fn init_child_job() { win_job::init(); }
#[cfg(target_os = "windows")]
fn assign_to_child_job(child: &Child) { win_job::assign(child); }

#[cfg(not(target_os = "windows"))]
fn init_child_job() {}
#[cfg(not(target_os = "windows"))]
fn assign_to_child_job(_child: &Child) {}

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

// Unix counterpart to the Windows Job Object above: give each runtime child its
// own process group so the child *and everything it spawns* can be signalled as
// a unit. Without this, grandchildren (the API's `dns-sd` LAN advertiser, TTS
// workers) survive their parent and reparent to init.
trait CommandOwnProcessGroup {
    fn own_process_group(&mut self) -> &mut Self;
}
impl CommandOwnProcessGroup for Command {
    fn own_process_group(&mut self) -> &mut Self {
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            // 0 = use the child's own pid as the new process group id.
            self.process_group(0);
        }
        self
    }
}

/// Stop runtime children and everything they spawned.
///
/// `Child::kill()` sends SIGKILL to a single pid. SIGKILL cannot be caught, so
/// the API's shutdown handler never runs, `stopDiscovery()` never fires, and its
/// `dns-sd` advertiser is orphaned to init — where it lives forever, still
/// advertising `_prism._tcp`. Signal the whole process group instead: SIGTERM so
/// each runtime can shut down cleanly, then SIGKILL for anything still standing.
#[cfg(unix)]
fn terminate_children(children: &mut [&mut Child]) {
    fn signal_group(pid: u32, signal: &str) {
        // `kill -SIG -PGID` targets the group. Shelling out keeps this
        // dependency-free; the crate has no `libc`.
        let _ = Command::new("/bin/kill")
            .args([signal, &format!("-{pid}")])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    for child in children.iter() {
        signal_group(child.id(), "-TERM");
    }

    // Give every runtime the same grace period, in parallel, so quitting stays
    // fast regardless of how many children are still draining.
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while std::time::Instant::now() < deadline {
        if children
            .iter_mut()
            .all(|child| matches!(child.try_wait(), Ok(Some(_))))
        {
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    for child in children.iter_mut() {
        if matches!(child.try_wait(), Ok(Some(_))) {
            continue;
        }
        signal_group(child.id(), "-KILL");
        let _ = child.wait();
    }
}

#[cfg(not(unix))]
fn terminate_children(children: &mut [&mut Child]) {
    // The Job Object tears the whole tree down with the process.
    for child in children.iter_mut() {
        let _ = child.kill();
    }
}

/// Single-child convenience for the spawn-failure rollback paths.
fn terminate_one(child: &mut Child) {
    terminate_children(&mut [child]);
}

/// Command-line markers identifying a Prism runtime process we own.
#[cfg(unix)]
const PRISM_RUNTIME_PROCESS_MARKERS: &[&str] = &[
    "/Resources/runtime/apps/api/dist/server.js",
    "/Resources/runtime/apps/web/.next/standalone",
    "/Application Support/Prism/bin/qdrant",
];

/// Reap Prism runtime processes leaked by a previous shell.
///
/// A runtime child always has a live desktop shell as its parent, so anything
/// reparented to init (ppid 1) is definitionally leaked — the shell was
/// SIGKILLed, force-quit, or crashed before `stop_runtime` could run. Those
/// strays keep holding 19787/19788, which pushes the next launch onto a
/// fallback port and quietly leaves two full stacks running. Restricting to
/// ppid 1 is what makes this safe: a genuinely running Prism instance owns its
/// children, so this can never disturb one.
///
/// Best-effort throughout — never block startup.
#[cfg(unix)]
fn reap_leaked_prism_runtimes(app: &AppHandle) {
    let listing = match Command::new("/bin/ps")
        .args(["-eo", "pid=,ppid=,args="])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
    {
        Ok(output) => String::from_utf8_lossy(&output.stdout).into_owned(),
        Err(_) => return,
    };

    let mut reaped = 0usize;
    for line in listing.lines() {
        let mut parts = line.split_whitespace();
        let (Some(pid_raw), Some(ppid_raw)) = (parts.next(), parts.next()) else {
            continue;
        };
        if ppid_raw != "1" {
            continue;
        }
        let Ok(pid) = pid_raw.parse::<i32>() else {
            continue;
        };
        if pid <= 1 {
            continue;
        }
        if !PRISM_RUNTIME_PROCESS_MARKERS
            .iter()
            .any(|marker| line.contains(marker))
        {
            continue;
        }
        unsafe {
            libc::kill(pid, libc::SIGTERM);
        }
        reaped += 1;
    }

    if reaped > 0 {
        emit_log(
            app,
            "prism",
            &format!("Reaped {reaped} leaked Prism runtime process(es) from a previous session."),
        );
    }
}

#[cfg(not(unix))]
fn reap_leaked_prism_runtimes(_app: &AppHandle) {
    // The Job Object guarantees the tree dies with the shell.
}

/// Latest shutdown signal seen, 0 when none. Written from a signal handler, so
/// only async-signal-safe work happens there; a watcher thread does the rest.
#[cfg(unix)]
static PRISM_SHUTDOWN_SIGNAL: std::sync::atomic::AtomicI32 =
    std::sync::atomic::AtomicI32::new(0);

#[cfg(unix)]
extern "C" fn prism_note_shutdown_signal(signal: i32) {
    PRISM_SHUTDOWN_SIGNAL.store(signal, std::sync::atomic::Ordering::SeqCst);
}

/// Run `stop_runtime` on Ctrl-C, `kill`, and terminal hangup.
///
/// Tauri's `RunEvent::Exit` covers quitting through the UI, but not a signal —
/// and since runtime children now live in their own process groups, a terminal
/// Ctrl-C during `tauri dev` no longer reaches them on its own. Without this,
/// every interrupted local build would strand a full stack.
#[cfg(unix)]
fn install_shutdown_signal_guard(app: AppHandle) {
    unsafe {
        for signal in [libc::SIGINT, libc::SIGTERM, libc::SIGHUP] {
            let handler: extern "C" fn(i32) = prism_note_shutdown_signal;
            libc::signal(signal, handler as libc::sighandler_t);
        }
    }
    std::thread::spawn(move || loop {
        if PRISM_SHUTDOWN_SIGNAL.load(std::sync::atomic::Ordering::SeqCst) != 0 {
            let state: State<'_, RuntimeState> = app.state();
            stop_runtime(&state);
            std::process::exit(0);
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    });
}

#[cfg(not(unix))]
fn install_shutdown_signal_guard(_app: AppHandle) {}

// Tauri 2 embeds the platform webview (WKWebView/WebView2/WebKitGTK), not an
// Electron Chromium session. Run this at document start for every PRISM frame
// so native spelling and automatic-correction UI cannot win a race with React.
const PRISM_DISABLE_NATIVE_TEXT_CORRECTION_SCRIPT: &str = r#"
(() => {
  globalThis.__PRISM_NATIVE_TEXT_CORRECTION_POLICY__ = true;
  const selector = 'input, textarea, [contenteditable]:not([contenteditable="false"])';
  const disable = (element) => {
    if (!(element instanceof HTMLElement) || !element.matches(selector)) return;
    if (element.spellcheck !== false) element.spellcheck = false;
    if (element.getAttribute('spellcheck') !== 'false') {
      element.setAttribute('spellcheck', 'false');
    }
    if (element.getAttribute('autocorrect') !== 'off') {
      element.setAttribute('autocorrect', 'off');
    }
  };
  const disableWithin = (root) => {
    if (root instanceof Element) disable(root);
    root.querySelectorAll?.(selector).forEach(disable);
  };
  const disableRoot = () => {
    const root = document.documentElement;
    if (!root) return;
    if (root.spellcheck !== false) root.spellcheck = false;
    if (root.getAttribute('spellcheck') !== 'false') {
      root.setAttribute('spellcheck', 'false');
    }
    if (root.getAttribute('autocorrect') !== 'off') {
      root.setAttribute('autocorrect', 'off');
    }
  };

  disableRoot();
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        disable(record.target);
        continue;
      }
      record.addedNodes.forEach((node) => {
        if (node instanceof Element) disableWithin(node);
      });
    }
  });
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['spellcheck', 'autocorrect'],
  });
  document.addEventListener('DOMContentLoaded', () => {
    disableRoot();
    disableWithin(document);
  }, { once: true });
})();
"#;

use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::utils::config::BackgroundThrottlingPolicy;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};

// PRISM is composed at a 16:10 reference size, but the native shell must fit
// the monitor's logical work area after OS scaling, docks, and taskbars. The
// web shell owns responsive composition below the reference size.
const PRISM_WINDOW_REFERENCE_WIDTH: f64 = 1440.0;
const PRISM_WINDOW_REFERENCE_HEIGHT: f64 = 900.0;
const PRISM_WINDOW_MIN_WIDTH: f64 = 800.0;
const PRISM_WINDOW_MIN_HEIGHT: f64 = 520.0;
use url::Url;

const DEFAULT_API_PORT: u16 = 19787;
const DEFAULT_WEB_PORT: u16 = 19788;
const API_STARTUP_TIMEOUT_SECS: u64 = 15 * 60;
const WEB_STARTUP_TIMEOUT_SECS: u64 = 90;
const API_STARTUP_PROGRESS_SECS: u64 = 15;

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

struct PortablePackageOpenState {
    paths: Mutex<Vec<String>>,
}

impl PortablePackageOpenState {
    fn new() -> Self {
        Self { paths: Mutex::new(Vec::new()) }
    }
}

fn portable_package_path(value: &str) -> Option<String> {
    let path = if let Ok(url) = Url::parse(value) {
        if url.scheme() != "file" { return None; }
        url.to_file_path().ok()?
    } else {
        PathBuf::from(value)
    };
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    if extension != "case" && extension != "mansion" && extension != "whodunnit" { return None; }
    Some(path.to_string_lossy().into_owned())
}

fn queue_portable_package_paths(app: &AppHandle, values: impl IntoIterator<Item = String>) {
    let Some(state) = app.try_state::<PortablePackageOpenState>() else { return; };
    let mut pending = state.paths.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    for value in values {
        if let Some(path) = portable_package_path(&value) {
            if !pending.contains(&path) { pending.push(path); }
        }
    }
    drop(pending);
    let _ = app.emit("prism-portable-package-open-pending", ());
}

fn emit_pending_portable_package_paths(app: &AppHandle) {
    let Some(state) = app.try_state::<PortablePackageOpenState>() else { return; };
    let pending = {
        let mut paths = state.paths.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        std::mem::take(&mut *paths)
    };
    for path in pending {
        let _ = app.emit("prism-open-portable-package", serde_json::json!({ "path": path }));
    }
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

/// Read the persisted LAN-access preference from `network.json` in the app data
/// directory. Returns `false` (private/loopback) when the file is absent or
/// unreadable — the same safe default as the server-side logic.
fn read_lan_access_enabled(data_dir: &std::path::Path) -> bool {
    let path = data_dir.join("network.json");
    let content = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let val: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return false,
    };
    val.get("lanAccessEnabled")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
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

/// Translate child output into fixed operational messages. Child stdout and
/// stderr are untrusted: provider failures, framework traces, or future debug
/// statements may contain account text. No raw child line may reach disk or
/// the splash terminal.
fn content_free_runtime_log_line(source: &str, line: &str) -> Option<&'static str> {
    let normalized = line.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return None;
    }
    if normalized.contains("vault")
        || normalized.contains("migration")
        || normalized.contains("upgrade")
    {
        return Some("Secure workspace preparation is active.");
    }
    if normalized.contains("error")
        || normalized.contains("failed")
        || normalized.contains("failure")
        || normalized.contains("fatal")
        || normalized.contains("panic")
        || normalized.contains("warning")
    {
        return Some("Runtime reported a content-free diagnostic.");
    }
    if normalized.contains("ready")
        || normalized.contains("listening")
        || normalized.contains("started")
        || normalized.contains("compiled")
    {
        return Some(match source {
            "api" => "API runtime is responding.",
            "web" => "Web interface is responding.",
            "qdrant" => "Private vector service is responding.",
            _ => "Runtime service is responding.",
        });
    }
    None
}

#[cfg(test)]
mod runtime_log_privacy_tests {
    use super::content_free_runtime_log_line;

    #[test]
    fn child_output_never_survives_content_free_classification() {
        let canary = "owner-a-private-prompt-canary";
        for source in ["api", "web", "qdrant"] {
            for line in [
                canary.to_string(),
                format!("ready {canary}"),
                format!("fatal provider error: {canary}"),
                format!("vault migration: {canary}"),
            ] {
                let classified = content_free_runtime_log_line(source, &line);
                assert!(!classified.unwrap_or_default().contains(canary));
            }
        }
    }
}

/// Drain a child stream while persisting and displaying only fixed,
/// content-free classifications.
fn spawn_content_free_log_drain(
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
                    if let Some(safe_line) = content_free_runtime_log_line(source, &line) {
                        let _ = writeln!(log_file, "{source} {safe_line}");
                        emit_log(&app, source, safe_line);
                    }
                }
                Err(_) => break,
            }
        }
    });
}

fn start_runtime(app: &AppHandle, state: &RuntimeState) -> std::io::Result<(u16, u16)> {
    init_child_job();
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

    // All child streams are drained through a fixed content-free classifier.
    // Never redirect raw stdout/stderr into persistent files.
    let qdrant_stdout_file = OpenOptions::new().create(true).append(true).open(&qdrant_log)
        .map_err(|e| io_error(format!("Failed to open qdrant log: {e}")))?;
    let qdrant_stderr_file = qdrant_stdout_file.try_clone()
        .map_err(|e| io_error(format!("Failed to clone qdrant log handle: {e}")))?;

    // API: both streams are classified before splash/file output.
    let api_stdout_file = OpenOptions::new().create(true).append(true).open(&api_log)
        .map_err(|e| io_error(format!("Failed to open api log: {e}")))?;
    let api_stderr_file = api_stdout_file.try_clone()
        .map_err(|e| io_error(format!("Failed to clone api log handle: {e}")))?;

    // Web: both streams are classified before splash/file output.
    let web_stdout_file = OpenOptions::new().create(true).append(true).open(&web_log)
        .map_err(|e| io_error(format!("Failed to open web log: {e}")))?;
    let web_stderr_file = web_stdout_file.try_clone()
        .map_err(|e| io_error(format!("Failed to clone web log handle: {e}")))?;

    // Clear strays from a previous shell before probing ports, so a leaked
    // runtime cannot push this launch onto a fallback port.
    reap_leaked_prism_runtimes(app);

    let api_port = pick_available_port(DEFAULT_API_PORT, &[])?;
    if api_port != DEFAULT_API_PORT {
        // Surfaced loudly: this almost always means another Prism is still
        // alive, so the window about to open is a second stack rather than the
        // build just staged.
        emit_log(
            app,
            "prism",
            &format!(
                "WARNING: port {DEFAULT_API_PORT} is already in use by another live Prism instance; \
                 this shell fell back to {api_port}. Quit the other instance if you meant to test this build.",
            ),
        );
    }
    let web_port = pick_available_port(DEFAULT_WEB_PORT, &[api_port])?;
    let localai_api_origin = format!("http://127.0.0.1:{api_port}");
    // Honour the persisted LAN-access preference: bind to 0.0.0.0 when the
    // user has enabled "Access from other devices", loopback otherwise.
    let lan_access = read_lan_access_enabled(&localai_data_dir);
    let bind_host = if lan_access { "0.0.0.0" } else { "127.0.0.1" };
    let qdrant_url = "http://127.0.0.1:6333";
    let web_cwd = web
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| root.clone());
    let qdrant_work_dir = localai_data_dir.join("Qdrant");
    let qdrant_storage_dir = qdrant_work_dir.join("storage");
    fs::create_dir_all(&qdrant_storage_dir)
        .map_err(|error| io_error(format!("Failed to create Qdrant data directory: {error}")))?;

    emit_log(app, "prism", "Private runtime paths prepared.");
    emit_log(app, "prism", "Private service ports reserved.");

    // ── Qdrant ──
    emit_status(app, "qdrant", "starting");
    let mut qdrant_child = Command::new(&qdrant)
        .current_dir(&qdrant_work_dir)
        .env("QDRANT__STORAGE__STORAGE_PATH", qdrant_storage_dir.to_string_lossy().to_string())
        .env("QDRANT__SERVICE__HOST", "127.0.0.1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .no_window()
        .own_process_group()
        .spawn()
        .map_err(|e| io_error(format!("Failed to start bundled Qdrant: {e}")))?;
    assign_to_child_job(&qdrant_child);
    if let Some(stdout) = qdrant_child.stdout.take() {
        spawn_content_free_log_drain(stdout, qdrant_stdout_file, app.clone(), "qdrant");
    }
    if let Some(stderr) = qdrant_child.stderr.take() {
        spawn_content_free_log_drain(stderr, qdrant_stderr_file, app.clone(), "qdrant");
    }
    emit_status(app, "qdrant", "running");
    emit_log(app, "qdrant", "Private vector service started.");

    // ── API ──
    emit_status(app, "api", "starting");
    let mut api_command = Command::new(&node);
    api_command
        .arg(&api)
        .current_dir(&root)
        .env("API_PORT", api_port.to_string())
        .env("API_HOST", bind_host)
        .env("WEB_PORT", web_port.to_string())
        .env("LOCALAI_DATA_DIR", localai_data_dir_value.clone())
        .env("QDRANT_URL", qdrant_url)
        .env("PRISM_DESKTOP_MODE", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .no_window()
        .own_process_group();
    let playwright_browsers = root.join("playwright-browsers");
    if playwright_browsers.exists() {
        api_command.env("PLAYWRIGHT_BROWSERS_PATH", playwright_browsers);
    }
    let mut api_child = api_command
        .spawn()
        .map_err(|e| {
            terminate_one(&mut qdrant_child);
            io_error(format!("Failed to start Prism API: {e}"))
        })?;

    assign_to_child_job(&api_child);
    if let Some(stdout) = api_child.stdout.take() {
        spawn_content_free_log_drain(stdout, api_stdout_file, app.clone(), "api");
    }
    if let Some(stderr) = api_child.stderr.take() {
        spawn_content_free_log_drain(stderr, api_stderr_file, app.clone(), "api");
    }
    emit_status(app, "api", "running");

    // ── Web ──
    emit_status(app, "web", "starting");
    let mut web_child = Command::new(&node)
        .arg(&web)
        .current_dir(&web_cwd)
        .env("PORT", web_port.to_string())
        .env("HOSTNAME", bind_host)
        .env("API_PORT", api_port.to_string())
        .env("LOCALAI_API_ORIGIN", localai_api_origin)
        .env("PRISM_DESKTOP_MODE", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .no_window()
        .own_process_group()
        .spawn()
        .map_err(|e| {
            terminate_one(&mut api_child);
            terminate_one(&mut qdrant_child);
            io_error(format!("Failed to start Prism web runtime: {e}"))
        })?;

    assign_to_child_job(&web_child);
    if let Some(stdout) = web_child.stdout.take() {
        spawn_content_free_log_drain(stdout, web_stdout_file, app.clone(), "web");
    }
    if let Some(stderr) = web_child.stderr.take() {
        spawn_content_free_log_drain(stderr, web_stderr_file, app.clone(), "web");
    }
    emit_status(app, "web", "running");

    *state.qdrant_child.lock().map_err(|_| io_error("Qdrant process lock poisoned"))? = Some(qdrant_child);
    *state.api_child.lock().map_err(|_| io_error("API process lock poisoned"))? = Some(api_child);
    *state.web_child.lock().map_err(|_| io_error("Web process lock poisoned"))? = Some(web_child);

    Ok((api_port, web_port))
}

fn wait_for_api(api_port: u16, state: &RuntimeState, app: &AppHandle) -> std::io::Result<()> {
    let start = Instant::now();
    let timeout_at = start + Duration::from_secs(API_STARTUP_TIMEOUT_SECS);
    let mut next_progress_at = start + Duration::from_secs(API_STARTUP_PROGRESS_SECS);
    let status_refresh_at = start + Duration::from_secs(1);
    let mut status_refreshed = false;
    let target = format!("127.0.0.1:{api_port}");
    emit_log(app, "prism", "Waiting for the private API…");
    while Instant::now() < timeout_at {
        if std::net::TcpStream::connect(&target).is_ok() {
            let elapsed = start.elapsed().as_secs_f64();
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
        let now = Instant::now();
        if !status_refreshed && now >= status_refresh_at {
            // The splash event listeners can attach after the runtime children
            // start. Refresh their current state once the webview is painted.
            emit_status(app, "qdrant", "running");
            emit_status(app, "api", "running");
            emit_status(app, "web", "running");
            status_refreshed = true;
        }
        if now >= next_progress_at {
            let elapsed = start.elapsed().as_secs();
            emit_status(app, "api", "preparing");
            emit_log(
                app,
                "prism",
                &format!(
                    "API is still preparing local data ({elapsed}s). Secure upgrades can take several minutes for large libraries."
                ),
            );
            next_progress_at = now + Duration::from_secs(API_STARTUP_PROGRESS_SECS);
        }
        thread::sleep(Duration::from_millis(500));
    }
    emit_status(app, "api", "error");
    Err(io_error(format!(
        "Prism API did not start in time ({API_STARTUP_TIMEOUT_SECS}s timeout). Check api.log in the app data directory."
    )))
}

fn wait_for_web(web_port: u16, api_port: u16, state: &RuntimeState, app: &AppHandle) -> std::io::Result<()> {
    let start = Instant::now();
    let timeout_at = start + Duration::from_secs(WEB_STARTUP_TIMEOUT_SECS);
    let target = format!("127.0.0.1:{web_port}");
    emit_log(app, "prism", "Waiting for the web interface…");
    while Instant::now() < timeout_at {
        if std::net::TcpStream::connect(&target).is_ok() {
            let elapsed = start.elapsed().as_secs_f64();
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
    emit_log(app, "prism", &format!("Timeout reached. API alive: {api_alive}"));
    emit_status(app, "web", "error");
    Err(io_error(format!(
        "Prism web runtime did not start in time ({WEB_STARTUP_TIMEOUT_SECS}s timeout). Check web.log in the app data directory."
    )))
}

fn stop_runtime(state: &RuntimeState) {
    // Take ownership of all three first, then signal them together, so every
    // runtime shares one grace period instead of queueing behind the last.
    let mut owned: Vec<Child> = Vec::new();
    for slot in [&state.web_child, &state.api_child, &state.qdrant_child] {
        if let Ok(mut guard) = slot.lock() {
            if let Some(child) = guard.take() {
                owned.push(child);
            }
        }
    }
    if owned.is_empty() {
        return;
    }
    let mut borrowed: Vec<&mut Child> = owned.iter_mut().collect();
    terminate_children(&mut borrowed);
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

#[tauri::command]
fn toggle_fullscreen(window: tauri::WebviewWindow) -> Result<bool, String> {
    let next_fullscreen = !window
        .is_fullscreen()
        .map_err(|error| format!("Could not read fullscreen state: {error}"))?;
    window
        .set_fullscreen(next_fullscreen)
        .map_err(|error| format!("Could not toggle fullscreen: {error}"))?;
    Ok(next_fullscreen)
}

#[tauri::command]
fn set_cursor_position(
    window: tauri::WebviewWindow,
    x: f64,
    y: f64,
) -> Result<bool, String> {
    if !x.is_finite() || !y.is_finite() {
        return Ok(false);
    }
    window
        .set_cursor_position(tauri::LogicalPosition::new(x, y))
        .map_err(|error| format!("Could not position the cursor: {error}"))?;
    Ok(true)
}

#[tauri::command]
fn open_emoji_picker(app: AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        app.run_on_main_thread(|| {
            use objc2::MainThreadMarker;
            use objc2_app_kit::NSApplication;

            let mtm = MainThreadMarker::new()
                .expect("Tauri scheduled the emoji picker on the macOS main thread");
            NSApplication::sharedApplication(mtm).orderFrontCharacterPalette(None);
        })
        .map_err(|error| format!("Could not open the emoji picker: {error}"))?;
        return Ok(true);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(false)
    }
}

fn main() {
    let builder = tauri::Builder::default();

    // Register this before every other plugin or managed service. A repeat
    // launch is redirected to the existing window and exits before setup can
    // spawn a second Qdrant/API/web runtime tree.
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
        queue_portable_package_paths(app, args);
        show_main_window(app);
    }));

    let app = match builder
        .manage(RuntimeState::new())
        .manage(AppLifecycleState::new())
        .manage(PortablePackageOpenState::new())
        .invoke_handler(tauri::generate_handler![
            toggle_fullscreen,
            set_cursor_position,
            open_emoji_picker
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if is_app_quitting(&window.app_handle()) { return; }
                // Hiding a fullscreen window during macOS close can strand its
                // Space as a black surface. On Mac, Close and Cmd+Q are real
                // shutdown paths; Windows and Linux retain close-to-tray.
                if cfg!(target_os = "macos") {
                    // Keep the window alive until shutdown is requested from a
                    // worker thread. Calling AppHandle::exit synchronously from
                    // inside CloseRequested can be swallowed by macOS while the
                    // native close callback is still on the main thread, leaving
                    // a headless process and its runtime children behind.
                    api.prevent_close();
                    let app_handle = window.app_handle().clone();
                    mark_app_quitting(&app_handle);
                    thread::spawn(move || {
                        let state: State<'_, RuntimeState> = app_handle.state();
                        stop_runtime(&state);
                        app_handle.exit(0);
                    });
                    return;
                }
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            // Tray must be set up on the main thread before the event loop starts.
            setup_tray(app)?;

            let app_handle = app.handle().clone();
            queue_portable_package_paths(&app_handle, std::env::args().skip(1));

            // Arm before any runtime child exists, so an interrupt at any point
            // during startup still tears the tree down.
            install_shutdown_signal_guard(app_handle.clone());

            // Spawn startup work on a background thread so the event loop can
            // start immediately and paint the splash screen.
            thread::spawn(move || {
                let state = app_handle.state::<RuntimeState>();
                let splash_start = Instant::now();

                let (api_port, web_port) = match start_runtime(&app_handle, &state) {
                    Ok(ports) => ports,
                    Err(_) => {
                        emit_log(&app_handle, "prism", "Startup failed. Check the service log.");
                        return;
                    }
                };

                if wait_for_api(api_port, &state, &app_handle).is_err() {
                    emit_log(&app_handle, "prism", "API readiness failed.");
                    return;
                }
                if wait_for_web(web_port, api_port, &state, &app_handle).is_err() {
                    emit_log(&app_handle, "prism", "Web readiness failed.");
                    return;
                }

                // Hold the splash for at least 2.5 s so it's visible on fast machines.
                const SPLASH_MIN_MS: u64 = 2500;
                let elapsed_ms = splash_start.elapsed().as_millis() as u64;
                if elapsed_ms < SPLASH_MIN_MS {
                    thread::sleep(Duration::from_millis(SPLASH_MIN_MS - elapsed_ms));
                }

                let web_url = match Url::parse(&format!("http://127.0.0.1:{web_port}")) {
                    Ok(url) => url,
                    Err(_) => {
                        emit_log(&app_handle, "prism", "The local web address was invalid.");
                        return;
                    }
                };

                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.navigate(web_url.clone());
                } else if WebviewWindowBuilder::new(
                    &app_handle,
                    "main",
                    WebviewUrl::External(web_url.clone()),
                )
                .title("PRISM")
                .inner_size(
                    PRISM_WINDOW_REFERENCE_WIDTH,
                    PRISM_WINDOW_REFERENCE_HEIGHT,
                )
                .min_inner_size(PRISM_WINDOW_MIN_WIDTH, PRISM_WINDOW_MIN_HEIGHT)
                .center()
                .prevent_overflow()
                .resizable(true)
                .maximizable(true)
                .fullscreen(false)
                .background_throttling(BackgroundThrottlingPolicy::Disabled)
                .initialization_script_for_all_frames(PRISM_DISABLE_NATIVE_TEXT_CORRECTION_SCRIPT)
                .build()
                .is_err()
                {
                    emit_log(&app_handle, "prism", "The workspace window could not open.");
                }
                emit_pending_portable_package_paths(&app_handle);
            });

            Ok(())
        })
        .build(tauri::generate_context!()) {
        Ok(app) => app,
        Err(_) => return,
    };

    app.run(|app_handle, event| match event {
        RunEvent::ExitRequested { .. } => {
            // An OS-level exit request is already distinct from the window
            // close event above. Always honor it and tear down owned services.
            mark_app_quitting(&app_handle);
            let state: State<'_, RuntimeState> = app_handle.state();
            stop_runtime(&state);
        }
        RunEvent::Exit => {
            let state: State<'_, RuntimeState> = app_handle.state();
            stop_runtime(&state);
        }
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => {
            queue_portable_package_paths(
                &app_handle,
                urls.into_iter().map(|url| url.to_string()),
            );
            show_main_window(&app_handle);
        }
        _ => {}
    });
}
