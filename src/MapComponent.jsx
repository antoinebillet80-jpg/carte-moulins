import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const getIconUrl = () => {
  const token = localStorage.getItem('authToken');
  const baseUrl = `${API_URL}/api/photo/1yRMDXFVIU3aEwQx3YBFQfEiARMFwMl29`;
  return token ? `${baseUrl}?token=${token}` : baseUrl;
};

function MapComponent({ points, onMapClick, selectedPoint, onPointClick, tempMarkerPos, onClearTemp }) {
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const tempMarkerRef = useRef(null);
  const clickTimeRef = useRef(0);

  useEffect(() => {
    if (!mapRef.current) {
      mapRef.current = L.map('map').setView([46.65, 5.52], 11);

      mapRef.current.doubleClickZoom.disable();

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(mapRef.current);

      mapRef.current.on('click', (e) => {
        const now = Date.now();
        const isDoubleClick = now - clickTimeRef.current < 300;
        clickTimeRef.current = now;

        if (!isDoubleClick) {
          onMapClick(e.latlng);
        }
      });

      mapRef.current.on('dblclick', (e) => {
        clickTimeRef.current = 0;
        onClearTemp?.();
      });
    }

    Object.keys(markersRef.current).forEach((key) => {
      markersRef.current[key].remove();
    });
    markersRef.current = {};

    const customIcon = L.icon({
      iconUrl: getIconUrl(),
      iconSize: [16, 16],
      iconAnchor: [8, 16],
      popupAnchor: [0, -16],
    });

    points.forEach((point, idx) => {
      const marker = L.marker([point.lat, point.lon], {
        icon: customIcon,
        title: point.name,
      }).addTo(mapRef.current);

      marker.bindPopup(
        `<strong>${point.name}</strong><br/>${point.desc || 'Sans description'}`
      );

      marker.on('click', () => onPointClick(idx));

      marker.on('mouseover', () => {
        mapRef.current.getContainer().style.cursor = 'pointer';
      });

      marker.on('mouseout', () => {
        mapRef.current.getContainer().style.cursor = 'default';
      });

      markersRef.current[idx] = marker;
    });

    if (tempMarkerPos) {
      if (tempMarkerRef.current) {
        tempMarkerRef.current.remove();
      }
      tempMarkerRef.current = L.circleMarker([tempMarkerPos.lat, tempMarkerPos.lon], {
        radius: 10,
        color: '#FFA500',
        fillOpacity: 0.6,
        weight: 2,
        dashArray: '5, 5',
      }).addTo(mapRef.current);
    } else {
      if (tempMarkerRef.current) {
        tempMarkerRef.current.remove();
        tempMarkerRef.current = null;
      }
    }
  }, [points, selectedPoint, onMapClick, onPointClick, tempMarkerPos]);

  return <div id="map"></div>;
}

export default MapComponent;
