import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

export default function CityMap({
  reports,
  onSelect,
}: {
  reports: any[];
  onSelect: (r: any) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let disposed = false;

    void import('leaflet').then((L) => {
      if (!ref.current || disposed) return;

      const map = L.map(ref.current, {
        zoomControl: false,
        scrollWheelZoom: false,
      }).setView([11.0168, 76.9558], 12);

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors | Coimbatore Municipal Corp',
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      reports.forEach((r) => {
        const icon = L.divIcon({
          className: 'road-marker-wrap',
          html: `<span class="road-marker marker-${r.severity}"><span></span></span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        L.marker([r.latitude, r.longitude], { icon })
          .addTo(map)
          .on('click', () => onSelect(r));
      });

      cleanup = () => map.remove();
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [reports, onSelect]);

  return <div className="city-map" ref={ref} aria-label="Coimbatore pothole report map" />;
}
