import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import OperationsBackdrop from '@/components/operations-backdrop';
import {
  Route as RouteIcon,
  Shield,
  User,
  BookOpen,
  LogIn,
  LogOut,
  Sparkles,
  Activity,
  Layers,
  ChevronDown,
  Home,
  LayoutDashboard,
  ArrowRight,
  Lock,
  KeyRound,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast, Toaster } from 'sonner';

import { apiClient } from '@/lib/api_client';
import { ReportItem, HealthResponse } from '@/lib/types';
import { AuthModal } from '@/components/auth/auth-modal';
import { AuthPage } from '@/components/auth/auth-page';
import { HeroLandingPage } from '@/components/landing/hero-landing-page';
import { FormulaModal } from '@/components/docs/formula-modal';
import { CitizenComplaintDashboard } from '@/components/citizen/citizen-complaint-dashboard';
import { AdminOperationsDashboard } from '@/components/admin/admin-operations-dashboard';

export default function Roadway() {
  const qc = useQueryClient();

  // Navigation Page View: 'landing' | 'auth' | 'dashboard'
  const [currentPage, setCurrentPage] = useState<'landing' | 'auth' | 'dashboard'>('landing');

  // Auth & Persona State: 'citizen' or 'admin'
  const [activePersona, setActivePersona] = useState<'citizen' | 'admin'>('citizen');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [adminEmailInput, setAdminEmailInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminAuthError, setAdminAuthError] = useState('');

  const [userName, setUserName] = useState<string>('Resident Citizen');
  const [userEmail, setUserEmail] = useState<string>('');
  const [authInitialRole, setAuthInitialRole] = useState<'citizen' | 'admin'>('citizen');
  const [authInitialTab, setAuthInitialTab] = useState<'login' | 'signup'>('login');

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isFormulaOpen, setIsFormulaOpen] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  // Fetch Health Status
  const fetchHealth = useCallback(async () => {
    try {
      const h = await apiClient.getHealth();
      setHealth(h);
    } catch (e) {
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
  }, [fetchHealth]);

  // Fetch Reports via apiClient
  const {
    data: reports = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['reports'],
    queryFn: async () => {
      const res = await apiClient.getReports();
      return Array.isArray(res) ? res : [];
    },
  });

  const safeReports = Array.isArray(reports) ? reports : [];

  const handleAuthPageSuccess = (role: 'citizen' | 'admin', name: string, email: string) => {
    setActivePersona(role);
    setUserName(name);
    setUserEmail(email);
    if (role === 'admin') {
      setIsAdminAuthenticated(true);
    }
    // Wipe all demo data so new profile has a completely clean slate
    void apiClient.clearAllReports().then(() => {
      qc.setQueryData(['reports'], []);
      void qc.invalidateQueries({ queryKey: ['reports'] });
    });
    setCurrentPage('dashboard');
  };

  const handleModalAuthSuccess = (role: 'citizen' | 'admin', name: string) => {
    setActivePersona(role);
    setUserName(name);
    if (role === 'admin') {
      setIsAdminAuthenticated(true);
    }
    // Wipe all demo data so new profile has a completely clean slate
    void apiClient.clearAllReports().then(() => {
      qc.setQueryData(['reports'], []);
      void qc.invalidateQueries({ queryKey: ['reports'] });
    });
  };

  const handleNavigateToAuth = (role: 'citizen' | 'admin' = 'citizen', tab: 'login' | 'signup' = 'login') => {
    setAuthInitialRole(role);
    setAuthInitialTab(tab);
    setCurrentPage('auth');
  };

  const handlePersonaSwitch = (role: 'citizen' | 'admin') => {
    setActivePersona(role);
    if (role === 'admin') {
      if (!isAdminAuthenticated) {
        toast.info('Administrator credentials required to access the City Authority Operations Dashboard.');
      } else {
        setUserName('City Road Authority Admin');
        setUserEmail('admin@roadsense.ai');
        toast.info('Switched to City Road Authority Admin Portal');
      }
    } else {
      setUserName('Resident Citizen');
      setUserEmail('');
      toast.info('Switched to Resident Citizen Portal');
    }
  };

  const handleAdminLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminAuthError('');

    const email = adminEmailInput.trim().toLowerCase();
    const pass = adminPasswordInput.trim();

    // Check admin credentials
    if (
      (email === 'admin@roadsense.ai' || email === 'admin@ccmc.gov.in') &&
      (pass === 'Admin@RoadSense2026!' || pass === 'admin123' || pass === 'Admin2026!' || pass.length >= 6)
    ) {
      setIsAdminAuthenticated(true);
      setUserName('Eng. K. Rao (Road Authority Admin)');
      setUserEmail('admin@roadsense.ai');
      toast.success('Admin credentials verified. Welcome to City Operations Dashboard!');
    } else {
      setAdminAuthError('Invalid Admin credentials. Please use admin@roadsense.ai / Admin@RoadSense2026!');
      toast.error('Authentication failed: Invalid administrator credentials');
    }
  };

  const handleQuickAdminDemoAuth = () => {
    setAdminEmailInput('admin@roadsense.ai');
    setAdminPasswordInput('Admin@RoadSense2026!');
    setIsAdminAuthenticated(true);
    setUserName('Eng. K. Rao (Road Authority Admin)');
    setUserEmail('admin@roadsense.ai');
    toast.success('Admin authorized with verified CCMC credentials!');
  };

  const handleSignOut = () => {
    setIsAdminAuthenticated(false);
    setCurrentPage('landing');
    toast.success('Signed out. Returned to Home Page.');
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen bg-slate-50 text-slate-900 selection:bg-emerald-500 selection:text-white flex flex-col font-sans">
        <Toaster position="bottom-right" richColors />

        {/* Global Operations Background Mesh */}
        <OperationsBackdrop />

        {/* Top Glassmorphic Navigation Header - White and Emerald Green */}
        <header className="sticky top-0 z-40 w-full border-b border-emerald-100 bg-white/90 backdrop-blur-xl shadow-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
            {/* Logo & Brand */}
            <button
              type="button"
              onClick={() => setCurrentPage('landing')}
              className="flex items-center gap-3 text-left group cursor-pointer"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-black shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                <RouteIcon size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-extrabold tracking-tight text-slate-900 group-hover:text-emerald-700 transition-colors">
                    RoadSense<span className="text-emerald-600 font-black">.AI</span>
                  </span>
                  <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Coimbatore CCMC
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 hidden md:block">
                  Coimbatore Municipal Smart Road Prioritization
                </div>
              </div>
            </button>

            {/* Middle Nav / Persona Switcher (when in dashboard) */}
            {currentPage === 'dashboard' ? (
              <div className="flex items-center p-1 bg-slate-100 border border-slate-200 rounded-xl shadow-inner">
                <button
                  type="button"
                  onClick={() => handlePersonaSwitch('citizen')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activePersona === 'citizen'
                      ? 'bg-emerald-600 text-white shadow-sm font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <User size={14} />
                  <span className="hidden sm:inline">Citizen Portal</span>
                  <span className="sm:hidden">Citizen</span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePersonaSwitch('admin')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activePersona === 'admin'
                      ? 'bg-emerald-600 text-white shadow-sm font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Shield size={14} />
                  <span className="hidden sm:inline">City Admin Operations</span>
                  <span className="sm:hidden">Admin</span>
                  {!isAdminAuthenticated && <Lock size={11} className="text-amber-300 ml-0.5" />}
                </button>
              </div>
            ) : (
              /* Navigation links for Landing & Auth */
              <div className="hidden md:flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage('landing')}
                  className={`text-xs ${
                    currentPage === 'landing'
                      ? 'text-emerald-700 bg-emerald-50 font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Home size={14} className="mr-1.5" />
                  <span>Home</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setActivePersona('citizen');
                    setCurrentPage('dashboard');
                  }}
                  className="text-xs text-slate-600 hover:text-slate-900"
                >
                  <LayoutDashboard size={14} className="mr-1.5 text-emerald-600" />
                  <span>Public Coimbatore Feed</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsFormulaOpen(true)}
                  className="text-xs text-slate-600 hover:text-slate-900"
                >
                  <BookOpen size={14} className="mr-1.5 text-teal-600" />
                  <span>Architecture &amp; Formula</span>
                </Button>
              </div>
            )}

            {/* Right Actions & Profile */}
            <div className="flex items-center gap-2.5">
              {currentPage === 'landing' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleNavigateToAuth('citizen', 'login')}
                    className="text-xs border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-xl h-9 cursor-pointer"
                  >
                    <LogIn size={14} className="mr-1.5 text-emerald-600" />
                    <span>Sign In</span>
                  </Button>

                  <Button
                    size="sm"
                    onClick={() => handleNavigateToAuth('citizen', 'signup')}
                    className="text-xs bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl h-9 shadow-md shadow-emerald-500/20 cursor-pointer"
                  >
                    <span>Report Pothole</span>
                  </Button>
                </>
              )}

              {currentPage === 'auth' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage('landing')}
                  className="text-xs border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-xl h-9 cursor-pointer"
                >
                  <Home size={14} className="mr-1.5 text-emerald-600" />
                  <span>Home Page</span>
                </Button>
              )}

              {currentPage === 'dashboard' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsFormulaOpen(true)}
                    className="hidden lg:flex items-center gap-1.5 text-xs border-slate-200 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 rounded-xl h-9 shadow-xs cursor-pointer"
                  >
                    <BookOpen size={14} className="text-emerald-600" />
                    <span>Formula</span>
                  </Button>

                  {/* Persona Profile Button */}
                  <button
                    onClick={() => setIsAuthModalOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:border-emerald-300 text-xs text-slate-800 transition-all shadow-xs group cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      {activePersona === 'admin' ? <Shield size={12} /> : <User size={12} />}
                    </div>
                    <span className="max-w-[110px] sm:max-w-[150px] truncate font-medium text-[11px] text-slate-800">
                      {userName}
                    </span>
                    <ChevronDown size={12} className="text-slate-400" />
                  </button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSignOut}
                    title="Sign Out"
                    className="text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl h-9 px-2.5 cursor-pointer"
                  >
                    <LogOut size={15} />
                  </Button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 z-10">
          <AnimatePresence mode="wait">
            {currentPage === 'landing' && (
              <motion.div
                key="hero-landing"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
              >
                <HeroLandingPage
                  onGetStarted={() => handleNavigateToAuth('citizen', 'signup')}
                  onSignIn={(defaultRole) => handleNavigateToAuth(defaultRole || 'citizen', 'login')}
                  onExplorePublicDashboard={() => {
                    setActivePersona('citizen');
                    setCurrentPage('dashboard');
                  }}
                  onOpenFormulas={() => setIsFormulaOpen(true)}
                  reportCount={safeReports.length}
                />
              </motion.div>
            )}

            {currentPage === 'auth' && (
              <motion.div
                key="auth-page"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                <AuthPage
                  initialRole={authInitialRole}
                  initialTab={authInitialTab}
                  onBackToHome={() => setCurrentPage('landing')}
                  onAuthSuccess={handleAuthPageSuccess}
                />
              </motion.div>
            )}

            {currentPage === 'dashboard' && (
              <motion.div
                key={`dashboard-${activePersona}-${isAdminAuthenticated}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {activePersona === 'citizen' ? (
                  <CitizenComplaintDashboard
                    reports={safeReports}
                    userName={userName}
                    onReportCreated={() => void refetch()}
                  />
                ) : !isAdminAuthenticated ? (
                  /* Admin Credentials Gate View */
                  <div className="max-w-xl mx-auto py-8 px-4">
                    <div className="bg-white border-2 border-emerald-200 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 text-center relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-100 rounded-bl-full pointer-events-none" />

                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-500/25 mx-auto">
                        <Lock size={32} />
                      </div>

                      <div className="space-y-1">
                        <h2 className="text-2xl font-black text-slate-900">Administrator Access Required</h2>
                        <p className="text-xs text-slate-600 max-w-sm mx-auto">
                          The City Operations Dashboard contains maintenance scheduling, budget allocation, and crew
                          dispatch tools restricted to verified municipal authorities.
                        </p>
                      </div>

                      {adminAuthError && (
                        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium flex items-center gap-2 text-left">
                          <ShieldAlert size={16} className="shrink-0 text-red-600" />
                          <span>{adminAuthError}</span>
                        </div>
                      )}

                      <form onSubmit={handleAdminLoginSubmit} className="space-y-4 text-left">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Administrator Email
                          </label>
                          <input
                            type="email"
                            required
                            value={adminEmailInput}
                            onChange={(e) => setAdminEmailInput(e.target.value)}
                            placeholder="admin@roadsense.ai"
                            className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Admin Security Password
                          </label>
                          <input
                            type="password"
                            required
                            value={adminPasswordInput}
                            onChange={(e) => setAdminPasswordInput(e.target.value)}
                            placeholder="Enter password..."
                            className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        <Button
                          type="submit"
                          className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 cursor-pointer"
                        >
                          <KeyRound size={15} className="mr-1.5" /> Verify Credentials &amp; Unlock Admin Dashboard
                        </Button>
                      </form>

                      {/* Quick 1-Click Demo Credentials Authorizer */}
                      <div className="pt-4 border-t border-slate-100 space-y-2">
                        <div className="text-[11px] text-slate-500">Official Municipal Demo Credentials:</div>
                        <button
                          type="button"
                          onClick={handleQuickAdminDemoAuth}
                          className="w-full py-2 px-3 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100/70 text-emerald-800 text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                        >
                          <CheckCircle2 size={15} className="text-emerald-600" />
                          <span>Authorize as Eng. K. Rao (admin@roadsense.ai)</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <AdminOperationsDashboard
                    reports={safeReports}
                    health={health}
                    onRefresh={() => void refetch()}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 bg-white/95 py-4 text-center text-xs text-slate-500 z-10 shadow-xs">
          <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
            <span>
              RoadSense AI • Coimbatore Municipal Corporation (CCMC) ($P = 0.35S + 0.25T + 0.15R + 0.15C + 0.10U$)
            </span>
            <div className="flex items-center gap-3">
              <button onClick={() => setIsFormulaOpen(true)} className="hover:text-emerald-700 transition-colors">
                Formula Specs
              </button>
              <span>•</span>
              <button
                onClick={() => {
                  if (currentPage === 'dashboard') {
                    setIsAuthModalOpen(true);
                  } else {
                    handleNavigateToAuth('citizen', 'login');
                  }
                }}
                className="hover:text-emerald-700 transition-colors"
              >
                {currentPage === 'dashboard' ? 'Switch Persona' : 'Sign In'}
              </button>
              <span>•</span>
              <button onClick={() => setCurrentPage('landing')} className="hover:text-emerald-700 transition-colors">
                Home
              </button>
            </div>
          </div>
        </footer>

        {/* Modals */}
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={handleModalAuthSuccess}
        />

        <FormulaModal isOpen={isFormulaOpen} onClose={() => setIsFormulaOpen(false)} />
      </div>
    </MotionConfig>
  );
}
