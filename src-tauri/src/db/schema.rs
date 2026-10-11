macro_rules! tables_sql {
    () => {
        r#"
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
    updated_at INTEGER NOT NULL,

    -- User Curation: Favorites & Star Ratings
    is_favorite INTEGER NOT NULL DEFAULT 0,
    rating INTEGER NOT NULL DEFAULT 0
);

-- R*Tree Spatial Virtual Table
CREATE VIRTUAL TABLE IF NOT EXISTS media_spatial_index USING rtree(
    id,
    min_lat, max_lat,
    min_lon, max_lon
);

-- Albums & Collections
CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    cover_media_id INTEGER REFERENCES media_files(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS album_media (
    album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    media_id INTEGER NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (album_id, media_id)
);

-- Media Tags
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#3b82f6'
);

CREATE TABLE IF NOT EXISTS media_tags (
    media_id INTEGER NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (media_id, tag_id)
);
"#
    };
}

macro_rules! indexes_and_triggers_sql {
    () => {
        r#"
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

CREATE INDEX IF NOT EXISTS idx_media_favorite 
ON media_files(is_favorite) 
WHERE is_favorite = 1;

CREATE INDEX IF NOT EXISTS idx_media_rating 
ON media_files(rating) 
WHERE rating > 0;

CREATE INDEX IF NOT EXISTS idx_album_media_album 
ON album_media(album_id);

CREATE INDEX IF NOT EXISTS idx_album_media_media 
ON album_media(media_id);

CREATE INDEX IF NOT EXISTS idx_media_tags_media 
ON media_tags(media_id);

CREATE INDEX IF NOT EXISTS idx_media_tags_tag 
ON media_tags(tag_id);
"#
    };
}

pub const SCHEMA_TABLES_SQL: &str = tables_sql!();
pub const SCHEMA_INDEXES_AND_TRIGGERS_SQL: &str = indexes_and_triggers_sql!();
pub const SCHEMA_SQL: &str = concat!(tables_sql!(), "\n", indexes_and_triggers_sql!());

