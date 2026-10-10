import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload,
  LocateFixed,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Zap,
  Tag,
  DollarSign,
  Clock,
  Crosshair,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api_client';
import { CreateReportResponse } from '@/lib/types';
import { toast } from 'sonner';

export function ReportDetectPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [roadName, setRoadName] = useState('');
  const [source, setSource] = useState('Resident Mobile App');
  const [latitude, setLatitude] = useState<string>('12.9716');
  const [longitude, setLongitude] = useState<string>('77.5946');
  const [severityInput, setSeverityInput] = useState<number>(2);
  const [criticalityInput, setCriticalityInput] = useState<number>(2);
  const [description, setDescription] = useState('');

  const [geoBusy, setGeoBusy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [detectionResult, setDetectionResult] = useState<CreateReportResponse | null>(null);

  function handleFileChange(file: File | null) {
    if (!file) {
      setImageFile(null);
      setPreviewUrl(null);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size exceeds 10 MB limit.');
      return;
    }
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function handleGPSLocation() {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setGeoBusy(false);
        toast.success('Current GPS coordinates captured!');
      },
      (err) => {
        setGeoBusy(false);
        toast.error(`Could not get GPS location: ${err.message}`);
      },
      { timeout: 10000 }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);

    if (isNaN(latNum) || isNaN(lngNum)) {
      toast.error('Please enter valid numerical latitude and longitude coordinates.');
      return;
    }

    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      toast.error('Coordinates out of range. Latitude must be -90..90, Longitude -180..180.');
      return;
    }

    setIsSubmitting(true);
    setDetectionResult(null);

    try {
      const req: any = {
        latitude: latNum,
        longitude: lngNum,
        source,
        severity: severityInput,
        criticality: criticalityInput,
      };
      if (imageFile) req.image = imageFile;
      if (roadName.trim()) req.road_name = roadName.trim();
      if (description.trim()) req.description = description.trim();

      const res = await apiClient.createReport(req);

      setDetectionResult(res);
      toast.success(`Report ${res.report_id} created successfully!`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit report and run detection.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleReset() {
    setImageFile(null);
    setPreviewUrl(null);
    setRoadName('');
    setDescription('');
    setDetectionResult(null);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Form Inputs */}
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        className="lg:col-span-6 bg-card border border-border rounded-lg p-6 shadow-sm space-y-5"
      >
        <div className="border-b border-border pb-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider mb-1">
            <Sparkles className="w-4 h-4" /> Section 3.2 • Report & Detect
          </div>
          <h2 className="text-xl font-bold text-foreground">Submit Pothole & Automated Inference</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Upload road imagery and location. The backend AI model detects damage class, computes priority score, and estimates repair effort.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* File Upload Zone */}
          <div className="space-y-1.5">
            <label className="font-medium text-foreground block">
              Pothole Image <span className="text-muted-foreground font-normal">(Optional preview in mock)</span>
            </label>
            <div className="upload-zone">
              {previewUrl ? (
                <div className="relative w-full h-40 rounded overflow-hidden group">
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                  <motion.div
                    className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] pointer-events-none"
                    animate={{ top: ['0%', '100%', '0%'] }}
                    transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium backdrop-blur-[2px]">
                    Click or drag to change image
                  </div>
                </div>
              ) : (
                <>
                  <Upload size={24} className="text-muted-foreground" />
                  <strong>{imageFile ? imageFile.name : 'Select or drop pothole photograph'}</strong>
                  <small>JPG, PNG or WebP · Up to 10 MB</small>
                </>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          {/* Coordinates & GPS */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="font-medium text-foreground">
                Location Coordinates <span className="text-rose-500">*</span>
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleGPSLocation}
                disabled={geoBusy}
                className="h-6 text-[11px] text-primary gap-1 px-2"
              >
                <LocateFixed className="w-3.5 h-3.5" />
                {geoBusy ? 'Fetching GPS...' : 'Use My GPS Location'}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-muted-foreground block mb-1">Latitude</span>
                <input
                  type="text"
                  required
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="12.9716"
                  className="w-full px-3 py-2 border border-border rounded bg-background text-foreground text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block mb-1">Longitude</span>
                <input
                  type="text"
                  required
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="77.5946"
                  className="w-full px-3 py-2 border border-border rounded bg-background text-foreground text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Road Name & Source */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-medium text-foreground block mb-1">Road / Street Name</label>
              <input
                type="text"
                value={roadName}
                onChange={(e) => setRoadName(e.target.value)}
                placeholder="e.g. MG Road, Indiranagar"
                className="w-full px-3 py-2 border border-border rounded bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="font-medium text-foreground block mb-1">Report Source</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option>Resident Mobile App</option>
                <option>Dashcam AI Stream</option>
                <option>City Web Portal</option>
                <option>Municipal Inspector</option>
              </select>
            </div>
          </div>

          {/* Severity & Criticality Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="font-medium text-foreground block mb-1">Visual Severity</label>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { level: 1, label: 'Low' },
                  { level: 2, label: 'Mod' },
                  { level: 3, label: 'High' },
                ].map((s) => (
                  <button
                    type="button"
                    key={s.level}
                    onClick={() => setSeverityInput(s.level)}
                    className={`py-1.5 px-2 rounded text-[11px] font-medium transition-colors border ${
                      severityInput === s.level
                        ? s.level === 3
                          ? 'bg-rose-500/10 border-rose-500 text-rose-600 dark:text-rose-400 font-semibold'
                          : s.level === 2
                          ? 'bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400 font-semibold'
                          : 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-semibold'
                        : 'border-border bg-background text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="font-medium text-foreground block mb-1">Road Traffic Criticality</label>
              <select
                value={criticalityInput}
                onChange={(e) => setCriticalityInput(Number(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value={1}>1 - Local Residential (Low)</option>
                <option value={2}>2 - Major Arterial (Medium)</option>
                <option value={3}>3 - Critical Transit / Highway (High)</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="font-medium text-foreground block mb-1">Additional Observations</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Size, water pooling, traffic risk details..."
              className="w-full px-3 py-2 border border-border rounded bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            />
          </div>

          {/* Submit Action */}
          <div className="pt-2 flex items-center gap-3">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 h-10 text-xs font-semibold gap-2 shadow"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin w-4 h-4" />
                  Running AI Detection & Triage...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Submit Report & Run Detection
                </>
              )}
            </Button>
            {detectionResult && (
              <Button type="button" variant="outline" onClick={handleReset} className="h-10 px-3 text-xs">
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </form>
      </motion.div>

      {/* Right Column: AI Inference & Report Result Display */}
      <motion.div
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        className="lg:col-span-6 bg-card border border-border rounded-lg p-6 shadow-sm flex flex-col justify-between"
      >
        <div>
          <div className="border-b border-border pb-4 mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">
                Backend Output & Analysis
              </div>
              <h3 className="text-lg font-bold text-foreground">Detection Results</h3>
            </div>
            {detectionResult && (
              <span
                className={`text-[10px] px-2.5 py-1 rounded-full font-mono font-medium ${
                  detectionResult.is_demo
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {detectionResult.is_demo ? '⚡ Demo Fallback Engine' : '🤖 Production YOLO Model'}
              </span>
            )}
          </div>

          {!detectionResult && !isSubmitting && (
            <div className="py-16 text-center text-muted-foreground space-y-3">
              <Crosshair className="w-12 h-12 mx-auto text-primary/40 animate-pulse" />
              <div className="font-medium text-foreground text-sm">Awaiting Report Submission</div>
              <p className="max-w-xs mx-auto text-xs text-muted-foreground">
                Fill out the location details on the left and submit to view instant backend detection bounding classes, priority scores, and cost estimates.
              </p>
            </div>
          )}

          {isSubmitting && (
            <div className="py-16 text-center space-y-4">
              <Loader2 className="w-10 h-10 mx-auto text-primary animate-spin" />
              <div className="font-semibold text-foreground text-sm">Processing Image & Querying AI Model...</div>
              <p className="text-xs text-muted-foreground">
                Generating priority score based on severity, road criticality, and repair estimate models.
              </p>
            </div>
          )}

          {detectionResult && !isSubmitting && (
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
              {/* Header result badge */}
              <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div>
                    <div className="font-bold text-sm">{detectionResult.report_id}</div>
                    <div className="text-[11px] opacity-90">{detectionResult.message || 'Report logged successfully'}</div>
                  </div>
                </div>
                <div className="text-right font-mono text-xs">
                  <div>Lat: {detectionResult.latitude.toFixed(4)}</div>
                  <div>Lng: {detectionResult.longitude.toFixed(4)}</div>
                </div>
              </div>

              {/* Detections List */}
              <div className="p-4 rounded-lg bg-background border border-border space-y-2.5 text-xs">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-primary" /> Detected Damage Classes & Confidence
                </div>
                <div className="space-y-2 pt-1">
                  {detectionResult.detections.map((det, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between font-medium">
                        <span>{det.class_name}</span>
                        <span className="font-mono text-primary">{(det.confidence * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-500"
                          style={{ width: `${det.confidence * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-background border border-border rounded-lg">
                  <div className="text-muted-foreground flex items-center gap-1 mb-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                    Severity Level
                  </div>
                  <div className="text-base font-bold text-foreground">{detectionResult.severity}</div>
                </div>

                <div className="p-3 bg-background border border-border rounded-lg">
                  <div className="text-muted-foreground flex items-center gap-1 mb-1">
                    <Zap className="w-3.5 h-3.5 text-primary" />
                    Priority Score
                  </div>
                  <div className="text-base font-bold text-primary">{detectionResult.priority_score.toFixed(1)} / 90.0</div>
                </div>

                <div className="p-3 bg-background border border-border rounded-lg">
                  <div className="text-muted-foreground flex items-center gap-1 mb-1">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                    Est. Repair Cost
                  </div>
                  <div className="text-base font-bold font-mono text-foreground">
                    ${detectionResult.estimated_cost.toLocaleString()}
                  </div>
                </div>

                <div className="p-3 bg-background border border-border rounded-lg">
                  <div className="text-muted-foreground flex items-center gap-1 mb-1">
                    <Clock className="w-3.5 h-3.5 text-blue-500" />
                    Est. Crew Hours
                  </div>
                  <div className="text-base font-bold font-mono text-foreground">
                    {detectionResult.estimated_hours} hrs
                  </div>
                </div>
              </div>

              {/* Explicit Fallback Warning Note (Section 3.2 requirement) */}
              {detectionResult.is_demo && (
                <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                  <div>
                    <strong>Demo / Fallback Mode Active:</strong> Values above are generated by the backend fallback model for demonstration. When the PyTorch YOLO model is connected, real inference bounding boxes will be returned.
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>

        <div className="pt-4 border-t border-border text-[11px] text-muted-foreground flex items-center justify-between">
          <span>Endpoint: POST /api/v1/reports</span>
          <span>Multipart / JSON payload</span>
        </div>
      </motion.div>
    </div>
  );
}
