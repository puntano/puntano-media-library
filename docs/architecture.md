# Puntano Media Library - Architectural Specification

## 1. Executive Overview

**Puntano Media Library** is an ultra-high-performance cross-platform desktop application designed to index, query, and visualize massive local photo and video libraries (100,000+ items).

The architecture is built around two primary visual paradigms:
1. **Interactive Spatial Map View:** Hardware-accelerated map rendering with dynamic multi-level marker clustering (`supercluster` / MapLibre GL).
2. **Chronological Timeline View:** Virtualized timeline grouped seamlessly by year, month, and day.

---

## 2. System Architecture

The application adopts a **Decoupled Asynchronous Core** architecture:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          PRESENTATION LAYER                            │
│           (React 19, TypeScript, Vite 8, WebGL / WebGPU)               │
│                                                                        │
│   ┌───────────────────────┐  ┌─────────────────────────────────────┐   │
│   │ Map Canvas & Clusters │  │ Virtualized Timeline & Media Grid   │   │
│   │ (MapLibre GL + Super) │  │ (@tanstack/react-virtual)           │   │
│   └───────────┬───────────┘  └──────────────────┬──────────────────┘   │
│               │                                 │                      │
│               └─────────────┬───────────────────┘                      │
│                             │  Zero-Copy IPC & Typed Commands          │
└─────────────────────────────┼──────────────────────────────────────────┘
                              │
┌─────────────────────────────┼──────────────────────────────────────────┐
│                             ▼                                          │
│                   CORE DESKTOP ENGINE (Rust)                           │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                      Tauri v2 Core Runtime                     │   │
│   └────────────────────────────────┬───────────────────────────────┘   │
│                                    │                                   │
│   ┌────────────────────────────────┴───────────────────────────────┐   │
│   │                Concurrent Indexing Pipeline                    │   │
│   │                                                                │   │
│   │   [Stage 1: Work-Stealing Directory Walker (Rayon)]            │   │
│   │             │                                                  │   │
│   │             ▼ (Bounded Channel: 1,000 items)                   │   │
│   │   [Stage 2: Non-Blocking Metadata & Hash Extractors]           │   │
│   │             │  - Header-only EXIF parsing (nom-exif)           │   │
│   │             │  - QuickTime/ISO BMFF GPS atom reader            │   │
│   │             │  - Rapid xxHash64 / BLAKE3 calculation           │   │
│   │             ▼ (Bounded Channel: 1,000 items)                   │   │
│   │   [Stage 3: Single-Writer Transactional Batch Engine]          │   │
│   │             │  - Dedicated thread with SQLite Connection       │   │
│   │             │  - Chunked 500-item transactions                 │   │
│   │             ▼                                                  │   │
│   │   [Stage 4: Throttled Event Streamer (60fps to UI)]            │   │
│   └────────────────────────────────┬───────────────────────────────┘   │
│                                    │                                   │
│                                    ▼                                   │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                   SQLite Persistence Engine                    │   │
│   │                                                                │   │
│   │   - PRAGMA WAL Mode & Memory-Mapped I/O (256MB mmap)           │   │
│   │   - SQLite R*Tree Virtual Table (Spatial Bounding Box)         │   │
│   │   - Inverted B-Tree Chronological Timestamp Index              │   │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Key Non-Functional Requirements & Mitigations

| Requirement | Challenge | Architectural Mitigation |
| :--- | :--- | :--- |
| **Zero UI Freezing** | Processing 100k+ files consumes heavy CPU/IO | All scanning, parsing, and hashing run in background thread pools (Rayon). The UI process communicates strictly via asynchronous IPC events. |
| **Fast Ingestion Throughput** | Naive SQLite inserts cause disk I/O bottlenecks (100 inserts/sec) | Single-writer queue with `BEGIN IMMEDIATE ... COMMIT` transactions writing in batches of 500 records. WAL mode achieves 10,000+ inserts/sec. |
| **Spatial Bounding-Box Speed** | Standard composite SQL queries (`lat BETWEEN ... AND lon BETWEEN ...`) degrade | SQLite R\*Tree virtual table (`media_spatial_index`) provides $O(\log N)$ spatial range queries with automated synchronization triggers. |
| **Instant Timeline Grouping** | Grouping 100k items in JavaScript freezes the main thread | Chronological indexing on `captured_at DESC`, paginated viewport queries, and virtualization via `@tanstack/react-virtual`. |
| **Low Memory Footprint** | Loading full-res images exhausts RAM immediately | Two-tier image pipeline: Viewports strictly load lightweight WebP/JPEG thumbnails. Original assets are accessed on-demand only for full-screen inspection. |
