use std::collections::{BTreeMap, HashSet};
use std::path::{Component, Path, PathBuf};
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
    "found.000", "found.001",
    // NAS, cloud-sync & photo manager internal cache/trash directories
    "@eadir", "@recycle", "#recycle", "#snapshot", "@sharebin",
    ".thumbnails", ".picasaoriginals", "_gsdata_",
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

    /// Canonicalizes an existing path to resolve exact filesystem casing, separators, and trailing slashes,
    /// stripping Windows extended-length verbatim prefixes (`\\?\`) for UI and Explorer compatibility.
    pub fn normalize_existing_path<P: AsRef<Path>>(input: P) -> PathBuf {
        let sanitized = Self::sanitize_path(input);
        let resolved = std::fs::canonicalize(&sanitized).unwrap_or(sanitized);
        Self::strip_verbatim_prefix(resolved)
    }

    pub fn strip_verbatim_prefix(path: PathBuf) -> PathBuf {
        let s = path.to_string_lossy();
        let cleaned = if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
            format!(r"\\{}", rest)
        } else if let Some(rest) = s.strip_prefix(r"\\?\") {
            rest.to_string()
        } else {
            s.into_owned()
        };

        // Strip trailing slash except on root paths like `D:\` or `/`
        let trimmed = if cleaned.len() > 3 && (cleaned.ends_with('\\') || cleaned.ends_with('/')) {
            cleaned.trim_end_matches(['\\', '/']).to_string()
        } else {
            cleaned
        };

        PathBuf::from(trimmed)
    }

    /// Validates that the root path exists, is a directory, and has read access, returning its normalized canonical path.
    pub fn validate_root_directory<P: AsRef<Path>>(root_dir: P) -> Result<PathBuf, String> {
        let raw_path = Self::sanitize_path(root_dir);
        if !raw_path.exists() {
            return Err(format!("Directory does not exist: '{}'", raw_path.display()));
        }
        if !raw_path.is_dir() {
            return Err(format!("Selected path is a file, not a directory: '{}'", raw_path.display()));
        }
        let path = Self::normalize_existing_path(&raw_path);
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
        let skipped_entries = std::sync::atomic::AtomicUsize::new(0);
        let mut skipped_empty_files: usize = 0;
        let mut skipped_inaccessible: usize = 0;
        let mut logged_inaccessible_warns: usize = 0;
        #[cfg_attr(not(target_os = "windows"), allow(unused_mut))]
        let mut cloud_placeholder_files: usize = 0;
        let mut ext_counts: BTreeMap<String, usize> = BTreeMap::new();

        log::info!(
            "Starting filesystem discovery on '{}' (max_depth: 32)",
            valid_path.display()
        );

        let walker = WalkDir::new(&valid_path)
            .follow_links(false)
            .max_depth(32)
            .into_iter()
            .filter_entry(|e| {
                let ignored = Self::is_ignored_entry(e);
                if ignored {
                    skipped_entries.fetch_add(1, Ordering::Relaxed);
                }
                !ignored
            });

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
                    skipped_inaccessible += 1;
                    if logged_inaccessible_warns < 5 {
                        log::warn!("Directory discovery skipped inaccessible entry: {}", err);
                        logged_inaccessible_warns += 1;
                    }
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
                    skipped_inaccessible += 1;
                    log::debug!(
                        "Skipping file with unreadable metadata '{}': {}",
                        path.display(),
                        err
                    );
                    continue;
                }
            };

            let file_size = metadata.len() as i64;
            if file_size <= 0 {
                skipped_empty_files += 1;
                continue;
            }

            #[cfg(target_os = "windows")]
            {
                use std::os::windows::fs::MetadataExt;
                // FILE_ATTRIBUTE_OFFLINE (0x1000) | FILE_ATTRIBUTE_RECALL_ON_OPEN (0x40000) | FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS (0x400000)
                const CLOUD_OR_OFFLINE_MASK: u32 = 0x0000_1000 | 0x0004_0000 | 0x0040_0000;
                if (metadata.file_attributes() & CLOUD_OR_OFFLINE_MASK) != 0 {
                    cloud_placeholder_files += 1;
                }
            }

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
            *ext_counts.entry(ext.clone()).or_insert(0) += 1;

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

        let ext_summary = if ext_counts.is_empty() {
            "none".to_string()
        } else {
            let mut pairs: Vec<_> = ext_counts.into_iter().collect();
            pairs.sort_by(|a, b| b.1.cmp(&a.1));
            pairs
                .into_iter()
                .map(|(k, v)| format!("{}: {}", k, v))
                .collect::<Vec<_>>()
                .join(", ")
        };

        log::info!(
            "Filesystem discovery finished for '{}'. Discovered {} valid media files ({}) | Skipped: {} hidden/system/ignored entries, {} empty (0B) files, {} inaccessible | Cloud/offline placeholders: {}.",
            valid_path.display(),
            discovered.len(),
            ext_summary,
            skipped_entries.load(Ordering::Relaxed),
            skipped_empty_files,
            skipped_inaccessible,
            cloud_placeholder_files
        );

        if cloud_placeholder_files > 0 {
            log::warn!(
                "Detected {} cloud-only / offline placeholder files under '{}' (e.g. Google Drive, OneDrive, or iCloud Files On-Demand). Reading headers or generating thumbnails may trigger on-demand cloud downloads and slow down indexing.",
                cloud_placeholder_files,
                valid_path.display()
            );
        }

        Ok(discovered)
    }

    /// Recursively discovers all media files in a directory tree.
    /// Fast filtering skips known system/ignored directories before traversing them.
    pub fn walk<P: AsRef<Path>>(root_dir: P) -> Vec<DiscoveredFile> {
        Self::walk_with_progress(root_dir, None, |_, _| {}).unwrap_or_default()
    }

    pub fn is_ignored_name(name: &str) -> bool {
        if name.starts_with('.') && name.len() > 1 {
            // Dot-prefixed hidden directories/files (.cache, .git, .thumbnails, macOS AppleDouble ._*)
            return true;
        }

        let lower = name.to_ascii_lowercase();
        if lower.ends_with(".lrdata") || lower.ends_with(".appledouble") {
            return true;
        }

        IGNORED_DIRECTORIES.iter().any(|&ignored| lower == ignored)
    }

    /// Checks whether an arbitrary path (e.g. from live filesystem watcher) resides inside an ignored,
    /// hidden, or system location and should be excluded from indexing.
    pub fn should_ignore_path(path: &Path) -> bool {
        for comp in path.components() {
            if let Component::Normal(os_str) = comp {
                let s = os_str.to_string_lossy();
                if Self::is_ignored_name(&s) {
                    return true;
                }
            }
        }

        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if let Ok(meta) = path.metadata() {
                // Only check non-root paths
                if path.parent().is_some() {
                    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x0002;
                    const FILE_ATTRIBUTE_SYSTEM: u32 = 0x0004;
                    if (meta.file_attributes() & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM)) != 0 {
                        return true;
                    }
                }
            }
        }

        false
    }

    fn is_ignored_entry(entry: &DirEntry) -> bool {
        // Never skip the user-selected root directory itself (e.g. drive roots like `D:\` carry HIDDEN|SYSTEM on Windows)
        if entry.depth() == 0 {
            return false;
        }

        let file_name = entry.file_name().to_string_lossy();
        if Self::is_ignored_name(&file_name) {
            return true;
        }

        // Prevent traversing symlinks on all platforms to avoid cycles and duplicate counting
        if entry.file_type().is_symlink() {
            log::debug!("Skipping symlink entry: {:?}", entry.path());
            return true;
        }

        // On Windows, skip hidden/system files & folders (matching Windows Explorer default behavior)
        // and prevent traversing NTFS junctions / reparse points which can form infinite loops
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if let Ok(meta) = entry.metadata() {
                const FILE_ATTRIBUTE_HIDDEN: u32 = 0x0002;
                const FILE_ATTRIBUTE_SYSTEM: u32 = 0x0004;
                const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;

                let attrs = meta.file_attributes();
                if (attrs & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM)) != 0 {
                    return true;
                }
                if entry.file_type().is_dir() && (attrs & FILE_ATTRIBUTE_REPARSE_POINT) != 0 {
                    log::debug!(
                        "Skipping Windows reparse point / junction: {:?}",
                        entry.path()
                    );
                    return true;
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

        let verbatim = DirectoryWalker::strip_verbatim_prefix(PathBuf::from(r"\\?\D:\Google Fotos\"));
        assert_eq!(verbatim, PathBuf::from(r"D:\Google Fotos"));

        let drive_root = DirectoryWalker::strip_verbatim_prefix(PathBuf::from(r"\\?\D:\"));
        assert_eq!(drive_root, PathBuf::from(r"D:\"));
    }

    #[test]
    fn test_ignored_auxiliary_and_empty_files() {
        assert!(DirectoryWalker::is_ignored_name("._IMG_0001.JPG"));
        assert!(DirectoryWalker::is_ignored_name("@eaDir"));
        assert!(DirectoryWalker::is_ignored_name("#recycle"));
        assert!(DirectoryWalker::is_ignored_name("Catalog Previews.lrdata"));
        assert!(!DirectoryWalker::is_ignored_name("Google Fotos"));

        let temp_root = std::env::temp_dir().join(format!(
            "puntano_walker_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let synology_dir = temp_root.join("@eaDir");
        let lrdata_dir = temp_root.join("Previews.lrdata");
        std::fs::create_dir_all(&synology_dir).unwrap();
        std::fs::create_dir_all(&lrdata_dir).unwrap();

        std::fs::write(temp_root.join("valid_photo.jpg"), b"non-empty-jpeg").unwrap();
        std::fs::write(temp_root.join("empty_stub.jpg"), b"").unwrap();
        std::fs::write(temp_root.join("._valid_photo.jpg"), b"apple-double").unwrap();
        std::fs::write(synology_dir.join("SYNOPHOTO_THUMB_XL.jpg"), b"thumb").unwrap();
        std::fs::write(lrdata_dir.join("pyramid_tile.jpg"), b"tile").unwrap();

        let found = DirectoryWalker::walk(&temp_root);
        let _ = std::fs::remove_dir_all(&temp_root);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].file_name, "valid_photo.jpg");
    }
}
