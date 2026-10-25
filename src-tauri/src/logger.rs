use std::collections::VecDeque;
use std::fs::{self, File, OpenOptions};
use std::io::{BufWriter, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use log::{Level, LevelFilter, Metadata, Record, SetLoggerError};

static LOGGER_STATE: OnceLock<AppLogger> = OnceLock::new();

pub struct AppLogger {
    log_file_path: PathBuf,
    file_writer: Mutex<Option<BufWriter<File>>>,
    unflushed_lines: AtomicUsize,
    recent_logs: Mutex<VecDeque<String>>,
    sticky_alerts: Mutex<VecDeque<String>>,
    max_memory_logs: usize,
    max_sticky_alerts: usize,
}

impl AppLogger {
    pub fn new(log_dir: &Path) -> std::io::Result<Self> {
        fs::create_dir_all(log_dir)?;
        let log_file_path = log_dir.join("puntano.log");
        let backup_path = log_dir.join("puntano.log.old");

        // Rotate if previous log file exceeds 10 MB
        if let Ok(metadata) = fs::metadata(&log_file_path) {
            if metadata.len() > 10 * 1024 * 1024 {
                let _ = fs::rename(&log_file_path, &backup_path);
            }
        }

        // Seed in-memory buffers with the tail of the previous session log so crashes/restarts remain visible
        let max_memory_logs = 500;
        let max_sticky_alerts = 100;
        let mut seeded_logs = VecDeque::with_capacity(512);
        let mut seeded_alerts = VecDeque::with_capacity(128);

        let seed_source = if log_file_path.exists() {
            Some(log_file_path.as_path())
        } else if backup_path.exists() {
            Some(backup_path.as_path())
        } else {
            None
        };

        if let Some(src_path) = seed_source {
            for line in Self::read_tail_lines(src_path, 131_072, 200) {
                if Self::is_alert_line(&line) {
                    if seeded_alerts.len() >= 50 {
                        seeded_alerts.pop_front();
                    }
                    seeded_alerts.push_back(line.clone());
                }
                if seeded_logs.len() >= max_memory_logs {
                    seeded_logs.pop_front();
                }
                seeded_logs.push_back(line);
            }
        }

        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_file_path)?;

        Ok(Self {
            log_file_path,
            file_writer: Mutex::new(Some(BufWriter::with_capacity(8192, file))),
            unflushed_lines: AtomicUsize::new(0),
            recent_logs: Mutex::new(seeded_logs),
            sticky_alerts: Mutex::new(seeded_alerts),
            max_memory_logs,
            max_sticky_alerts,
        })
    }

    fn is_alert_line(line: &str) -> bool {
        line.contains("[WARN ") || line.contains("[ERROR") || line.contains("[FATAL")
    }

    fn read_tail_lines(path: &Path, max_bytes: u64, max_lines: usize) -> Vec<String> {
        let mut file = match File::open(path) {
            Ok(f) => f,
            Err(_) => return Vec::new(),
        };
        let len = match file.metadata().map(|m| m.len()) {
            Ok(l) if l > 0 => l,
            _ => return Vec::new(),
        };

        let seek_offset = len.saturating_sub(max_bytes);
        if file.seek(SeekFrom::Start(seek_offset)).is_err() {
            return Vec::new();
        }

        let mut buf = Vec::with_capacity((len - seek_offset) as usize);
        if file.read_to_end(&mut buf).is_err() {
            return Vec::new();
        }

        let text = String::from_utf8_lossy(&buf);
        let mut lines_iter = text.lines();
        // Discard potentially truncated first line if we seeked into the middle of the file
        if seek_offset > 0 {
            let _ = lines_iter.next();
        }

        let all_lines: Vec<String> = lines_iter
            .map(|l| l.trim_end().to_string())
            .filter(|l| !l.is_empty())
            .collect();

        let start = all_lines.len().saturating_sub(max_lines);
        all_lines[start..].to_vec()
    }

    fn write_record(&self, timestamp: &str, level: &str, target: &str, message: &str) {
        let formatted = format!("{} [{:<5}] [{}] {}\n", timestamp, level, target, message);
        let clean_line = formatted.trim_end().to_string();
        let is_urgent = matches!(level, "WARN" | "ERROR" | "FATAL");

        // 1. In-memory circular buffer
        if let Ok(mut buffer) = self.recent_logs.lock() {
            if buffer.len() >= self.max_memory_logs {
                buffer.pop_front();
            }
            buffer.push_back(clean_line.clone());
        }

        // 2. Sticky alert buffer (never evicted by routine INFO logs)
        if is_urgent {
            if let Ok(mut alerts) = self.sticky_alerts.lock() {
                if alerts.len() >= self.max_sticky_alerts {
                    alerts.pop_front();
                }
                alerts.push_back(clean_line);
            }
        }

        // 3. Persistent buffered file log (flushes immediately on WARN/ERROR/FATAL or every 16 lines)
        if let Ok(mut writer_guard) = self.file_writer.lock() {
            if let Some(writer) = writer_guard.as_mut() {
                let _ = writer.write_all(formatted.as_bytes());
                let pending = self.unflushed_lines.fetch_add(1, Ordering::Relaxed) + 1;
                if is_urgent || pending >= 16 {
                    let _ = writer.flush();
                    self.unflushed_lines.store(0, Ordering::Relaxed);
                }
            }
        }

        // 4. Stderr/Stdout for developer terminals
        #[cfg(debug_assertions)]
        {
            eprint!("{}", formatted);
        }
    }

    pub fn flush_now(&self) {
        if let Ok(mut writer_guard) = self.file_writer.lock() {
            if let Some(writer) = writer_guard.as_mut() {
                let _ = writer.flush();
                self.unflushed_lines.store(0, Ordering::Relaxed);
            }
        }
    }
}

impl log::Log for AppLogger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        metadata.level() <= Level::Debug
    }

    fn log(&self, record: &Record) {
        if self.enabled(record.metadata()) {
            let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
            let level_str = record.level().to_string();
            let target = record.target();
            let msg = record.args().to_string();
            self.write_record(&now, &level_str, target, &msg);
        }
    }

    fn flush(&self) {
        self.flush_now();
    }
}

/// Initializes the file logger and hooks into the standard Rust log facade.
pub fn init(log_dir: &Path) -> Result<(), SetLoggerError> {
    let logger = match AppLogger::new(log_dir) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[Puntano Logger] Failed to create log directory or file: {}", e);
            return Ok(());
        }
    };

    let _ = LOGGER_STATE.set(logger);
    if let Some(logger_ref) = LOGGER_STATE.get() {
        log::set_logger(logger_ref)?;
        log::set_max_level(LevelFilter::Info);
    }

    log::info!("============================================================");
    log::info!(
        "Puntano Media Library v{} initialized. OS: {}, Arch: {}",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH
    );
    log::info!("Log file path: {:?}", get_log_file_path());
    log::info!("============================================================");
    flush();

    Ok(())
}

/// Flushes buffered log lines to disk immediately.
pub fn flush() {
    if let Some(logger) = LOGGER_STATE.get() {
        logger.flush_now();
    }
}

/// Retrieves the most recent log entries from the in-memory buffer (including seeded tail from prior run).
pub fn get_recent_logs(limit: usize) -> Vec<String> {
    if let Some(logger) = LOGGER_STATE.get() {
        if let Ok(buffer) = logger.recent_logs.lock() {
            let start = buffer.len().saturating_sub(limit);
            return buffer.range(start..).cloned().collect();
        }
    }
    Vec::new()
}

/// Retrieves sticky WARN/ERROR/FATAL entries that are protected against eviction by INFO logs.
pub fn get_sticky_alerts(limit: usize) -> Vec<String> {
    if let Some(logger) = LOGGER_STATE.get() {
        if let Ok(alerts) = logger.sticky_alerts.lock() {
            let start = alerts.len().saturating_sub(limit);
            return alerts.range(start..).cloned().collect();
        }
    }
    Vec::new()
}

/// Returns the path to the current active log file.
pub fn get_log_file_path() -> Option<PathBuf> {
    LOGGER_STATE.get().map(|l| l.log_file_path.clone())
}

/// Records an uncaught frontend / WebView error or warning into the persistent log and sticky alerts.
pub fn log_frontend(level: &str, source: &str, message: &str) {
    if let Some(logger) = LOGGER_STATE.get() {
        let normalized_level = match level.to_ascii_uppercase().as_str() {
            "FATAL" => "FATAL",
            "ERROR" => "ERROR",
            "WARN" | "WARNING" => "WARN",
            _ => "INFO",
        };
        let sanitized_source: String = source
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | ':' | '.'))
            .take(48)
            .collect();
        let target = if sanitized_source.is_empty() {
            "webview".to_string()
        } else {
            format!("webview::{}", sanitized_source)
        };
        let truncated_msg: String = message.chars().take(2000).collect();
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
        logger.write_record(&now, normalized_level, &target, &truncated_msg);
    }
}

/// Directly appends a panic message to the log file even during unwinding or crashes.
pub fn log_panic(panic_msg: &str) {
    if let Some(logger) = LOGGER_STATE.get() {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
        logger.write_record(&now, "FATAL", "panic_handler", panic_msg);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_logger_file_and_memory_buffer() {
        let temp_dir = std::env::temp_dir().join(format!(
            "puntano_log_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let logger = AppLogger::new(&temp_dir).expect("Should create AppLogger");

        logger.write_record("2026-10-13 12:00:00.000", "INFO", "test", "Hello logger test!");
        logger.flush_now();

        // Check buffer
        let buf = logger.recent_logs.lock().unwrap();
        assert_eq!(buf.len(), 1);
        assert!(buf[0].contains("Hello logger test!"));

        // Check file content
        drop(buf);
        let log_file = temp_dir.join("puntano.log");
        assert!(log_file.exists());
        let content = std::fs::read_to_string(&log_file).unwrap();
        assert!(content.contains("[INFO ] [test] Hello logger test!"));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_logger_seeds_previous_session_and_retains_sticky_alerts() {
        let temp_dir = std::env::temp_dir().join(format!(
            "puntano_log_seed_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        {
            let first_session = AppLogger::new(&temp_dir).unwrap();
            first_session.write_record(
                "2026-10-25 13:51:15.835",
                "FATAL",
                "panic_handler",
                "Simulated crash from previous session",
            );
            first_session.write_record("2026-10-25 13:51:16.000", "INFO", "indexer", "Prior run finished");
            first_session.flush_now();
        }

        // Second session opens the same directory and must recover both tail logs and sticky alerts
        let second_session = AppLogger::new(&temp_dir).unwrap();
        // Flood 600 INFO lines to evict the main ring buffer
        for i in 0..600 {
            second_session.write_record("2026-10-25 14:00:00.000", "INFO", "worker", &format!("Routine line {}", i));
        }

        let alerts = second_session.sticky_alerts.lock().unwrap();
        assert!(
            alerts.iter().any(|l| l.contains("Simulated crash from previous session")),
            "Sticky alerts must preserve FATAL/ERROR records across restarts and INFO floods"
        );
        drop(alerts);
        drop(second_session);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}

