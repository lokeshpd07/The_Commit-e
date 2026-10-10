import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Info } from 'lucide-react';
import { ReportItem } from '@/lib/types';

interface CoimbatoreMapPickerProps {
  latitude: number;
  longitude: number;
  onLocationChange: (lat: number, lng: number) => void;
  existingReports?: ReportItem[];
}

export function CoimbatoreMapPicker({
  latitude,
  longitude,
  onLocationChange,
  existingReports = [],
}: CoimbatoreMapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const activeMarkerRef = useRef<any>(null);

  useEffect(() => {
    let disposed = false;

    void import('leaflet').then((L) => {
      if (!mapContainerRef.current || disposed) return;

      // Fix default Leaflet icon assets
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: [latitude, longitude],
          zoom: 13,
          zoomControl: true,
          scrollWheelZoom: true,
        });

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors | Coimbatore Municipal Corp',
          maxZoom: 19,
        }).addTo(map);

        // Custom pulsed emerald marker for chosen location
        const selectedPinIcon = L.divIcon({
          className: 'coimbatore-selected-pin',
          html: `
            <div style="
              position: relative;
              width: 34px;
              height: 34px;
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <div style="
                position: absolute;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: rgba(16, 185, 129, 0.35);
                animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
              "></div>
              <div style="
                width: 26px;
                height: 26px;
                border-radius: 50%;
                background: linear-gradient(135deg, #059669, #047857);
                border: 3px solid #ffffff;
                box-shadow: 0 4px 12px rgba(0,0,0,0.35);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 13px;
                font-weight: bold;
              ">📍</div>
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });

        const activeMarker = L.marker([latitude, longitude], {
          icon: selectedPinIcon,
          draggable: true,
        }).addTo(map);

        activeMarker.bindPopup('<b>Selected Pothole Spot</b><br/>Drag or click map to move').openPopup();

        activeMarker.on('dragend', (e: any) => {
          const pos = e.target.getLatLng();
          onLocationChange(Number(pos.lat.toFixed(5)), Number(pos.lng.toFixed(5)));
        });

        // Click map to reposition
        map.on('click', (e: any) => {
          const lat = Number(e.latlng.lat.toFixed(5));
          const lng = Number(e.latlng.lng.toFixed(5));
          activeMarker.setLatLng([lat, lng]);
          onLocationChange(lat, lng);
        });

        // Add nearby existing report markers in Coimbatore
        existingReports.forEach((rep) => {
          if (rep.latitude && rep.longitude) {
            const isCrit = rep.is_critical || rep.priority_score >= 80;
            const markerColor = isCrit ? '#ef4444' : rep.priority_score >= 50 ? '#f59e0b' : '#10b981';
            const repIcon = L.divIcon({
              className: 'existing-pothole-dot',
              html: `
                <div style="
                  width: 14px;
                  height: 14px;
                  border-radius: 50%;
                  background: ${markerColor};
                  border: 2px solid white;
                  box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                "></div>
              `,
              iconSize: [14, 14],
              iconAnchor: [7, 7],
            });

            L.marker([rep.latitude, rep.longitude], { icon: repIcon })
              .addTo(map)
              .bindPopup(
                `<b>${rep.report_id}</b>: ${rep.road_name}<br/>Score: <b>${rep.priority_score.toFixed(
                  0
                )}/100</b> (${rep.priority_band})`
              );
          }
        });

        mapInstanceRef.current = map;
        activeMarkerRef.current = activeMarker;
      } else {
        // Update marker position
        if (activeMarkerRef.current) {
          activeMarkerRef.current.setLatLng([latitude, longitude]);
        }
        mapInstanceRef.current.setView([latitude, longitude], mapInstanceRef.current.getZoom());
      }
    });

    return () => {
      disposed = true;
    };
  }, [latitude, longitude, onLocationChange, existingReports]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-700 flex items-center gap-1.5">
          <MapPin size={14} className="text-emerald-600" /> Interactive Coimbatore Location Picker
        </span>
        <span className="text-[11px] text-slate-500 flex items-center gap-1">
          <Info size={12} className="text-emerald-600" /> Click map or drag pin to adjust
        </span>
      </div>

      <div className="relative rounded-2xl overflow-hidden border border-slate-300 bg-slate-100 shadow-inner h-[230px] w-full z-0">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Live Coordinate Overlay Badge */}
        <div className="absolute bottom-2 left-2 z-[400] bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] text-slate-800 shadow-sm flex items-center gap-2">
          <Navigation size={12} className="text-emerald-600 animate-pulse" />
          <span>
            Lat: <strong className="font-mono text-emerald-700">{latitude.toFixed(4)}</strong>, Lng:{' '}
            <strong className="font-mono text-emerald-700">{longitude.toFixed(4)}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
