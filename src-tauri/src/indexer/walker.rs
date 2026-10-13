use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use walkdir::{DirEntry, WalkDir};

pub const SUPPORTED_EXTENSIONS: &[&str] = &[
    // Standard Photos
    "jpg", "jpeg", "png", "webp", "heic", "heif", "tiff", "tif", "avif",
    // RAW Photos
    "dng", "cr2", "cr3", "nef", "arw", "rw2", "orf", "raf",
    // Videos
    "mp4", "mov", "m4v", "mkv", "webm", "avi",
];

const IGNORED_DIRECTORIES: &[&str] = &[
    ".git", ".svn", "node_modules", "$recycle.bin", "system volume information",
    ".trash", ".trashes", "__macosx", ".cache", ".tmp",
    "$windows.~bt", "$winreagent", "config.msi", "recovery",
    // Common Windows junction / loop points
    "my pictures", "my music", "my videos", "application data", "local settings",
    "nethood", "printhood", "recent", "sendto", "start menu", "templates", "cookies",
];

#[derive(Debug, Clone)]
pub struct DiscoveredFile {
    pub path: PathBuf,
    pub file_name: String,
    pub directory: String,
    pub extension: String,
    pub file_size: i64,
    pub file_modified_at: i64,
    pub media_type: String,
    pub mime_type: String,
}

pub struct DirectoryWalker;

impl DirectoryWalker {
    /// Sanitizes path strings by trimming whitespace and quotation marks.
    pub fn sanitize_path<P: AsRef<Path>>(input: P) -> PathBuf {
        let path_str = input.as_ref().to_string_lossy().trim().to_string();
        let unquoted = path_str.trim_matches('"').trim_matches('\'').trim();
        PathBuf::from(unquoted)
    }

    /// Validates that the root path exists, is a directory, and has read access.
    pub fn validate_root_directory<P: AsRef<Path>>(root_dir: P) -> Result<PathBuf, String> {
        let path = Self::sanitize_path(root_dir);
        if !path.exists() {
            return Err(format!("Directory does not exist: '{}'", path.display()));
        }
        if !path.is_dir() {
            return Err(format!("Selected path is a file, not a directory: '{}'", path.display()));
        }
        match std::fs::read_dir(&path) {
            Ok(_) => Ok(path),
            Err(e) => Err(format!(
                "Cannot access directory '{}': {}. Please check folder read permissions.",
                path.display(),
                e
            )),
        }
    }

    /// Recursively discovers all media files with real-time discovery callbacks and cancellation support.
    pub fn walk_with_progress<P, F>(
        root_dir: P,
        cancel_token: Option<Arc<AtomicBool>>,
        mut progress_callback: F,
    ) -> Result<Vec<DiscoveredFile>, String>
    where
        P: AsRef<Path>,
        F: FnMut(&str, usize),
    {
        let valid_path = Self::validate_root_directory(root_dir)?;
        let valid_exts: HashSet<&str> = SUPPORTED_EXTENSIONS.iter().cloned().collect();
        let mut discovered = Vec::with_capacity(10000);

        log::info!(
            "Starting filesystem discovery on '{}' (max_depth: 32)",
            valid_path.display()
        );

        let walker = WalkDir::new(&valid_path)
            .follow_links(false)
            .max_depth(32)
            .into_iter()
            .filter_entry(|e| !Self::is_ignored_entry(e));

        let mut last_progress_report = Instant::now();

        for entry_res in walker {
            if let Some(ref cancel) = cancel_token {
                if cancel.load(Ordering::Relaxed) {
                    log::info!("Filesystem discovery cancelled by user.");
                    return Ok(discovered);
                }
            }

            let entry = match entry_res {
                Ok(e) => e,
                Err(err) => {
                    log::warn!("Directory discovery skipped inaccessible entry: {}", err);
                    continue;
                }
            };

            if !entry.file_type().is_file() {
                continue;
            }

            let path = entry.path();
            let ext = match path.extension().and_then(|s| s.to_str()) {
                Some(e) => e.to_lowercase(),
                None => continue,
            };

            if !valid_exts.contains(ext.as_str()) {
                continue;
            }

            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(err) => {
                    log::debug!(
                        "Skipping file with unreadable metadata '{}': {}",
                        path.display(),
                        err
                    );
                    continue;
                }
            };

            let file_size = metadata.len() as i64;
            let file_modified_at = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);

            let file_name = path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();

            let directory = path
                .parent()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();

            let (media_type, mime_type) = Self::classify_media(&ext);

            discovered.push(DiscoveredFile {
                path: path.to_path_buf(),
                file_name,
                directory: directory.clone(),
                extension: ext,
                file_size,
                file_modified_at,
                media_type,
                mime_type,
            });

            if last_progress_report.elapsed().as_millis() > 100 {
                progress_callback(&directory, discovered.len());
                last_progress_report = Instant::now();
            }
        }

        log::info!(
            "Filesystem discovery finished for '{}'. Discovered {} valid media files.",
            valid_path.display(),
            discovered.len()
        );

        Ok(discovered)
    }

    /// Recursively discovers all media files in a directory tree.
    /// Fast filtering skips known system/ignored directories before traversing them.
    pub fn walk<P: AsRef<Path>>(root_dir: P) -> Vec<DiscoveredFile> {
        Self::walk_with_progress(root_dir, None, |_, _| {}).unwrap_or_default()
    }

    fn is_ignored_entry(entry: &DirEntry) -> bool {
        let file_name = entry.file_name().to_string_lossy();
        if file_name.starts_with('.') && file_name.len() > 1 && file_name != ".git" {
            // hidden directories like .cache
            return true;
        }

        let is_name_ignored = IGNORED_DIRECTORIES
            .iter()
            .any(|&ignored| file_name.eq_ignore_ascii_case(ignored));
        if is_name_ignored {
            return true;
        }

        // On all platforms, prevent traversing directory symlinks to avoid symlink loops
        if entry.file_type().is_symlink() && entry.path().is_dir() {
            log::debug!(
                "Skipping symlinked directory to avoid cycle: {:?}",
                entry.path()
            );
            return true;
        }

        // On Windows, prevent traversing NTFS junctions / reparse points which can form infinite loops
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if entry.file_type().is_dir() {
                if let Ok(meta) = entry.metadata() {
                    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
                    if (meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT) != 0 {
                        log::debug!(
                            "Skipping Windows reparse point / junction: {:?}",
                            entry.path()
                        );
                        return true;
                    }
                }
            }
        }

        false
    }

    pub fn classify_media(ext: &str) -> (String, String) {
        match ext {
            "jpg" | "jpeg" => ("photo".into(), "image/jpeg".into()),
            "png" => ("photo".into(), "image/png".into()),
            "webp" => ("photo".into(), "image/webp".into()),
            "heic" | "heif" => ("photo".into(), "image/heic".into()),
            "tiff" | "tif" => ("photo".into(), "image/tiff".into()),
            "avif" => ("photo".into(), "image/avif".into()),
            "dng" => ("raw".into(), "image/x-adobe-dng".into()),
            "cr2" | "cr3" => ("raw".into(), "image/x-canon-cr2".into()),
            "nef" => ("raw".into(), "image/x-nikon-nef".into()),
            "arw" => ("raw".into(), "image/x-sony-arw".into()),
            "rw2" => ("raw".into(), "image/x-panasonic-rw2".into()),
            "orf" => ("raw".into(), "image/x-olympus-orf".into()),
            "raf" => ("raw".into(), "image/x-fuji-raf".into()),
            "mp4" => ("video".into(), "video/mp4".into()),
            "mov" => ("video".into(), "video/quicktime".into()),
            "m4v" => ("video".into(), "video/x-m4v".into()),
            "mkv" => ("video".into(), "video/x-matroska".into()),
            "webm" => ("video".into(), "video/webm".into()),
            "avi" => ("video".into(), "video/x-msvideo".into()),
            _ => ("photo".into(), "application/octet-stream".into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_media_types() {
        assert_eq!(
            DirectoryWalker::classify_media("jpg"),
            ("photo".into(), "image/jpeg".into())
        );
        assert_eq!(
            DirectoryWalker::classify_media("png"),
            ("photo".into(), "image/png".into())
        );
        assert_eq!(
            DirectoryWalker::classify_media("dng"),
            ("raw".into(), "image/x-adobe-dng".into())
        );
        assert_eq!(
            DirectoryWalker::classify_media("mp4"),
            ("video".into(), "video/mp4".into())
        );
        assert_eq!(
            DirectoryWalker::classify_media("mov"),
            ("video".into(), "video/quicktime".into())
        );
    }

    #[test]
    fn test_extension_support() {
        let valid: HashSet<&str> = SUPPORTED_EXTENSIONS.iter().cloned().collect();
        assert!(valid.contains("jpg"));
        assert!(valid.contains("heic"));
        assert!(valid.contains("arw"));
        assert!(valid.contains("mp4"));
        assert!(!valid.contains("exe"));
        assert!(!valid.contains("txt"));
    }

    #[test]
    fn test_sanitize_and_validate_path() {
        let sample = "  \"C:\\TestFolder\"  ";
        let sanitized = DirectoryWalker::sanitize_path(sample);
        assert_eq!(sanitized, PathBuf::from("C:\\TestFolder"));
    }
}
