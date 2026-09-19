# ADR 001: Selection of Tauri v2 over .NET MAUI / Blazor Hybrid and Electron

## Status
Accepted

## Context
We need to build a high-performance cross-platform desktop application for Windows and macOS capable of indexing and smoothly visualizing massive local photo and video libraries (100,000+ files). The application requires:
1. High-throughput non-blocking disk I/O, hashing, and metadata parsing.
2. Low memory footprint when idle and during heavy operations.
3. GPU-accelerated interactive Map View with spatial clustering (`supercluster`, MapLibre GL).
4. High-frame-rate (60/120 fps) virtualized timeline and gallery rendering.

## Options Considered
1. **Tauri v2 (Rust Core + React/TypeScript UI)**
2. **.NET MAUI / Blazor Hybrid**
3. **Electron (Node.js + Chromium)**

## Decision
We select **Tauri v2 (Rust Backend + React/TypeScript Frontend)**.

## Rationale
1. **Zero Garbage Collection Freezes:** Scanning 100k+ media files generates millions of transient objects (file paths, EXIF tag maps, byte buffers). In managed runtimes (.NET / V8), this creates intense GC Gen0/1/2 churn and noticeable UI frame drops. Rust provides deterministic memory management, zero-cost abstractions, and fearless multi-threading (via Rayon and crossbeam).
2. **Minimal Resource Footprint:** Tauri uses the OS's native WebViews (WebView2 on Windows, WKWebView on macOS) with a compiled native Rust binary. Memory usage is ~35-50 MB idle vs. 150-250 MB for .NET and 350-600 MB for Electron.
3. **Maturity of the GIS & Virtualization Ecosystem:** Web standards (WebGL 2, MapLibre GL, Supercluster, TanStack Virtual) are unmatched for high-density spatial clustering and virtualized UI grids. In .NET MAUI, desktop map controls are either immature, wrapped WebViews, or lack dynamic clustering performance.
4. **Direct SQLite C-Integration:** Rust allows compiling SQLite directly into the binary with compiler flags enabling `rtree` (spatial virtual table), memory-mapped I/O, and zero-overhead native prepared statements.
