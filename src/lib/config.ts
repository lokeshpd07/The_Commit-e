export interface AppConfig {
  apiBaseUrl: string;
  useMockApi: boolean;
  apiTimeoutSeconds: number;
}

const STORAGE_KEY = 'roadsense_app_config';

const defaultConfig: AppConfig = {
  apiBaseUrl: (import.meta.env['VITE_API_BASE_URL'] as string | undefined) || 'http://127.0.0.1:8000/api/v1',
  useMockApi: import.meta.env['VITE_USE_MOCK_API'] !== undefined 
    ? import.meta.env['VITE_USE_MOCK_API'] === 'true' 
    : true,
  apiTimeoutSeconds: 30,
};

export function getConfig(): AppConfig {
  if (typeof window === 'undefined') return defaultConfig;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...defaultConfig, ...parsed };
    }
  } catch (e) {
    console.error('Failed to parse saved config:', e);
  }
  return defaultConfig;
}

export function saveConfig(newConfig: Partial<AppConfig>): AppConfig {
  const current = getConfig();
  const updated = { ...current, ...newConfig };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  }
  return updated;
}

export function resetConfig(): AppConfig {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error('Failed to reset config:', e);
    }
  }
  return defaultConfig;
}
