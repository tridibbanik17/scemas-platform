use crate::{CliError, exit_code_string, spawn_engine, terminate_child};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitStatus;
use std::time::{Duration, SystemTime};
use tokio::process::Child;

const ENGINE_RELOAD_INTERVAL: Duration = Duration::from_millis(750);

pub(crate) enum EngineRuntime {
    Direct(Child),
    Reloading(ReloadingEngine),
}

impl EngineRuntime {
    pub(crate) fn spawn(root: &Path, reload: bool) -> Result<Self, CliError> {
        if reload {
            Ok(Self::Reloading(ReloadingEngine::spawn(root)?))
        } else {
            Ok(Self::Direct(spawn_engine(root)?))
        }
    }

    pub(crate) async fn wait(&mut self) -> Result<ExitStatus, CliError> {
        match self {
            Self::Direct(child) => Ok(child.wait().await?),
            Self::Reloading(engine) => engine.wait().await,
        }
    }

    pub(crate) async fn terminate(&mut self) -> Result<(), CliError> {
        match self {
            Self::Direct(child) => terminate_child(child).await,
            Self::Reloading(engine) => engine.terminate().await,
        }
    }
}

pub(crate) struct ReloadingEngine {
    root: PathBuf,
    child: Option<Child>,
    watcher: ReloadWatcher,
}

impl ReloadingEngine {
    fn spawn(root: &Path) -> Result<Self, CliError> {
        let watcher = ReloadWatcher::for_engine(root)?;
        tracing::info!(
            target: "scemas::reload",
            interval_ms = ENGINE_RELOAD_INTERVAL.as_millis(),
            watched_roots = ?watcher.watched_roots(),
            "engine reload enabled"
        );

        Ok(Self {
            root: root.to_path_buf(),
            child: Some(spawn_engine(root)?),
            watcher,
        })
    }

    async fn wait(&mut self) -> Result<ExitStatus, CliError> {
        loop {
            if let Some(child) = &mut self.child {
                tokio::select! {
                    status = child.wait() => {
                        let status = status?;
                        let exit = exit_code_string(&status);
                        if status.success() {
                            tracing::info!(
                                target: "scemas::reload",
                                exit,
                                "scemas-server exited, waiting for changes to restart"
                            );
                        } else {
                            tracing::warn!(
                                target: "scemas::reload",
                                exit,
                                "scemas-server exited, waiting for changes to restart"
                            );
                        }
                        self.child = None;
                    }
                    _ = tokio::time::sleep(self.watcher.poll_interval()) => {}
                }
            } else {
                tokio::time::sleep(self.watcher.poll_interval()).await;
            }

            if let Some(changed_path) = self.watcher.take_change()? {
                self.restart(changed_path).await?;
            }
        }
    }

    async fn terminate(&mut self) -> Result<(), CliError> {
        if let Some(mut child) = self.child.take() {
            terminate_child(&mut child).await?;
        }
        Ok(())
    }

    async fn restart(&mut self, changed_path: PathBuf) -> Result<(), CliError> {
        let restart_action = if self.child.is_some() {
            "restarting"
        } else {
            "starting"
        };

        tracing::info!(
            target: "scemas::reload",
            changed_path = %changed_path.display(),
            restart_action,
            "source changed"
        );

        if let Some(mut child) = self.child.take() {
            terminate_child(&mut child).await?;
        }

        self.child = Some(spawn_engine(&self.root)?);
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct FileFingerprint {
    modified: Option<SystemTime>,
    len: u64,
}

struct ReloadWatcher {
    roots: Vec<PathBuf>,
    poll_interval: Duration,
    snapshot: BTreeMap<PathBuf, FileFingerprint>,
}

impl ReloadWatcher {
    fn for_engine(root: &Path) -> Result<Self, CliError> {
        Self::new(
            vec![
                root.join("crates"),
                root.join("data"),
                root.join("Cargo.toml"),
                root.join("Cargo.lock"),
                root.join(".env"),
            ],
            ENGINE_RELOAD_INTERVAL,
        )
    }

    fn new(roots: Vec<PathBuf>, poll_interval: Duration) -> Result<Self, CliError> {
        let snapshot = collect_snapshot(&roots)?;
        Ok(Self {
            roots,
            poll_interval,
            snapshot,
        })
    }

    fn poll_interval(&self) -> Duration {
        self.poll_interval
    }

    fn watched_roots(&self) -> &[PathBuf] {
        self.roots.as_slice()
    }

    fn take_change(&mut self) -> Result<Option<PathBuf>, CliError> {
        let current = collect_snapshot(&self.roots)?;
        let changed_path = detect_change(&self.snapshot, &current);
        self.snapshot = current;
        Ok(changed_path)
    }
}

fn collect_snapshot(roots: &[PathBuf]) -> Result<BTreeMap<PathBuf, FileFingerprint>, CliError> {
    let mut snapshot = BTreeMap::new();

    for root in roots {
        collect_path(root, &mut snapshot)?;
    }

    Ok(snapshot)
}

fn collect_path(
    path: &Path,
    snapshot: &mut BTreeMap<PathBuf, FileFingerprint>,
) -> Result<(), CliError> {
    if !path.exists() {
        return Ok(());
    }

    let metadata = fs::metadata(path)?;
    if metadata.is_dir() {
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            collect_path(&entry.path(), snapshot)?;
        }
        return Ok(());
    }

    if metadata.is_file() && should_track(path) {
        snapshot.insert(
            path.to_path_buf(),
            FileFingerprint {
                modified: metadata.modified().ok(),
                len: metadata.len(),
            },
        );
    }

    Ok(())
}

fn should_track(path: &Path) -> bool {
    if let Some(file_name) = path.file_name().and_then(|name| name.to_str())
        && matches!(file_name, "Cargo.toml" | "Cargo.lock" | ".env")
    {
        return true;
    }

    matches!(
        path.extension().and_then(|extension| extension.to_str()),
        Some("rs" | "toml" | "json" | "lock")
    )
}

fn detect_change(
    previous: &BTreeMap<PathBuf, FileFingerprint>,
    current: &BTreeMap<PathBuf, FileFingerprint>,
) -> Option<PathBuf> {
    for (path, fingerprint) in current {
        match previous.get(path) {
            Some(existing) if existing == fingerprint => {}
            _ => return Some(path.clone()),
        }
    }

    previous
        .keys()
        .find(|path| !current.contains_key(*path))
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::{ReloadWatcher, should_track};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    #[test]
    fn watcher_detects_added_tracked_file() {
        let temp_dir = create_temp_dir();
        let mut watcher = ReloadWatcher::new(vec![temp_dir.clone()], Duration::from_millis(10))
            .expect("watcher should initialize");

        fs::write(temp_dir.join("engine.rs"), "fn main() {}\n").expect("tracked file should write");

        let changed = watcher.take_change().expect("watcher should poll");

        assert_eq!(changed, Some(temp_dir.join("engine.rs")));
        fs::remove_dir_all(temp_dir).expect("temp dir should be removed");
    }

    #[test]
    fn watcher_ignores_untracked_extensions() {
        let temp_dir = create_temp_dir();
        let mut watcher = ReloadWatcher::new(vec![temp_dir.clone()], Duration::from_millis(10))
            .expect("watcher should initialize");

        fs::write(temp_dir.join("notes.txt"), "not a watched file\n")
            .expect("text file should write");

        let changed = watcher.take_change().expect("watcher should poll");

        assert_eq!(changed, None);
        assert!(should_track(&PathBuf::from("Cargo.toml")));
        fs::remove_dir_all(temp_dir).expect("temp dir should be removed");
    }

    fn create_temp_dir() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "scemas-cli-reload-test-{}-{}",
            std::process::id(),
            unique
        ));
        fs::create_dir_all(&path).expect("temp dir should be created");
        path
    }
}
