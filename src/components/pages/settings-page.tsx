import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Settings,
  Server,
  Cpu,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Save,
  RotateCcw,
  Zap,
  Lock,
  Globe,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getConfig, saveConfig, resetConfig, AppConfig } from '@/lib/config';
import { apiClient } from '@/lib/api_client';
import { HealthResponse } from '@/lib/types';
import { toast } from 'sonner';

interface SettingsPageProps {
  onConfigChange: () => void;
}

export function SettingsPage({ onConfigChange }: SettingsPageProps) {
  const [config, setConfigState] = useState<AppConfig>(getConfig());
  const [baseUrlInput, setBaseUrlInput] = useState(config.apiBaseUrl);
  const [useMockInput, setUseMockInput] = useState(config.useMockApi);
  const [timeoutInput, setTimeoutInput] = useState(config.apiTimeoutSeconds);

  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  async function checkBackendHealth() {
    setHealthLoading(true);
    try {
      const h = await apiClient.getHealth();
      setHealthData(h);
      toast.success(`Health check passed: ${h.status}`);
    } catch (err: any) {
      setHealthData(null);
      toast.error(err.message || 'Could not connect to backend server');
    } finally {
      setHealthLoading(false);
    }
  }

  useEffect(() => {
    void checkBackendHealth();
  }, []);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const updated = saveConfig({
      apiBaseUrl: baseUrlInput.trim(),
      useMockApi: useMockInput,
      apiTimeoutSeconds: Number(timeoutInput) || 30,
    });
    setConfigState(updated);
    toast.success('Configuration saved successfully!');
    onConfigChange();
    void checkBackendHealth();
  }

  function handleReset() {
    const res = resetConfig();
    setConfigState(res);
    setBaseUrlInput(res.apiBaseUrl);
    setUseMockInput(res.useMockApi);
    setTimeoutInput(res.apiTimeoutSeconds);
    toast.info('Reset configuration to defaults.');
    onConfigChange();
    void checkBackendHealth();
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-card border border-border rounded-lg p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Settings className="w-3.5 h-3.5" /> Section 3.6 • Configuration & Settings
          </div>
          <h2 className="text-xl font-bold text-foreground">API Connection & System Status</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure backend target URLs, switch mock demo modes, and test connection latency.
          </p>
        </div>
      </div>

      {/* Security Notice Banner */}
      <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
        <Lock className="w-4 h-4 text-emerald-500 shrink-0" />
        <div>
          <strong>Credential Security Guarantee:</strong> Private API tokens, database passwords, and model secret keys are stored in backend environment files and are never exposed in frontend client code.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form Configuration */}
        <motion.div
          initial={{ opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-7 bg-card border border-border rounded-lg p-6 shadow-sm space-y-5 text-xs"
        >
          <div className="border-b border-border pb-3 flex items-center justify-between">
            <div className="font-bold text-foreground text-sm flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" /> API Environment Settings
            </div>
            <span className="text-[10px] text-muted-foreground">Persisted in LocalStorage</span>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            {/* API Base URL */}
            <div className="space-y-1.5">
              <label className="font-medium text-foreground block">
                API Base URL <code className="text-primary bg-secondary px-1 py-0.5 rounded">API_BASE_URL</code>
              </label>
              <input
                type="text"
                required
                value={baseUrlInput}
                onChange={(e) => setBaseUrlInput(e.target.value)}
                placeholder="http://127.0.0.1:8000/api/v1"
                className="w-full px-3 py-2 border border-border rounded bg-background text-foreground font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-[10px] text-muted-foreground block">
                Default: http://127.0.0.1:8000/api/v1
              </span>
            </div>

            {/* Mock Mode Toggle */}
            <div className="p-3.5 rounded-lg border border-border bg-background space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-foreground flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-primary" /> Enable Mock Demo Mode (<code className="text-xs">USE_MOCK_API</code>)
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Use synthetic demo dataset when backend Python server is offline.
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useMockInput}
                    onChange={(e) => setUseMockInput(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
                </label>
              </div>

              <div className="text-[10px] font-mono text-muted-foreground pt-1 border-t border-border">
                Status: {useMockInput ? 'MOCK_API_ENABLED (Offline-Ready)' : 'REAL_BACKEND_API (HTTP Requests)'}
              </div>
            </div>

            {/* Timeout Input */}
            <div className="space-y-1.5">
              <label className="font-medium text-foreground block">
                API Timeout (Seconds)
              </label>
              <input
                type="number"
                min={5}
                max={120}
                value={timeoutInput}
                onChange={(e) => setTimeoutInput(Number(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded bg-background text-foreground font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Buttons */}
            <div className="pt-3 flex items-center gap-3">
              <Button type="submit" className="flex-1 h-9 text-xs font-semibold gap-1.5">
                <Save className="w-3.5 h-3.5" /> Save Configuration
              </Button>
              <Button type="button" variant="outline" onClick={handleReset} className="h-9 px-3 text-xs gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" /> Reset Defaults
              </Button>
            </div>
          </form>
        </motion.div>

        {/* Right Column: Live Backend Health Card */}
        <motion.div
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-5 bg-card border border-border rounded-lg p-6 shadow-sm space-y-5 text-xs flex flex-col justify-between"
        >
          <div>
            <div className="border-b border-border pb-3 flex items-center justify-between">
              <div className="font-bold text-foreground text-sm flex items-center gap-2">
                <Server className="w-4 h-4 text-primary" /> Backend Server Health
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={checkBackendHealth}
                disabled={healthLoading}
                className="h-6 px-2 text-[11px] text-primary gap-1"
              >
                {healthLoading ? <Loader2 className="animate-spin w-3 h-3" /> : <RefreshCw className="w-3 h-3" />}
                Ping Health
              </Button>
            </div>

            <div className="space-y-3 pt-3">
              {/* Status Pill */}
              <div className="p-3.5 rounded-lg border bg-background flex items-center justify-between">
                <span className="text-muted-foreground">Connection Status</span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-xs ${
                    healthData?.status === 'healthy' || healthData?.status === 'ok'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                  }`}
                >
                  {healthData?.status === 'healthy' || healthData?.status === 'ok' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  )}
                  {healthData?.status || 'Offline'}
                </span>
              </div>

              {/* Mode & Version */}
              <div className="p-3.5 rounded-lg border border-border bg-background space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Active Engine:</span>
                  <span className="font-semibold text-foreground font-mono">
                    {healthData?.mode === 'mock' ? 'Mock Engine' : 'PyTorch Production'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Server Version:</span>
                  <span className="font-mono text-primary font-medium">{healthData?.version || '1.4.2'}</span>
                </div>
                {healthData?.latency_ms !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">API Latency:</span>
                    <span className="font-mono text-amber-500 font-medium flex items-center gap-1">
                      <Zap className="w-3 h-3" /> {healthData.latency_ms} ms
                    </span>
                  </div>
                )}
                {healthData?.database && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Database Engine:</span>
                    <span className="font-mono text-foreground text-[11px]">{healthData.database}</span>
                  </div>
                )}
              </div>

              {/* Application Metadata */}
              <div className="p-3.5 rounded-lg border border-border bg-background space-y-1.5 text-[11px]">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" /> RoadSense AI Frontend Info
                </div>
                <div className="text-muted-foreground">App Name: RoadSense AI Dashboard</div>
                <div className="text-muted-foreground">Build Environment: Vite + React + TypeScript</div>
                <div className="text-muted-foreground">Style Tokens: Global OKLCH Design Tokens</div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border text-[10px] text-muted-foreground text-center">
            RoadSense AI Frontend Full Implementation Guide • End-to-End Complete
          </div>
        </motion.div>
      </div>
    </div>
  );
}
