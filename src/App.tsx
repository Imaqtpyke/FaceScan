import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera,
  RotateCw,
  Menu,
  X,
  ChevronLeft,
  User,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  Clock,
  Trash2,
  Settings,
  Sparkles,
  RefreshCw,
  Image as ImageIcon,
  UserCheck
} from 'lucide-react';

import { ScanResult, ScreenState, CameraDirectionType } from './types';
import { capturePhoto, preprocessImage } from './services/camera';
import { getScanHistory, saveScanResult, clearScanHistory } from './services/storage';
import { classifyCanvas, loadTeachableMachineModel } from './services/faceModel';

export default function App() {
  // Screens & Navigation
  const [activeScreen, setActiveScreen] = useState<ScreenState>('camera');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);

  // Model & Core State
  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cameraDirection, setCameraDirection] = useState<CameraDirectionType>('front');

  // Camera Permission / Availability State
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);

  // Scan Results
  const [activeResult, setActiveResult] = useState<ScanResult | null>(null);

  // History & Storage
  const [historyList, setHistoryList] = useState<ScanResult[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);

  // Toasts Alert State
  interface Toast {
    id: string;
    message: string;
    type: 'success' | 'warning' | 'error' | 'info';
  }
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Spin rotation angle tracker for flip button
  const [spinDeg, setSpinDeg] = useState(0);

  // Hidden file input ref for browser preview file upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Register real-time UTC Clock on top frame bar for authenticity
  const [simulatedTime, setSimulatedTime] = useState('');

  // Toast notifier helper
  const triggerToast = (message: string, type: 'success' | 'warning' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Run on startup: Synchronous initialize Teachable Machine & offline History
  useEffect(() => {
    let active = true;

    async function initializeCoreApp() {
      try {
        await loadTeachableMachineModel();
      } catch (err) {
        console.error('Offline TM Model Loader failed on startup:', err);
        if (active) setModelError(true);
      } finally {
        if (active) setModelLoading(false);
      }

      try {
        const historyData = await getScanHistory();
        if (active) setHistoryList(historyData);
      } catch (err) {
        console.error('History Preferences Loader failed on startup:', err);
        if (active) {
          setHistoryError(true);
          triggerToast('Unable to load history.', 'error');
        }
      }
    }

    initializeCoreApp();

    // Setup local simulated clock matching timezone format May 31, 2026
    const tick = () => {
      const now = new Date();
      setSimulatedTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    };
    tick();
    const interval = setInterval(tick, 60000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Helper: Format Dates consistently e.g., "May 31, 2026 · 10:42 AM"
  const getFormattedDate = (): string => {
    const date = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // first hour is 12

    return `${month} ${day}, ${year} · ${hours}:${minutes} ${ampm}`;
  };

  // Preprocesses and classifies captured Base64 image
  const processAndClassify = async (base64Data: string) => {
    setIsAnalyzing(true);
    try {
      // 1. Resize and crop to 224x224 1:1 on hidden canvas
      const { canvas, preprocessedBase64 } = await preprocessImage(base64Data);

      // 2. Classify using offline TM model (or fallback metrics helper)
      const classification = await classifyCanvas(canvas);

      // 3. Assemble scan result struct
      const newResult: ScanResult = {
        id: `scan_${Date.now()}`,
        photoBase64: preprocessedBase64,
        name: classification.name,
        studentId: classification.studentId,
        confidence: classification.confidence,
        timestamp: getFormattedDate(),
        status: classification.status,
      };

      // 4. Save scan report offline to Preferences
      try {
        await saveScanResult(newResult);
        // Refresh local memory history
        const refreshed = await getScanHistory();
        setHistoryList(refreshed);
      } catch (saveErr) {
        triggerToast('Could not save scan to history.', 'error');
      }

      setActiveResult(newResult);
      setActiveScreen('results');
    } catch (err: any) {
      console.error('Preprocessing or classification pipeline error:', err);
      triggerToast('Could not process the captured image. Please try again.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Action: CAPTURE PHOTO triggers capacitor camera
  const handleCapturePhoto = async () => {
    if (modelLoading) {
      triggerToast('Model is still loading. Please wait...', 'info');
      return;
    }
    if (modelError) {
      triggerToast('Face recognition model is not loaded.', 'error');
      return;
    }

    try {
      setCameraPermissionDenied(false);
      setCameraUnavailable(false);

      const capturedBase64 = await capturePhoto(cameraDirection);
      await processAndClassify(capturedBase64);
    } catch (err: any) {
      console.warn('Native Capacitor Camera call skipped or errored:', err);
      
      const errMsg = err?.message || '';
      if (errMsg.toLowerCase().includes('permission') || errMsg.toLowerCase().includes('denied')) {
        setCameraPermissionDenied(true);
      } else if (errMsg.toLowerCase().includes('unavailable') || errMsg.toLowerCase().includes('no camera')) {
        setCameraUnavailable(true);
      } else {
        // Safe automatic sandbox fallback: Open simulation view drawer so user isn't stuck holding errors!
        triggerToast('Native camera integration skipped in sandbox preview mode.', 'info');
        setSimulatorOpen(true);
      }
    }
  };

  // Flip Camera Action
  const toggleFlipCamera = () => {
    setSpinDeg((prev) => prev + 180);
    setCameraDirection((prev) => (prev === 'front' ? 'rear' : 'front'));
  };

  // Trigger simulated profiles manually on-screen
  const executeSimulation = (presetType: 'john' | 'jane' | 'unknown') => {
    setIsAnalyzing(true);
    setSimulatorOpen(false);

    setTimeout(async () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 224;
        canvas.height = 224;
        drawMockProfileToCanvas(presetType, canvas);

        const base64 = canvas.toDataURL('image/jpeg', 0.9);
        await processAndClassify(base64);
      } catch (err) {
        triggerToast('Simulator preprocessing failure.', 'error');
        setIsAnalyzing(false);
      }
    }, 1200); // realistic scan timing
  };

  // Live File Upload Handler (Fallback for browser testing)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        await processAndClassify(base64);
      }
    };
    reader.onerror = () => {
      triggerToast('Could not load image file.', 'error');
    };
    reader.readAsDataURL(file);
  };

  // Storage history cleaner triggers
  const handleClearHistory = async () => {
    try {
      await clearScanHistory();
      setHistoryList([]);
      setShowClearConfirmation(false);
      triggerToast('History cleared successfully.', 'success');
    } catch (err) {
      triggerToast('Could not clear scan history.', 'error');
    }
  };

  // Retry Model reloader callback
  const handleRetryModelLoad = async () => {
    setModelLoading(true);
    setModelError(false);
    try {
      await loadTeachableMachineModel();
      triggerToast('Face recognition model loaded successfully!', 'success');
    } catch (err) {
      console.error(err);
      setModelError(true);
      triggerToast('Model failed to load again. Please restart server.', 'error');
    } finally {
      setModelLoading(false);
    }
  };

  // Preset Draw Canvas vector avatars helper
  const drawMockProfileToCanvas = (type: 'john' | 'jane' | 'unknown', canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    // Gradient Backgrounds
    const grad = ctx.createLinearGradient(0, 0, w, h);
    if (type === 'john') {
      grad.addColorStop(0, '#1E3A8A'); // deep blue
      grad.addColorStop(1, '#3B82F6'); // primary accent blue
    } else if (type === 'jane') {
      grad.addColorStop(0, '#78350F'); // amber
      grad.addColorStop(1, '#F59E0B'); // warning amber
    } else {
      grad.addColorStop(0, '#1E293B'); // Slate
      grad.addColorStop(1, '#475569');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Grid effect
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Outer scanning circular radar lines
    ctx.strokeStyle = type === 'john' ? '#10B981' : type === 'jane' ? '#F59E0B' : '#F43F5E';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 85, 0, Math.PI * 2);
    ctx.stroke();

    // User Avatar drawing
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 10;

    if (type !== 'unknown') {
      const cx = w / 2;
      const cy = h / 2 - 12;

      // Circle representing Head
      ctx.beginPath();
      ctx.arc(cx, cy, 32, 0, Math.PI * 2);
      ctx.fill();

      // Rounded neck & shoulders
      ctx.beginPath();
      ctx.ellipse(cx, cy + 68, 52, 38, 0, 0, Math.PI, true);
      ctx.fill();

      // Stylish Glasses
      ctx.fillStyle = type === 'john' ? '#10B981' : '#F59E0B';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(cx - 14, cy - 4, 7, 0, Math.PI * 2);
      ctx.arc(cx + 14, cy - 4, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.rect(cx - 14, cy - 6, 28, 3);
      ctx.fill();

      // Badge ID Banner
      ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
      ctx.beginPath();
      ctx.roundRect(cx - 45, cy + 44, 90, 18, 5);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(type === 'john' ? 'STUDENT #00123' : 'STUDENT #00567', cx, cy + 56);
    } else {
      // Question Mark indicator
      ctx.fillStyle = '#F8FAFC';
      ctx.font = 'bold 54px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('?', w / 2, h / 2 + 18);
    }
  };

  return (
    <div className="min-h-screen bg-[#090D1A] flex flex-col items-center justify-center font-sans text-[#F8FAFC] antialiased p-0 sm:p-4 selection:bg-blue-600 selection:text-white" id="facescan-app-container">
      
      {/* 1. Global Multi-Alert Toaster */}
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 w-[340px]" id="facescan-toaster">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              className={`p-3 rounded-xl shadow-lg border text-sm font-medium flex items-center justify-between gap-3 text-white ${
                toast.type === 'success'
                  ? 'bg-emerald-600 border-emerald-500'
                  : toast.type === 'warning'
                    ? 'bg-amber-600 border-amber-500'
                    : toast.type === 'error'
                      ? 'bg-rose-600 border-rose-500'
                      : 'bg-[#1E293B] border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                {toast.type === 'success' && <CheckCircle className="w-5 h-5 flex-shrink-0" />}
                {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 flex-shrink-0" />}
                {toast.type === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
                {toast.type === 'info' && <Sparkles className="w-5 h-5 flex-shrink-0" />}
                <span>{toast.message}</span>
              </div>
              <button onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))} className="text-white hover:opacity-80 transition" aria-label="Dismiss toast">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Portrait Simulator Trigger (Floating Action Button in Web Sandbox) */}
      <button
        onClick={() => setSimulatorOpen(true)}
        className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-xl z-40 flex items-center gap-2 group transition-all duration-300 md:scale-105 active:scale-95"
        id="simulate-scan-fab"
        title="Open browser face recognition controls"
      >
        <Sparkles className="w-5 h-5 animate-pulse" />
        <span className="max-w-0 overflow-hidden group-hover:max-w-[130px] transition-all duration-300 ease-in-out font-medium text-sm whitespace-nowrap">
          Face Simulator
        </span>
      </button>

      {/* 2. Sleek Smartphone Chassis Container Wrapper */}
      <div 
        className="w-full sm:max-w-[385px] sm:h-[812px] bg-[#0F172A] border-0 sm:border-[8px] sm:border-slate-800 rounded-none sm:rounded-[40px] shadow-2xl relative overflow-hidden flex flex-col justify-between"
        id="facescan-mobile-chassis"
      >
        
        {/* Device Screen Header with simulated status bars */}
        <div className="px-5 pt-3 pb-2 flex justify-between items-center bg-[#0F172A] border-b border-slate-800/40 select-none text-xs font-mono text-[#94A3B8]" id="mobile-notch-header">
          <div className="flex items-center gap-1 font-semibold text-emerald-500">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <span>OFFLINE LOCAL RECOGNITION</span>
          </div>
          <div className="flex items-center gap-2">
            <span>{simulatedTime || '10:42 AM'}</span>
            <div className="w-5 h-2.5 border border-slate-700 rounded-sm p-[1px] flex gap-[1px]">
              <div className="w-1 h-full bg-emerald-400 rounded-2xs"></div>
              <div className="w-1.5 h-full bg-emerald-400 rounded-2xs"></div>
              <div className="w-1 h-full bg-emerald-400 rounded-2xs"></div>
            </div>
          </div>
        </div>

        {/* 3. APP TOP NAV ACTION BAR */}
        <header className="px-5 py-4 flex items-center justify-between border-b border-slate-800/70" id="facescan-app-header">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping"></div>
            <h1 className="text-md font-extrabold tracking-widest text-[#F8FAFC]">
              FACESCAN<span className="text-blue-500">.</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Hamburger opens scan history drawer */}
            <button
              onClick={() => setHistoryOpen(true)}
              className="p-2 text-[#94A3B8] hover:text-[#F8FAFC] bg-[#1E293B]/60 hover:bg-[#1E293B] rounded-xl transition relative active:scale-95"
              id="hamburger-menu-btn"
              aria-label="Open scan history drawer"
            >
              <Menu className="w-5 h-5" />
              {historyList.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold font-mono">
                  {historyList.length}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* 4. MAIN WORKSPACE / ROUTER VIEWS */}
        <main className="flex-1 relative overflow-y-auto flex flex-col justify-between" id="facescan-main-content">
          
          <AnimatePresence mode="wait">
            
            {/* VIEW A: CAMERA HOME VIEW */}
            {activeScreen === 'camera' && (
              <motion.div
                key="camera-screen"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col justify-between p-5"
                id="camera-view-container"
              >
                {/* Error/Model alerts or default camera instructions */}
                <div className="flex-1 flex flex-col justify-center items-center gap-6">
                  
                  {/* Model failure state */}
                  {modelError ? (
                    <div className="bg-rose-950/40 border border-rose-900 rounded-2xl p-6 text-center max-w-[310px]" id="model-error-state">
                      <AlertCircle className="w-12 h-12 text-[#F43F5E] mx-auto mb-3" />
                      <h3 className="text-base font-bold text-[#F8FAFC] mb-1">Model Loading Error</h3>
                      <p className="text-xs text-[#94A3B8] mb-4">
                        Face recognition model could not be loaded. Please restart the app.
                      </p>
                      <button
                        onClick={handleRetryModelLoad}
                        className="px-4 py-2 bg-[#F43F5E] hover:bg-rose-600 text-white font-semibold text-xs rounded-xl flex items-center gap-2 mx-auto active:scale-95 transition"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retry Load
                      </button>
                    </div>
                  ) : cameraPermissionDenied ? (
                    // Camera permission failure state
                    <div className="bg-amber-950/40 border border-amber-900 rounded-2xl p-6 text-center max-w-[310px]" id="camera-denied-state">
                      <Settings className="w-12 h-12 text-[#F59E0B] mx-auto mb-3" />
                      <h3 className="text-base font-bold text-[#F8FAFC] mb-1">Camera Access Required</h3>
                      <p className="text-xs text-[#94A3B8] mb-4">
                        Camera access is required. Please enable it in settings.
                      </p>
                      <button
                        onClick={() => {
                          setCameraPermissionDenied(false);
                          triggerToast('Settings panel simulated. Camera permission updated to Granted!', 'success');
                        }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl mx-auto active:scale-95 transition"
                      >
                        Open Settings
                      </button>
                    </div>
                  ) : cameraUnavailable ? (
                    // Camera hardware missing error state
                    <div className="bg-slate-900/80 border border-slate-700 rounded-2xl p-6 text-center max-w-[310px]" id="camera-unavailable-state">
                      <AlertTriangle className="w-12 h-12 text-[#F43F5E] mx-auto mb-3" />
                      <h3 className="text-base font-bold text-[#F8FAFC] mb-1">Camera Unavailable</h3>
                      <p className="text-xs text-[#94A3B8] mb-4">
                        Camera unavailable on this device. Use the face simulator button instead.
                      </p>
                      <button
                        onClick={() => {
                          setCameraUnavailable(false);
                          setSimulatorOpen(true);
                        }}
                        className="px-4 py-2 bg-[#1E293B] border border-slate-700 text-[#F8FAFC] font-semibold text-xs rounded-xl mx-auto transition active:scale-95"
                      >
                        Try Simulator
                      </button>
                    </div>
                  ) : (
                    // Default Scanner face placement guide
                    <div className="flex flex-col items-center justify-center">
                      
                      {/* Interactive visual viewfinder with dynamic scan animation overlay */}
                      <div className="relative w-60 h-60 rounded-[32px] border-4 border-slate-800 bg-[#1E293B]/20 overflow-hidden shadow-inner flex items-center justify-center group" id="face-scanner-viewfinder">
                        
                        {/* Cool corner brackets */}
                        <div className="absolute top-4 left-4 w-6 h-6 border-t-4 border-l-4 border-blue-500 rounded-tl-lg"></div>
                        <div className="absolute top-4 right-4 w-6 h-6 border-t-4 border-r-4 border-blue-500 rounded-tr-lg"></div>
                        <div className="absolute bottom-4 left-4 w-6 h-6 border-b-4 border-l-4 border-blue-500 rounded-bl-lg"></div>
                        <div className="absolute bottom-4 right-4 w-6 h-6 border-b-4 border-r-4 border-blue-500 rounded-br-lg"></div>

                        {/* Scanner Laser Sweep Line */}
                        <motion.div
                          animate={{ top: ['0%', '100%', '0%'] }}
                          transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                          className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent z-10 shadow-[0_0_8px_rgba(59,130,246,0.8)]"
                        ></motion.div>

                        {/* Static face silhouette inside bracket guide */}
                        <div className="opacity-15 text-slate-400 group-hover:scale-105 group-hover:opacity-20 transition duration-500">
                          <User className="w-36 h-36 stroke-[1]" />
                        </div>

                        {/* Loading Model overlay */}
                        {modelLoading && (
                          <div className="absolute inset-0 bg-[#0F172A]/90 p-4 flex flex-col items-center justify-center text-center z-20">
                            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-3" />
                            <p className="text-xs font-semibold tracking-wider text-blue-400 animate-pulse">
                              LOADING MODEL...
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1">Initializing TensorFlow local files</p>
                          </div>
                        )}
                      </div>

                      {/* Instructions */}
                      <p className="mt-5 text-sm font-medium text-slate-400 select-none text-center">
                        Position your face and tap capture
                      </p>
                    </div>
                  )}

                </div>

                {/* BOTTOM CAMERA CONTROL RAIL */}
                <div className="flex items-center justify-center gap-10 mt-auto pt-4" id="camera-controls-rail">
                  
                  {/* File Upload Selector (Safe alternative for review) */}
                  <label className="p-3 text-slate-400 hover:text-white bg-slate-800/40 hover:bg-slate-800 border border-slate-850 rounded-full cursor-pointer transition active:scale-90" title="Upload selfie file to crop and classify">
                    <ImageIcon className="w-5 h-5" />
                    <input
                      type="file"
                      id="upload-selfie-file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept="image/*"
                      className="hidden"
                    />
                  </label>

                  {/* Main capture trigger */}
                  <button
                    onClick={handleCapturePhoto}
                    disabled={modelLoading || modelError}
                    className={`w-20 h-20 rounded-full p-1.5 border-4 transition-all duration-300 flex items-center justify-center shadow-xl active:scale-95 ${
                      modelLoading || modelError
                        ? 'border-slate-800 bg-[#1E293B]/20 cursor-not-allowed opacity-50'
                        : 'border-[#F8FAFC]/90 bg-white hover:bg-slate-100'
                    }`}
                    id="capture-photo-button"
                    title={modelLoading ? 'Teachable Machine Model still loading...' : 'Capture and analyze face'}
                  >
                    <div className="w-full h-full rounded-full bg-slate-100 flex items-center justify-center border border-slate-300">
                      <Camera className="w-8 h-8 text-[#0F172A]" />
                    </div>
                  </button>

                  {/* Flip direction button */}
                  <button
                    onClick={toggleFlipCamera}
                    className="p-3 text-slate-400 hover:text-white bg-slate-800/40 hover:bg-slate-800 border border-slate-850 rounded-full transition active:scale-90"
                    id="flip-camera-direction"
                    title="Change camera orientation"
                  >
                    <motion.div animate={{ rotate: spinDeg }} transition={{ duration: 0.4 }}>
                      <RotateCw className="w-5 h-5" />
                    </motion.div>
                  </button>
                </div>

                {/* Front / Rear orientation label tag */}
                <div className="text-center mt-3" id="orientation-indicator">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest bg-slate-900/60 px-3 py-1 rounded-full">
                    Camera Bias: {cameraDirection} direction
                  </span>
                </div>

              </motion.div>
            )}

            {/* VIEW B: CLASSIFICATION RESULTS STATE SCREEN (A, B, or C) */}
            {activeScreen === 'results' && activeResult && (
              <motion.div
                key="results-screen"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col justify-between p-5"
                id="results-view-container"
              >
                
                {/* Result Status card wrapper based on detected labels */}
                <div className="flex-1 flex flex-col gap-5 pt-2">
                  
                  {/* Cropped analysis avatar frame */}
                  <div className="flex justify-center flex-col items-center gap-1.5" id="output-face-crop">
                    <div className="relative">
                      <img
                        src={activeResult.photoBase64}
                        alt="Preprocessed cropped face analysis"
                        referrerPolicy="no-referrer"
                        className="w-24 h-24 rounded-full object-cover border-4 border-slate-850 bg-slate-800 shadow-lg"
                      />
                      <div className={`absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs border-2 border-slate-900 font-bold ${
                        activeResult.status === 'success' ? 'bg-emerald-500' :
                        activeResult.status === 'warning' ? 'bg-amber-500' : 'bg-rose-500'
                      }`}>
                        {activeResult.status === 'success' && <CheckCircle className="w-4 h-4" />}
                        {activeResult.status === 'warning' && <AlertTriangle className="w-4 h-4" />}
                        {activeResult.status === 'error' && <X className="w-4 h-4" />}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-[#94A3B8] tracking-widest bg-slate-900/55 px-2.5 py-0.5 rounded-full">
                      ANALYZED CROP
                    </span>
                  </div>

                  {/* Dynamic Status card (State A, State B, State C) */}
                  {activeResult.status === 'success' && (
                    /* State A: Match (confidence >= 75) */
                    <div className="bg-[#1E293B]/70 border border-slate-800 rounded-2xl p-4 flex flex-col items-center text-center gap-2" id="results-state-a">
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold font-sans tracking-wide">
                        <CheckCircle className="w-3.5 h-3.5" /> Successful Match
                      </span>
                      <div>
                        <h2 className="text-xl font-black text-white tracking-wide">{activeResult.name}</h2>
                        {activeResult.studentId && (
                          <p className="text-sm font-mono tracking-wider font-bold text-blue-400 mt-1">
                            ID: {activeResult.studentId}
                          </p>
                        )}
                      </div>
                      <div className="w-full mt-2 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                        <div className="flex justify-between items-center text-xs text-[#94A3B8] mb-1">
                          <span>Match Confidence</span>
                          <span className="font-mono font-bold text-emerald-400">{activeResult.confidence}%</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 transition-all duration-500"
                            style={{ width: `${activeResult.confidence}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeResult.status === 'warning' && (
                    /* State B: Low confidence (50-74) */
                    <div className="bg-amber-950/20 border border-amber-900/50 rounded-2xl p-4 flex flex-col items-center text-center gap-2" id="results-state-b">
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 text-xs font-bold tracking-wide">
                        <AlertTriangle className="w-3.5 h-3.5" /> Low Confidence Scan
                      </span>
                      <p className="text-xs text-amber-400/90 max-w-[280px]">
                        Low confidence result. Please retake for a more accurate scan.
                      </p>
                      <div className="my-1">
                        <h2 className="text-lg font-black text-slate-300">{activeResult.name}</h2>
                        {activeResult.studentId && (
                          <p className="text-xs font-mono text-slate-400 mt-0.5">ID: {activeResult.studentId}</p>
                        )}
                      </div>
                      <div className="w-full mt-1 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                        <div className="flex justify-between items-center text-xs text-[#94A3B8] mb-1">
                          <span>Match Confidence</span>
                          <span className="font-mono font-bold text-amber-500">{activeResult.confidence}%</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-500 transition-all duration-500"
                            style={{ width: `${activeResult.confidence}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeResult.status === 'error' && (
                    /* State C: No Face / Environment Detected (< 50) */
                    <div className="bg-rose-950/20 border border-rose-900/40 rounded-2xl p-4 flex flex-col items-center text-center gap-2" id="results-state-c">
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#F43F5E]/10 text-[#F43F5E] text-xs font-bold tracking-wide">
                        <AlertCircle className="w-3.5 h-3.5" /> No Person Detected
                      </span>
                      <h2 className="text-lg font-black text-[#F8FAFC]">No person or face detected.</h2>
                      <p className="text-xs text-[#94A3B8] max-w-[270px] leading-relaxed">
                        Make sure your face is clearly visible and well-lit. Avoid dark environments or camera obstructions.
                      </p>
                    </div>
                  )}

                  {/* Scanned Timestamp Metadata */}
                  <div className="flex items-center gap-1.5 justify-center text-xs text-[#94A3B8] font-mono select-none" id="scan-metadata-footer">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Scanned: {activeResult.timestamp}</span>
                  </div>

                </div>

                {/* SHARED RESULTS SCREEN BUTTON CONTROLLER FOOTER */}
                <div className="flex flex-col gap-3 mt-auto pt-4" id="results-buttons-footer">
                  
                  {/* Scan again/retake option */}
                  <button
                    onClick={() => setActiveScreen('camera')}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-lg border border-blue-500/10 flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                    id="scan-again-button"
                  >
                    Scan Again
                  </button>

                  {/* Specifically RETAKE PHOTO option with camera icon */}
                  <button
                    onClick={() => {
                      setActiveScreen('camera');
                      // Wait a brief tick then open simulated camera or preference
                      setTimeout(() => handleCapturePhoto(), 100);
                    }}
                    className="w-full py-3.5 bg-[#1E293B] hover:bg-[#28354c] text-[#F8FAFC] border border-slate-800 font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                    id="retake-photo-button"
                  >
                    <Camera className="w-4 h-4 text-blue-500" />
                    Retake Photo
                  </button>
                </div>

              </motion.div>
            )}

          </AnimatePresence>

          {/* 5. PROCESS LOAD ANALYZING LOADER OVERLAY */}
          {isAnalyzing && (
            <div className="absolute inset-0 bg-[#0F172A]/85 backdrop-blur-xs flex flex-col items-center justify-center text-center z-40 p-5" id="processing-loader-overlay">
              <div className="relative flex items-center justify-center mb-4">
                {/* Pulsing ring animation */}
                <div className="absolute w-20 h-20 border-4 border-blue-500/20 rounded-full animate-ping"></div>
                <div className="w-16 h-16 border-4 border-t-blue-500 border-r-transparent border-b-blue-500 border-l-transparent rounded-full animate-spin flex items-center justify-center shadow-lg"></div>
              </div>
              <p className="text-md font-extrabold tracking-widest text-[#F8FAFC]">Analyzing Image...</p>
              <p className="text-xs text-[#94A3B8] mt-1 max-w-[220px]">
                Preprocessing aspect crop and matching with local Teachable Machine nodes
              </p>
            </div>
          )}

        </main>

        {/* 6. HISTORY SIDE-DRAWER PANEL (SLIDES IN FROM LEFT) */}
        <AnimatePresence>
          {historyOpen && (
            <>
              {/* Backing Dim Overlay */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                onClick={() => setHistoryOpen(false)}
                className="absolute inset-0 bg-black z-30"
                id="drawer-backing-overlay"
              ></motion.div>

              {/* Drawer Container Panel */}
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="absolute inset-y-0 left-0 w-4/5 bg-[#1E293B] z-30 shadow-2xl flex flex-col justify-between"
                id="history-slide-drawer"
              >
                  {/* Drawer Title Section */}
                  <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-blue-400 font-bold">
                      <Clock className="w-4 h-4 animate-pulse" />
                      <span className="text-sm font-sans tracking-wider uppercase">Scan History</span>
                    </div>
                    <button
                      onClick={() => setHistoryOpen(false)}
                      className="p-1.5 text-slate-400 hover:text-white bg-slate-900/40 rounded-lg hover:bg-slate-900 transition active:scale-95"
                      aria-label="Close drawer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Drawer List contents */}
                  <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
                    {historyError ? (
                      <div className="text-center py-10 px-5" id="history-error-state">
                        <AlertTriangle className="w-10 h-10 text-[#F43F5E] mx-auto mb-2" />
                        <p className="text-xs font-semibold text-slate-300">Unable to load history.</p>
                        <button
                          onClick={async () => {
                            try {
                              setHistoryError(false);
                              const list = await getScanHistory();
                              setHistoryList(list);
                            } catch {
                              setHistoryError(true);
                            }
                          }}
                          className="mt-3 px-3 py-1.5 bg-slate-800 border border-slate-700 text-xs font-bold rounded-lg text-white mx-auto active:scale-95"
                        >
                          Retry Loader
                        </button>
                      </div>
                    ) : historyList.length === 0 ? (
                      /* Empty storage history state */
                      <div className="text-center py-14 px-4 select-none flex flex-col items-center justify-center h-full" id="history-empty-state">
                        <Clock className="w-12 h-12 text-slate-600 mb-2 stroke-[1.5]" />
                        <p className="text-sm font-bold text-slate-400">No scans yet.</p>
                        <p className="text-[11px] text-slate-500 mt-1 max-w-[160px] leading-relaxed">
                          History is stored fully local to your browser preferences.
                        </p>
                      </div>
                    ) : (
                      /* Populated checklist sorted newest first */
                      <div className="flex flex-col gap-2.5" id="history-populated-list">
                        {historyList.map((item) => (
                          <div
                            key={item.id}
                            onClick={() => {
                              setActiveResult(item);
                              setActiveScreen('results');
                              setHistoryOpen(false);
                            }}
                            className="bg-[#0F172A]/75 outline-0 hover:bg-[#0F172A] p-2.5 border border-slate-800/80 rounded-xl flex gap-3 items-center cursor-pointer hover:border-slate-700 transition duration-200 active:scale-98 relative group"
                          >
                            {/* Class/Status color bullet tag dot */}
                            <div className={`absolute top-2.5 right-2.5 w-2 h-2 rounded-full ${
                              item.status === 'success' ? 'bg-emerald-500' :
                              item.status === 'warning' ? 'bg-amber-500' : 'bg-rose-500'
                            }`} title={`Status: ${item.status}`}></div>

                            {/* Crop avatar thumbnail */}
                            <img
                              src={item.photoBase64}
                              alt="Scan Thumbnail portrait"
                              referrerPolicy="no-referrer"
                              className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-slate-800 border border-slate-700"
                            />

                            {/* Information detail block */}
                            <div className="flex-1 min-w-0 pr-2">
                              <h4 className="text-xs font-black text-white truncate leading-snug">{item.name}</h4>
                              {item.studentId && (
                                <p className="text-[10px] font-mono text-blue-400 leading-snug">ID: {item.studentId}</p>
                              )}
                              <p className="text-[9px] text-[#94A3B8] font-mono truncate mt-0.5 leading-snug">
                                {item.timestamp}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Drawer Footer clear button */}
                  {historyList.length > 0 && (
                    <div className="p-3 border-t border-slate-800 bg-[#151D2A] flex flex-col gap-2" id="drawer-footer-actions">
                      {showClearConfirmation ? (
                        <div className="bg-rose-950/40 border border-rose-900 rounded-xl p-2.5 flex flex-col gap-2">
                          <p className="text-[10px] text-center text-rose-300">
                            Are you sure you want to delete all history? This cannot be undone.
                          </p>
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={handleClearHistory}
                              className="px-3 py-1 bg-[#F43F5E] text-white text-[11px] font-bold rounded-lg hover:bg-rose-600 transition"
                            >
                              Yes, Clear
                            </button>
                            <button
                              onClick={() => setShowClearConfirmation(false)}
                              className="px-3 py-1 bg-slate-800 text-slate-300 text-[11px] font-bold rounded-lg hover:bg-slate-700 transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowClearConfirmation(true)}
                          className="w-full py-2.5 bg-rose-600/10 hover:bg-[#F43F5E] text-[#F43F5E] hover:text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 border border-rose-950 hover:border-transparent transition-all active:scale-95"
                          id="clear-all-history"
                        >
                          <Trash2 className="w-4 h-4" />
                          Clear History
                        </button>
                      )}
                    </div>
                  )}

              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* 7. QUICK PRESET BROWSER SIMULATION DOCK PANEL (POPUP DRAWER) */}
        <AnimatePresence>
          {simulatorOpen && (
            <>
              {/* Backing dim */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                onClick={() => setSimulatorOpen(false)}
                className="absolute inset-0 bg-black z-30"
              ></motion.div>

              {/* Simulation dock view */}
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="absolute shrink-0 bottom-0 inset-x-0 bg-[#1E293B] border-t border-slate-700 rounded-t-[28px] p-5 z-40 shadow-2xl flex flex-col gap-4 max-h-[85%]"
                id="simulator-dock"
              >
                
                {/* Header info */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 select-none">
                  <div className="flex items-center gap-1.5 text-blue-400 font-extrabold text-sm tracking-wide">
                    <Sparkles className="w-4 h-4 animate-spin-slow" />
                    <span>BROWSER DEVICE SIMULATION</span>
                  </div>
                  <button onClick={() => setSimulatorOpen(false)} className="p-1.5 bg-slate-900/40 text-slate-400 rounded-lg" aria-label="Close simulator dock">
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>

                <p className="text-xs text-[#94A3B8] leading-normal leading-relaxed -mt-1 select-none">
                  Inside browser previews or sandboxed container frames, access to the real hardware camera can be blocked by host browser security policies. Choose a simulated preset portrait below to fully evaluate all of the application's matching layouts, states, and persistent offline history logic instantly:
                </p>

                {/* Simulated profiles choices */}
                <div className="flex flex-col gap-2.5" id="presets-container">
                  
                  {/* Preset 1: John Doe (A successful match) */}
                  <button
                    onClick={() => executeSimulation('john')}
                    className="flex items-center gap-3 w-full p-2.5 bg-[#0F172A] hover:bg-slate-900/60 rounded-xl border border-slate-800 text-left transition duration-150 active:scale-98 hover:border-emerald-500/50 group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 text-emerald-400">
                      <UserCheck className="w-5 h-5 group-hover:scale-110 transition" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-white">Preset A: John Doe</span>
                        <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1 rounded-sm">
                          SUCCESS MATCHER
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-none mt-1">Tests State A layout &mdash; confidence rate 94%</p>
                    </div>
                  </button>

                  {/* Preset 2: Jane Smith (Low Confidence) */}
                  <button
                    onClick={() => executeSimulation('jane')}
                    className="flex items-center gap-3 w-full p-2.5 bg-[#0F172A] hover:bg-slate-900/60 rounded-xl border border-slate-800 text-left transition duration-150 active:scale-98 hover:border-amber-500/50 group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0 text-amber-400">
                      <AlertTriangle className="w-5 h-5 group-hover:scale-110 transition" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-white">Preset B: Jane Smith</span>
                        <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1 rounded-sm">
                          LOW CONFIDENCE
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-none mt-1">Tests State B layout &mdash; confidence rate 68%</p>
                    </div>
                  </button>

                  {/* Preset 3: Unknown / Environment (No Face Detected) */}
                  <button
                    onClick={() => executeSimulation('unknown')}
                    className="flex items-center gap-3 w-full p-2.5 bg-[#0F172A] hover:bg-slate-900/60 rounded-xl border border-slate-800 text-left transition duration-150 active:scale-98 hover:border-rose-500/50 group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center flex-shrink-0 text-rose-400">
                      <HelpCircle className="w-5 h-5 group-hover:scale-110 transition" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-white">Preset C: Unknown Environment</span>
                        <span className="text-[9px] bg-rose-500/10 text-[#F43F5E] border border-rose-500/20 px-1 rounded-sm">
                          NO FACE
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-none mt-1">Tests State C layout &mdash; confidence rate 34%</p>
                    </div>
                  </button>

                  {/* Custom Test Upload Button (Standard Input fallback trigger value) */}
                  <button
                    onClick={() => {
                      setSimulatorOpen(false);
                      fileInputRef.current?.click();
                    }}
                    className="flex items-center justify-center gap-2 py-3 bg-[#151D2A] hover:bg-slate-900 text-[#F8FAFC] border border-slate-800 font-bold text-xs rounded-xl transition duration-150 active:scale-95 cursor-pointer mt-1"
                  >
                    <ImageIcon className="w-4 h-4 text-blue-400" />
                    Upload Custom Portrait File
                  </button>

                </div>

              </motion.div>
            </>
          )}
        </AnimatePresence>

      </div>

    </div>
  );
}
