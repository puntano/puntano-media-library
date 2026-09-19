# ADR 002: SQLite R*Tree Virtual Tables for Spatial Indexing

## Status
Accepted

## Context
The Map View requires querying media files inside arbitrary geographic bounding boxes `[min_lon, min_lat, max_lon, max_lat]` across libraries with 100,000+ geotagged files.

Traditional 2D indexing in relational databases typically uses:
1. Composite B-Tree index on `(latitude, longitude)`: Inefficient for 2D ranges because the index can only efficiently filter on the leading dimension, leading to expensive scans on the second dimension.
2. Geohash string prefixes: Good for coarse tile clustering, but awkward for arbitrary dynamic viewport bounding boxes (e.g. edge boundary boundary cases).
3. SQLite R\*Tree Module: An in-tree virtual table implementation of the multidimensional R-Tree algorithm specifically designed for spatial range queries.

## Decision
We utilize **SQLite's built-in R\*Tree module** (`media_spatial_index`) complemented by a coarse `geohash` column for tile aggregation.

## Rationale
1. **$O(\log N)$ Spatial Lookups:** R\*Tree indexes bounding boxes hierarchically, pruning bounding boxes outside the query viewport in logarithmic time.
2. **Zero External Dependencies:** SQLite R\*Tree is bundled directly inside SQLite and enabled at compile-time via `SQLITE_ENABLE_RTREE=1` (standard in `rusqlite` bundled mode).
3. **Automated Synchronization via Triggers:** SQL `AFTER INSERT`, `AFTER UPDATE`, and `AFTER DELETE` triggers keep `media_spatial_index` in exact sync with `media_files` without manual application-layer bookkeeping.
