use std::collections::VecDeque;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use log::{Level, LevelFilter, Metadata, Record, SetLoggerError};

static LOGGER_STATE: OnceLock<AppLogger> = OnceLock::new();

pub struct AppLogger {
    log_file_path: PathBuf,
    file_writer: Mutex<Option<File>>,
    recent_logs: Mutex<VecDeque<String>>,
    max_memory_logs: usize,
}

impl AppLogger {
    pub fn new(log_dir: &Path) -> std::io::Result<Self> {
        fs::create_dir_all(log_dir)?;
        let log_file_path = log_dir.join("puntano.log");

        // Rotate if previous log file exceeds 10 MB
        if let Ok(metadata) = fs::metadata(&log_file_path) {
            if metadata.len() > 10 * 1024 * 1024 {
                let backup_path = log_dir.join("puntano.log.old");
                let _ = fs::rename(&log_file_path, backup_path);
            }
        }

        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_file_path)?;

        Ok(Self {
            log_file_path,
            file_writer: Mutex::new(Some(file)),
            recent_logs: Mutex::new(VecDeque::with_capacity(300)),
            max_memory_logs: 250,
        })
    }

    fn write_record(&self, timestamp: &str, level: &str, target: &str, message: &str) {
        let formatted = format!("{} [{:<5}] [{}] {}\n", timestamp, level, target, message);

        // 1. In-memory circular buffer
        if let Ok(mut buffer) = self.recent_logs.lock() {
            if buffer.len() >= self.max_memory_logs {
                buffer.pop_front();
            }
            buffer.push_back(formatted.trim_end().to_string());
        }

        // 2. Persistent file log
        if let Ok(mut writer_guard) = self.file_writer.lock() {
            if let Some(file) = writer_guard.as_mut() {
                let _ = file.write_all(formatted.as_bytes());
                let _ = file.flush();
            }
        }

        // 3. Stderr/Stdout for developer terminals
        #[cfg(debug_assertions)]
        {
            eprint!("{}", formatted);
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
        if let Ok(mut writer_guard) = self.file_writer.lock() {
            if let Some(file) = writer_guard.as_mut() {
                let _ = file.flush();
            }
        }
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
    log::info!("Puntano Media Library initialized. OS: {}, Arch: {}", std::env::consts::OS, std::env::consts::ARCH);
    log::info!("Log file path: {:?}", get_log_file_path());
    log::info!("============================================================");

    Ok(())
}

/// Retrieves the most recent log entries from the in-memory buffer.
pub fn get_recent_logs(limit: usize) -> Vec<String> {
    if let Some(logger) = LOGGER_STATE.get() {
        if let Ok(buffer) = logger.recent_logs.lock() {
            let start = if buffer.len() > limit {
                buffer.len() - limit
            } else {
                0
            };
            return buffer.range(start..).cloned().collect();
        }
    }
    Vec::new()
}

/// Returns the path to the current active log file.
pub fn get_log_file_path() -> Option<PathBuf> {
    LOGGER_STATE.get().map(|l| l.log_file_path.clone())
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
        let temp_dir = std::env::temp_dir().join(format!("puntano_log_test_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let logger = AppLogger::new(&temp_dir).expect("Should create AppLogger");

        logger.write_record("2026-10-13 12:00:00.000", "INFO", "test", "Hello logger test!");

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
}

