import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera,
  Upload,
  MapPin,
  Sparkles,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Navigation,
  Check,
  Flame,
  ThumbsUp,
  FileText,
  Layers,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  Eye,
  Info,
  Ruler,
  AlertOctagon,
  Car,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api_client';
import {
  ReportItem,
  RoadClass,
  TrafficLevel,
  CriticalFacility,
  CreateComplaintInput,
} from '@/lib/types';
import potholeSampleImg from '@/assets/pothole.jpg';
import { calculateFactorScores } from '@/lib/mock_api';
import { CoimbatoreMapPicker } from './coimbatore-map-picker';

interface CitizenDashboardProps {
  reports: ReportItem[];
  userName: string;
  onReportCreated: () => void;
  onOpenMapLocation?: (lat: number, lng: number) => void;
}

export const COIMBATORE_HOTSPOTS = [
  {
    name: 'Avinashi Road (Peelamedu - PSG Tech Corridor)',
    lat: 11.0284,
    lng: 77.0125,
    roadClass: 'Highway / Transit' as RoadClass,
    traffic: 'Heavy' as TrafficLevel,
    facility: 'Transit Hub' as CriticalFacility,
    desc: 'High-speed arterial with heavy bus and two-wheeler traffic near educational institutions.',
  },
  {
    name: 'Trichy Road (CMCH Emergency Corridor - Ramanathapuram)',
    lat: 11.0022,
    lng: 76.9691,
    roadClass: 'Major Arterial' as RoadClass,
    traffic: 'Severe' as TrafficLevel,
    facility: 'Hospital / Emergency Route' as CriticalFacility,
    desc: 'Critical ambulance corridor for Coimbatore Medical College Hospital (CMCH).',
  },
  {
    name: 'Gandhipuram (Cross Cut Road - 100 Feet Rd)',
    lat: 11.0183,
    lng: 76.9654,
    roadClass: 'Major Arterial' as RoadClass,
    traffic: 'Severe' as TrafficLevel,
    facility: 'Transit Hub' as CriticalFacility,
    desc: 'Dense commercial shopping zone and central bus terminus connector.',
  },
  {
    name: 'RS Puram (Diwan Bahadur Road - DB Road)',
    lat: 11.0086,
    lng: 76.9507,
    roadClass: 'Collector' as RoadClass,
    traffic: 'Moderate' as TrafficLevel,
    facility: 'Nearby School' as CriticalFacility,
    desc: 'Active commercial high street with school zones and pedestrian crossings.',
  },
  {
    name: 'Saravanampatti (Sathy Road - CHIL SEZ IT Corridor)',
    lat: 11.0825,
    lng: 76.9961,
    roadClass: 'Major Arterial' as RoadClass,
    traffic: 'Heavy' as TrafficLevel,
    facility: 'None' as CriticalFacility,
    desc: 'Rapidly growing tech corridor with heavy IT commuter and freight traffic.',
  },
  {
    name: 'Singanallur (Trichy Highway Junction - Bus Stand)',
    lat: 10.9998,
    lng: 77.021,
    roadClass: 'Highway / Transit' as RoadClass,
    traffic: 'Severe' as TrafficLevel,
    facility: 'Transit Hub' as CriticalFacility,
    desc: 'Major highway interchange with heavy inter-district transport buses.',
  },
];

export function CitizenComplaintDashboard({
  reports,
  userName,
  onReportCreated,
}: CitizenDashboardProps) {
  const [subTab, setSubTab] = useState<'file' | 'my_reports' | 'community'>('file');

  // Form State (Clean Initial State - No Pre-loaded Data)
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedHotspot, setSelectedHotspot] = useState<typeof COIMBATORE_HOTSPOTS[0] | null>(null);
  const [latitude, setLatitude] = useState(11.0168);
  const [longitude, setLongitude] = useState(76.9558);
  const [roadName, setRoadName] = useState('');
  const [roadClass, setRoadClass] = useState<RoadClass>('Major Arterial');
  const [trafficLevel, setTrafficLevel] = useState<TrafficLevel>('Moderate');
  const [criticalFacility, setCriticalFacility] = useState<CriticalFacility>('None');
  const [severity, setSeverity] = useState<number>(2);

  // New Pothole Dimensions & Safety Input Fields
  const [depthInches, setDepthInches] = useState<number>(2.0);
  const [diameterFeet, setDiameterFeet] = useState<number>(1.5);
  const [accidentsCount, setAccidentsCount] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [aiScanned, setAiScanned] = useState(false);

  const safeReports = useMemo(() => (Array.isArray(reports) ? reports : []), [reports]);

  // Filter user's complaints
  const myComplaints = useMemo(() => {
    return safeReports.filter(
      (r) =>
        !userName ||
        r.user_name === userName ||
        (userName && r.user_name?.toLowerCase().includes(userName.toLowerCase())) ||
        r.user_id === 'usr_resident_demo' ||
        r.user_name?.includes('Resident') ||
        safeReports.length === 1
    );
  }, [safeReports, userName]);

  // Check for nearby duplicate reports (<0.004 deg approx 400m in Coimbatore)
  const nearbyDuplicate = useMemo(() => {
    return safeReports.find(
      (r) =>
        r.status !== 'Resolved' &&
        Math.abs(r.latitude - latitude) < 0.004 &&
        Math.abs(r.longitude - longitude) < 0.004
    );
  }, [safeReports, latitude, longitude]);

  // Live Score Calculator with Depth, Diameter & Accident Modifiers
  const liveScore = useMemo(() => {
    return calculateFactorScores({
      severity,
      traffic_level: trafficLevel,
      road_class: roadClass,
      critical_facility: criticalFacility,
      linked_complaints: nearbyDuplicate ? nearbyDuplicate.linked_complaints_count + 1 : 1,
      depth_inches: depthInches,
      diameter_feet: diameterFeet,
      accidents_count: accidentsCount,
    });
  }, [severity, trafficLevel, roadClass, criticalFacility, nearbyDuplicate, depthInches, diameterFeet, accidentsCount]);

  // Determine if OpenAI will flag as Critical Hazard
  const isAnticipatedCritical = useMemo(() => {
    return (
      liveScore.priority_score >= 80 ||
      depthInches >= 3.5 ||
      accidentsCount >= 2 ||
      (criticalFacility === 'Hospital / Emergency Route' && severity >= 2)
    );
  }, [liveScore.priority_score, depthInches, accidentsCount, criticalFacility, severity]);

  const handleHotspotSelect = (h: typeof COIMBATORE_HOTSPOTS[0]) => {
    setSelectedHotspot(h);
    setLatitude(h.lat);
    setLongitude(h.lng);
    setRoadName(h.name);
    setRoadClass(h.roadClass);
    setTrafficLevel(h.traffic);
    setCriticalFacility(h.facility);
  };

  const handleLocationPicked = (lat: number, lng: number) => {
    setLatitude(lat);
    setLongitude(lng);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setAiScanned(true);
      toast.info('Analyzing image with YOLOv11 defect scanner...');
    }
  };

  const handleConfirmExisting = async (reportId: string) => {
    try {
      await apiClient.upvoteComplaint(reportId);
      toast.success('Your verification was linked! Urgency score increased.');
      onReportCreated();
    } catch (e) {
      toast.error('Failed to link report');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const input: CreateComplaintInput = {
        image: imageFile,
        latitude,
        longitude,
        road_name: roadName,
        road_class: roadClass,
        traffic_level: trafficLevel,
        critical_facility: criticalFacility,
        observed_severity: severity,
        depth_inches: depthInches,
        diameter_feet: diameterFeet,
        accidents_count: accidentsCount,
        description:
          description ||
          `Resident road damage report in Coimbatore (${roadName}) with YOLOv11 defect detection and OpenAI multi-modal triage.`,
        user_name: userName,
      };

      const res = await apiClient.createReport(input);
      if (res.is_critical) {
        toast.error(
          `CRITICAL HAZARD FLAGGED: Report #${res.report_id} prioritized at ${res.priority_score.toFixed(
            1
          )}/100 for immediate rapid repair!`,
          { duration: 6000 }
        );
      } else {
        toast.success(
          `Complaint #${res.report_id} registered! Priority Score: ${res.priority_score.toFixed(1)}/100`
        );
      }
      onReportCreated();
      setSubTab('my_reports');
      setDescription('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit complaint');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub navigation bar - White and Green Theme */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-white border border-slate-200 rounded-2xl shadow-xs">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
          <button
            onClick={() => setSubTab('file')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              subTab === 'file'
                ? 'bg-emerald-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Camera size={14} /> File New Complaint
          </button>
          <button
            onClick={() => setSubTab('my_reports')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              subTab === 'my_reports'
                ? 'bg-emerald-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText size={14} /> My Complaints ({myComplaints.length})
          </button>
          <button
            onClick={() => setSubTab('community')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              subTab === 'community'
                ? 'bg-emerald-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MapPin size={14} /> Coimbatore Feed ({safeReports.length})
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          City: <strong className="text-slate-800">Coimbatore (CCMC)</strong> • Logged in as{' '}
          <strong className="text-slate-800">{userName}</strong>
        </div>
      </div>

      {/* TAB 1: FILE COMPLAINT */}
      {subTab === 'file' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Form (7 cols) */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl p-5 md:p-6 shadow-sm space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Camera className="text-emerald-600" size={20} />
                  Coimbatore Pothole &amp; Defect Report
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                  <Sparkles size={12} className="text-emerald-600" /> YOLOv11 + OpenAI Fusion
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Capture the road hazard photo, pinpoint the spot on the Coimbatore map, and enter crater dimensions.
                Our multi-modal AI synthesizes vision and citizen measurements for transparent municipal triage.
              </p>
            </div>

            {/* Nearby duplicate warning banner */}
            {nearbyDuplicate && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-amber-950 font-semibold">
                      Existing Complaint Nearby in Coimbatore ({nearbyDuplicate.report_id})
                    </strong>
                    <span>
                      {nearbyDuplicate.location} • Status: <strong>{nearbyDuplicate.status}</strong> • Linked Reports:{' '}
                      <strong>{nearbyDuplicate.linked_complaints_count}</strong>
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleConfirmExisting(nearbyDuplicate.report_id)}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] px-2.5 py-1 shrink-0 h-auto rounded-md shadow-xs cursor-pointer"
                >
                  <ThumbsUp size={12} className="mr-1" /> Confirm Existing
                </Button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 1. Image Upload Area */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  1. Road Photograph (YOLOv11 Defect Scan)
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50 rounded-2xl p-4 cursor-pointer transition-colors group">
                    <Upload size={22} className="text-slate-400 group-hover:text-emerald-600 mb-1" />
                    <span className="text-xs font-medium text-slate-700 group-hover:text-emerald-700">
                      Click to browse or drop Coimbatore road photo
                    </span>
                    <span className="text-[10px] text-slate-500 mt-0.5">JPEG, PNG or WEBP (Max 15MB)</span>
                    <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                  </label>
                </div>
              </div>

              {/* 2. Interactive Coimbatore Map Location Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  2. Select Location on Coimbatore Map
                </label>
                <CoimbatoreMapPicker
                  latitude={latitude}
                  longitude={longitude}
                  onLocationChange={handleLocationPicked}
                  existingReports={safeReports}
                />
              </div>

              {/* Quick Coimbatore Hotspot Selector Chips */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Or pick a Coimbatore Arterial / Commercial Hotspot:
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {COIMBATORE_HOTSPOTS.map((h) => (
                    <button
                      key={h.name}
                      type="button"
                      onClick={() => handleHotspotSelect(h)}
                      className={`p-2 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                        selectedHotspot?.name === h.name
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-semibold shadow-xs'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                      }`}
                    >
                      <div className="truncate font-medium text-slate-900">{h.name.split('(')[0]}</div>
                      <div className="text-[10px] text-slate-500 truncate">{h.roadClass}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Coordinates & Road Name */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={latitude}
                    onChange={(e) => setLatitude(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={longitude}
                    onChange={(e) => setLongitude(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Coimbatore Road Corridor</label>
                  <input
                    type="text"
                    value={roadName}
                    onChange={(e) => setRoadName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* 3. Physical Crater Details: Depth & Diameter */}
              <div className="p-4 rounded-2xl bg-emerald-50/40 border border-emerald-100 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Ruler size={15} className="text-emerald-600" />
                    3. Pothole Physical Dimensions
                  </label>
                  <span className="text-[10px] text-emerald-800 font-medium">Passed to OpenAI Risk Engine</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Depth */}
                  <div>
                    <div className="flex justify-between items-center text-xs mb-1.5">
                      <span className="font-semibold text-slate-700">Crater Depth (Inches)</span>
                      <span className="font-mono font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                        {depthInches.toFixed(1)} in ({Math.round(depthInches * 2.54)} cm)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {[1.5, 3.0, 5.0].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDepthInches(d)}
                          className={`flex-1 py-1 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer ${
                            Math.abs(depthInches - d) < 0.3
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300'
                          }`}
                        >
                          {d === 1.5 ? '< 2" Shallow' : d === 3.0 ? '3" Medium' : '> 4" Deep Crater'}
                        </button>
                      ))}
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="8"
                      step="0.5"
                      value={depthInches}
                      onChange={(e) => setDepthInches(parseFloat(e.target.value))}
                      className="w-full mt-2 accent-emerald-600 cursor-pointer"
                    />
                  </div>

                  {/* Diameter / Width */}
                  <div>
                    <div className="flex justify-between items-center text-xs mb-1.5">
                      <span className="font-semibold text-slate-700">Crater Diameter (Feet)</span>
                      <span className="font-mono font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                        {diameterFeet.toFixed(1)} ft ({Math.round(diameterFeet * 30.48)} cm)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {[1.0, 2.5, 4.5].map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setDiameterFeet(w)}
                          className={`flex-1 py-1 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer ${
                            Math.abs(diameterFeet - w) < 0.3
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300'
                          }`}
                        >
                          {w === 1.0 ? '< 1 ft Minor' : w === 2.5 ? '2.5 ft Medium' : '> 4 ft Hazard'}
                        </button>
                      ))}
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="6"
                      step="0.5"
                      value={diameterFeet}
                      onChange={(e) => setDiameterFeet(parseFloat(e.target.value))}
                      className="w-full mt-2 accent-emerald-600 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* 4. Traffic Volume & Known Accidents */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Car size={14} className="text-emerald-600" />
                    4. Traffic Volume (T)
                  </label>
                  <select
                    value={trafficLevel}
                    onChange={(e) => setTrafficLevel(e.target.value as TrafficLevel)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Severe">Severe / Peak Hour Gridlock (Score: 100)</option>
                    <option value="Heavy">Heavy Volume (Score: 80)</option>
                    <option value="Moderate">Moderate Flow (Score: 50)</option>
                    <option value="Low">Low / Local Only (Score: 20)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <AlertOctagon size={14} className="text-red-500" />
                    5. Known Accidents / Near-Misses
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[0, 1, 2, 3].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setAccidentsCount(cnt)}
                        className={`py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                          accidentsCount === cnt
                            ? cnt >= 2
                              ? 'bg-red-600 text-white border-red-600 shadow-xs'
                              : 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {cnt === 0 ? 'None (0)' : cnt === 3 ? '3+ Serious' : `${cnt}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Road Class & Critical Facility */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Road Classification (R)</label>
                  <select
                    value={roadClass}
                    onChange={(e) => setRoadClass(e.target.value as RoadClass)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Highway / Transit">Highway / Transit (Score: 100)</option>
                    <option value="Major Arterial">Major Arterial (Score: 85)</option>
                    <option value="Collector">Collector Road (Score: 55)</option>
                    <option value="Residential">Residential Street (Score: 25)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Critical Facility (C)</label>
                  <select
                    value={criticalFacility}
                    onChange={(e) => setCriticalFacility(e.target.value as CriticalFacility)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Hospital / Emergency Route">CMCH Hospital / Emergency Route (Score: 100)</option>
                    <option value="Transit Hub">Transit / Railway / Bus Stand (Score: 75)</option>
                    <option value="Nearby School">School Zone (Score: 60)</option>
                    <option value="None">None / General Road (Score: 10)</option>
                  </select>
                </div>
              </div>

              {/* Observed Severity Radio Buttons */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Observed Defect Severity (S)
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  <label
                    className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer text-xs transition-all ${
                      severity === 1
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-semibold shadow-xs'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="sev"
                      value={1}
                      checked={severity === 1}
                      onChange={() => setSeverity(1)}
                      className="hidden"
                    />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                    <div>
                      <div className="text-slate-900 font-medium">Low Severity</div>
                      <div className="text-[10px] text-slate-500">Surface crack (S=30)</div>
                    </div>
                  </label>

                  <label
                    className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer text-xs transition-all ${
                      severity === 2
                        ? 'border-amber-500 bg-amber-50 text-amber-900 font-semibold shadow-xs'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="sev"
                      value={2}
                      checked={severity === 2}
                      onChange={() => setSeverity(2)}
                      className="hidden"
                    />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                    <div>
                      <div className="text-slate-900 font-medium">Moderate Severity</div>
                      <div className="text-[10px] text-slate-500">Medium pit (S=65)</div>
                    </div>
                  </label>

                  <label
                    className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer text-xs transition-all ${
                      severity === 3
                        ? 'border-red-500 bg-red-50 text-red-900 font-semibold shadow-xs'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="sev"
                      value={3}
                      checked={severity === 3}
                      onChange={() => setSeverity(3)}
                      className="hidden"
                    />
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                    <div>
                      <div className="text-slate-900 font-medium">Critical Severity</div>
                      <div className="text-[10px] text-slate-500">Deep cavity (S=95)</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Optional Description */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Optional Observations / Citizen Notes
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g., Deep crater on right lane near flyover ramp, caused 2-wheeler skidding in rain..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Submit button */}
              <Button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-600/20 cursor-pointer"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <Sparkles size={16} className="animate-spin" /> Running YOLOv11 &amp; OpenAI Multi-Modal Analysis...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <CheckCircle2 size={16} /> Submit Coimbatore Citizen Complaint
                  </span>
                )}
              </Button>
            </form>
          </div>

          {/* Right Column: Visual AI Detection Preview & Live Priority Gauge (5 cols) */}
          <div className="lg:col-span-5 space-y-5">
            {/* Visual AI Bounding Box Box */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={14} className="text-emerald-600" /> YOLOv11 AI Visual Inspection
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                  Detector Active
                </span>
              </div>

              <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 aspect-[16/10] flex items-center justify-center group shadow-xs">
                {imagePreview ? (
                  <>
                    <img src={imagePreview} alt="Road scan" className="w-full h-full object-cover" />
                    {/* Simulated Detection Bounding Box Overlays */}
                    <div className="absolute inset-[20%_25%_25%_25%] border-2 border-red-500 rounded bg-red-500/10 pointer-events-none transition-all">
                      <div className="absolute -top-5 left-0 px-1.5 py-0.5 bg-red-600 text-white text-[9px] font-bold rounded flex items-center gap-1 shadow">
                        Pothole (Severe) 95.4%
                      </div>
                    </div>
                    <div className="absolute inset-[55%_65%_20%_15%] border-2 border-emerald-400 rounded bg-emerald-400/10 pointer-events-none">
                      <div className="absolute -top-5 left-0 px-1.5 py-0.5 bg-emerald-600 text-white text-[9px] font-bold rounded shadow">
                        Surface Crack 88.2%
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-6 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                    <Camera size={26} className="text-slate-500" />
                    <span>Upload a road photo in Step 1 to run YOLOv11 defect analysis</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block">Bounding Box Area Ratio ($r$)</span>
                  <strong className="text-emerald-700 font-mono text-xs">
                    {severity === 3 ? '0.22 (22% Pavement)' : '0.09 (9% Pavement)'}
                  </strong>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block">Physical Volume Estimate</span>
                  <strong className="text-slate-900 font-medium">
                    ~{(depthInches * diameterFeet * 0.4).toFixed(1)} cu.ft asphalt
                  </strong>
                </div>
              </div>
            </div>

            {/* Live OpenAI Multi-Modal Critical Alert Prediction Card */}
            {isAnticipatedCritical && (
              <div className="p-4 rounded-3xl bg-red-50/90 border border-red-200 text-red-950 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-red-700 flex items-center gap-1.5 uppercase tracking-wide">
                    <AlertOctagon size={16} className="text-red-600 animate-pulse" />
                    OpenAI Safety Alert: Critical Hazard
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-600 text-white font-bold">
                    Direct Rapid Dispatch
                  </span>
                </div>
                <p className="text-[11px] text-red-900 leading-relaxed">
                  Based on <strong>{depthInches}" depth</strong>, <strong>{diameterFeet} ft diameter</strong>,{' '}
                  <strong>{accidentsCount} prior accident(s)</strong>, and{' '}
                  <strong>{criticalFacility === 'Hospital / Emergency Route' ? 'CMCH Emergency Corridor' : roadClass}</strong>,
                  OpenAI models will automatically flag this complaint as <strong>CRITICAL</strong> in the City Authority
                  Dashboard.
                </p>
              </div>
            )}

            {/* Live Explainable Multi-Factor Priority Breakdown */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Flame size={14} className="text-emerald-600" /> Live Priority Score ($P$)
                </h4>
                <span
                  className={`text-xs px-2.5 py-0.5 font-bold rounded-full ${
                    liveScore.priority_band === 'Critical'
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : liveScore.priority_band === 'High'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {liveScore.priority_band} Band
                </span>
              </div>

              {/* Large Score Gauge */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-600 font-medium">Calculated Priority Score ($P$)</div>
                  <div className="text-3xl font-extrabold text-emerald-700 tracking-tight font-mono">
                    {liveScore.priority_score.toFixed(1)}
                    <span className="text-sm font-normal text-slate-500"> / 100</span>
                  </div>
                </div>
                <div className="text-right text-[11px] text-slate-500">
                  <span className="block font-medium">Coimbatore CCMC Model</span>
                  <span className="font-mono text-xs text-emerald-800 font-semibold">
                    P = 0.35S + 0.25T + 0.15R + 0.15C + 0.10U
                  </span>
                </div>
              </div>

              {/* Factor Contribution Bars */}
              <div className="space-y-2 text-xs">
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-600">Severity S (35%) + Depth Modifier</span>
                    <span className="text-slate-900 font-mono font-medium">
                      {liveScore.factors.severity_score}/100
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full transition-all"
                      style={{ width: `${liveScore.factors.severity_score}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-600">Traffic Exposure T (25%)</span>
                    <span className="text-slate-900 font-mono font-medium">
                      {liveScore.factors.traffic_score}/100
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${liveScore.factors.traffic_score}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-600">Road Class Importance R (15%)</span>
                    <span className="text-slate-900 font-mono font-medium">
                      {liveScore.factors.road_importance_score}/100
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-teal-500 rounded-full transition-all"
                      style={{ width: `${liveScore.factors.road_importance_score}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-600">Critical Proximity C (15%)</span>
                    <span className="text-slate-900 font-mono font-medium">
                      {liveScore.factors.criticality_score}/100
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full transition-all"
                      style={{ width: `${liveScore.factors.criticality_score}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-600">Crowd Urgency U + Accident Factor (10%)</span>
                    <span className="text-slate-900 font-mono font-medium">
                      {liveScore.factors.urgency_score}/100
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${liveScore.factors.urgency_score}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MY COMPLAINTS & LIFECYCLE TRACKING */}
      {subTab === 'my_reports' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">My Coimbatore Complaints &amp; Lifecycle Tracking</h3>
              <p className="text-xs text-slate-500">
                Track the live status of your reported potholes through municipal triage, work order scheduling, and CCMC crew dispatch.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {myComplaints.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-3xl border border-slate-200">
                <p className="text-xs text-slate-500">No complaints filed yet. File your first road report in Coimbatore above!</p>
              </div>
            ) : (
              myComplaints.map((c) => {
                const statusSteps = ['Submitted', 'Under Triage', 'Scheduled', 'Crew Dispatched', 'Resolved'];
                const currentStepIdx = statusSteps.indexOf(c.status);

                return (
                  <div
                    key={c.report_id}
                    className="p-5 rounded-3xl border border-slate-200 bg-white shadow-sm space-y-4 hover:border-emerald-200 transition-all"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-mono font-bold text-xs border border-emerald-200">
                          {c.report_id}
                        </span>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">{c.location}</h4>
                          <span className="text-[11px] text-slate-500">
                            {c.road_class} • Reported on {new Date(c.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {c.is_critical && (
                          <span className="text-xs px-2.5 py-1 font-bold rounded-lg bg-red-600 text-white flex items-center gap-1 shadow-xs">
                            <AlertOctagon size={12} /> CRITICAL HAZARD
                          </span>
                        )}
                        <span
                          className={`text-xs px-2.5 py-1 font-bold rounded-lg ${
                            c.priority_band === 'Critical'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : c.priority_band === 'High'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          Priority: {c.priority_score.toFixed(1)} ({c.priority_band})
                        </span>
                        <span className="text-xs px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg border border-slate-200 font-medium">
                          Status: <strong className="text-slate-900">{c.status}</strong>
                        </span>
                      </div>
                    </div>

                    {/* AI Assessment Justification snippet */}
                    {c.ai_triage_justification && (
                      <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 text-xs text-slate-800">
                        <strong className="text-emerald-800 block text-[11px] mb-0.5">
                          OpenAI Multi-Modal Assessment:
                        </strong>
                        <span className="text-slate-600">{c.ai_triage_justification}</span>
                      </div>
                    )}

                    {/* 5-Stage Visual Progress Timeline */}
                    <div>
                      <div className="text-[11px] text-slate-600 font-semibold mb-2">Repair Lifecycle Progress:</div>
                      <div className="grid grid-cols-5 gap-2 relative">
                        {statusSteps.map((step, idx) => {
                          const isDone = idx <= currentStepIdx;
                          const isCurrent = idx === currentStepIdx;

                          return (
                            <div
                              key={step}
                              className={`p-2.5 rounded-xl border text-center transition-all ${
                                isCurrent
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-bold shadow-xs'
                                  : isDone
                                  ? 'border-emerald-300 bg-emerald-50/50 text-emerald-700'
                                  : 'border-slate-200 bg-slate-50 text-slate-400'
                              }`}
                            >
                              <div className="flex items-center justify-center mb-1">
                                {isDone ? (
                                  <CheckCircle2
                                    size={16}
                                    className={isCurrent ? 'text-emerald-600' : 'text-emerald-500'}
                                  />
                                ) : (
                                  <div className="w-3.5 h-3.5 rounded-full border border-slate-300"></div>
                                )}
                              </div>
                              <span className="text-[11px] block truncate">{step}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Details row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-1">
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-slate-500 block text-[10px]">Assigned CCMC Crew</span>
                        <strong className="text-slate-800">{c.team || 'CCMC Rapid Response Team 1'}</strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-slate-500 block text-[10px]">Physical Crater Size</span>
                        <strong className="text-slate-800">
                          {c.depth_inches || 3.5}" depth • {c.diameter_feet || 2.5} ft wide
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-slate-500 block text-[10px]">Work Zone (DBSCAN)</span>
                        <strong className="text-slate-800">{c.cluster_name || 'Coimbatore Zone 1'}</strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-slate-500 block text-[10px]">Accidents Recorded</span>
                        <strong className={c.accidents_count && c.accidents_count > 0 ? 'text-red-600' : 'text-slate-700'}>
                          {c.accidents_count || 0} incidents
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 3: COMMUNITY FEED & NEIGHBORHOOD MAP */}
      {subTab === 'community' && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Coimbatore City Road Damage Feed</h3>
            <p className="text-xs text-slate-500">
              Explore recent potholes filed by citizens across Coimbatore. Upvote active defects to help RoadSense AI
              calculate heightened urgency for CCMC road works.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {safeReports.length === 0 ? (
              <div className="col-span-full p-8 text-center bg-white rounded-3xl border border-slate-200">
                <p className="text-xs text-slate-500">
                  No community complaints reported yet in Coimbatore. Be the first to register a road defect!
                </p>
              </div>
            ) : (
              safeReports.map((r) => (
              <div
                key={r.report_id}
                className="p-5 rounded-3xl border border-slate-200 bg-white shadow-sm space-y-3 flex flex-col justify-between hover:shadow-md transition-shadow"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono text-emerald-700 font-bold">{r.report_id}</span>
                    <div className="flex items-center gap-1.5">
                      {r.is_critical && (
                        <span className="text-[10px] px-2 py-0.5 font-bold rounded-full bg-red-100 text-red-700 border border-red-200">
                          CRITICAL
                        </span>
                      )}
                      <span
                        className={`text-[10px] px-2 py-0.5 font-bold rounded-full ${
                          r.status === 'Resolved'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 line-clamp-1">{r.location}</h4>
                  <p className="text-[11px] text-slate-500 line-clamp-2 mt-1">{r.description}</p>
                  {r.depth_inches && (
                    <div className="mt-2 text-[10px] text-slate-600 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                      Depth: <strong>{r.depth_inches}"</strong> • Diameter: <strong>{r.diameter_feet} ft</strong> • Accidents:{' '}
                      <strong className={r.accidents_count ? 'text-red-600' : 'text-slate-700'}>
                        {r.accidents_count || 0}
                      </strong>
                    </div>
                  )}
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Priority Score ($P$)</span>
                    <span className="font-mono font-bold text-emerald-700">{r.priority_score.toFixed(1)}/100</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Confirmations</span>
                    <span className="text-slate-700 font-medium">{r.linked_complaints_count} reports</span>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleConfirmExisting(r.report_id)}
                    className="w-full text-xs border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-slate-700 cursor-pointer shadow-xs"
                  >
                    <ThumbsUp size={12} className="mr-1.5 text-emerald-600" /> I Encountered This Pothole
                  </Button>
                </div>
              </div>
            )))}
          </div>
        </div>
      )}
    </div>
  );
}
