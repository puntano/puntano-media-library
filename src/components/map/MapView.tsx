import React, { useEffect, useRef, useState } from 'react';
import { Map, Marker, NavigationControl } from 'maplibre-gl';
import Supercluster from 'supercluster';
import { tauriApi } from '../../services/tauriApi';
import { SpatialClusterPoint } from '../../types/media';
import { useLibraryStore } from '../../stores/libraryStore';
import { getThumbnailUrl } from '../../services/thumbnailProtocol';

export const MapView: React.FC = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const clusterIndex = useRef<Supercluster<any, any> | null>(null);
  const activeMarkers = useRef<Marker[]>([]);

  const [points, setPoints] = useState<SpatialClusterPoint[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<SpatialClusterPoint | null>(null);
  const [clusterCount, setClusterCount] = useState<number>(0);
  const [activeZoom, setActiveZoom] = useState<number>(2);

  const { setSelectedItem } = useLibraryStore();

  // 1. Initialize MapLibre
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm-tiles-layer',
            type: 'raster',
            source: 'osm-tiles',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: [0, 20],
      zoom: 2,
    });

    map.current.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');

    // Debounced Viewport Bounding-Box Listener
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleViewportChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!map.current) return;
        const zoom = Math.floor(map.current.getZoom());
        setActiveZoom(zoom);

        // Fetch visible bounding box points
        const bounds = map.current.getBounds();
        tauriApi
          .querySpatialBoundingBox(
            bounds.getSouth(),
            bounds.getNorth(),
            bounds.getWest(),
            bounds.getEast(),
            20000
          )
          .then((data) => {
            setPoints(data);
          });
      }, 150);
    };

    map.current.on('moveend', handleViewportChange);
    map.current.on('zoomend', handleViewportChange);

    // Initial query
    tauriApi.querySpatialBoundingBox(-90, 90, -180, 180, 20000).then((data) => {
      setPoints(data);
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      activeMarkers.current.forEach((m) => m.remove());
      activeMarkers.current = [];
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // 2. Load points into Supercluster
  useEffect(() => {
    if (points.length === 0) {
      clearMarkers();
      return;
    }

    const geojsonFeatures = points.map((p) => ({
      type: 'Feature' as const,
      properties: {
        id: p.id,
        filePath: p.file_path,
        mediaType: p.media_type,
        point: p,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [p.longitude, p.latitude],
      },
    }));

    const sc = new Supercluster({
      radius: 60,
      maxZoom: 16,
    });

    sc.load(geojsonFeatures);
    clusterIndex.current = sc;
    renderClusterMarkers();
  }, [points]);

  const clearMarkers = () => {
    activeMarkers.current.forEach((m) => m.remove());
    activeMarkers.current = [];
  };

  // 3. Render HTML Supercluster Markers
  const renderClusterMarkers = () => {
    if (!map.current || !clusterIndex.current) return;
    clearMarkers();

    const bounds = map.current.getBounds();
    const bbox: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];
    const zoom = Math.floor(map.current.getZoom());
    const clusters = clusterIndex.current.getClusters(bbox, zoom);
    setClusterCount(clusters.length);

    for (const cluster of clusters) {
      const [longitude, latitude] = cluster.geometry.coordinates;
      const isCluster = cluster.properties.cluster;

      const el = document.createElement('div');

      if (isCluster) {
        // Multi-marker cluster badge
        const count = cluster.properties.point_count as number;
        const size = count < 100 ? 40 : count < 1000 ? 48 : 56;

        el.className = 'map-cluster-marker';
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.fontSize = count < 1000 ? '13px' : '11px';
        el.innerText = count < 10000 ? count.toLocaleString() : '10k+';

        el.addEventListener('click', () => {
          if (!map.current || !clusterIndex.current) return;
          const expansionZoom = clusterIndex.current.getClusterExpansionZoom(cluster.id as number);
          map.current.easeTo({
            center: [longitude, latitude],
            zoom: Math.min(expansionZoom, 17),
            duration: 500,
          });
        });
      } else {
        // Individual media pin
        const point = cluster.properties.point as SpatialClusterPoint;
        el.className = 'map-pin-marker';
        el.innerText = point.media_type === 'video' ? '🎬' : '📷';

        el.addEventListener('click', () => {
          setSelectedPoint(point);
        });
      }

      const marker = new Marker({ element: el })
        .setLngLat([longitude, latitude])
        .addTo(map.current);

      activeMarkers.current.push(marker);
    }
  };

  const handleInspectMedia = () => {
    if (!selectedPoint) return;
    setSelectedItem({
      id: selectedPoint.id,
      library_id: 1,
      file_path: selectedPoint.file_path,
      directory: selectedPoint.file_path.substring(0, selectedPoint.file_path.lastIndexOf('/') || selectedPoint.file_path.lastIndexOf('\\')),
      file_name: selectedPoint.file_path.split(/[/\\]/).pop() || '',
      file_size: 3500000,
      file_modified_at: selectedPoint.captured_at || Date.now(),
      file_hash: `hash_${selectedPoint.id}`,
      mime_type: selectedPoint.media_type === 'video' ? 'video/mp4' : 'image/jpeg',
      media_type: selectedPoint.media_type,
      orientation: 1,
      captured_at: selectedPoint.captured_at,
      latitude: selectedPoint.latitude,
      longitude: selectedPoint.longitude,
      thumbnail_status: 'ready',
      indexed_at: Date.now(),
      updated_at: Date.now(),
    });
    setSelectedPoint(null);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* Floating Spatial Statistics Overlay */}
      <div
        className="glass-panel"
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          padding: '14px 18px',
          borderRadius: 'var(--radius-md)',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Geotagged Library Media
        </div>
        <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {points.length.toLocaleString()} Coordinates
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Zoom Level: {activeZoom} • {clusterCount} viewport clusters
        </div>
      </div>

      {/* Selected Point Popover Preview Card */}
      {selectedPoint && (
        <div
          className="glass-panel"
          style={{
            position: 'absolute',
            bottom: 28,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: 16,
            borderRadius: 'var(--radius-lg)',
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            minWidth: 360,
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              flexShrink: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
            }}
          >
            <img
              src={getThumbnailUrl(`hash_${selectedPoint.id}`, selectedPoint.media_type)}
              alt="Preview"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedPoint.file_path.split(/[/\\]/).pop()}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              {selectedPoint.latitude.toFixed(4)}°, {selectedPoint.longitude.toFixed(4)}°
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={handleInspectMedia} style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
              Inspect
            </button>
            <button className="btn-secondary" onClick={() => setSelectedPoint(null)} style={{ padding: '6px 10px', fontSize: '0.75rem' }}>
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
