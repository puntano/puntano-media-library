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
        let conn = Connection::open(path)?;
        Self::configure_connection(&conn)?;
        Self::apply_migrations(&conn)?;
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
             PRAGMA page_size = 4096;",
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
        Ok(())
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

        // Verify idempotence: calling apply_migrations again should succeed
        DatabaseManager::apply_migrations(&conn)
            .expect("apply_migrations should be idempotent");
    }
}

