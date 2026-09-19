use rusqlite::{Connection, Result};
use std::path::Path;

use super::schema::SCHEMA_SQL;

pub struct DatabaseManager;

impl DatabaseManager {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Connection> {
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

    fn configure_connection(conn: &Connection) -> Result<()> {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA cache_size = -64000;
             PRAGMA foreign_keys = ON;
             PRAGMA temp_store = MEMORY;
             PRAGMA mmap_size = 268435456;
             PRAGMA page_size = 4096;",
        )?;
        Ok(())
    }

    pub fn apply_migrations(conn: &Connection) -> Result<()> {
        conn.execute_batch(SCHEMA_SQL)?;
        Ok(())
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
