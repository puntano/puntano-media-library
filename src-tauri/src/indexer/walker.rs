use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::{DirEntry, WalkDir};

const SUPPORTED_EXTENSIONS: &[&str] = &[
    // Standard Photos
    "jpg", "jpeg", "png", "webp", "heic", "heif", "tiff", "tif", "avif",
    // RAW Photos
    "dng", "cr2", "cr3", "nef", "arw", "rw2", "orf", "raf",
    // Videos
    "mp4", "mov", "m4v", "mkv", "webm", "avi",
];

const IGNORED_DIRECTORIES: &[&str] = &[
    ".git", ".svn", "node_modules", "$RECYCLE.BIN", "System Volume Information",
    ".Trash", ".Trashes", "__MACOSX", ".cache", ".tmp",
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
    /// Recursively discovers all media files in a directory tree.
    /// Fast filtering skips known system/ignored directories before traversing them.
    pub fn walk<P: AsRef<Path>>(root_dir: P) -> Vec<DiscoveredFile> {
        let valid_exts: HashSet<&str> = SUPPORTED_EXTENSIONS.iter().cloned().collect();
        let mut discovered = Vec::with_capacity(10000);

        let walker = WalkDir::new(root_dir)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| !Self::is_ignored_entry(e));

        for entry in walker.filter_map(|e| e.ok()) {
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
                Err(_) => continue,
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
                directory,
                extension: ext,
                file_size,
                file_modified_at,
                media_type,
                mime_type,
            });
        }

        discovered
    }

    fn is_ignored_entry(entry: &DirEntry) -> bool {
        let file_name = entry.file_name().to_string_lossy();
        if file_name.starts_with('.') && file_name.len() > 1 && file_name != ".git" {
            // hidden directories like .cache
            return true;
        }

        IGNORED_DIRECTORIES.iter().any(|&ignored| file_name.eq_ignore_ascii_case(ignored))
    }

    fn classify_media(ext: &str) -> (String, String) {
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
            "mp4" => ("video".into(), "video/mp4".into()),
            "mov" => ("video".into(), "video/quicktime".into()),
            "m4v" => ("video".into(), "video/x-m4v".into()),
            "mkv" => ("video".into(), "video/x-matroska".into()),
            "webm" => ("video".into(), "video/webm".into()),
            _ => ("photo".into(), "application/octet-stream".into()),
        }
    }
}
