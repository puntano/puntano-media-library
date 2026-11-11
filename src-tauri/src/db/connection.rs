use rusqlite::{Connection, Result};
use std::path::Path;

use super::schema::{SCHEMA_INDEXES_AND_TRIGGERS_SQL, SCHEMA_TABLES_SQL};

pub struct DatabaseManager;

impl DatabaseManager {
    /// Opens an existing database connection with high-performance PRAGMAs configured.
    /// Does NOT re-run DDL migrations on every call, ensuring near-instant connection setup (<0.1ms) without schema locks.
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Connection> {
        let conn = Connection::open(path)?;
        Self::configure_connection(&conn)?;
        Ok(conn)
    }

    /// Opens the database and applies all schema tables, migrations, and indexes.
    /// Called once during application startup.
    pub fn open_and_migrate<P: AsRef<Path>>(path: P) -> Result<Connection> {
        let mut conn = Connection::open(path)?;
        Self::configure_connection(&conn)?;
        Self::apply_migrations(&conn)?;
        let _ = Self::repair_missing_captured_dates(&mut conn);
        let _ = conn.execute(
            "UPDATE media_files SET thumbnail_status = 'pending' WHERE media_type = 'video' AND (thumbnail_path LIKE '%.webp' OR thumbnail_path IS NULL);",
            [],
        );
        Ok(conn)
    }

    pub fn open_in_memory() -> Result<Connection> {
        let conn = Connection::open_in_memory()?;
        Self::configure_connection(&conn)?;
        Self::apply_migrations(&conn)?;
        Ok(conn)
    }

    pub fn configure_connection(conn: &Connection) -> Result<()> {
        let _ = conn.busy_timeout(std::time::Duration::from_secs(10));
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA busy_timeout = 10000;
             PRAGMA cache_size = -64000;
             PRAGMA foreign_keys = ON;
             PRAGMA temp_store = MEMORY;
             PRAGMA mmap_size = 268435456;
             PRAGMA page_size = 4096;
             PRAGMA threads = 4;",
        )?;
        Ok(())
    }

    pub fn apply_migrations(conn: &Connection) -> Result<()> {
        // 1. Ensure all base and collection tables exist
        conn.execute_batch(SCHEMA_TABLES_SQL)?;

        // 2. Safely apply column additions for existing legacy tables before creating dependent indexes
        Self::migrate_existing_columns(conn)?;

        // 3. Create triggers and indexes (which depend on the columns above)
        conn.execute_batch(SCHEMA_INDEXES_AND_TRIGGERS_SQL)?;

        Ok(())
    }

    fn migrate_existing_columns(conn: &Connection) -> Result<()> {
        if !Self::table_has_column(conn, "media_files", "is_favorite")? {
            conn.execute(
                "ALTER TABLE media_files ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;",
                [],
            )?;
        }
        if !Self::table_has_column(conn, "media_files", "rating")? {
            conn.execute(
                "ALTER TABLE media_files ADD COLUMN rating INTEGER NOT NULL DEFAULT 0;",
                [],
            )?;
        }
        if !Self::table_has_column(conn, "media_files", "face_scanned")? {
            conn.execute(
                "ALTER TABLE media_files ADD COLUMN face_scanned INTEGER NOT NULL DEFAULT 0;",
                [],
            )?;
        }
        Ok(())
    }

    /// Scans for media items where `captured_at IS NULL` and attempts to recover true capture
    /// dates from common filename conventions (e.g. WhatsApp, Android, Takeout, Screenshots).
    /// Updates all matching rows in a single atomic transaction.
    pub fn repair_missing_captured_dates(conn: &mut Connection) -> Result<usize> {
        let mut candidates = Vec::new();
        {
            let mut stmt = match conn.prepare(
                "SELECT id, file_name, file_path FROM media_files WHERE captured_at IS NULL;"
            ) {
                Ok(s) => s,
                Err(e) => {
                    log::warn!("[DatabaseManager] Could not prepare query for missing dates: {}", e);
                    return Ok(0);
                }
            };

            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })?;

            for item in rows.flatten() {
                candidates.push(item);
            }
        }

        if candidates.is_empty() {
            return Ok(0);
        }

        log::info!(
            "[DatabaseManager] Found {} records with NULL captured_at. Checking filenames and Takeout sidecars...",
            candidates.len()
        );

        let mut to_update = Vec::new();
        for (id, file_name, file_path) in candidates {
            if let Some((ts, local)) = crate::metadata::extract_date_from_filename(&file_name) {
                to_update.push((id, ts, local));
            } else if let Some((ts, local)) = crate::metadata::photo::try_parse_google_takeout_sidecar(&file_path) {
                to_update.push((id, ts, local));
            }
        }

        if to_update.is_empty() {
            log::info!("[DatabaseManager] No missing dates could be recovered from filenames or metadata sidecars.");
            return Ok(0);
        }

        let updated_count = to_update.len();
        let now = chrono::Utc::now().timestamp_millis();

        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "UPDATE media_files SET captured_at = ?1, captured_at_local = ?2, updated_at = ?3 WHERE id = ?4;"
            )?;

            for (id, ts, local) in to_update {
                stmt.execute(rusqlite::params![ts, local, now, id])?;
            }
        }
        tx.commit()?;

        log::info!(
            "[DatabaseManager] Successfully reparsed and restored capture dates for {} media items!",
            updated_count
        );

        Ok(updated_count)
    }

    pub fn table_has_column(conn: &Connection, table: &str, column: &str) -> Result<bool> {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({});", table))?;
        let mut rows = stmt.query([])?;
        while let Some(row) = rows.next()? {
            let col_name: String = row.get(1)?;
            if col_name.eq_ignore_ascii_case(column) {
                return Ok(true);
            }
        }
        Ok(false)
    }

    pub fn verify_rtree_support(conn: &Connection) -> Result<bool> {
        let mut stmt = conn.prepare("PRAGMA compile_options;")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for row in rows {
            if let Ok(opt) = row {
                if opt.contains("ENABLE_RTREE") {
                    return Ok(true);
                }
            }
        }
        // Fallback test: attempt querying the rtree virtual table
        let test = conn.execute("SELECT count(*) FROM media_spatial_index;", []);
        Ok(test.is_ok())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_migration_of_legacy_database_without_favorites_or_ratings() {
        let conn = Connection::open_in_memory().unwrap();
        DatabaseManager::configure_connection(&conn).unwrap();

        // Simulate legacy database schema (exact previous schema without is_favorite and rating)
        let legacy_schema = r#"
            CREATE TABLE libraries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL UNIQUE,
                is_active INTEGER NOT NULL DEFAULT 1,
                last_scanned_at INTEGER,
                total_files INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE media_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                library_id INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
                file_path TEXT NOT NULL UNIQUE,
                directory TEXT NOT NULL,
                file_name TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                file_modified_at INTEGER NOT NULL,
                file_hash TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                media_type TEXT NOT NULL,
                
                width INTEGER,
                height INTEGER,
                duration REAL,
                orientation INTEGER DEFAULT 1,
                
                captured_at INTEGER,
                captured_at_local TEXT,
                timezone_offset INTEGER,
                
                latitude REAL,
                longitude REAL,
                altitude REAL,
                geohash TEXT,
                
                camera_make TEXT,
                camera_model TEXT,
                lens_model TEXT,
                focal_length REAL,
                aperture REAL,
                iso INTEGER,
                exposure_time TEXT,
                
                thumbnail_path TEXT,
                thumbnail_status TEXT NOT NULL DEFAULT 'pending',
                
                indexed_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
        "#;
        conn.execute_batch(legacy_schema).unwrap();

        // Verify the legacy table has no is_favorite or rating columns
        assert!(!DatabaseManager::table_has_column(&conn, "media_files", "is_favorite").unwrap());
        assert!(!DatabaseManager::table_has_column(&conn, "media_files", "rating").unwrap());

        // Apply migrations on the existing legacy database
        DatabaseManager::apply_migrations(&conn)
            .expect("apply_migrations should succeed on existing database");

        // Verify columns were added
        assert!(DatabaseManager::table_has_column(&conn, "media_files", "is_favorite").unwrap());
        assert!(DatabaseManager::table_has_column(&conn, "media_files", "rating").unwrap());

        // Verify albums and tags tables were created
        assert!(DatabaseManager::table_has_column(&conn, "albums", "name").unwrap());
        assert!(DatabaseManager::table_has_column(&conn, "tags", "name").unwrap());
        assert!(DatabaseManager::table_has_column(&conn, "persons", "name").unwrap());
        assert!(DatabaseManager::table_has_column(&conn, "media_faces", "embedding").unwrap());
        assert!(DatabaseManager::table_has_column(&conn, "media_files", "face_scanned").unwrap());

        // Verify idempotence: calling apply_migrations again should succeed
        DatabaseManager::apply_migrations(&conn)
            .expect("apply_migrations should be idempotent");
    }

    #[test]
    fn test_repair_missing_captured_dates() {
        let mut conn = DatabaseManager::open_in_memory().unwrap();

        // Insert library
        conn.execute("INSERT INTO libraries (path, created_at) VALUES ('/test', 1000);", []).unwrap();

        // Insert media items: one with NULL captured_at and WhatsApp filename, one with IMG filename, one with random filename
        conn.execute(
            "INSERT INTO media_files (
                library_id, file_path, directory, file_name, file_size, file_modified_at,
                file_hash, mime_type, media_type, captured_at, indexed_at, updated_at
            ) VALUES (
                1, '/test/WhatsApp Image 2023-05-14 at 15.23.45.jpeg', '/test',
                'WhatsApp Image 2023-05-14 at 15.23.45.jpeg', 1000, 1720000000000,
                'hash1', 'image/jpeg', 'photo', NULL, 1000, 1000
            );",
            [],
        ).unwrap();

        conn.execute(
            "INSERT INTO media_files (
                library_id, file_path, directory, file_name, file_size, file_modified_at,
                file_hash, mime_type, media_type, captured_at, indexed_at, updated_at
            ) VALUES (
                1, '/test/IMG_20220820_103000.jpg', '/test',
                'IMG_20220820_103000.jpg', 1000, 1720000000000,
                'hash2', 'image/jpeg', 'photo', NULL, 1000, 1000
            );",
            [],
        ).unwrap();

        conn.execute(
            "INSERT INTO media_files (
                library_id, file_path, directory, file_name, file_size, file_modified_at,
                file_hash, mime_type, media_type, captured_at, indexed_at, updated_at
            ) VALUES (
                1, '/test/unparseable_photo.jpg', '/test',
                'unparseable_photo.jpg', 1000, 1720000000000,
                'hash3', 'image/jpeg', 'photo', NULL, 1000, 1000
            );",
            [],
        ).unwrap();

        let repaired = DatabaseManager::repair_missing_captured_dates(&mut conn).unwrap();
        assert_eq!(repaired, 2, "Expected 2 items to have their dates repaired from filename");

        // Verify dates in DB
        let row1: (Option<i64>, Option<String>) = conn.query_row(
            "SELECT captured_at, captured_at_local FROM media_files WHERE file_hash = 'hash1';",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap();
        assert!(row1.0.is_some());
        assert_eq!(row1.1.unwrap(), "2023-05-14 15:23:45");

        let row2: (Option<i64>, Option<String>) = conn.query_row(
            "SELECT captured_at, captured_at_local FROM media_files WHERE file_hash = 'hash2';",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap();
        assert!(row2.0.is_some());
        assert_eq!(row2.1.unwrap(), "2022-08-20 10:30:00");

        let row3: (Option<i64>, Option<String>) = conn.query_row(
            "SELECT captured_at, captured_at_local FROM media_files WHERE file_hash = 'hash3';",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap();
        assert!(row3.0.is_none());
    }
}

