-- ==============================================================================
-- Puntano Media Library - Production Database Schema (SQLite 3.40+)
-- Optimized for high-throughput batch ingestion and sub-millisecond queries.
-- Features:
--   1. SQLite R*Tree virtual table for logarithmic O(log N) bounding-box queries.
--   2. Inverted chronological indexes for smooth timeline virtualization.
--   3. WAL (Write-Ahead Logging) mode and memory cache tuning.
--   4. Automatic synchronization triggers between media_files and spatial index.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. High-Performance Runtime PRAGMAs
-- ------------------------------------------------------------------------------
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;         -- 64MB memory cache allocation
PRAGMA foreign_keys = ON;
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 268435456;       -- 256MB memory-mapped I/O
PRAGMA page_size = 4096;

-- ------------------------------------------------------------------------------
-- 2. Library Roots Table
-- Stores user-registered library folders (e.g. Pictures, External SSDs)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS libraries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_scanned_at INTEGER,                    -- Epoch ms
    total_files INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL                 -- Epoch ms
);

-- ------------------------------------------------------------------------------
-- 3. Media Files Table
-- Comprehensive metadata storage for photos, videos, and raw images.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    library_id INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL UNIQUE,
    directory TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,                 -- Bytes
    file_modified_at INTEGER NOT NULL,          -- mtime Epoch ms (for incremental scans)
    file_hash TEXT NOT NULL,                    -- xxHash64 / BLAKE3 for duplicate detection
    mime_type TEXT NOT NULL,                    -- 'image/jpeg', 'video/mp4', 'image/heic', etc.
    media_type TEXT NOT NULL,                   -- 'photo' | 'video' | 'raw'
    
    -- Pixel Dimensions & Duration
    width INTEGER,
    height INTEGER,
    duration REAL,                              -- Duration in seconds (videos only, NULL for photos)
    orientation INTEGER DEFAULT 1,              -- EXIF Orientation tag (1-8)
    
    -- Chronological Timestamps
    captured_at INTEGER,                        -- UTC epoch timestamp in milliseconds
    captured_at_local TEXT,                     -- ISO-8601 string representation with camera timezone
    timezone_offset INTEGER,                    -- Timezone offset in minutes
    
    -- Geolocation Coordinates (WGS84)
    latitude REAL,                              -- Float: -90.0 to 90.0
    longitude REAL,                             -- Float: -180.0 to 180.0
    altitude REAL,                              -- Altitude in meters above sea level
    geohash TEXT,                               -- 7-char geohash for coarse aggregation
    
    -- Camera & Lens EXIF Details
    camera_make TEXT,
    camera_model TEXT,
    lens_model TEXT,
    focal_length REAL,
    aperture REAL,
    iso INTEGER,
    exposure_time TEXT,
    
    -- Local Cache & Thumbnail Status
    thumbnail_path TEXT,                        -- Relative path in app cache directory
    thumbnail_status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'ready' | 'failed' | 'skipped'
    
    indexed_at INTEGER NOT NULL,                -- Epoch ms
    updated_at INTEGER NOT NULL                 -- Epoch ms
);

-- ------------------------------------------------------------------------------
-- 4. SQLite R*Tree Spatial Virtual Table
-- Enables 2D spatial bounding-box indexing with logarithmic complexity.
-- Columns: (id, min_lat, max_lat, min_lon, max_lon)
-- ------------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS media_spatial_index USING rtree(
    id,                                         -- References media_files.id
    min_lat, max_lat,                           -- Latitude bounds
    min_lon, max_lon                            -- Longitude bounds
);

-- ------------------------------------------------------------------------------
-- 5. Automatic Synchronization Triggers for R*Tree
-- Ensures that inserting, updating, or deleting media automatically keeps
-- the spatial index 100% consistent without application-level overhead.
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 6. Performance B-Tree Indexes
-- ------------------------------------------------------------------------------

-- Fast Chronological Queries (Timeline View)
CREATE INDEX IF NOT EXISTS idx_media_captured_at 
ON media_files(captured_at DESC, id) 
WHERE captured_at IS NOT NULL;

-- Fast Incremental Scan Checking (Skips reading unchanged files)
CREATE INDEX IF NOT EXISTS idx_media_scan_lookup 
ON media_files(file_path, file_modified_at, file_size);

-- Fast Duplicate Detection
CREATE INDEX IF NOT EXISTS idx_media_hash 
ON media_files(file_hash);

-- Fast Thumbnail Worker Queue
CREATE INDEX IF NOT EXISTS idx_media_thumb_status 
ON media_files(thumbnail_status) 
WHERE thumbnail_status = 'pending';

-- Fast Coarse Zoom-Level Clustering via Geohash
CREATE INDEX IF NOT EXISTS idx_media_geohash 
ON media_files(geohash) 
WHERE geohash IS NOT NULL;

-- Directory grouping index
CREATE INDEX IF NOT EXISTS idx_media_directory
ON media_files(directory);
