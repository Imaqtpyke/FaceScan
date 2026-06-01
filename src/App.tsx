import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Clock,
  Trash2,
  Settings,
  Sparkles,
  RefreshCw,
  Lightbulb,
  Images
} from 'lucide-react';

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';

import { ScanResult, ScreenState, CameraDirectionType } from './types';
import { preprocessImage } from './services/camera';
import {
  captureVideoFrame,
  startCameraStream,
  stopMediaStream,
} from './services/cameraStream';
import { getScanHistory, saveScanResult, clearScanHistory, deleteScanResult } from './services/storage';
import { classifyCanvas, loadTeachableMachineModel } from './services/faceModel';
import { ClassBreakdown } from './components/ClassBreakdown';
import { openAppSettings } from './utils/openAppSettings';

export default function App() {
  // Screens & Navigation
  const [activeScreen, setActiveScreen] = useState<ScreenState>('camera');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [tipsExpanded, setTipsExpanded] = useState(false);
  const [tipsDismissed, setTipsDismissed] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  // Model & Core State
  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cameraDirection, setCameraDirection] = useState<CameraDirectionType>('rear');

  // Camera Permission / Availability State
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);

  // Scan Results
  const [activeResult, setActiveResult] = useState<ScanResult | null>(null);

  // History & Storage
  const [historyList, setHistoryList] = useState<ScanResult[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);

  // Track which history entry IDs are fading out before removal
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Toasts Alert State
  interface Toast {
    id: string;
    message: string;
    type: 'success' | 'warning' | 'error' | 'info';
  }
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Spin rotation angle tracker for flip button
  const [spinDeg, setSpinDeg] = useState(0);

  const browserFileInputRef = useRef<HTMLInputElement>(null);
  const viewfinderRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraRetryToken, setCameraRetryToken] = useState(0);
  const [cameraStreamReady, setCameraStreamReady] = useState(false);
  /** Bumped each time we navigate to the camera screen so stream effect re-runs after results */
  const [cameraSessionId, setCameraSessionId] = useState(0);

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

      try {
        const { value } = await Preferences.get({ key: 'tips_dismissed' });
        if (value === 'true') {
          if (active) setTipsDismissed(true);
        }
      } catch (err) {
        console.warn('Failed to load tips preferences:', err);
      }
    }

    initializeCoreApp();

    return () => {
      active = false;
    };
  }, []);

  // Request camera permission on native app launch
  useEffect(() => {
    if (!isNative) return;

    let active = true;

    const requestOnLaunch = async () => {
      try {
        const permission = await CapCamera.requestPermissions({ permissions: ['camera'] });
        if (!active) return;
        if (permission.camera !== 'granted' && permission.camera !== 'limited') {
          setCameraPermissionDenied(true);
        } else {
          setCameraPermissionDenied(false);
        }
      } catch (err) {
        console.warn('Camera permission request on launch failed:', err);
        if (active) setCameraPermissionDenied(true);
      }
    };

    void requestOnLaunch();

    return () => {
      active = false;
    };
  }, [isNative]);

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

  const navigateToCameraScreen = useCallback(() => {
    setCameraSessionId((id) => id + 1);
    setActiveScreen('camera');
  }, []);

  // Tips panel: read preference whenever home screen becomes active
  useEffect(() => {
    if (activeScreen !== 'camera') return;

    let active = true;

    const applyTipsPreference = async () => {
      try {
        const { value } = await Preferences.get({ key: 'tips_dismissed' });
        if (!active) return;
        const dismissed = value === 'true';
        setTipsDismissed(dismissed);
        if (dismissed) {
          setTipsExpanded(false);
        } else {
          setTipsExpanded(true);
        }
      } catch (err) {
        console.warn('Failed to load tips preferences:', err);
        if (active) {
          setTipsExpanded(true);
        }
      }
    };

    void applyTipsPreference();

    return () => {
      active = false;
    };
  }, [activeScreen, cameraSessionId]);

  const stopCameraStream = useCallback(() => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStreamReady(false);
  }, []);

  const startCameraStreamForDirection = useCallback(
    async (direction: CameraDirectionType) => {
      const video = videoRef.current;
      if (!video || !navigator.mediaDevices?.getUserMedia) {
        setCameraUnavailable(true);
        return;
      }

      try {
        if (isNative) {
          const permission = await CapCamera.requestPermissions({ permissions: ['camera'] });
          if (permission.camera !== 'granted' && permission.camera !== 'limited') {
            setCameraPermissionDenied(true);
            return;
          }
          setCameraPermissionDenied(false);
        }

        if (streamRef.current?.active) {
          stopCameraStream();
        }

        const stream = await startCameraStream(direction, video);
        streamRef.current = stream;
        setCameraUnavailable(false);
        setCameraStreamReady(true);
      } catch (err) {
        console.error('getUserMedia failed:', err);
        const errMsg = err instanceof Error ? err.message : String(err);
        if (
          errMsg.toLowerCase().includes('permission') ||
          errMsg.toLowerCase().includes('denied') ||
          errMsg.toLowerCase().includes('notallowed')
        ) {
          setCameraPermissionDenied(true);
        } else {
          setCameraUnavailable(true);
          triggerToast('Camera preview unavailable', 'warning');
        }
        setCameraStreamReady(false);
      }
    },
    [isNative, stopCameraStream]
  );

  // Live camera stream via getUserMedia (native + browser)
  useEffect(() => {
    const shouldRun =
      activeScreen === 'camera' && !modelError && !cameraPermissionDenied;

    if (!shouldRun) {
      stopCameraStream();
      return;
    }

    let cancelled = false;

    const waitForVideoElement = async (): Promise<boolean> => {
      for (let attempt = 0; attempt < 40; attempt++) {
        if (cancelled) return false;
        if (videoRef.current) return true;
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
      }
      return false;
    };

    const run = async () => {
      const hasVideo = await waitForVideoElement();
      if (cancelled || !hasVideo) return;

      if (streamRef.current?.active) {
        stopCameraStream();
      }

      await startCameraStreamForDirection(cameraDirection);
    };

    void run();

    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [
    activeScreen,
    cameraSessionId,
    modelError,
    cameraPermissionDenied,
    cameraDirection,
    cameraRetryToken,
    startCameraStreamForDirection,
    stopCameraStream,
  ]);

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
        topClassLabel: classification.topClassLabel,
        classPredictions: classification.classPredictions,
        thresholds: classification.thresholds,
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

  const handleRetryCameraPermission = async () => {
    setCameraPermissionDenied(false);
    try {
      const permission = await CapCamera.requestPermissions({ permissions: ['camera'] });
      if (permission.camera !== 'granted' && permission.camera !== 'limited') {
        setCameraPermissionDenied(true);
        return;
      }
      setCameraRetryToken((t) => t + 1);
    } catch (err) {
      console.warn('Camera permission retry failed:', err);
      setCameraPermissionDenied(true);
    }
  };

  // Action: CAPTURE PHOTO — canvas snapshot from live <video> feed
  const handleCapturePhoto = async () => {
    if (modelLoading) {
      triggerToast('Model is still loading. Please wait...', 'info');
      return;
    }
    if (modelError) {
      triggerToast('Face recognition model is not loaded.', 'error');
      return;
    }

    if (cameraPermissionDenied) {
      triggerToast('Camera permission is required to capture.', 'warning');
      return;
    }

    const video = videoRef.current;
    if (video?.srcObject && video.videoWidth > 0 && cameraStreamReady) {
      try {
        const base64 = captureVideoFrame(video);
        stopCameraStream();
        await processAndClassify(base64);
      } catch (err: unknown) {
        console.error('Video frame capture failed:', err);
        triggerToast('Could not capture from the camera. Please try again.', 'error');
      }
      return;
    }

    if (!isNative) {
      browserFileInputRef.current?.click();
      return;
    }

    triggerToast('Camera is not ready. Please wait or try again.', 'warning');
  };

  // Flip camera — restart getUserMedia with new facingMode
  const toggleFlipCamera = () => {
    setSpinDeg((prev) => prev + 180);
    setCameraDirection((prev) => (prev === 'front' ? 'rear' : 'front'));
  };

  // Action: Pick Photo from Gallery (native) or file picker (browser)
  const handleGalleryPick = async () => {
    if (!isNative) {
      browserFileInputRef.current?.click();
      return;
    }

    try {
      const image = await CapCamera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos,
      });
      if (image.dataUrl) {
        await processAndClassify(image.dataUrl);
      }
    } catch (err: unknown) {
      console.warn('Gallery pick cancelled or failed', err);
    }
  };

  const handleDismissTipsForever = async (checked: boolean) => {
    setTipsDismissed(checked);
    if (checked) {
      setTipsExpanded(false);
    }
    try {
      await Preferences.set({
        key: 'tips_dismissed',
        value: checked ? 'true' : 'false',
      });
    } catch (err) {
      console.warn('Failed to save tips preferences:', err);
    }
  };

  const handleCloseTipsPanel = async () => {
    setTipsExpanded(false);
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

  // Delete a single history entry with fade-out animation then persist
  const handleDeleteSingleEntry = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingIds((prev) => new Set(prev).add(id));
    setTimeout(async () => {
      try {
        await deleteScanResult(id);
        setHistoryList((prev) => prev.filter((item) => item.id !== id));
      } catch {
        triggerToast('Could not delete scan entry.', 'error');
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }, 200);
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

  // Removed preset canvas drawing mock function



  return (
    <div
      className={`${isNative ? 'fixed inset-0 h-[100dvh] w-full' : 'min-h-screen'} bg-[#090D1A] flex flex-col items-stretch justify-stretch font-sans text-[#F8FAFC] antialiased ${isNative ? 'p-0' : 'p-0 sm:p-4 items-center justify-center'} selection:bg-blue-600 selection:text-white`}
      id="facescan-app-container"
    >
      
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

      {/* 2. App shell — full screen on device, phone frame in browser */}
      <div 
        className={`w-full flex-1 bg-[#0F172A] ${isNative ? 'h-full max-w-none rounded-none border-0 shadow-none' : 'sm:max-w-[385px] sm:h-[812px] sm:border-[8px] sm:border-slate-800 sm:rounded-[40px] shadow-2xl'} relative overflow-hidden flex flex-col justify-between`}
        id="facescan-mobile-chassis"
        style={
          isNative
            ? {
                paddingTop: 'env(safe-area-inset-top)',
                paddingBottom: 'env(safe-area-inset-bottom)',
              }
            : undefined
        }
      >
        {/* 3. APP TOP NAV ACTION BAR */}
        <header className="px-5 py-4 flex items-center justify-between border-b border-slate-800/70" id="facescan-app-header">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping"></div>
            <h1 className="text-md font-extrabold tracking-widest text-[#F8FAFC]">
              FACESCAN<span className="text-blue-500">.</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Hamburger opens menu drawer (history + tips) */}
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
        <main
          className="flex-1 relative overflow-y-auto flex flex-col justify-between bg-[#0F172A]"
          id="facescan-main-content"
        >
          
          <AnimatePresence mode="wait">
            
            {/* VIEW A: CAMERA HOME VIEW */}
            {activeScreen === 'camera' && (
              <motion.div
                key={`camera-screen-${cameraSessionId}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col justify-between p-5"
                id="camera-view-container"
              >
                {/* Error/Model alerts or default camera instructions */}
                <div className="flex-1 flex flex-col justify-center items-center gap-6 relative z-10">
                  
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
                  ) : cameraUnavailable ? (
                    // Camera hardware missing error state
                    <div className="bg-slate-900/80 border border-slate-700 rounded-2xl p-6 text-center max-w-[310px]" id="camera-unavailable-state">
                      <AlertTriangle className="w-12 h-12 text-[#F43F5E] mx-auto mb-3" />
                      <h3 className="text-base font-bold text-[#F8FAFC] mb-1">Camera Unavailable</h3>
                      <p className="text-xs text-[#94A3B8] mb-4">
                        Camera unavailable on this device. You can still upload a photo.
                      </p>
                      <button
                        onClick={() => {
                          browserFileInputRef.current?.click();
                        }}
                        className="px-4 py-2 bg-[#1E293B] border border-slate-700 text-[#F8FAFC] font-semibold text-xs rounded-xl mx-auto transition active:scale-95"
                      >
                        Upload Photo
                      </button>
                    </div>
                  ) : (
                    <>
                    {cameraPermissionDenied && (
                      <div
                        className="absolute inset-0 z-30 flex items-center justify-center px-5"
                        id="camera-denied-state"
                      >
                        <div className="bg-amber-950/90 border border-amber-900 rounded-2xl p-6 text-center max-w-[310px]">
                          <Settings className="w-12 h-12 text-[#F59E0B] mx-auto mb-3" />
                          <p className="text-sm text-[#F8FAFC] mb-4 leading-relaxed">
                            Camera permission is required. Please enable it in your device settings.
                          </p>
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => void openAppSettings()}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl active:scale-95 transition w-full"
                            >
                              Open Settings
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRetryCameraPermission()}
                              className="px-4 py-2 bg-[#1E293B] border border-slate-700 text-[#F8FAFC] font-semibold text-xs rounded-xl active:scale-95 transition w-full"
                            >
                              Try Again
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col items-center justify-center">
                      <div
                        ref={viewfinderRef}
                        className={`relative w-72 h-72 rounded-[40px] border-4 ${cameraStreamReady ? 'border-blue-500/60' : 'border-slate-800'} bg-[#1E293B]/20 shadow-inner overflow-hidden flex items-center justify-center group`}
                        id="face-scanner-viewfinder"
                      >
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className={`absolute inset-0 z-10 w-full h-full object-cover ${cameraStreamReady ? 'opacity-100' : 'opacity-0'}`}
                          style={{
                            borderRadius: '12px',
                            transform: cameraDirection === 'front' ? 'scaleX(-1)' : 'scaleX(1)',
                          }}
                        />

                        {/* Cool corner brackets */}
                        <div className="absolute top-5 left-5 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-lg z-20 pointer-events-none"></div>
                        <div className="absolute top-5 right-5 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-lg z-20 pointer-events-none"></div>
                        <div className="absolute bottom-5 left-5 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-lg z-20 pointer-events-none"></div>
                        <div className="absolute bottom-5 right-5 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-lg z-20 pointer-events-none"></div>

                        {/* Scanner Laser Sweep Line */}
                        <motion.div
                          animate={{ top: ['0%', '100%', '0%'] }}
                          transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                          className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent z-20 shadow-[0_0_8px_rgba(59,130,246,0.8)]"
                        ></motion.div>

                        {/* Placeholder when live stream is not active (browser / loading) */}
                        {!cameraStreamReady && (
                          <div className="opacity-15 text-slate-400 group-hover:scale-105 group-hover:opacity-20 transition duration-500 z-0">
                            <User className="w-44 h-44 stroke-[1]" />
                          </div>
                        )}

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
                      <p className="mt-6 text-sm font-medium text-slate-400 select-none text-center max-w-[280px] leading-relaxed">
                        Position your face inside the frame and tap capture
                      </p>
                    </div>
                    </>
                  )}

                </div>
 
                {/* Collapsible Tips Panel */}
                <div 
                  className={`overflow-hidden transition-all duration-300 w-full ${
                    tipsExpanded ? 'max-h-[220px] opacity-100 mt-4 mb-2' : 'max-h-0 opacity-0 mt-0 mb-0 pointer-events-none'
                  }`}
                  id="scanning-tips-panel"
                >
                  <div className="bg-[#1E293B]/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-blue-400 select-none uppercase tracking-wider flex items-center gap-1.5">
                        <Lightbulb className="w-3.5 h-3.5 text-yellow-400" /> Quick Tips
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleCloseTipsPanel()}
                        className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/50 transition"
                        aria-label="Close tips panel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <ul className="flex flex-col gap-2 text-xs text-slate-300">
                      <li className="flex items-start gap-2">
                        <span className="flex-shrink-0">💡</span>
                        <span>Ensure your face is well-lit and clearly visible</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="flex-shrink-0">💡</span>
                        <span>Hold the camera steady before capturing</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="flex-shrink-0">💡</span>
                        <span>Avoid covering your face with accessories</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="flex-shrink-0">💡</span>
                        <span>Look directly at the camera for best results</span>
                      </li>
                    </ul>
                    
                    <div className="mt-2 pt-2 border-t border-slate-700 flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        id="dismiss-tips" 
                        checked={tipsDismissed}
                        onChange={(e) => void handleDismissTipsForever(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 accent-blue-500"
                      />
                      <label htmlFor="dismiss-tips" className="text-[10px] text-slate-400 select-none cursor-pointer">
                        Don&apos;t show again
                      </label>
                    </div>
                  </div>
                </div>

                {/* BOTTOM CAMERA CONTROL RAIL */}
                <div className="flex items-center justify-between px-6 w-full mt-auto pt-4" id="camera-controls-rail">
                  
                  {/* Gallery Pick Button (Bottom Left) */}
                  <button
                    onClick={handleGalleryPick}
                    className="p-3 border rounded-full transition-all duration-300 active:scale-90 text-slate-400 hover:text-white bg-slate-800/40 hover:bg-slate-800 border-slate-850"
                    id="gallery-picker-button"
                    title="Choose from Gallery"
                  >
                    <Images className="w-5 h-5" />
                  </button>
 
                  {/* Hidden file input kept in DOM for browser testing capability */}
                  <input
                    type="file"
                    id="upload-selfie-file"
                    ref={browserFileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    className="hidden"
                  />
 
                  {/* Main capture trigger (Center) */}
                  <button
                    onClick={handleCapturePhoto}
                    disabled={modelLoading || modelError || cameraPermissionDenied}
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
 
                  {/* Flip direction button (Bottom Right) */}
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
                    /* State A: Match (confidence >= high threshold) */
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
                    /* State B: Low confidence (between low and high threshold) */
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
                    /* State C: No Face / Environment Detected (below low threshold) */
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

                  {activeResult.classPredictions &&
                    activeResult.classPredictions.length > 0 &&
                    activeResult.thresholds && (
                      <ClassBreakdown
                        predictions={activeResult.classPredictions}
                        thresholds={activeResult.thresholds}
                        topClassLabel={activeResult.topClassLabel}
                      />
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
                    onClick={navigateToCameraScreen}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-lg border border-blue-500/10 flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                    id="scan-again-button"
                  >
                    Scan Again
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
                  {/* Drawer title + menu actions */}
                  <div className="p-4 border-b border-slate-800 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-sans tracking-wider uppercase text-slate-300 font-bold">Menu</span>
                      <button
                        onClick={() => setHistoryOpen(false)}
                        className="p-1.5 text-slate-400 hover:text-white bg-slate-900/40 rounded-lg hover:bg-slate-900 transition active:scale-95"
                        aria-label="Close drawer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTipsExpanded(true);
                        setHistoryOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 hover:bg-yellow-500/20 transition active:scale-[0.98]"
                      id="menu-tips-item"
                    >
                      <Lightbulb className="w-4 h-4" />
                      Tips
                    </button>
                    <div className="flex items-center gap-2 text-blue-400 font-bold pt-1">
                      <Clock className="w-4 h-4" />
                      <span className="text-sm font-sans tracking-wider uppercase">Scan History</span>
                    </div>
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
                            className={`bg-[#0F172A]/75 outline-0 hover:bg-[#0F172A] p-2.5 border border-slate-800/80 rounded-xl flex gap-3 items-center cursor-pointer hover:border-slate-700 active:scale-98 relative group transition-all duration-200 ${
                              deletingIds.has(item.id) ? 'opacity-0 pointer-events-none' : 'opacity-100'
                            }`}
                          >
                            {/* Class/Status color bullet dot — shifted left to make room for trash btn */}
                            <div className={`absolute top-2.5 right-9 w-2 h-2 rounded-full ${
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
                            <div className="flex-1 min-w-0 pr-1">
                              <h4 className="text-xs font-black text-white truncate leading-snug">{item.name}</h4>
                              {item.studentId && (
                                <p className="text-[10px] font-mono text-blue-400 leading-snug">ID: {item.studentId}</p>
                              )}
                              <p className="text-[9px] text-[#94A3B8] font-mono truncate mt-0.5 leading-snug">
                                {item.timestamp}
                              </p>
                            </div>

                            {/* Per-entry delete button — subtle, reveals on hover */}
                            <button
                              onClick={(e) => handleDeleteSingleEntry(item.id, e)}
                              className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors duration-150 opacity-0 group-hover:opacity-100 focus:opacity-100"
                              aria-label={`Delete scan for ${item.name}`}
                              id={`delete-entry-${item.id}`}
                              title="Delete this entry"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
      </div>

    </div>
  );
}
