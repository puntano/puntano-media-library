use std::fs;
use std::path::{Path, PathBuf};

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

    /// Resolves the absolute on-disk path for a thumbnail based on its file hash.
    /// Organizes files into 2-character hex prefix buckets (e.g. `thumbnails/a1/a1b2c3d4.webp`)
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

        bucket_dir.join(format!("{}.webp", file_hash))
    }

    /// Returns the relative path for database storage (e.g. `thumbnails/a1/a1b2c3d4.webp`)
    pub fn get_relative_path(&self, file_hash: &str) -> String {
        let prefix = if file_hash.len() >= 2 {
            &file_hash[0..2]
        } else {
            "00"
        };
        format!("thumbnails/{}/{}.webp", prefix, file_hash)
    }

    /// Checks if a thumbnail is already generated on disk
    pub fn exists(&self, file_hash: &str) -> bool {
        self.resolve_path(file_hash).exists()
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
        assert!(path.to_string_lossy().ends_with("a1b2c3d4e5f6.webp"));

        let rel = cache.get_relative_path("a1b2c3d4e5f6");
        assert_eq!(rel, "thumbnails/a1/a1b2c3d4e5f6.webp");

        let short_rel = cache.get_relative_path("a");
        assert_eq!(short_rel, "thumbnails/00/a.webp");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
