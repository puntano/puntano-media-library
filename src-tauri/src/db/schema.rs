pub const SCHEMA_SQL: &str = r#"
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;
PRAGMA foreign_keys = ON;
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 268435456;
PRAGMA page_size = 4096;

CREATE TABLE IF NOT EXISTS libraries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_scanned_at INTEGER,
    total_files INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS media_files (
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

-- R*Tree Spatial Virtual Table
CREATE VIRTUAL TABLE IF NOT EXISTS media_spatial_index USING rtree(
    id,
    min_lat, max_lat,
    min_lon, max_lon
);

-- Automated Synchronization Triggers
CREATE TRIGGER IF NOT EXISTS trg_media_insert_spatial
AFTER INSERT ON media_files
WHEN NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL
BEGIN
    INSERT INTO media_spatial_index (id, min_lat, max_lat, min_lon, max_lon)
    VALUES (NEW.id, NEW.latitude, NEW.latitude, NEW.longitude, NEW.longitude);
END;

CREATE TRIGGER IF NOT EXISTS trg_media_update_spatial
AFTER UPDATE OF latitude, longitude ON media_files
BEGIN
    DELETE FROM media_spatial_index WHERE id = OLD.id;
    INSERT INTO media_spatial_index (id, min_lat, max_lat, min_lon, max_lon)
    SELECT NEW.id, NEW.latitude, NEW.latitude, NEW.longitude, NEW.longitude
    WHERE NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL;
END;

CREATE TRIGGER IF NOT EXISTS trg_media_delete_spatial
AFTER DELETE ON media_files
BEGIN
    DELETE FROM media_spatial_index WHERE id = OLD.id;
END;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_media_captured_at 
ON media_files(captured_at DESC, id) 
WHERE captured_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_media_scan_lookup 
ON media_files(file_path, file_modified_at, file_size);

CREATE INDEX IF NOT EXISTS idx_media_hash 
ON media_files(file_hash);

CREATE INDEX IF NOT EXISTS idx_media_thumb_status 
ON media_files(thumbnail_status) 
WHERE thumbnail_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_media_geohash 
ON media_files(geohash) 
WHERE geohash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_media_directory 
ON media_files(directory);
"#;
