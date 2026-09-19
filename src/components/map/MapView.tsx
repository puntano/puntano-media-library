import React, { useEffect, useRef, useState } from 'react';
import { Map, NavigationControl } from 'maplibre-gl';
import Supercluster from 'supercluster';
import { tauriApi } from '../../services/tauriApi';
import { SpatialClusterPoint } from '../../types/media';

export const MapView: React.FC = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const clusterIndex = useRef<Supercluster<any, any> | null>(null);
  const [points, setPoints] = useState<SpatialClusterPoint[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<SpatialClusterPoint | null>(null);
  const [clusterCount, setClusterCount] = useState<number>(0);

  // Initialize MapLibre
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

    map.current.addControl(new NavigationControl(), 'top-right');

    // Fetch initial points
    tauriApi.querySpatialBoundingBox(-90, 90, -180, 180, 10000).then((data) => {
      setPoints(data);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Initialize Supercluster whenever points change
  useEffect(() => {
    if (points.length === 0) return;

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
    updateMarkers();
  }, [points]);

  const updateMarkers = () => {
    if (!map.current || !clusterIndex.current) return;
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
          {clusterCount > 0 ? `${clusterCount} active viewport clusters` : 'Indexed via SQLite R*Tree & Supercluster'}
        </div>
      </div>

      {/* Selected Point Popover Preview */}
      {selectedPoint && (
        <div
          className="glass-panel"
          style={{
            position: 'absolute',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '16px 20px',
            borderRadius: 'var(--radius-lg)',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{selectedPoint.file_path}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Lat: {selectedPoint.latitude.toFixed(4)}, Lon: {selectedPoint.longitude.toFixed(4)}
            </div>
          </div>
          <button className="btn-secondary" onClick={() => setSelectedPoint(null)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
};
