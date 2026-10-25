use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static TEMP_FILE_SEQ: AtomicU64 = AtomicU64::new(1);

pub struct ThumbnailCache {
    base_dir: PathBuf,
}

impl ThumbnailCache {
    pub fn new<P: AsRef<Path>>(base_dir: P) -> Self {
        let dir = base_dir.as_ref().join("thumbnails");
        if !dir.exists() {
            let _ = fs::create_dir_all(&dir);
        }
        Self { base_dir: dir }
    }

    /// Verifies that a cached thumbnail file exists on disk and is non-empty.
    /// Automatically cleans up any 0-byte leftover file from an interrupted write.
    pub fn is_valid_cached_file(path: &Path) -> bool {
        match fs::metadata(path) {
            Ok(meta) if meta.is_file() && meta.len() > 0 => true,
            Ok(meta) if meta.is_file() && meta.len() == 0 => {
                let _ = fs::remove_file(path);
                false
            }
            _ => false,
        }
    }

    /// Generates a unique sibling temporary path ending in `.jpg` for atomic rename writes.
    pub fn temp_path_for(dst_path: &Path) -> PathBuf {
        let seq = TEMP_FILE_SEQ.fetch_add(1, Ordering::Relaxed);
        let pid = std::process::id();
        let stem = dst_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("thumb");
        let parent = dst_path.parent().unwrap_or_else(|| Path::new("."));
        parent.join(format!(".{}.{}_{}.tmp.jpg", stem, pid, seq))
    }

    /// Resolves the absolute on-disk path for a thumbnail based on its file hash.
    /// Organizes files into 2-character hex prefix buckets (e.g. `thumbnails/a1/a1b2c3d4.jpg`)
    /// to avoid exceeding single-directory filesystem limits with 100k+ files.
    pub fn resolve_path(&self, file_hash: &str) -> PathBuf {
        let prefix = if file_hash.len() >= 2 {
            &file_hash[0..2]
        } else {
            "00"
        };

        let bucket_dir = self.base_dir.join(prefix);
        if !bucket_dir.exists() {
            let _ = fs::create_dir_all(&bucket_dir);
        }

        // Prefer existing non-empty .jpg or .webp if already present on disk
        let jpg_path = bucket_dir.join(format!("{}.jpg", file_hash));
        if Self::is_valid_cached_file(&jpg_path) {
            return jpg_path;
        }

        let webp_path = bucket_dir.join(format!("{}.webp", file_hash));
        if Self::is_valid_cached_file(&webp_path) {
            return webp_path;
        }

        jpg_path
    }

    /// Returns the relative path for database storage (e.g. `thumbnails/a1/a1b2c3d4.jpg`)
    pub fn get_relative_path(&self, file_hash: &str) -> String {
        let path = self.resolve_path(file_hash);
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("jpg");
        let prefix = if file_hash.len() >= 2 {
            &file_hash[0..2]
        } else {
            "00"
        };
        format!("thumbnails/{}/{}.{}", prefix, file_hash, ext)
    }

    /// Checks if a non-empty thumbnail is already generated on disk
    pub fn exists(&self, file_hash: &str) -> bool {
        Self::is_valid_cached_file(&self.resolve_path(file_hash))
    }

    pub fn get_base_dir(&self) -> &Path {
        &self.base_dir
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_path_and_buckets() {
        let temp_dir = std::env::temp_dir().join("puntano_test_cache_unit");
        let cache = ThumbnailCache::new(&temp_dir);

        let path = cache.resolve_path("a1b2c3d4e5f6");
        assert!(path.to_string_lossy().contains("a1"));
        assert!(path.to_string_lossy().ends_with("a1b2c3d4e5f6.jpg"));

        let rel = cache.get_relative_path("a1b2c3d4e5f6");
        assert_eq!(rel, "thumbnails/a1/a1b2c3d4e5f6.jpg");

        let short_rel = cache.get_relative_path("a");
        assert_eq!(short_rel, "thumbnails/00/a.jpg");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
