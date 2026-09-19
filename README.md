# Puntano Media Library

[![Cross-Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-blue.svg)](https://github.com/puntano/puntano-media-library)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2.11-orange.svg)](https://v2.tauri.app)
[![React 19](https://img.shields.io/badge/React-19.3-61dafb.svg)](https://react.dev)
[![SQLite R*Tree](https://img.shields.io/badge/SQLite-R*Tree%20Spatial-003B57.svg)](https://sqlite.org/rtree.html)

**Puntano Media Library** is an ultra-high-performance cross-platform desktop application designed to index, query, and visualize massive local photo and video libraries (100,000+ files) across interactive **Map** and **Timeline** views without blocking the UI.

---

## Key Features

1. **🗺️ GPU-Accelerated Map View:** Geolocation of photos and videos using embedded GPS coordinates, featuring multi-level spatial clustering (`MapLibre GL` + `Supercluster`).
2. **📅 Chronological Timeline View:** Virtualized timeline grouping media by year, month, and day with sub-millisecond B-Tree queries.
3. **⚡ High-Throughput Indexing Pipeline:**
   - Multi-threaded recursive directory walker (`Rayon`).
   - Non-blocking header-only metadata parsing (EXIF/XMP for photos, QuickTime/ISO BMFF atoms for videos via `nom-exif`).
   - Transactional SQLite batch writes reaching **75,000+ inserts/sec** in WAL mode.
4. **📍 Native SQLite R\*Tree Spatial Indexing:** Sub-millisecond geographic bounding-box queries kept automatically synchronized via database triggers.
5. **🪟 Virtualized Grid View:** High-fps viewport rendering with zero-allocation DOM virtualization (`@tanstack/react-virtual`).

---

## 💾 Download & Installation

Pre-compiled production binaries for Windows (x64) are generated in the release bundle:

| Package Type | File | Description |
| :--- | :--- | :--- |
| **Setup Wizard (Recommended)** | `Puntano Media Library_0.1.0_x64-setup.exe` | Standard Windows NSIS installer with desktop shortcut and Start menu entry (~4.3 MB). |
| **Enterprise Installer** | `Puntano Media Library_0.1.0_x64_en-US.msi` | Windows Installer package suitable for unattended or enterprise deployments (~6.0 MB). |
| **Portable Executable** | `puntano-media-library.exe` | Standalone binary with embedded UI assets. Requires no installation—run directly from any folder or USB drive (~18.7 MB). |

### How to Install on Windows
1. Download the setup file (`.exe` or `.msi`).
2. Double-click the installer and follow the prompt instructions.
3. **Note on Windows SmartScreen:** Because this local build is self-signed, Windows SmartScreen may show a *"Windows protected your PC"* prompt on first launch. Click **"More info"** and then **"Run anyway"**.

### How to Share with Others
- **Option A (GitHub Releases):** Create a new release in your GitHub repository and upload the generated `.exe` and `.msi` files from `src-tauri/target/release/bundle/`.
- **Option B (Direct Sharing):** Send the `Puntano Media Library_0.1.0_x64-setup.exe` file directly via Google Drive, OneDrive, or USB stick. Recipients do not need Node.js, Rust, or C++ installed.

---

## Technical Stack & Version Target

| Layer | Technology | Latest Version | Role |
| :--- | :--- | :--- | :--- |
| **Desktop Runtime** | **Tauri v2** | `v2.11.x` | Native OS integration, system tray, zero-copy IPC |
| **Core Systems Engine** | **Rust** | `2021 / 2024` | Multi-threaded file I/O, Rayon scheduler, zero GC pauses |
| **Persistence & Spatial** | **SQLite3 + R\*Tree** | `rusqlite 0.32+` / SQLite 3.49 | WAL mode, 256MB mmap, O(log N) bounding-box spatial virtual table |
| **Metadata & Video Atoms**| **nom-exif** | `v3.8.x` | Zero-copy EXIF/XMP & MP4/MOV ISO 6709 coordinate parser |
| **UI Framework** | **React 19** + **TypeScript** | `v19.3.x` / `v5.8.x` | Modern reactive frontend |
| **Bundler** | **Vite** | `v6.x / v8.x` | Instant HMR development server |
| **Map Rendering** | **MapLibre GL** | `v6.10.x` | Hardware-accelerated WebGL 2 mapping engine |
| **Spatial Clustering** | **Supercluster** | `v9.1.x` | Hierarchical spatial index for 100k+ pins |
| **Virtualization** | **TanStack Virtual** | `v3.14.x` | 60/120 fps virtual scroll grid |
| **State Management** | **Zustand** | `v5.0.x` | Atomic high-velocity store |

---

## Repository Directory Structure

```
puntano-media-library/
├── .github/
│   └── workflows/
│       ├── build-windows.yml       # Windows x64 & ARM64 MSI / NSIS installer
│       └── build-macos.yml         # macOS Universal binary (.dmg / .app)
├── docs/
│   ├── architecture.md             # System architecture & thread pipeline
│   ├── database-schema.sql         # Production DDL schema with R*Tree & triggers
│   └── adr/                        # Architecture Decision Records
│       ├── 001-tauri-v2-stack.md
│       └── 002-sqlite-rtree-spatial.md
├── scripts/
│   └── benchmark-index.mjs         # Standalone test & benchmark harness
├── src-tauri/                      # Core Desktop & Systems Engine (Rust)
│   ├── src/
│   │   ├── commands/               # Tauri IPC commands (start_indexing, query_spatial_bbox)
│   │   ├── db/                     # SQLite connection, migrations, batch writer
│   │   ├── indexer/                # Work-stealing walker & multi-threaded pipeline
│   │   ├── metadata/               # Photo EXIF/XMP & Video QuickTime atom parsers
│   │   ├── models/                 # Domain structs and DTOs
│   │   ├── lib.rs                  # Tauri v2 builder and setup
│   │   └── main.rs                 # Native entry point
│   ├── Cargo.toml                  # Rust dependencies
│   ├── tauri.conf.json             # Tauri window, CSP, and bundle settings
│   └── build.rs
├── src/                            # Frontend UI (TypeScript + React 19)
│   ├── components/
│   │   ├── map/                    # MapLibre GL + Supercluster
│   │   ├── timeline/               # Chronological timeline view
│   │   ├── gallery/                # TanStack Virtualized photo grid
│   │   └── indexing/               # Indexing progress & folder picker
│   ├── services/                   # Tauri IPC client & mock fallbacks
│   ├── stores/                     # Zustand state management
│   ├── styles/                     # Dark mode & glassmorphism design system
│   ├── types/                      # TypeScript definitions matching Rust DTOs
│   ├── App.tsx
│   ├── main.tsx
│   └── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## Step-by-Step Developer Setup Guide

### 1. Prerequisites

#### For Windows:
1. **Node.js**: Install Node.js LTS (v22+) from [nodejs.org](https://nodejs.org) or via `winget`:
   ```powershell
   winget install OpenJS.NodeJS.LTS
   ```
2. **C++ Build Tools**: Install Visual Studio C++ Build Tools (included in Visual Studio Community with the "Desktop development with C++" workload):
   ```powershell
   winget install Microsoft.VisualStudio.2022.BuildTools --override "--passive --add Microsoft.VisualStudio.Workload.VCTools"
   ```
3. **Rust Toolchain**: Install `rustup` via winget or [rustup.rs](https://rustup.rs):
   ```powershell
   winget install Rustlang.Rustup
   ```
   After installation, ensure the toolchain is active:
   ```powershell
   rustup default stable-msvc
   ```
4. **WebView2**: Built into Windows 10 and 11 by default.

#### For macOS:
1. **Xcode Command Line Tools**:
   ```bash
   xcode-select --install
   ```
2. **Rust Toolchain**:
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
3. **Node.js**:
   ```bash
   brew install node
   ```

---

### 2. Installation & Verification

Clone the repository and install frontend dependencies:

```bash
git clone https://github.com/puntano/puntano-media-library.git
cd puntano-media-library
npm install
```

#### Run the Standalone Indexing & SQLite R\*Tree Benchmark:
You can verify the core indexing engine, SQLite DDL, spatial triggers, and chronological queries immediately using the built-in Node 22 verification harness:

```bash
npm run test:index
```

**Expected output:**
```
[1/5] Generating synthetic test media dataset...
  -> Created 540 sample media files across multiple folders.
[2/5] Initializing SQLite schema with R*Tree and WAL mode...
[3/5] Traversing directory and extracting metadata...
  -> Discovered 540 valid media files in 9.37 ms.
  -> Extracted metadata and computed hashes in 4.19 ms.
[4/5] Executing Batch Transactional Database Ingestion...
  -> Ingested 540 records in 6.97 ms (77,425 records/sec).
[5/5] Running verification queries...
  ✓ Total records in media_files: 540
  ✓ R*Tree spatial virtual table points synchronized: 360
  ✓ R*Tree Bounding Box Query [San Francisco Area]: returned 90 matching geotagged items.
  ✓ Chronological Timeline Query (Grouped by Month):
      • 2026-07: 180 items
      • 2025-07: 180 items
      • 2024-07: 180 items
```

---

### 3. Running in Development Mode

#### Option A: Web UI Fast-Development (Runs directly in your browser with mock IPC)
For rapid UI iteration with instant Hot Module Replacement (HMR):
```bash
npm run dev
```
Navigate to `http://localhost:5173`.

#### Option B: Full Native Desktop Application (Tauri v2)
Once the Rust toolchain is installed:
```bash
npm run tauri dev
```
This will compile the Rust backend, bind to the local SQLite database (`puntano.db` in your OS App Data directory), and launch the native desktop window.

---

### 4. Building Production Installers

To create optimized production bundles:

```bash
npm run tauri build
```

The build command outputs:
- **Windows Setup Wizard:** `src-tauri/target/release/bundle/nsis/Puntano Media Library_0.1.0_x64-setup.exe`
- **Windows MSI Installer:** `src-tauri/target/release/bundle/msi/Puntano Media Library_0.1.0_x64_en-US.msi`
- **Standalone Binary:** `src-tauri/target/release/puntano-media-library.exe`
- **macOS (when built on Mac):** `.dmg` disk image and `.app` bundle in `src-tauri/target/release/bundle/dmg/`

---

## Architectural Highlights

- **Zero-Copy EXIF & Atom Extraction:** The engine never loads full-resolution multi-megabyte images or gigabyte video files into RAM during indexing. Only the file header (first 64KB–512KB) is parsed.
- **Logarithmic Spatial Viewport Queries:** Bounding box queries use the SQLite R\*Tree module:
  ```sql
  SELECT m.id, m.latitude, m.longitude, m.file_path
  FROM media_spatial_index s
  JOIN media_files m ON s.id = m.id
  WHERE s.min_lat >= ?1 AND s.max_lat <= ?2
    AND s.min_lon >= ?3 AND s.max_lon <= ?4;
  ```
- **Automated Trigger Synchronization:** The `media_spatial_index` virtual table is kept 100% consistent with `media_files` via SQL triggers (`AFTER INSERT`, `AFTER UPDATE`, `AFTER DELETE`).
