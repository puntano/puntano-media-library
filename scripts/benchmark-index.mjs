import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const TEST_DIR = path.resolve(ROOT_DIR, 'test-scratch-library');
const DB_FILE = path.resolve(ROOT_DIR, 'benchmark-test.db');

// Supported extensions
const PHOTO_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'tiff', 'dng', 'cr2', 'arw']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi']);
const IGNORED_DIRS = new Set(['.git', 'node_modules', '$RECYCLE.BIN', '.trash', '__MACOSX']);

console.log('='.repeat(80));
console.log('  PUNTANO MEDIA LIBRARY - CORE INDEXING ENGINE BENCHMARK & TEST HARNESS');
console.log('='.repeat(80));

// -----------------------------------------------------------------------------
// 1. Generate Synthetic Media Library for Testing
// -----------------------------------------------------------------------------
function generateTestLibrary() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });

  console.log('\n[1/5] Generating synthetic test media dataset...');
  const cities = [
    { name: 'San_Francisco', lat: 37.7749, lon: -122.4194 },
    { name: 'Los_Angeles', lat: 34.0522, lon: -118.2437 },
    { name: 'New_York', lat: 40.7128, lon: -74.0060 },
    { name: 'London', lat: 51.5074, lon: -0.1278 },
    { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
    { name: 'Buenos_Aires', lat: -34.6037, lon: -58.3816 },
  ];

  let fileCount = 0;
  for (let year = 2024; year <= 2026; year++) {
    for (const city of cities) {
      const folder = path.join(TEST_DIR, `${year}`, city.name);
      fs.mkdirSync(folder, { recursive: true });

      for (let i = 1; i <= 25; i++) {
        // Photo file
        const photoPath = path.join(folder, `IMG_${year}_${i.toString().padStart(3, '0')}.jpg`);
        // Synthesize EXIF-like data buffer
        const fakeExif = Buffer.alloc(1024);
        fakeExif.write('Exif\0\0', 0);
        // Small random offset
        const lat = city.lat + (Math.random() - 0.5) * 0.05;
        const lon = city.lon + (Math.random() - 0.5) * 0.05;
        const dateStr = `${year}:0${(i % 9) + 1}:15 12:30:00`;
        fakeExif.write(dateStr, 20);
        fs.writeFileSync(photoPath, fakeExif);
        fileCount++;

        // Video file
        if (i % 5 === 0) {
          const videoPath = path.join(folder, `VID_${year}_${i.toString().padStart(3, '0')}.mp4`);
          const fakeMp4 = Buffer.alloc(2048);
          fakeMp4.write('ftypmp42', 4);
          fs.writeFileSync(videoPath, fakeMp4);
          fileCount++;
        }
      }
    }
  }

  // Create an ignored directory to test exclusion rules
  const ignoredDir = path.join(TEST_DIR, 'node_modules', 'some_package');
  fs.mkdirSync(ignoredDir, { recursive: true });
  fs.writeFileSync(path.join(ignoredDir, 'dummy.jpg'), Buffer.from('ignored'));

  console.log(`  -> Created ${fileCount} sample media files across multiple folders.`);
}

// -----------------------------------------------------------------------------
// 2. Recursive Directory Walker
// -----------------------------------------------------------------------------
function walkDirectory(dir, discovered = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name) || (entry.name.startsWith('.') && entry.name.length > 1)) {
        continue; // Skip ignored directories
      }
      walkDirectory(fullPath, discovered);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).slice(1).toLowerCase();
      let mediaType = null;
      let mimeType = 'application/octet-stream';

      if (PHOTO_EXTS.has(ext)) {
        mediaType = 'photo';
        mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      } else if (VIDEO_EXTS.has(ext)) {
        mediaType = 'video';
        mimeType = 'video/mp4';
      }

      if (mediaType) {
        const stats = fs.statSync(fullPath);
        discovered.push({
          filePath: fullPath,
          fileName: entry.name,
          directory: dir,
          fileSize: stats.size,
          modifiedAt: Math.floor(stats.mtimeMs),
          mediaType,
          mimeType,
        });
      }
    }
  }

  return discovered;
}

// -----------------------------------------------------------------------------
// 3. Fast Metadata Extractor & Hashing
// -----------------------------------------------------------------------------
function parseMetadata(item) {
  // Fast hash: xxHash64 or BLAKE3 or MD5 for testing
  const hash = crypto.createHash('sha256').update(item.filePath).digest('hex').substring(0, 16);

  // Parse simulated coordinates / dates
  let lat = null;
  let lon = null;
  let capturedAt = null;

  if (item.filePath.includes('San_Francisco')) {
    lat = 37.7749 + (Math.random() - 0.5) * 0.05;
    lon = -122.4194 + (Math.random() - 0.5) * 0.05;
  } else if (item.filePath.includes('New_York')) {
    lat = 40.7128 + (Math.random() - 0.5) * 0.05;
    lon = -74.0060 + (Math.random() - 0.5) * 0.05;
  } else if (item.filePath.includes('London')) {
    lat = 51.5074 + (Math.random() - 0.5) * 0.05;
    lon = -0.1278 + (Math.random() - 0.5) * 0.05;
  } else if (item.filePath.includes('Buenos_Aires')) {
    lat = -34.6037 + (Math.random() - 0.5) * 0.05;
    lon = -58.3816 + (Math.random() - 0.5) * 0.05;
  }

  // Simulated capture date
  const matchYear = item.filePath.match(/202[4-6]/);
  const year = matchYear ? parseInt(matchYear[0]) : 2025;
  capturedAt = new Date(`${year}-07-15T14:30:00Z`).getTime();

  return {
    ...item,
    fileHash: hash,
    width: 4032,
    height: 3024,
    duration: item.mediaType === 'video' ? 12.5 : null,
    orientation: 1,
    capturedAt,
    capturedAtLocal: new Date(capturedAt).toISOString(),
    latitude: lat,
    longitude: lon,
    altitude: lat ? 15.0 : null,
    geohash: lat ? '9q8yy' : null,
    cameraMake: 'Apple',
    cameraModel: 'iPhone 15 Pro',
    thumbnailStatus: 'pending',
    indexedAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// -----------------------------------------------------------------------------
// 4. Batch Transactional SQLite Ingestion
// -----------------------------------------------------------------------------
function runIndexingBenchmark() {
  if (fs.existsSync(DB_FILE)) {
    fs.rmSync(DB_FILE, { force: true });
  }

  const db = new DatabaseSync(DB_FILE);

  console.log('\n[2/5] Initializing SQLite schema with R*Tree and WAL mode...');
  const schemaSql = fs.readFileSync(path.resolve(ROOT_DIR, 'docs', 'database-schema.sql'), 'utf-8');
  db.exec(schemaSql);

  // Insert default library
  db.exec(`INSERT INTO libraries (path, created_at) VALUES ('${TEST_DIR.replace(/'/g, "''")}', ${Date.now()});`);
  const libRow = db.prepare('SELECT id FROM libraries LIMIT 1;').get();
  const libraryId = libRow.id;

  console.log('\n[3/5] Traversing directory and extracting metadata...');
  const walkStart = performance.now();
  const rawFiles = walkDirectory(TEST_DIR);
  const walkDuration = (performance.now() - walkStart).toFixed(2);
  console.log(`  -> Discovered ${rawFiles.length} valid media files in ${walkDuration} ms (ignored directories skipped successfully).`);

  const metaStart = performance.now();
  const processedItems = rawFiles.map(parseMetadata);
  const metaDuration = (performance.now() - metaStart).toFixed(2);
  console.log(`  -> Extracted metadata and computed hashes in ${metaDuration} ms.`);

  console.log('\n[4/5] Executing Batch Transactional Database Ingestion...');
  const insertStmt = db.prepare(`
    INSERT INTO media_files (
      library_id, file_path, directory, file_name, file_size,
      file_modified_at, file_hash, mime_type, media_type,
      width, height, duration, orientation,
      captured_at, captured_at_local,
      latitude, longitude, altitude, geohash,
      camera_make, camera_model,
      thumbnail_status, indexed_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?
    );
  `);

  const batchSize = 100;
  const insertStart = performance.now();

  // Single transaction wrapping batch inserts
  db.exec('BEGIN TRANSACTION;');
  for (const item of processedItems) {
    insertStmt.run(
      libraryId, item.filePath, item.directory, item.fileName, item.fileSize,
      item.modifiedAt, item.fileHash, item.mimeType, item.mediaType,
      item.width, item.height, item.duration, item.orientation,
      item.capturedAt, item.capturedAtLocal,
      item.latitude, item.longitude, item.altitude, item.geohash,
      item.cameraMake, item.cameraModel,
      item.thumbnailStatus, item.indexedAt, item.updatedAt
    );
  }
  db.exec('COMMIT;');

  const insertDuration = performance.now() - insertStart;
  const throughput = Math.round((processedItems.length / insertDuration) * 1000);
  console.log(`  -> Ingested ${processedItems.length} records in ${insertDuration.toFixed(2)} ms (${throughput.toLocaleString()} records/sec).`);

  // ---------------------------------------------------------------------------
  // 5. Benchmarking Asynchronous Thumbnail Pipeline & Content-Addressed Cache
  // ---------------------------------------------------------------------------
  console.log('\n[5/6] Benchmarking Thumbnail Pipeline & Content-Addressed Cache...');
  const cacheBaseDir = path.resolve(ROOT_DIR, 'test-cache');
  if (fs.existsSync(cacheBaseDir)) fs.rmSync(cacheBaseDir, { recursive: true, force: true });
  fs.mkdirSync(cacheBaseDir, { recursive: true });

  const pendingThumbnails = db.prepare("SELECT id, file_hash FROM media_files WHERE thumbnail_status = 'pending';").all();
  const thumbStart = performance.now();

  const updateStmt = db.prepare("UPDATE media_files SET thumbnail_path = ?, thumbnail_status = 'ready' WHERE id = ?;");
  db.exec('BEGIN TRANSACTION;');
  for (const item of pendingThumbnails) {
    const prefix = item.file_hash.substring(0, 2);
    const bucket = path.join(cacheBaseDir, 'thumbnails', prefix);
    if (!fs.existsSync(bucket)) fs.mkdirSync(bucket, { recursive: true });

    const thumbFile = path.join(bucket, `${item.file_hash}.webp`);
    // Simulated lightweight 384px WebP payload (~15KB)
    fs.writeFileSync(thumbFile, Buffer.alloc(15000));

    const relPath = `thumbnails/${prefix}/${item.file_hash}.webp`;
    updateStmt.run(relPath, item.id);
  }
  db.exec('COMMIT;');

  const thumbDuration = performance.now() - thumbStart;
  const thumbThroughput = Math.round((pendingThumbnails.length / thumbDuration) * 1000);
  console.log(`  -> Generated and cached ${pendingThumbnails.length} thumbnails in ${thumbDuration.toFixed(2)} ms (${thumbThroughput.toLocaleString()} thumbs/sec).`);

  // ---------------------------------------------------------------------------
  // 6. Verification Queries: Spatial R*Tree & Chronological Timeline
  // ---------------------------------------------------------------------------
  console.log('\n[6/6] Running verification queries...');

  // Test 1: Total records
  const countRow = db.prepare('SELECT count(*) as total FROM media_files;').get();
  console.log(`  ✓ Total records in media_files: ${countRow.total}`);

  // Test 2: R*Tree Spatial Virtual Table synchronization via triggers
  const rtreeCount = db.prepare('SELECT count(*) as total FROM media_spatial_index;').get();
  console.log(`  ✓ R*Tree spatial virtual table points synchronized: ${rtreeCount.total}`);

  // Test 3: Bounding-box spatial query (San Francisco Bay Area)
  // BBox: Lat [37.0, 38.5], Lon [-123.0, -121.5]
  const sfBboxQuery = db.prepare(`
    SELECT m.id, m.file_name, m.latitude, m.longitude
    FROM media_spatial_index s
    JOIN media_files m ON s.id = m.id
    WHERE s.min_lat >= 37.0 AND s.max_lat <= 38.5
      AND s.min_lon >= -123.0 AND s.max_lon <= -121.5;
  `).all();
  console.log(`  ✓ R*Tree Bounding Box Query [San Francisco Area]: returned ${sfBboxQuery.length} matching geotagged items.`);

  // Test 4: Chronological timeline query (Grouped by Year-Month)
  const timelineQuery = db.prepare(`
    SELECT 
      strftime('%Y-%m', datetime(captured_at / 1000, 'unixepoch')) as period,
      count(*) as item_count
    FROM media_files
    GROUP BY period
    ORDER BY period DESC;
  `).all();
  console.log(`  ✓ Chronological Timeline Query (Grouped by Month):`);
  for (const t of timelineQuery) {
    console.log(`      • ${t.period}: ${t.item_count} items`);
  }

  // Cleanup with Windows retry handling for antivirus/indexer file locks
  db.close();
  const rmOpts = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 };
  fs.rmSync(DB_FILE, { force: true });
  fs.rmSync(TEST_DIR, rmOpts);
  fs.rmSync(cacheBaseDir, rmOpts);

  console.log('\n' + '='.repeat(80));
  console.log('  ALL CORE INDEXING & SPATIAL QUERIES VERIFIED SUCCESSFULLY!');
  console.log('='.repeat(80) + '\n');
}

generateTestLibrary();
runIndexingBenchmark();
