// ─── Reel-grade Create Page ──────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Home, Film, Plus, PlusSquare, MessageCircle, User, Search, Settings, X, 
  Image as ImageIcon, Video, Hash, Type, Upload, Music, Volume2, VolumeX, 
  Play, Pause, RotateCw, RefreshCw, Camera, Mic, MicOff, Sparkles, Palette, 
  ChevronDown, ChevronLeft, ChevronRight, Check, AlertCircle, Trash2,
  Zap, ZapOff, Square, FileText, Eye, Bookmark, Share2, ArrowLeft, Heart, Coins,
  Sliders, Crown
} from 'lucide-react';
import api from '../../api';
import config from '../../config';
import { useTheme } from '../../contexts/ThemeContext';
import realtimeService from '../../services/RealtimeService';
import { InsufficientCoinsModal } from '../../components/common/InsufficientCoinsModal';

const FILTERS = [
  { id:'none',      name:'Original', css:'none' },
  { id:'grayscale', name:'B&W',      css:'grayscale(100%)' },
  { id:'sepia',     name:'Vintage',  css:'sepia(70%)' },
  { id:'warm',      name:'Warm',     css:'saturate(1.5) hue-rotate(-15deg)' },
  { id:'cool',      name:'Cool',     css:'saturate(1.3) hue-rotate(20deg)' },
  { id:'vibrant',   name:'Vibrant',  css:'saturate(2) contrast(1.1)' },
  { id:'fade',      name:'Fade',     css:'brightness(1.15) contrast(0.82) saturate(0.7)' },
  { id:'drama',     name:'Drama',    css:'contrast(1.5) brightness(0.85)' },
  { id:'neon',      name:'Neon',     css:'saturate(2.2) hue-rotate(280deg) brightness(1.15)' },
  { id:'golden',    name:'Golden',   css:'sepia(55%) saturate(1.4) hue-rotate(-10deg)' },
];

const SPEEDS = ['0.3x', '0.5x', '1x', '2x', '3x'];
const MAX_REC = 90;
const FREE_LIMIT = 60;
const PAID_LIMIT = 90;
const EXTENDED_RECORDING_COST = 200;

// Module-level helper to send logs to backend for server-side debugging
const logToBackend = (message, level = 'info', source = 'recording') => {
  try {
    fetch(`${config.API_BASE_URL}/client-log/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, level, message, userAgent: navigator.userAgent }),
    }).catch(() => {});
  } catch (_) {}
};

const TEXT_COLORS = [
  '#FFFFFF', '#000000', '#FF3B57', '#DA9B2A', 
  '#3B82F6', '#10B981', '#8B5CF6', '#F97316',
  '#EC4899', '#14B8A6', '#EAB308', '#6366F1'
];

// ── SVG Progress Ring ────────────────────────────────────────────────────────
function ProgressRing({ radius, stroke, progress, color }) {
  const r = radius - stroke / 2;
  const circ = r * 2 * Math.PI;
  const offset = circ - (progress / 100) * circ;
  return (
    <svg width={radius*2} height={radius*2}
      style={{ position:'absolute', top:0, left:0, transform:'rotate(-90deg)', pointerEvents:'none' }}>
      <circle stroke={color} fill="none" strokeWidth={stroke} r={r} cx={radius} cy={radius}
        strokeDasharray={`${circ} ${circ}`} strokeDashoffset={offset}
        strokeLinecap="round" style={{ transition:'stroke-dashoffset 0.5s linear' }} />
    </svg>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function EnhancedPostPage({ user, onBack, onPostSuccess, onNavHome, onNavReels, onNavMessages, onNavProfile, unreadDmCount = 0, onShowCoinPurchase, subscriptionStatus, onShowSubscription }) {
  const { colors: T } = useTheme();
  // Stage
  const [stage, setStage] = useState('capture'); // 'capture' | 'details'
  const [captureMode, setCaptureMode] = useState('upload'); // 'upload' | 'camera'
  const [camMode, setCamMode] = useState('photo'); // 'video' | 'photo'

  // File
  const [selectedFile, setSelectedFile] = useState(null);
  // Shown instead of navigating away, so the video, caption, hashtags and
  // overlays all stay exactly where the user left them.
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [savingDraftForSub, setSavingDraftForSub] = useState(false);
  const [subDraftError, setSubDraftError] = useState('');
  const [preview, setPreview] = useState(null);
  const [isVideoFile, setIsVideoFile] = useState(false);

  // Camera
  const [facingMode, setFacingMode] = useState('user');
  const [flashOn, setFlashOn] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recTime, setRecTime] = useState(0);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [recProgress, setRecProgress] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState('none');
  const [selectedSpeed, setSelectedSpeed] = useState('1x');
  const [showFilters, setShowFilters] = useState(false);
  const [showSpeeds, setShowSpeeds] = useState(false);

  // Text overlays
  const [textOverlays, setTextOverlays] = useState([]);
  const [showTextInput, setShowTextInput] = useState(false);
  const [currentText, setCurrentText] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [textStyle, setTextStyle] = useState('bold');   // bold|plain|outline|neon|highlight
  const [textAlign, setTextAlign] = useState('center'); // left|center|right
  const [textFontSize, setTextFontSize] = useState(22);
  const [dragging, setDragging] = useState(null); // { id, startX, startY, origX, origY }

  // Toast
  const [successMsg, setSuccessMsg] = useState('');

  // Sound
  const [backgroundSound, setBackgroundSound] = useState(null);
  const [showSoundSheet, setShowSoundSheet] = useState(false);
  const [isPlayingSound, setIsPlayingSound] = useState(false);
  const [origVol, setOrigVol] = useState(100);
  const [addedVol, setAddedVol] = useState(80);
  const [showVolMixer, setShowVolMixer] = useState(false);
  const [customAudioFile, setCustomAudioFile] = useState(null);
  const [decodedAudioBuffer, setDecodedAudioBuffer] = useState(null);
  const [isDecodingAudio, setIsDecodingAudio] = useState(false);

  // Post
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showInsufficientCoins, setShowInsufficientCoins] = useState(false);
  const [postCost, setPostCost] = useState(0);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Extended recording
  const [hasExtendedRecording, setHasExtendedRecording] = useState(false);
  const [showExtendedInsufficientModal, setShowExtendedInsufficientModal] = useState(false);
  const [coinBalance, setCoinBalance] = useState(0);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);

  // Debug modal state changes
  useEffect(() => {
    console.log('[INSUFFICIENT_COINS] Modal state changed:', showInsufficientCoins);
  }, [showInsufficientCoins]);

  // Reload coins and resume recording after purchase
  useEffect(() => {
    if (showExtendedInsufficientModal && isRecordingPaused) {
      const checkBalance = () => {
        api.request('/coins/balance/')
          .then(data => {
            const balance = data.balance || 0;
            setCoinBalance(balance);
            console.log('[INSUFFICIENT_COINS] Polling balance:', balance, 'required:', EXTENDED_RECORDING_COST);
            if (balance >= EXTENDED_RECORDING_COST) {
              console.log('[INSUFFICIENT_COINS] Balance sufficient, closing modal and resuming');
              setShowExtendedInsufficientModal(false);
              // Small delay to ensure modal closes before resuming
              setTimeout(() => resumeRecording(), 100);
            }
          })
          .catch(err => {
            console.error('Failed to check coin balance after purchase:', err);
          });
      };
      // Check immediately, then poll every 1 second (faster)
      checkBalance();
      const interval = setInterval(checkBalance, 1000);
      return () => clearInterval(interval);
    }
  }, [showExtendedInsufficientModal, isRecordingPaused]);

  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const timerRef = useRef(null);
  const chunksRef = useRef([]);
  const audioRef = useRef(null);
  const streamRef = useRef(null);
  const cameraGenRef = useRef(0);        // incremented on every startCamera/stopCamera to cancel in-flight getUserMedia
  const liveRef = useRef({ filter: 'none', overlays: [] });
  const isRecordingRef = useRef(false); // sync ref so onMouseDown guard doesn't rely on stale state
  const recordingStartRef = useRef(0);  // timestamp when recording began (for ghost-click guard)
  const lastToggleRef = useRef(0);      // timestamp of last record-button toggle to coalesce touch+click double-fire
  const audioCtxRef = useRef(null);     // Web Audio context for mic+bg mixing into recorder
  const monitorAudioRef = useRef(null); // separate Audio element so user hears bg WITHOUT routing through mic
  const fileInputRef = useRef(null);
  const audioFileInputRef = useRef(null);
  const previewContainerRef = useRef(null);
  const previewVideoRef = useRef(null);
  const lastFlipAtRef = useRef(0);

  // ── Drafts state ─────────────────────────────────────────────────────────
  const [drafts, setDrafts] = useState([]);
  const [showDrafts, setShowDrafts] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(true);  // start muted so browsers allow autoplay; user can tap to unmute
  const [isPreviewThumbnail, setIsPreviewThumbnail] = useState(false);  // track if preview is a generated thumbnail

  // ── Keep liveRef synced ──────────────────────────────────────────────────
  useEffect(() => { liveRef.current.filter = selectedFilter; }, [selectedFilter]);
  useEffect(() => { liveRef.current.overlays = textOverlays; }, [textOverlays]);

  // ── Load drafts on mount ─────────────────────────────────────────────────
  useEffect(() => {
    loadDrafts();
  }, []);

  // ── Canvas draw loop ─────────────────────────────────────────────────────
  const startDrawLoop = useCallback(() => {
    const draw = () => {
      const vid = videoRef.current;
      const cvs = canvasRef.current;
      if (!vid || !cvs) return;
      if (vid.readyState < 2 || !vid.videoWidth || !vid.videoHeight) {
        animFrameRef.current = requestAnimationFrame(draw);
        return;
      }
      const ctx = cvs.getContext('2d');
      cvs.width = vid.videoWidth || 360;
      cvs.height = vid.videoHeight || 640;
      const f = liveRef.current.filter;
      ctx.filter = f === 'none' ? 'none' : (FILTERS.find(x => x.id === f)?.css || 'none');
      try {
        ctx.drawImage(vid, 0, 0, cvs.width, cvs.height);
      } catch (_) {
        animFrameRef.current = requestAnimationFrame(draw);
        return;
      }
      // ── Bake text overlays into the canvas frame ──
      ctx.filter = 'none';
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      (liveRef.current.overlays || []).forEach(ov => {
        const px = ov.x / 100 * cvs.width;
        const py = ov.y / 100 * cvs.height;
        const fs = ov.fontSize * (cvs.width / 360);
        ctx.save();
        ctx.font = `800 ${fs}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(ov.text).width;
        const pad = fs * 0.35;
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(px - tw/2 - pad, py - fs/2 - pad*0.5, tw + pad*2, fs + pad, fs*0.3);
        else ctx.rect(px - tw/2 - pad, py - fs/2 - pad*0.5, tw + pad*2, fs + pad);
        ctx.fill();
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = ov.color;
        ctx.fillText(ov.text, px, py);
        ctx.restore();
      });
      animFrameRef.current = requestAnimationFrame(draw);
    };
    draw();
  }, []);

  const stopDrawLoop = useCallback(() => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
  }, []);

  // ── Cleanup helper (defined early so useEffects below can reference it) ──
  const _cleanupAudio = (caller = 'unknown') => {
    // Capture short stack to identify caller
    let stackInfo = '';
    try {
      stackInfo = new Error().stack?.split('\n').slice(1, 4).join(' | ').slice(0, 400) || '';
    } catch (_) {}
    logToBackend(`_cleanupAudio called by=${caller} isRecording=${isRecordingRef.current} hasMonitor=${!!monitorAudioRef.current} stack=${stackInfo}`, 'warn');
    // Stop preview audio (sound selection preview)
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlayingSound(false);
    // Stop monitor audio (bg music during recording)
    if (monitorAudioRef.current) {
      monitorAudioRef.current.pause();
      monitorAudioRef.current.src = '';
      monitorAudioRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch (_) {}
      audioCtxRef.current = null;
    }
  };

  // ── Camera start/stop ───────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    const gen = ++cameraGenRef.current;  // capture generation token
    try {
      setCameraLoading(true);
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }

      console.log('[CAMERA] Starting camera with facingMode:', facingMode);

      // Check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('[CAMERA] mediaDevices not available');
        setErrorMessage('Your browser does not support camera access. Please use Chrome, Firefox, or Edge.');
        setShowErrorModal(true);
        return;
      }

      let mediaStream = null;
      let lastError = null;

      // Try to get camera stream directly - browser will handle permission and device detection
      const constraintAttempts = [
        // Attempt 1: With current facingMode preference and audio
        { video: { facingMode }, audio: true },
        // Attempt 2: With current facingMode preference without audio
        { video: { facingMode }, audio: false },
        // Attempt 3: Fallback to any camera without facingMode
        { video: true, audio: false },
        // Attempt 4: Last resort - user facing camera
        { video: { facingMode: 'user' }, audio: false },
      ];

      // Helper to send logs to backend for server-side debugging
      const logToBackend = (message, level = 'info') => {
        try {
          fetch(`${config.API_BASE_URL}/client-log/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: 'camera', level, message, userAgent: navigator.userAgent }),
          }).catch(() => {});
        } catch (_) {}
      };

      logToBackend(`Starting camera, facingMode=${facingMode}`);

      for (let i = 0; i < constraintAttempts.length; i++) {
        const constraints = constraintAttempts[i];
        try {
          console.log(`[CAMERA] Attempt ${i + 1}/${constraintAttempts.length} with constraints:`, constraints);
          logToBackend(`Attempt ${i + 1}/${constraintAttempts.length} constraints=${JSON.stringify(constraints)}`);
          mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
          console.log(`[CAMERA] Success on attempt ${i + 1}`);
          logToBackend(`Camera SUCCESS on attempt ${i + 1}`);
          break;
        } catch (error) {
          lastError = error;
          console.warn(`[CAMERA] Attempt ${i + 1} failed:`, error.name, error.message);
          logToBackend(`Attempt ${i + 1} FAILED: ${error.name} - ${error.message}`, 'error');
          // Wait a bit before retrying to allow OS to release camera
          if (i < constraintAttempts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      }

      if (!mediaStream) {
        // Only show error if all attempts genuinely failed
        if (lastError && lastError.name !== 'NotFoundError') {
          throw lastError;
        }
        // For NotFoundError, don't show error - camera might actually work
        return;
      }

      // If stopCamera was called while we were waiting, discard the stream immediately
      if (gen !== cameraGenRef.current) { 
        console.log('[CAMERA] Camera generation changed, discarding stream');
        mediaStream.getTracks().forEach(t => t.stop()); 
        return; 
      }
      
      streamRef.current = mediaStream;
      console.log('[CAMERA] Stream set to streamRef.current');
      
      if (videoRef.current) {
        const videoEl = videoRef.current;
        videoEl.srcObject = mediaStream;
        console.log('[CAMERA] Stream attached to video element');
        
        await new Promise((resolve) => {
          if (videoEl.readyState >= 1 && videoEl.videoWidth && videoEl.videoHeight) {
            console.log('[CAMERA] Video already loaded, readyState:', videoEl.readyState);
            resolve();
            return;
          }

          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            console.log('[CAMERA] Video metadata loaded, readyState:', videoEl.readyState, 'dimensions:', videoEl.videoWidth, 'x', videoEl.videoHeight);
            videoEl.onloadedmetadata = null;
            videoEl.oncanplay = null;
            resolve();
          };

          videoEl.onloadedmetadata = finish;
          videoEl.oncanplay = finish;
          setTimeout(finish, 1200);
        });

        try {
          await videoEl.play();
          console.log('[CAMERA] Video playing successfully');
        } catch (playError) {
          console.warn('[CAMERA] Video preview play failed, continuing with draw loop:', playError);
        }
      }
      console.log('[CAMERA] Starting draw loop');
      startDrawLoop();
    } catch (e) {
      console.error('[CAMERA] =========================================');
      console.error('[CAMERA] CAMERA ACCESS DENIED - FINAL ERROR');
      console.error('[CAMERA] Error name:', e.name);
      console.error('[CAMERA] Error message:', e.message);
      console.error('[CAMERA] Full error:', e);
      console.error('[CAMERA] Error stack:', e.stack);
      console.error('[CAMERA] =========================================');

      // Show user-friendly error message based on error type
      let errorMessage = 'Camera access failed. ';
      switch (e.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
          errorMessage += 'Camera permission was denied. Please:\n\n1. Click the lock/info icon in your browser address bar\n2. Allow camera access\n3. Refresh the page and try again';
          break;
        case 'NotReadableError':
          errorMessage += 'Could not start camera. Try these steps:\n\n1. Close other apps using the camera (Zoom, Teams, Skype, Camera app, OBS, etc.)\n2. Close other browser tabs that may use the camera\n3. Check Windows: Settings → Privacy → Camera → Allow apps to access camera (ON)\n4. Try a different browser (Chrome/Edge work best)\n5. Restart your browser\n\nIf the problem persists, your camera driver may need updating.';
          break;
        case 'OverconstrainedError':
          errorMessage += 'Your camera does not support the requested resolution. The app will try with lower quality automatically.';
          break;
        case 'TypeError':
          errorMessage += 'Camera not supported in this browser. Please use Chrome, Firefox, or Edge.';
          break;
        default:
          errorMessage += `Please check your permissions and try again.\n\nError: ${e.message}`;
      }
      setErrorMessage(errorMessage);
      setShowErrorModal(true);
    } finally {
      setCameraLoading(false);
    }
  }, [facingMode, startDrawLoop]);

  const stopCamera = useCallback(() => {
    cameraGenRef.current++;              // invalidate any in-flight startCamera
    stopDrawLoop();
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) { videoRef.current.srcObject = null; }
    clearInterval(timerRef.current);
  }, [stopDrawLoop]);

  const flipCamera = useCallback((event) => {
    event?.preventDefault?.();
    const now = Date.now();
    if (now - lastFlipAtRef.current < 350) return;
    lastFlipAtRef.current = now;
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  }, []);

  // Stop camera when captureMode or facingMode changes
  useEffect(() => {
    if (captureMode === 'camera') { 
      console.log('[CAMERA] Starting camera due to mode change');
      startCamera(); 
    }
    else { 
      console.log('[CAMERA] Stopping camera due to mode change');
      stopCamera(); 
    }
    // No cleanup function - it causes the camera to stop immediately after starting
    // Camera will be stopped by the other useEffect on unmount or stage change
  }, [captureMode, facingMode]); // eslint-disable-line

  // Hard-stop camera+audio the moment we leave the capture stage
  useEffect(() => {
    if (stage !== 'capture') {
      logToBackend(`stage useEffect fired stage=${stage} isRecording=${isRecordingRef.current}`, 'warn');
      stopCamera();
      _cleanupAudio(`stage-effect:${stage}`);
    }
  }, [stage]); // eslint-disable-line

  // Release camera+audio on component unmount (e.g. user navigates away)
  useEffect(() => {
    return () => {
      logToBackend(`unmount useEffect fired isRecording=${isRecordingRef.current}`, 'warn');
      stopCamera();
      _cleanupAudio('unmount');
    };
  }, []); // eslint-disable-line

  // ── Recording ───────────────────────────────────────────────────────────
  const startRecording = async () => {
    console.log('[RECORDING] startRecording called, isRecording:', isRecordingRef.current);
    logToBackend(`startRecording called. customAudio=${!!customAudioFile} decodedBuf=${!!decodedAudioBuffer}`);
    // ── LOCK IMMEDIATELY before any async work so no re-entrant calls slip through ──
    if (isRecordingRef.current) {
      console.log('[RECORDING] Already recording, ignoring startRecording call');
      logToBackend('Already recording, ignored', 'warn');
      return;
    }
    if (!streamRef.current) {
      console.log('[RECORDING] No stream available');
      logToBackend('No stream available', 'error');
      setErrorMessage('Camera not ready. Please wait a moment and try again.');
      setShowErrorModal(true);
      return;
    }
    console.log('[RECORDING] Starting recording, setting lock');
    isRecordingRef.current = true;   // set lock NOW — before awaits
    recordingStartRef.current = Date.now();

    // Kill any stale timer / audio from a previous session
    clearInterval(timerRef.current);
    _cleanupAudio('startRecording-pre');
    chunksRef.current = [];
    setRecTime(0);
    setRecProgress(0);
    console.log('[RECORDING] Cleanup complete, setting recording state');

    // ── Step 1: canvas video track ───────────────────────────────────────
    let videoTrack = null;
    try {
      const cvs = canvasRef.current;
      if (cvs && cvs.captureStream) {
        videoTrack = cvs.captureStream(30).getVideoTracks()[0] || null;
      }
    } catch (_) {}

    // ── Step 2: audio track ──────────────────────────────────────────────
    // Strategy: mix mic (origVol%) + bg audio (addedVol%) into recorder.
    // ECHO FIX: bg audio goes ONLY into the recorder (dest), NOT ctx.destination.
    // A separate Audio element is used for monitoring so the user hears the music
    // without routing it through ctx.destination → speaker → mic → echo loop.
    let audioTracks = streamRef.current.getAudioTracks();
    logToBackend(`Mic tracks=${audioTracks.length}, hasCustomAudio=${!!customAudioFile}, hasDecodedBuf=${!!decodedAudioBuffer}`);
    if (customAudioFile && decodedAudioBuffer) {
      try {
        console.log('[RECORDER] Starting audio mix with pre-decoded buffer');
        logToBackend('Creating AudioContext for mix');
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = ctx;
        logToBackend(`AudioContext state=${ctx.state} sampleRate=${ctx.sampleRate}`);

        // Resume AudioContext if suspended (common on mobile browsers)
        if (ctx.state === 'suspended') {
          try {
            await ctx.resume();
            logToBackend(`AudioContext resumed, new state=${ctx.state}`);
          } catch (resumeErr) {
            logToBackend(`AudioContext resume failed: ${resumeErr.message}`, 'warn');
          }
        }

        const dest = ctx.createMediaStreamDestination();

        // Mic at origVol (0 = full lipsync, 100 = full voice)
        // IMPORTANT: clone the audio track before feeding to Web Audio.
        // Otherwise the browser may pause the camera <video> element because
        // its audio track has been "consumed" by AudioContext, which freezes
        // the canvas capture (looks like a still photo on recording).
        if (audioTracks.length > 0) {
          const clonedAudioTracks = audioTracks.map(t => t.clone());
          const micSrc  = ctx.createMediaStreamSource(new MediaStream(clonedAudioTracks));
          const micGain = ctx.createGain();
          micGain.gain.value = origVol / 100;
          micSrc.connect(micGain);
          micGain.connect(dest);
          logToBackend(`Mic source connected (cloned), gain=${origVol}%`);
        }

        // Use pre-decoded audio buffer (no blocking during recording)
        console.log('[RECORDER] Using pre-decoded audio buffer, duration:', decodedAudioBuffer.duration);
        logToBackend(`Using decoded buffer duration=${decodedAudioBuffer.duration.toFixed(2)}s`);

        const bgSrc = ctx.createBufferSource();
        bgSrc.buffer = decodedAudioBuffer;
        bgSrc.loop = true;
        const bgGain = ctx.createGain();
        bgGain.gain.value = addedVol / 100;
        bgSrc.connect(bgGain);
        bgGain.connect(dest); // recorder only — no ctx.destination → no mic echo
        bgSrc.start(0);
        logToBackend(`BG audio source started, gain=${addedVol}%`);

        audioTracks = dest.stream.getAudioTracks();
        logToBackend(`Mixed audio tracks=${audioTracks.length}`);

        // Separate Audio element for monitoring (user hears music but mic doesn't double-pick it up)
        const monitor = new Audio();
        monitor.src = URL.createObjectURL(customAudioFile);
        monitor.volume = addedVol / 100;
        monitor.loop = true;
        monitor.onpause = () => logToBackend('Monitor audio PAUSED', 'warn');
        monitor.onplay = () => logToBackend('Monitor audio PLAYING');
        monitor.onerror = (e) => logToBackend(`Monitor audio ERROR: ${monitor.error?.message || 'unknown'}`, 'error');
        monitor.play().then(() => {
          logToBackend('Monitor audio play() resolved');
        }).catch((err) => {
          console.warn('[RECORDER] Monitor audio play failed:', err);
          logToBackend(`Monitor audio play() failed: ${err.name} - ${err.message}`, 'warn');
        });
        monitorAudioRef.current = monitor;

        console.log('[RECORDER] mix: mic', origVol + '%, bg', addedVol + '%');
      } catch (mixErr) {
        console.error('[RECORDER] Web Audio mix failed, raw mic fallback:', mixErr);
        console.error('[RECORDER] Error:', mixErr.name, mixErr.message);
        logToBackend(`Audio mix FAILED: ${mixErr.name} - ${mixErr.message}`, 'error');
        // Clean up audio context but continue with raw mic
        _cleanupAudio('mix-failed');
        audioTracks = streamRef.current.getAudioTracks();
        // Reset audio file to prevent retry on next recording
        setCustomAudioFile(null);
        setDecodedAudioBuffer(null);
      }
    }

    // ── Step 3: assemble MediaStream ─────────────────────────────────────
    const tracks = [
      ...(videoTrack ? [videoTrack] : []),
      ...audioTracks,
    ];
    const recordStream = tracks.length > 0 ? new MediaStream(tracks) : streamRef.current;

    // ── Step 4: pick best mimeType ───────────────────────────────────────
    // Prioritize mp4 format as it has better duration metadata handling than webm
    const MIME_CANDIDATES = [
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    const mimeType = MIME_CANDIDATES.find(m => MediaRecorder.isTypeSupported(m)) || '';
    let mr;
    try {
      mr = new MediaRecorder(recordStream, mimeType ? { mimeType } : {});
    } catch (_) {
      try { mr = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : {}); }
      catch (e2) {
        _cleanupAudio('mr-construct-failed');
        isRecordingRef.current = false;
        setErrorMessage('Recording not supported on this browser: ' + e2.message);
        setShowErrorModal(true);
        return;
      }
    }

    const actualMime = mr.mimeType || mimeType || 'video/webm';
    const ext = actualMime.includes('mp4') ? 'mp4' : 'webm';

    // ── Step 5: wire events ──────────────────────────────────────────────
    mr.ondataavailable = e => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onpause = () => {
      console.warn('[RECORDER] MediaRecorder PAUSED');
      logToBackend('MediaRecorder PAUSED unexpectedly', 'warn');
    };
    mr.onresume = () => {
      console.log('[RECORDER] MediaRecorder RESUMED');
      logToBackend('MediaRecorder RESUMED');
    };
    mr.onstart = () => {
      console.log('[RECORDER] MediaRecorder STARTED');
      logToBackend(`MediaRecorder STARTED, mimeType=${actualMime}`);
    };

    mr.onstop = () => {
      console.log('[RECORDER] onstop triggered, chunks:', chunksRef.current.length);
      logToBackend(`MediaRecorder onstop chunks=${chunksRef.current.length}`, 'warn');
      const chunks = chunksRef.current;
      if (!chunks.length) {
        console.log('[RECORDER] No chunks in recording');
        setErrorMessage('Recording produced no data. Please try again.');
        setShowErrorModal(true);
        isRecordingRef.current = false;
        setIsRecording(false);
        return;
      }
      const blob = new Blob(chunks, { type: actualMime });
      if (blob.size === 0) {
        console.log('[RECORDER] Blob is empty');
        setErrorMessage('Recorded file is empty. Please try again.');
        setShowErrorModal(true);
        isRecordingRef.current = false;
        setIsRecording(false);
        return;
      }
      console.log('[RECORDER] Recording successful, blob size:', blob.size);
      
      // Fix duration metadata for webm files by using a video element to force duration calculation
      const processBlob = async () => {
        if (ext === 'webm') {
          try {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.src = URL.createObjectURL(blob);
            
            await new Promise((resolve, reject) => {
              video.onloadedmetadata = () => {
                // Seek to end to force duration calculation
                video.currentTime = video.duration || 999999;
              };
              video.onseeked = () => {
                // Duration should now be calculated
                URL.revokeObjectURL(video.src);
                resolve();
              };
              video.onerror = () => {
                URL.revokeObjectURL(video.src);
                resolve(); // Continue even if fix fails
              };
              // Timeout fallback
              setTimeout(() => {
                URL.revokeObjectURL(video.src);
                resolve();
              }, 2000);
            });
          } catch (e) {
            console.warn('[RECORDER] Duration fix failed:', e);
          }
        }
        
        const file = new File([blob], `rec_${Date.now()}.${ext}`, { type: actualMime });
        const url = URL.createObjectURL(blob);
        stopCamera();
        setSelectedFile(file);
        setPreview(url);
        setIsPreviewThumbnail(false);
        setIsVideoFile(true);
        setCaptureMode('upload');
        setStage('details');
        isRecordingRef.current = false;
        setIsRecording(false);
      };
      
      processBlob();
    };

    mr.onerror = e => {
      console.error('[RECORDER] MediaRecorder error:', e.error?.name, e.error?.message);
      logToBackend(`MediaRecorder onerror: ${e.error?.name} - ${e.error?.message}`, 'error');
      _cleanupAudio('mr-onerror');
      isRecordingRef.current = false;
      setIsRecording(false);
      setErrorMessage('Recording error: ' + (e.error?.message || 'unknown'));
      setShowErrorModal(true);
    };

    // ── Step 6: go ───────────────────────────────────────────────────────
    mediaRecorderRef.current = mr;
    mr.start(250);
    setIsRecording(true);
    console.log('[RECORDING] MediaRecorder started, mimeType:', actualMime);

    // Camera-preview watchdog: some browsers pause the <video> element when its
    // audio track is consumed by Web Audio. The canvas draws from this video,
    // so a paused video element = frozen video frames in the recording.
    // This loop keeps it playing every 500ms during recording.
    const watchdogVideo = videoRef.current;
    if (watchdogVideo) {
      const onUnexpectedPause = () => {
        if (isRecordingRef.current && watchdogVideo.paused) {
          logToBackend(`Camera <video> paused unexpectedly during recording, resuming`, 'warn');
          watchdogVideo.play().catch((err) => {
            logToBackend(`Camera <video> resume failed: ${err.message}`, 'error');
          });
        }
      };
      watchdogVideo.addEventListener('pause', onUnexpectedPause);
      // Stash so we can remove on stop
      mediaRecorderRef.current._videoPauseHandler = onUnexpectedPause;
    }

    timerRef.current = setInterval(() => {
      // Watchdog: if camera video element somehow paused, kick it back to play.
      const vid = videoRef.current;
      if (vid && vid.paused && isRecordingRef.current) {
        logToBackend(`Camera <video> found paused mid-record, calling play()`, 'warn');
        vid.play().catch(() => {});
      }
      setRecTime(t => {
        const next = t + 1;
        setRecProgress((next / MAX_REC) * 100);

        // Check if crossing the free limit (60 seconds)
        if (next === FREE_LIMIT + 1 && !hasExtendedRecording) {
          // Check coin balance before allowing extended recording
          api.request('/coins/balance/')
            .then(data => {
              const balance = data.balance || 0;
              setCoinBalance(balance);
              if (balance < EXTENDED_RECORDING_COST) {
                // Insufficient coins - pause recording and show modal
                const mr = mediaRecorderRef.current;
                if (mr && mr.state === 'recording') {
                  mr.pause();
                  setIsRecordingPaused(true);
                  clearInterval(timerRef.current);
                }
                setShowExtendedInsufficientModal(true);
              } else {
                // Sufficient coins - mark as extended and allow recording to continue
                // Actual deduction will happen during post upload
                setHasExtendedRecording(true);
              }
            })
            .catch(err => {
              console.error('Failed to check coin balance:', err);
              // Pause recording on error to be safe
              const mr = mediaRecorderRef.current;
              if (mr && mr.state === 'recording') {
                mr.pause();
                setIsRecordingPaused(true);
                clearInterval(timerRef.current);
              }
              setShowExtendedInsufficientModal(true);
            });
        }

        if (next >= MAX_REC) stopRecording();
        return next;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (!isRecordingRef.current) return;
    // Ghost-click guard: ignore stop calls within 1s of start
    if (Date.now() - recordingStartRef.current < 1000) return;

    logToBackend(`stopRecording called elapsedMs=${Date.now() - recordingStartRef.current} mrState=${mediaRecorderRef.current?.state}`, 'warn');
    clearInterval(timerRef.current);
    _cleanupAudio('stopRecording'); // stop monitor + AudioContext immediately (no music after stop)

    // Reset extended recording state
    setHasExtendedRecording(false);
    setIsRecordingPaused(false);

    const mr = mediaRecorderRef.current;
    if (mr && mr.state === 'recording') {
      try { mr.requestData(); } catch (_) {}
      mr.stop(); // triggers onstop asynchronously
    } else {
      isRecordingRef.current = false;
      setIsRecording(false);
    }
  };

  const resumeRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === 'paused' && isRecordingPaused) {
      mr.resume();
      setIsRecordingPaused(false);
      setHasExtendedRecording(true);

      // Resume timer
      timerRef.current = setInterval(() => {
        setRecTime(t => {
          const next = t + 1;
          setRecProgress((next / MAX_REC) * 100);

          if (next >= MAX_REC) stopRecording();
          return next;
        });
      }, 1000);
    }
  };

  // ── Photo capture ───────────────────────────────────────────────────────
  const takePhoto = () => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    cvs.toBlob(blob => {
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      setSelectedFile(file);
      setPreview(url);
      setIsPreviewThumbnail(false);
      setIsVideoFile(false);
      stopCamera();
      setCaptureMode('upload');
      setStage('details');
    }, 'image/jpeg', 0.92);
  };

  // ── File upload from device ─────────────────────────────────────────────
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (50MB limit)
    if (file.size > 50 * 1024 * 1024) {
      setErrorMessage("File size must be less than 50MB");
      setShowErrorModal(true);
      return;
    }

    setSelectedFile(file);
    setIsVideoFile(file.type.startsWith('video/'));

    // Handle different file types
    if (file.type.startsWith('video/')) {
      // For videos, check duration and apply extended recording logic
      const video = document.createElement('video');
      video.preload = 'metadata';
      const videoUrl = URL.createObjectURL(file);
      video.src = videoUrl;

      video.onloadedmetadata = () => {
        const duration = video.duration;
        URL.revokeObjectURL(videoUrl);

        if (duration > PAID_LIMIT) {
          setErrorMessage(`Video duration exceeds ${PAID_LIMIT} seconds limit`);
          setShowErrorModal(true);
          setSelectedFile(null);
          return;
        }

        if (duration > FREE_LIMIT) {
          // Check coin balance for extended video
          api.request('/coins/balance/')
            .then(data => {
              const balance = data.balance || 0;
              if (balance < EXTENDED_RECORDING_COST) {
                setCoinBalance(balance);
                setShowExtendedInsufficientModal(true);
                setSelectedFile(null);
              } else {
                // Sufficient coins - mark as extended and proceed
                // Actual deduction will happen during post upload
                setHasExtendedRecording(true);
                createVideoThumbnail(file);
              }
            })
            .catch(err => {
              console.error('Failed to check coin balance:', err);
              setShowExtendedInsufficientModal(true);
              setSelectedFile(null);
            });
        } else {
          // Within free limit, proceed normally
          createVideoThumbnail(file);
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(videoUrl);
        setErrorMessage("Failed to load video file");
        setShowErrorModal(true);
        setSelectedFile(null);
      };
    } else {
      // For images, use object URL as before
      const url = URL.createObjectURL(file);
      setPreview(url);
      setStage('details');
    }
  };

  const createVideoThumbnail = (file) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const videoUrl = URL.createObjectURL(file);
    video.src = videoUrl;

    video.onloadedmetadata = () => {
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // FIX: Handle duration=Infinity (WebM bug)
      const duration = video.duration;
      const isInf = !isFinite(duration) || duration === 0;

      if (isInf) {
        // Apply seek-to-end hack to force browser to scan and compute real duration
        logToBackend(`video thumbnail: duration=${duration}, applying seek hack`, 'warn', 'upload');
        const onTimeUpdate = () => {
          video.removeEventListener('timeupdate', onTimeUpdate);
          video.currentTime = 0;
          logToBackend(`video thumbnail: seek hack done, new duration=${video.duration}`, 'info', 'upload');
          drawFrame();
        };
        video.addEventListener('timeupdate', onTimeUpdate);
        try {
          video.currentTime = 1e101;
        } catch (e) {
          logToBackend(`video thumbnail: seek hack failed, drawing first frame: ${e.message}`, 'error', 'upload');
          drawFrame();
        }
      } else {
        // Normal case: seek to 1 second (or first frame if video is shorter)
        const seekTime = Math.min(1, duration);
        video.currentTime = seekTime;
      }
    };

    const drawFrame = () => {
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            setPreview(url);
            setIsPreviewThumbnail(true);
            setStage('details');
            logToBackend(`video thumbnail: generated successfully`, 'info', 'upload');
          } else {
            logToBackend(`video thumbnail: toBlob returned null`, 'error', 'upload');
            // Fallback: use video URL if thumbnail generation fails
            setPreview(videoUrl);
            setIsPreviewThumbnail(false);
            setStage('details');
          }
        }, 'image/jpeg', 0.8);
      } catch (e) {
        logToBackend(`video thumbnail: drawImage failed: ${e.message}`, 'error', 'upload');
        // Fallback: use video URL if draw fails
        setPreview(videoUrl);
        setIsPreviewThumbnail(false);
        setStage('details');
      } finally {
        URL.revokeObjectURL(video.src);
      }
    };

    video.onseeked = () => {
      logToBackend(`video thumbnail: onseeked fired at currentTime=${video.currentTime}`, 'info', 'upload');
      drawFrame();
    };

    video.onerror = () => {
      logToBackend(`video thumbnail: video error code=${video.error?.code} msg=${video.error?.message}`, 'error', 'upload');
      // Fallback: use the original video URL
      setPreview(videoUrl);
      setIsPreviewThumbnail(false);
    };
  };

  // ── Overlay drag helpers ─────────────────────────────────────────────────
  // Note: React synthetic onTouch* handlers are passive by default in React 17+,
  // so preventDefault is a no-op. We guard with e.cancelable to avoid warnings,
  // and rely on `touch-action: none` CSS on the drag elements to suppress scroll.
  const startOverlayDrag = (e, id) => {
    e.stopPropagation();
    if (e.cancelable && e.preventDefault) e.preventDefault();
    const pt = e.touches?.[0] || e;
    const ov = textOverlays.find(o => o.id === id);
    if (!ov || dragging) return; // Prevent starting new drag if already dragging
    setDragging({ id, sx: pt.clientX, sy: pt.clientY, ox: ov.x, oy: ov.y });
  };
  const moveOverlayDrag = (e) => {
    if (!dragging) return;
    if (e.cancelable && e.preventDefault) e.preventDefault();
    const pt = e.touches?.[0] || e;
    const el = previewContainerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = ((pt.clientX - dragging.sx) / r.width) * 100;
    const dy = ((pt.clientY - dragging.sy) / r.height) * 100;
    // Update only the dragged overlay position
    setTextOverlays(prev => prev.map(o => o.id === dragging.id
      ? { ...o, x: Math.max(5, Math.min(95, dragging.ox + dx)), y: Math.max(5, Math.min(95, dragging.oy + dy)) }
      : o));
  };
  const endOverlayDrag = (e) => {
    if (e && e.cancelable && e.preventDefault) e.preventDefault();
    setDragging(null);
  };

  // Attach native non-passive touch listeners on the drag container so we can
  // actually call preventDefault during overlay drags (React listeners are
  // registered as passive in React 17+, which makes preventDefault a no-op
  // and prints "Unable to preventDefault inside passive event listener").
  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const onMove = (ev) => {
      if (!dragging) return;
      if (ev.cancelable) ev.preventDefault();
      moveOverlayDrag(ev);
    };
    const onEnd = (ev) => {
      if (!dragging) return;
      if (ev.cancelable) ev.preventDefault();
      setDragging(null);
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: false });
    el.addEventListener('touchcancel', onEnd, { passive: false });
    return () => {
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [dragging]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Overlay CSS helper ────────────────────────────────────────────────────
  const overlayCSS = (ov) => {
    const base = { 
      fontWeight: 800, 
      fontSize: `${ov.fontSize || 22}px`, 
      color: ov.color, 
      textAlign: ov.align || 'center', 
      userSelect: 'none', 
      cursor: 'move', 
      whiteSpace: 'pre-wrap', 
      maxWidth: '260px',
      lineHeight: 1.2,
      display: 'inline-block'
    };
    switch (ov.style) {
      case 'plain':     return { ...base, textShadow: 'none', background: 'transparent', padding: '4px 6px', borderRadius: 0 };
      case 'outline':   return { ...base, textShadow: 'none', WebkitTextStroke: `2px ${ov.color}`, color: 'transparent', background: 'transparent', padding: '4px 6px' };
      case 'neon':      return { ...base, textShadow: 'none', background: 'transparent', padding: '4px 6px' };
      case 'highlight': return { ...base, background: ov.color, color: ov.color === '#fff' || ov.color === '#ffffff' ? '#000' : '#fff', padding: '4px 12px', borderRadius: 6 };
      default:          return { ...base, background: 'rgba(0,0,0,0.45)', padding: '4px 10px', borderRadius: 8, textShadow: 'none' };
    }
  };

  // ── Draft helpers ─────────────────────────────────────────────────────
  // Returns true only when the draft reached the server. The subscription
  // prompt relies on that answer: navigating away on a failed save would
  // destroy the very video this flow exists to protect.
  // `silent` suppresses the toast/modal so the caller can own the messaging.
  const saveDraft = async ({ silent = false } = {}) => {
    try {
      const formData = new FormData();
      if (isVideoFile && selectedFile) {
        formData.append('media', selectedFile);
      } else if (preview && !isVideoFile) {
        // Convert preview URL to blob for image drafts
        const resp = await fetch(preview);
        const blob = await resp.blob();
        formData.append('image', blob, `draft_${Date.now()}.jpg`);
      }
      formData.append('caption', caption);
      formData.append('hashtags', hashtags);
      formData.append('overlay_text', JSON.stringify(textOverlays));
      formData.append('filter', selectedFilter);
      if (customAudioFile) {
        formData.append('audio_file', customAudioFile);
        formData.append('audio_volume_level', addedVol);
        formData.append('original_volume_level', origVol);
      }

      const response = await api.request('/drafts/', {
        method: 'POST',
        body: formData,
        isFormData: true,
      });

      // Refresh drafts list
      loadDrafts();
      if (!silent) {
        setSuccessMsg('Draft saved!');
        setTimeout(() => { setSuccessMsg(''); }, 1200);
      }
      return true;
    } catch (err) {
      console.error('[DRAFT] Failed to save:', err);
      if (!silent) {
        setErrorMessage('Failed to save draft. Please try again.');
        setShowErrorModal(true);
      }
      return false;
    }
  };

  const loadDrafts = async () => {
    try {
      const response = await api.request('/drafts/');
      setDrafts(Array.isArray(response) ? response : (response.results || []));
    } catch (err) {
      console.error('[DRAFT] Failed to load:', err);
      setDrafts([]);
    }
  };

  // Normalize media URLs from backend: avoid mixed-content (force https when page is https)
  // and ensure we have an absolute URL the <video> tag can load.
  const normalizeMediaUrl = (url) => {
    if (!url) return url;
    try {
      if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
        return 'https://' + url.slice('http://'.length);
      }
    } catch (_) {}
    return url;
  };

  const loadDraft = async (draft) => {
    logToBackend(`loadDraft id=${draft.id} hasMedia=${!!draft.media} hasImage=${!!draft.image} mediaUrl=${draft.media || ''}`, 'info', 'drafts');
    setCaption(draft.caption || '');
    setHashtags(draft.hashtags || '');
    setSelectedFilter(draft.filter || 'none');
    setTextOverlays(draft.overlay_text ? JSON.parse(draft.overlay_text) : []);

    const isVideo = !!draft.media;
    setIsVideoFile(isVideo);

    if (draft.media) {
      // Video draft
      setSelectedFile(null); // File is on server, we'll use the URL
      setPreview(normalizeMediaUrl(draft.media));
      setIsPreviewThumbnail(false);
      setStage('details');
    } else if (draft.image) {
      // Image draft
      setSelectedFile(null);
      setPreview(normalizeMediaUrl(draft.image));
      setIsPreviewThumbnail(false);
      setStage('details');
    } else {
      // No media - go to capture
      setPreview(null);
      setSelectedFile(null);
      setCaptureMode('camera');
      setStage('capture');
    }
    setShowDrafts(false);
  };

  const deleteDraft = async (id) => {
    try {
      await api.request(`/drafts/${id}/`, { method: 'DELETE' });
      await loadDrafts();
    } catch (err) {
      console.error('[DRAFT] Failed to delete:', err);
      setErrorMessage('Failed to delete draft. Please try again.');
      setShowErrorModal(true);
    }
  };

  // ── Text overlay ────────────────────────────────────────────────────────
  const addTextOverlay = () => {
    if (!currentText.trim()) return;
    setTextOverlays(prev => [...prev, {
      id: Date.now(), text: currentText, color: textColor,
      style: textStyle, align: textAlign, fontSize: textFontSize,
      x: 50, y: 50,
    }]);
    setCurrentText('');
    setShowTextInput(false);
  };

  const removeOverlay = (id) => setTextOverlays(prev => prev.filter(o => o.id !== id));

  // ── Sound ───────────────────────────────────────────────────────────────
  const selectSound = (s) => {
    setBackgroundSound(s);
    setShowSoundSheet(false);
    if (audioRef.current && s.url) {
      audioRef.current.src = s.url;
      audioRef.current.volume = addedVol / 100;
    }
  };

  const toggleSoundPlay = () => {
    if (!audioRef.current) return;
    if (isPlayingSound) { audioRef.current.pause(); setIsPlayingSound(false); }
    else { 
      audioRef.current.play().catch((err) => {
        if (err.name !== 'AbortError') console.log('Play error:', err);
      }); 
      setIsPlayingSound(true); 
    }
  };

  const handleCustomAudio = async (e) => {
    console.log('[CUSTOM AUDIO] File input triggered');
    const file = e.target.files?.[0];
    if (!file) {
      console.log('[CUSTOM AUDIO] No file selected');
      return;
    }
    console.log('[CUSTOM AUDIO] File selected:', file.name, 'isRecording:', isRecordingRef.current);
    // Bug fix: opening the file picker mid-recording suspends the camera/MediaRecorder
    // on most mobile browsers, and a new AudioContext fights the recorder's context.
    // Music must be picked BEFORE recording starts (see startRecording which reads
    // customAudioFile at start time). Bail out if a recording is in progress.
    if (isRecordingRef.current) {
      console.log('[CUSTOM AUDIO] Recording in progress, blocking audio selection');
      // Reset the input so the same file can be re-selected later
      if (audioFileInputRef.current) audioFileInputRef.current.value = '';
      setErrorMessage('Please pick music before starting to record. Stop the current recording, choose your sound, then record again.');
      setShowErrorModal(true);
      return;
    }
    console.log('[CUSTOM AUDIO] Processing audio file');
    const sound = { id: 'custom', name: file.name, artist: 'Your audio', dur: '?', url: URL.createObjectURL(file) };
    setCustomAudioFile(file);
    setDecodedAudioBuffer(null);
    setIsDecodingAudio(true);
    selectSound(sound);

    // Pre-decode audio to prevent blocking during recording
    let decodeCtx = null;
    try {
      console.log('[CUSTOM AUDIO] Starting audio decode');
      logToBackend(`Decoding audio file=${file.name} size=${file.size}`, 'info', 'custom-audio');
      const arrayBuf = await file.arrayBuffer();
      decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuf = await decodeCtx.decodeAudioData(arrayBuf);
      setDecodedAudioBuffer(audioBuf);
      console.log('[AUDIO] Pre-decoded audio file, duration:', audioBuf.duration);
      logToBackend(`Decoded audio duration=${audioBuf.duration.toFixed(2)}s`, 'info', 'custom-audio');
    } catch (err) {
      console.error('[AUDIO] Failed to pre-decode audio:', err);
      logToBackend(`Decode failed: ${err.message}`, 'error', 'custom-audio');
      setDecodedAudioBuffer(null);
    } finally {
      setIsDecodingAudio(false);
      // Always close the decoding AudioContext to prevent leaks/conflicts during recording
      if (decodeCtx) {
        try { await decodeCtx.close(); } catch (_) {}
      }
    }
  };

  // ── Post / upload ───────────────────────────────────────────────────────
  const handlePost = async () => {
    if (!preview || isUploading) return;

    // Subscriber-only. This used to call onShowSubscription() straight
    // away, which navigated off the page and threw away the recording,
    // the caption and everything else the user had entered. Ask instead,
    // and leave the draft untouched.
    //
    // `false` means we know they are not subscribed. `undefined`/`null`
    // means the status request has not answered (or failed) -- that is not
    // a refusal, so let it through and let the backend be the authority.
    if (subscriptionStatus && subscriptionStatus.has_subscription === false) {
      setShowSubscriptionModal(true);
      return;
    }

    // Give immediate visual feedback so the button never appears "dead"
    // (especially inside the Telebirr SuperApp webview where network calls
    // can stall). The actual upload guard below also checks isUploading.
    setIsUploading(true);
    setUploadProgress(0);

    // Check coin balance before posting. This is a best-effort gate — if the
    // balance/config requests stall (common in the H5 SuperApp webview), we
    // must NOT block posting forever. Race against a short timeout so the
    // upload always proceeds; the backend still rejects on insufficient coins.
    try {
      const withTimeout = (promise, fallback, ms = 6000) =>
        Promise.race([
          promise,
          new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
        ]);

      const [walletConfig, coinBalance] = await Promise.all([
        withTimeout(
          api.request('/wallet/config/').catch(err => {
            console.error('Wallet config error:', err);
            return { cost_post_create_non_campaign: 0 };
          }),
          { cost_post_create_non_campaign: 0 }
        ),
        withTimeout(
          api.request('/coins/balance/').catch(err => {
            console.error('Coin balance error:', err);
            return { balance: 0 };
          }),
          { balance: 0 }
        ),
      ]);
      
      const cost = walletConfig.cost_post_create_non_campaign || 0;
      const balance = coinBalance.balance || 0;
      
      console.log('[POST] Coin check:', { cost, balance, sufficient: balance >= cost });
      
      if (cost > 0 && balance < cost) {
        console.log('[POST] Showing insufficient coins modal', { cost, balance });
        setPostCost(cost);
        setShowInsufficientCoins(true);
        setIsUploading(false);
        return;
      }
    } catch (error) {
      console.error('Error checking coin balance:', error);
      // Continue with posting if balance check fails
    }
    
    setUploadProgress(0);
    try {
      const fd = new FormData();
      
      // If we have a selectedFile (new recording/upload), use it
      // Otherwise, if preview is a URL (from draft), fetch it and upload
      if (selectedFile) {
        fd.append('file', selectedFile, selectedFile.name);
      } else if (preview && preview.startsWith('http')) {
        // Fetch the file from the draft URL
        const resp = await fetch(preview);
        const blob = await resp.blob();
        const file = new File([blob], `draft_${Date.now()}.${isVideoFile ? 'mp4' : 'jpg'}`, { type: blob.type });
        fd.append('file', file);
      } else if (preview) {
        // Local blob URL - convert to file
        const resp = await fetch(preview);
        const blob = await resp.blob();
        const file = new File([blob], `upload_${Date.now()}.${isVideoFile ? 'mp4' : 'jpg'}`, { type: blob.type });
        fd.append('file', file);
      }
      
      fd.append('caption', caption);
      if (hashtags) fd.append('hashtags', hashtags);
      if (customAudioFile) {
        fd.append('audio_file', customAudioFile);
        fd.append('audio_volume_level', addedVol);
        fd.append('original_volume_level', origVol);
      }
      if (textOverlays.length) {
        fd.append('overlay_text', JSON.stringify(textOverlays));
      }
      // Real upload progress from XHR.  While the server is still
      // processing after the bytes are uploaded, cap at 97% so the bar
      // doesn't appear frozen — the final 100% fires on successful response.
      let lastReported = 0;
      const newReel = await api.createPost(fd, {
        onProgress: (pct) => {
          lastReported = pct;
          setUploadProgress(Math.min(pct, 97));
        },
      }).catch(err => {
        console.error('[POST] Upload error:', err);
        setIsUploading(false);

        // The backend is the final authority: the subscription can lapse
        // between opening this page and pressing Publish. Branch on the code,
        // not the prose, and keep the draft exactly as it is -- no generic
        // "something went wrong", no navigation.
        if (err?.code === 'SUBSCRIPTION_REQUIRED') {
          setShowSubscriptionModal(true);
          return null;
        }

        // Check if error is due to insufficient coins
        if (err?.error && err.error.includes('Insufficient') || err?.required_coins) {
          const requiredCoins = err.required_coins || postCost || 2;
          console.log('[POST] Backend returned insufficient coins error, showing modal');
          setPostCost(requiredCoins);
          setShowInsufficientCoins(true);
          return null; // Return null to prevent success logic
        }

        // Only show modal for other errors (not insufficient coins)
        setErrorMessage(`Upload failed: ${err?.error || err?.message || 'Server error'}`);
        setShowErrorModal(true);
        return null; // Return null to prevent success logic
      });

      // Only show success if upload actually succeeded (newReel is not null)
      if (newReel && newReel.id) {
        // Broadcast new post to all users for real-time updates
        realtimeService.broadcastNewPost({
          id: newReel.id,
          user: user,
          caption: caption,
          media: newReel.media || newReel.image,
          created_at: newReel.created_at || new Date().toISOString()
        });

        // Also broadcast feed refresh to ensure all tabs update
        realtimeService.broadcastFeedRefresh();

        // Dispatch wallet balance changed event to refresh wallet page
        window.dispatchEvent(new CustomEvent('walletBalanceChanged'));

        setUploadProgress(100);
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          if (onPostSuccess) {
            onPostSuccess(newReel.id);
          } else {
            onBack?.();
          }
        }, 2000);
      }
    } catch (e) {
      console.error('Upload failed', e);
      const detail = e?.traceback || e?.error || e?.message || String(e);
      setErrorMessage(`Upload failed: ${e?.error || e?.message || 'Server error'}`);
      setShowErrorModal(true);
      console.error('[UPLOAD TRACEBACK]', detail);
    } finally {
      setIsUploading(false);
    }
  };

  const fmtTime = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  const activeFilter = FILTERS.find(f => f.id === selectedFilter);

  const bottomNavItems = [
    { id: 'home',     label: 'Home',     Icon: Home,       action: onNavHome },
    { id: 'reels',    label: 'Reels',    Icon: Film,       action: onNavReels },
    { id: 'create',   label: 'New',      Icon: PlusSquare, action: null, isCreate: true },
    { id: 'messages', label: 'Messages', Icon: MessageCircle, action: onNavMessages, badge: unreadDmCount },
    { id: 'profile',  label: 'Profile',  Icon: User,       action: onNavProfile },
  ];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, background: T.bg, zIndex: 4000,
      display: 'flex', flexDirection: 'column', color: T.txt, fontFamily: 'system-ui, sans-serif',
      paddingBottom: 64,
    }}>
      <style>{`
        @keyframes ep-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
        @keyframes ep-fade-in { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ep-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes ep-success { 0%{transform:scale(0.7);opacity:0} 60%{transform:scale(1.1)} 100%{transform:scale(1);opacity:1} }
        .ep-btn { border:none; cursor:pointer; transition:all 0.15s; touch-action:manipulation; -webkit-tap-highlight-color:transparent; }
        .ep-btn:active { transform:scale(0.94); }
        .ep-filter-scroll::-webkit-scrollbar { display:none; }
        .ep-hash { color:${T.pri}; font-weight:700; }
      `}</style>

      {/* ── BOTTOM NAV BAR ──────────────────────────────────────────────── */}
      {window.innerWidth <= 768 ? (
      <nav style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: 60,
        background: T.bg,
        borderTop: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        zIndex: 5000,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxShadow: 'none',
        overflow: 'visible',
      }}>
        <style>{`
          .ep-nav-btn { transition: transform 0.15s cubic-bezier(0.34,1.56,0.64,1); border: none; background: transparent; cursor: pointer; }
          .ep-nav-btn:active { transform: scale(0.82) !important; }
          .ep-nav-btn:active svg { fill: #000 !important; }
        `}</style>
        {bottomNavItems.map(({ id, label, Icon, action, isCreate, badge }) => {
          if (isCreate) return (
            <button key={id} className="ep-nav-btn"
              onClick={() => action?.()}
              style={{ 
                flex: 1,
                height: '100%',
                background: 'none', 
                border: 'none', 
                cursor: 'pointer', 
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-start',
                position: 'relative',
                padding: '0 8px',
                overflow: 'visible',
                WebkitTapHighlightColor: 'transparent',
                outline: 'none',
              }}>
              <div style={{
                position: 'absolute',
                top: -18,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 54,
                height: 54,
                borderRadius: '50%',
                background: 'linear-gradient(145deg, #8fc441 0%, #6ba835 100%)',
                boxShadow: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                border: '3px solid rgba(255,255,255,0.15)',
              }}>
                <Plus size={26} strokeWidth={2.8} color='#1A0A00' />
              </div>
            <span style={{ fontSize: 10, fontWeight: 500, color: '#8fc441', lineHeight: 1, marginTop: 'auto', paddingBottom: 4 }}>Create</span>
          </button>
        );
        return (
          <button key={id} className="ep-nav-btn"
              onClick={() => action?.()}
              style={{ 
                flex: 1,
                height: '100%',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                padding: '4px 8px',
                position: 'relative',
                WebkitTapHighlightColor: 'transparent !important',
                outline: 'none',
              }}>
              <div style={{
                position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon
                  size={24}
                  strokeWidth={1.8}
                  color={'#8fc441'}
                  fill={'none'}
                />
                {badge > 0 && (
                  <div style={{
                    position: 'absolute', top: -4, right: -6,
                    minWidth: 15, height: 15, borderRadius: 8,
                    background: '#EF4444', color: '#fff',
                    fontSize: 8, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 3px', boxSizing: 'border-box',
                    border: '1.5px solid #fff', lineHeight: 1,
                  }}>
                    {badge > 99 ? '99+' : badge}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 10, fontWeight: 500, color: '#8fc441', lineHeight: 1 }}>{label}</span>
            </button>
          );
        })}
      </nav>
      ) : null}

      {/* ── CAPTURE STAGE ─────────────────────────────────────────────── */}
      {stage === 'capture' && (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

          {captureMode === 'camera' ? (
            /* ── CAMERA VIEW (fullscreen 9:16) ── */
            <div ref={previewContainerRef} style={{ position: 'absolute', inset: 0, touchAction: dragging ? 'none' : 'auto' }}
              onMouseMove={moveOverlayDrag} onMouseUp={endOverlayDrag} onMouseLeave={endOverlayDrag}>
              {/* Camera loading indicator */}
              {cameraLoading && (
                <div style={{
                  position: 'absolute', inset: 0, background: T.bg,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  zIndex: 1000,
                }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%', background: T.pri,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'spin 1s linear infinite',
                  }}>
                    <RefreshCw size={24} color="#8fc441" />
                  </div>
                  <div style={{ marginTop: 16, fontSize: 14, color: '#8fc441', fontWeight: 600 }}>
                    Starting camera...
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: '#8fc441' }}>
                    Please allow camera permissions if prompted
                  </div>
                  <style>{`
                    @keyframes spin {
                      from { transform: rotate(0deg); }
                      to { transform: rotate(360deg); }
                    }
                  `}</style>
                </div>
              )}
              {/* Hidden video source */}
              <video 
                ref={videoRef} 
                playsInline 
                muted 
                autoPlay
                playsinline
                webkit-playsinline
                style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} 
              />
              {/* Filtered canvas - contain to show full camera view without zoom */}
              <canvas ref={canvasRef}
                style={{ 
                  width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: 'block',
                  pointerEvents: 'none', // Don't capture touch events - let them pass to controls
                }} />

              {/* Text overlays ON camera preview — draggable */}
              {textOverlays.map(ov => (
                <div key={ov.id}
                  style={{ position: 'absolute', left: `${ov.x}%`, top: `${ov.y}%`, transform: 'translate(-50%,-50%)', zIndex: 20, touchAction: 'none' }}
                  onMouseDown={e => startOverlayDrag(e, ov.id)}
                  onTouchStart={e => startOverlayDrag(e, ov.id)}
                >
                  <div style={{ position: 'relative', ...overlayCSS(ov) }}>
                    {ov.text}
                    <div style={{ position: 'absolute', top: -10, right: -10, width: 20, height: 20, borderRadius: '50%', background: T.red, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 11, zIndex: 21 }}
                      onMouseDown={e => e.stopPropagation()}
                      onTouchStart={e => e.stopPropagation()}
                      onClick={() => removeOverlay(ov.id)}>×</div>
                  </div>
                </div>
              ))}

              {/* Top bar */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30,
                padding: 'max(12px, env(safe-area-inset-top)) 16px 12px',
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <button className="ep-btn" 
                  onClick={() => { stopCamera(); setCaptureMode('upload'); }}
                  onTouchEnd={(e) => { e.preventDefault(); stopCamera(); setCaptureMode('upload'); }}
                  style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={20} color="#8fc441" />
                </button>

                {/* Mode tabs — force light text on dark overlay so the Photo/
                    Video labels are readable regardless of theme. */}
                <div style={{ display: 'flex', gap: 6, background: 'rgba(0,0,0,0.4)', borderRadius: 24, padding: '4px 6px' }}>
                  {['photo','video'].map(m => (
                    <button key={m} className="ep-btn" 
                      onClick={() => setCamMode(m)}
                      onTouchEnd={(e) => { e.preventDefault(); setCamMode(m); }}
                      style={{
                        padding: '6px 14px', borderRadius: 20,
                        background: camMode === m ? T.pri : 'transparent',
                        color: camMode === m ? '#1a1a1a' : '#8fc441',
                        fontSize: 13, fontWeight: 700,
                        textShadow: camMode === m ? 'none' : '0 1px 2px rgba(0,0,0,0.8)',
                      }}>
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Flash */}
                <button className="ep-btn" 
                  onClick={() => setFlashOn(f => !f)}
                  onTouchEnd={(e) => { e.preventDefault(); setFlashOn(f => !f); }}
                  style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {flashOn ? <Zap size={18} color="#8fc441" fill="#8fc441" /> : <ZapOff size={18} color="#8fc441" />}
                </button>
              </div>

              {/* Recording timer */}
              {isRecording && (
                <div style={{
                  position: 'absolute', top: 70, left: 0, right: 0, textAlign: 'center', zIndex: 25,
                }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: '6px 16px',
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: hasExtendedRecording ? '#F59E0B' : T.red, animation: 'ep-pulse 1s infinite' }} />
                    <span style={{ fontWeight: 700, fontSize: 16, fontVariantNumeric: 'tabular-nums', color: hasExtendedRecording ? '#F59E0B' : '#fff' }}>
                      {fmtTime(recTime)} / {fmtTime(MAX_REC)}
                    </span>
                    {hasExtendedRecording && <Coins size={14} color="#F59E0B" />}
                  </div>
                  {/* Progress bar at top */}
                  <div style={{ position: 'absolute', top: -8, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.2)' }}>
                    <div style={{ height: '100%', width: `${recProgress}%`, background: hasExtendedRecording ? '#F59E0B' : T.red, transition: 'width 0.5s linear' }} />
                  </div>
                </div>
              )}

              {/* Right side toolbar — icons + labels on the dark camera
                  preview.  Force white + drop shadow so they're readable
                  regardless of theme (user's dark-on-dark bug). */}
              <div style={{
                position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center',
                zIndex: 30,
              }}>
                {[
                  { icon: <RefreshCw size={22} color="#8fc441" />, label: 'Flip', action: flipCamera },
                  { icon: <Type size={22} color="#8fc441" />, label: 'Text', action: () => setShowTextInput(true) },
                  { icon: <Music size={22} color={backgroundSound ? '#8fc441' : '#8fc441'} />, label: 'Sound', action: () => {
                    console.log('[SOUND ICON] Clicked, isRecording:', isRecordingRef.current);
                    if (isRecordingRef.current) {
                      console.log('[SOUND ICON] Recording in progress, blocking sound selection');
                      setErrorMessage('Please pick music before starting to record. Stop the current recording, choose your sound, then record again.');
                      setShowErrorModal(true);
                      return;
                    }
                    console.log('[SOUND ICON] Opening sound sheet');
                    setShowSoundSheet(true);
                  }},
                  { icon: <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#8fc441" strokeWidth={2}><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/></svg>, label: 'Filter', action: () => setShowFilters(f => !f) },
                  { icon: <span style={{ fontSize: 13, fontWeight: 800, color: '#8fc441' }}>{selectedSpeed}</span>, label: 'Speed', action: () => setShowSpeeds(s => !s) },
                ].map((item, i) => (
                  <button key={i} className="ep-btn" onClick={item.action} onTouchEnd={(e) => { e.preventDefault(); item.action(); }}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', padding: 8, margin: -8 }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.15)' }}>
                      {item.icon}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#8fc441', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>{item.label}</span>
                  </button>
                ))}
              </div>

              {/* Speed selector — force light text on dark popover */}
              {showSpeeds && (
                <div style={{
                  position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                  display: 'flex', flexDirection: 'column', gap: 8,
                  background: 'rgba(0,0,0,0.7)', borderRadius: 16, padding: '10px 8px',
                  backdropFilter: 'blur(12px)', zIndex: 35,
                  border: '1px solid rgba(255,255,255,0.15)',
                }}>
                  {SPEEDS.map(sp => (
                    <button key={sp} className="ep-btn" onClick={() => { setSelectedSpeed(sp); setShowSpeeds(false); }}
                      style={{
                        padding: '6px 14px', borderRadius: 12,
                        background: selectedSpeed === sp ? T.pri : 'rgba(255,255,255,0.12)',
                        color: '#8fc441', fontSize: 13, fontWeight: 700,
                      }}>{sp}</button>
                  ))}
                </div>
              )}

              {/* Filter strip — labels above dark preview must be white. */}
              {showFilters && (
                <div style={{
                  position: 'absolute', bottom: 130, left: 0, right: 0, zIndex: 35,
                  overflowX: 'auto', display: 'flex', gap: 12, padding: '8px 16px',
                  scrollbarWidth: 'none',
                }}>
                  {FILTERS.map(f => (
                    <button key={f.id} className="ep-btn" onClick={() => setSelectedFilter(f.id)}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', flexShrink: 0 }}>
                      <div style={{
                        width: 58, height: 58, borderRadius: 12,
                        background: `conic-gradient(${T.pri}, #3B82F6, #10B981, ${T.pri})`,
                        filter: f.css,
                        border: selectedFilter === f.id ? `3px solid ${T.pri}` : '3px solid rgba(255,255,255,0.4)',
                        boxShadow: selectedFilter === f.id ? `0 0 0 2px ${T.pri}` : 'none',
                        transition: 'all 0.2s',
                      }} />
                      <span style={{
                        fontSize: 11,
                        color: '#8fc441',
                        fontWeight: selectedFilter === f.id ? 800 : 600,
                        textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                      }}>{f.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Bottom controls */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30,
                background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
                padding: '0 24px 48px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
              }}>
                  {/* Upload from gallery shortcut */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <button className="ep-btn" 
                    onClick={() => fileInputRef.current?.click()}
                    onTouchEnd={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
                    style={{ background: 'rgba(0,0,0,0.45)', borderRadius: 12, padding: 6, backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}>
                    <div style={{ width: 52, height: 52, borderRadius: 10, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Upload size={22} color="#8fc441" />
                    </div>
                  </button>

                  {/* Record / Shutter button */}
                  <div style={{ position: 'relative', width: 80, height: 80 }}>
                    {camMode === 'video' && isRecording && (
                      <ProgressRing radius={40} stroke={4} progress={recProgress} color={T.red} />
                    )}
                    <button className="ep-btn"
                      disabled={isDecodingAudio && !isRecordingRef.current}
                      onClick={(e) => {
                        // Block start while audio is still decoding
                        if (isDecodingAudio && !isRecordingRef.current) {
                          logToBackend('record-btn click BLOCKED: audio still decoding', 'warn');
                          setErrorMessage('Music is still loading. Please wait a moment.');
                          setShowErrorModal(true);
                          return;
                        }
                        // Debounce: ignore if another toggle just fired (touch+click double-fire)
                        const now = Date.now();
                        if (now - lastToggleRef.current < 500) {
                          logToBackend(`record-btn onClick IGNORED (debounce ${now - lastToggleRef.current}ms)`, 'warn');
                          return;
                        }
                        lastToggleRef.current = now;
                        logToBackend(`record-btn onClick fired isRecording=${isRecordingRef.current}`, 'info');
                        if (camMode === 'video') {
                          isRecordingRef.current ? stopRecording() : startRecording().catch(console.error);
                        } else {
                          takePhoto();
                        }
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        if (isDecodingAudio && !isRecordingRef.current) {
                          logToBackend('record-btn touchEnd BLOCKED: audio still decoding', 'warn');
                          setErrorMessage('Music is still loading. Please wait a moment.');
                          setShowErrorModal(true);
                          return;
                        }
                        const now = Date.now();
                        if (now - lastToggleRef.current < 500) {
                          logToBackend(`record-btn onTouchEnd IGNORED (debounce ${now - lastToggleRef.current}ms)`, 'warn');
                          return;
                        }
                        lastToggleRef.current = now;
                        logToBackend(`record-btn onTouchEnd fired isRecording=${isRecordingRef.current}`, 'info');
                        if (camMode === 'video') {
                          isRecordingRef.current ? stopRecording() : startRecording().catch(console.error);
                        } else {
                          takePhoto();
                        }
                      }}
                      style={{
                        width: 80, height: 80, borderRadius: '50%',
                        background: camMode === 'video' ? (isRecording ? '#EF4444' : '#FFFFFF') : '#FFFFFF',
                        border: `4px solid rgba(255,255,255,0.5)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: isRecording ? `0 0 0 6px #EF444455` : 'rgba(0,0,0,0.4)',
                        transition: 'all 0.2s',
                        opacity: (isDecodingAudio && !isRecording) ? 0.4 : 1,
                        cursor: (isDecodingAudio && !isRecording) ? 'wait' : 'pointer',
                      }}>
                      {camMode === 'video'
                        ? (isRecording
                          ? <Square size={26} color={T.txt} fill={T.txt} />
                          : (isDecodingAudio
                            ? <RefreshCw size={26} color="#666" style={{ animation: 'spin 1s linear infinite' }} />
                            : <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#EF4444' }} />))
                        : <div style={{ width: 56, height: 56, borderRadius: '50%', background: T.cardBg || '#fff', border: `3px solid ${T.border}` }} />
                      }
                    </button>
                    {isDecodingAudio && !isRecording && (
                      <div style={{
                        position: 'absolute',
                        bottom: -28,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        whiteSpace: 'nowrap',
                        background: 'rgba(0,0,0,0.85)',
                        color: '#8fc441',
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: 12,
                        border: '1px solid rgba(143,196,65,0.4)',
                      }}>
                        Loading music…
                      </div>
                    )}
                    {/* Video icon indicator - only show in video mode */}
                    {camMode === 'video' && (
                      <div style={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,0.75)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid rgba(255,255,255,0.35)',
                      }}>
                        <Video size={14} color="#8fc441" strokeWidth={2.5} />
                      </div>
                    )}
                  </div>

                  {/* Flip camera shortcut */}
                  <button aria-label="Refresh" className="ep-btn" 
                    onClick={flipCamera}
                    onTouchEnd={flipCamera}
                    style={{ background: 'rgba(0,0,0,0.45)', borderRadius: '50%', width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}>
                    <RefreshCw size={22} color="#8fc441" />
                  </button>
                </div>

                {/* Background sound pill */}
                {backgroundSound && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: `${T.dark}8C`, borderRadius: 24, padding: '8px 14px',
                    backdropFilter: 'blur(10px)',
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.pri, animation: isRecording ? 'ep-pulse 1s infinite' : 'none' }} />
                    <Music size={14} color={T.pri} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{backgroundSound.name}</span>
                    <button className="ep-btn" onClick={() => { setBackgroundSound(null); setCustomAudioFile(null); setDecodedAudioBuffer(null); }}
                      style={{ background: `${T.pri}20`, borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={11} color={T.txt} />
                    </button>
                  </div>
                )}
              </div>

              {/* Hidden input */}
              <input ref={fileInputRef} type="file" accept="image/*,video/*"
                onChange={handleFileSelect} style={{ display: 'none' }} />
            </div>

          ) : (
            /* ── UPLOAD / PICK MODE ── */
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              height: '100%',
              overflowY: 'auto',
              paddingBottom: 24,
              background: 'linear-gradient(160deg, #0D0A06 0%, #0D0D0D 60%, #0A0806 100%)',
            }}>

              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: 'max(16px, env(safe-area-inset-top)) 16px 12px',
                background: 'transparent',
                position: 'relative', zIndex: 1,
              }}>
                <button aria-label="Go back" className="ep-btn" onClick={onBack}
                  style={{ background: 'rgba(249,224,139,0.15)', border: '1.5px solid #8fc441', borderRadius: 10, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ArrowLeft size={20} color="#8fc441" />
                </button>
                <span style={{ fontSize: 18, fontWeight: 800, background: 'linear-gradient(to bottom, #8fc441 0%, #D4AF37 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>New Post</span>
                {drafts.length > 0 ? (
                  <button className="ep-btn" onClick={() => setShowDrafts(true)}
                    style={{ background: 'rgba(249,224,139,0.12)', border: '1.5px solid #8fc441', borderRadius: 20, padding: '7px 13px', color: '#8fc441', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileText size={14} /> Drafts ({drafts.length})
                  </button>
                ) : <div style={{ width: 40 }} />}
              </div>

              {/* Hero icon + title */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 20, paddingBottom: 4, position: 'relative', zIndex: 1 }}>
                <div style={{ position: 'relative', marginBottom: 14 }}>
                  <img
                    src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23D99B2A'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z'/%3E%3C/svg%3E"
                    alt="Create"
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: '50%',
                      objectFit: 'cover'
                    }} 
                  />
                  <div style={{ position: 'absolute', top: -2, right: -2, width: 22, height: 22, background: '#8fc441', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, border: '2px solid #0D0D0D', boxShadow: '0 2px 6px rgba(249,224,139,0.5)' }}>✨</div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, background: 'linear-gradient(to bottom, #8fc441 0%, #D4AF37 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 4 }}>Create Post</div>
                <div style={{ fontSize: 13, color: '#8fc441', opacity: 0.7, textAlign: 'center' }}>Choose how you want to create content</div>
              </div>

              {/* Cards */}
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 16, 
                padding: '20px 20px 32px', 
                position: 'relative', 
                zIndex: 1, 
                alignItems: 'center', 
                justifyContent: 'center', 
                width: '100%',
                maxWidth: '450px',
                margin: '0 auto'
              }}>

                {/* ── Take Photo card ── */}
                <button className="ep-btn" onClick={() => { setCamMode('photo'); setCaptureMode('camera'); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: '#1a1a1a',
                    border: '1.5px solid #8fc441',
                    borderRadius: 10,
                    padding: '10px 14px',
                    cursor: 'pointer',
                    boxShadow: 'none',
                    transition: 'transform 0.15s',
                    textAlign: 'left',
                    position: 'relative',
                    overflow: 'hidden',
                    width: '100%',
                    height: '52px',
                    minWidth: '240px',
                    maxWidth: '300px',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#111', border: '1px solid #8fc44144', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z" fill="#8fc441"/><path d="M9 3L7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9z" stroke="#8fc441" strokeWidth="1.8" fill="none" strokeLinejoin="round"/></svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#8fc441', marginBottom: 2 }}>Take Photo</div>
                    <div style={{ fontSize: 11.5, color: '#8fc441', opacity: 0.6 }}>Use camera for photos</div>
                  </div>
                </button>

                {/* ── Record Video card ── */}
                <button className="ep-btn" onClick={() => { setCamMode('video'); setCaptureMode('camera'); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: '#1a1a1a',
                    border: '1.5px solid #8fc441',
                    borderRadius: 10,
                    padding: '10px 14px',
                    cursor: 'pointer',
                    boxShadow: 'none',
                    transition: 'transform 0.15s',
                    textAlign: 'left',
                    position: 'relative',
                    overflow: 'hidden',
                    width: '100%',
                    height: '52px',
                    minWidth: '240px',
                    maxWidth: '300px',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#111', border: '1px solid #8fc44144', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="2" y="6" width="14" height="12" rx="2" stroke="#8fc441" strokeWidth="1.8" fill="none"/><path d="M22 8l-6 4 6 4V8z" fill="#8fc441"/></svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#8fc441', marginBottom: 2 }}>Record Video</div>
                    <div style={{ fontSize: 11.5, color: '#8fc441', opacity: 0.6 }}>Record up to 60 seconds</div>
                  </div>
                </button>

                {/* ── Upload Photo/Video card ── */}
                <button className="ep-btn" onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: '#1a1a1a',
                    border: '1.5px solid #8fc441',
                    borderRadius: 10,
                    padding: '10px 14px',
                    cursor: 'pointer',
                    boxShadow: 'none',
                    transition: 'transform 0.15s',
                    textAlign: 'left',
                    position: 'relative',
                    overflow: 'hidden',
                    width: '100%',
                    height: '52px',
                    minWidth: '240px',
                    maxWidth: '300px',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#111', border: '1px solid #8fc44144', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#8fc441" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="17 8 12 3 7 8" stroke="#8fc441" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="3" x2="12" y2="15" stroke="#8fc441" strokeWidth="2.2" strokeLinecap="round"/></svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#8fc441', marginBottom: 2 }}>Upload Photo/Video</div>
                    <div style={{ fontSize: 11.5, color: '#8fc441', opacity: 0.6 }}>From gallery or files</div>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*,video/*"
                    onChange={handleFileSelect} style={{ display: 'none' }} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── DETAILS STAGE ──────────────────────────────────────────────────── */}
      {stage === 'details' && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Top bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: 'max(16px, env(safe-area-inset-top)) 16px 12px',
            borderBottom: `1px solid ${T.border}`,
            position: 'sticky', top: 0, background: T.bg, zIndex: 10,
          }}>
            <button className="ep-btn" onClick={() => { setStage('capture'); setPreview(null); setSelectedFile(null); }}
              style={{ background: 'rgba(255,255,255,0.12)', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowLeft size={20} color={T.txt} />
            </button>
            <span style={{ fontSize: 18, fontWeight: 800, color: T.txt }}>Post</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="ep-btn" onClick={() => setShowPreview(true)}
                style={{ background: 'rgba(218,155,42,0.2)', borderRadius: 20, padding: '8px 14px', color: T.txt, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Eye size={15} /> Preview
              </button>
              <button aria-label="Save" className="ep-btn" onClick={saveDraft}
                style={{ background: 'rgba(218,155,42,0.2)', borderRadius: 20, padding: '8px', color: T.txt, display: 'flex', alignItems: 'center' }}>
                <Bookmark size={17} />
              </button>
              <button className="ep-btn" onClick={handlePost} disabled={isUploading}
                style={{
                  background: isUploading ? 'rgba(218,155,42,0.4)' : T.pri,
                  borderRadius: 24, padding: '10px 22px',
                  fontSize: 15, fontWeight: 800, color: '#fff',
                  opacity: isUploading ? 0.7 : 1,
                }}>
                {isUploading ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>

          {/* Upload progress bar */}
          {isUploading && (
            <div style={{ height: 3, background: T.border }}>
              <div style={{ height: '100%', width: `${uploadProgress}%`, background: T.pri, transition: 'width 0.3s' }} />
            </div>
          )}

          <div style={{ padding: '20px 20px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Preview + caption row */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              {/* Media preview */}
              <div style={{
                width: 100, height: 138, borderRadius: 14, overflow: 'hidden',
                background: '#000', flexShrink: 0, position: 'relative',
                border: '1px solid rgba(255,255,255,0.2)',
              }}>
                {preview && (
                  // Use isPreviewThumbnail to determine if preview is an image (thumbnail) or video
                  isPreviewThumbnail || !isVideoFile
                    ? <img src={preview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={() => logToBackend(`thumb img ERROR src=${preview}`, 'error', 'drafts')}
                      />
                    : <video src={preview}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        muted playsInline preload="metadata"
                        onLoadedMetadata={(e) => logToBackend(`thumb video loaded w=${e.target.videoWidth} h=${e.target.videoHeight} dur=${e.target.duration?.toFixed(1)}`, 'info', 'drafts')}
                        onError={(e) => {
                          const code = e.target.error?.code;
                          const msg = e.target.error?.message;
                          logToBackend(`thumb video ERROR code=${code} msg=${msg} src=${preview}`, 'error', 'drafts');
                        }}
                      />
                )}
                {/* Text overlays on preview thumbnail */}
                {textOverlays.map(ov => (
                  <div key={ov.id} style={{
                    position: 'absolute',
                    left: `${ov.x}%`, top: `${ov.y}%`,
                    transform: 'translate(-50%,-50%)',
                    color: ov.color, fontSize: ov.fontSize * 0.42,
                    fontWeight: 800, whiteSpace: 'nowrap', pointerEvents: 'none',
                    textShadow: '0 1px 4px rgba(0,0,0,0.7)',
                    background: 'rgba(0,0,0,0.28)', borderRadius: 4, padding: '1px 4px',
                  }}>{ov.text}</div>
                ))}
                {/* Filter label */}
                {selectedFilter !== 'none' && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(218,155,42,0.12)',
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                    padding: 6,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#8fc441', background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: 8 }}>
                      {activeFilter?.name}
                    </span>
                  </div>
                )}
              </div>

              {/* Caption */}
              <div style={{ flex: 1 }}>
                <textarea
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  placeholder="Describe your video..."
                  rows={5}
                  style={{
                    width: '100%', background: 'transparent', border: 'none', outline: 'none',
                    color: '#8fc441', fontSize: 15, lineHeight: 1.5, resize: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Hashtags */}
            <div style={{
              background: '#000', borderRadius: 16, padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
              border: '1px solid rgba(255,255,255,0.2)',
            }}>
              <span style={{ color: T.pri, fontSize: 18, fontWeight: 800 }}>#</span>
              <input
                value={hashtags}
                onChange={e => setHashtags(e.target.value)}
                placeholder="Add hashtags..."
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: '#8fc441', fontSize: 14,
                }}
              />
            </div>

            {/* Sound section */}
            <div style={{ background: '#000', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)' }}>
              <button className="ep-btn" onClick={() => setShowSoundSheet(true)}
                style={{
                  width: '100%', padding: '16px 20px', background: 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(218,155,42,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Music size={18} color={T.pri} />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#8fc441' }}>
                      {backgroundSound ? backgroundSound.name : 'Add Sound'}
                    </div>
                    <div style={{ fontSize: 12, color: '#8fc441' }}>
                      {backgroundSound ? backgroundSound.artist : 'Pick background music'}
                    </div>
                  </div>
                </div>
                <span style={{ color: T.sub, fontSize: 20 }}>›</span>
              </button>

              {backgroundSound && (
                <div style={{ borderTop: `1px solid ${T.border}`, padding: '12px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <button className="ep-btn" onClick={toggleSoundPlay}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(218,155,42,0.15)', borderRadius: 24, padding: '6px 14px' }}>
                      {isPlayingSound ? <Pause size={14} color={T.pri} /> : <Play size={14} color={T.pri} />}
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.pri }}>Preview</span>
                    </button>
                    <button className="ep-btn" onClick={() => setShowVolMixer(v => !v)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 24, padding: '6px 14px' }}>
                      <Sliders size={14} color={'#8fc441'} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#8fc441' }}>Mix</span>
                    </button>
                  </div>

                  {showVolMixer && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'ep-fade-in 0.2s ease' }}>
                      {[
                        { label: 'Original sound', val: origVol, set: setOrigVol },
                        { label: 'Added sound', val: addedVol, set: setAddedVol },
                      ].map(({ label, val, set }) => (
                        <div key={label}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 13, color: '#8fc441' }}>{label}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#8fc441' }}>{val}%</span>
                          </div>
                          <input type="range" min={0} max={100} value={val}
                            onChange={e => set(+e.target.value)}
                            style={{ width: '100%', accentColor: T.pri }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Text overlays summary */}
            {textOverlays.length > 0 && (
              <div style={{ background: '#000', borderRadius: 16, padding: '16px 20px', border: '1px solid rgba(255,255,255,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#8fc441' }}>Text overlays</span>
                  <button className="ep-btn" onClick={() => setShowTextInput(true)}
                    style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 20, padding: '4px 12px', fontSize: 13, color: '#8fc441' }}>
                    + Add
                  </button>
                </div>
                {textOverlays.map(ov => (
                  <div key={ov.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 14, color: ov.color, fontWeight: 700 }}>{ov.text}</span>
                    <button className="ep-btn" onClick={() => removeOverlay(ov.id)}
                      style={{ background: 'rgba(255,59,87,0.15)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={13} color={T.red} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add text CTA if none yet */}
            {textOverlays.length === 0 && (
              <button className="ep-btn" onClick={() => setShowTextInput(true)}
                style={{
                  padding: '16px', background: '#000', border: '1px dashed rgba(255,255,255,0.2)',
                  borderRadius: 16, display: 'flex', alignItems: 'center', gap: 12,
                  cursor: 'pointer',
                }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Type size={18} color={'#8fc441'} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#8fc441' }}>Add text overlay</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── TEXT INPUT MODAL — Professional Reel-style ─────────────────────── */}
      {showTextInput && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 9000,
          display: 'flex', flexDirection: 'column',
          animation: 'ep-fade-in 0.2s ease',
        }} onClick={() => setShowTextInput(false)}>
          
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: 'max(16px, env(safe-area-inset-top)) 20px 16px',
          }}>
            <button className="ep-btn" onClick={() => setShowTextInput(false)}
              style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={20} color={'#8fc441'} />
            </button>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#8fc441' }}>Add Text</span>
            <button className="ep-btn" onClick={addTextOverlay}
              style={{ background: T.pri, borderRadius: 20, padding: '10px 20px', fontSize: 14, fontWeight: 700, color: '#000' }}>
              Done
            </button>
          </div>

          {/* Live Preview Area */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={e => e.stopPropagation()}>
            <div style={{
              minHeight: 120, minWidth: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 24,
            }}>
              {currentText ? (
                <span style={{ ...overlayCSS({ color: textColor, style: textStyle, align: textAlign, fontSize: textFontSize, fontWeight: 800 }), cursor: 'default' }}>
                  {currentText}
                </span>
              ) : <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }}>Your text preview</span>}
            </div>
          </div>

          {/* Bottom Controls */}
          <div style={{
            background: 'rgba(20,20,20,0.98)', borderRadius: '24px 24px 0 0',
            padding: '20px 20px max(20px, env(safe-area-inset-bottom))',
          }} onClick={e => e.stopPropagation()}>
            
            {/* Text Input */}
            <textarea
              autoFocus
              value={currentText}
              onChange={e => setCurrentText(e.target.value)}
              placeholder="Type something..."
              rows={2}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.08)', border: 'none',
                borderRadius: 14, padding: '14px 16px', color: '#8fc441',
                fontSize: 16, fontWeight: 600, outline: 'none', resize: 'none', boxSizing: 'border-box',
              }}
            />

            {/* Style Buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'center' }}>
              {[['bold','Aa'],['plain','A'],['outline','Ø'],['neon','✦'],['highlight','▮']].map(([s,lbl]) => (
                <button key={s} className="ep-btn" onClick={() => setTextStyle(s)}
                  style={{
                    width: 48, height: 48, borderRadius: '50%', fontSize: 16, fontWeight: 800,
                    background: textStyle === s ? T.pri : 'rgba(255,255,255,0.1)',
                    color: textStyle === s ? '#000' : '#8fc441',
                    border: 'none',
                    boxShadow: textStyle === s ? '0 4px 12px rgba(218,155,42,0.4)' : 'none',
                  }}>
                  {lbl}
                </button>
              ))}
            </div>

            {/* Alignment + Size */}
            <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', justifyContent: 'center' }}>
              {[['left','◀'],['center','≡'],['right','▶']].map(([a,lbl]) => (
                <button key={a} className="ep-btn" onClick={() => setTextAlign(a)}
                  style={{
                    width: 40, height: 40, borderRadius: '50%', fontSize: 14,
                    background: textAlign === a ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
                    color: '#8fc441', border: 'none',
                  }}>
                  {lbl}
                </button>
              ))}
              <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)', margin: '0 8px' }} />
              <span style={{ color: T.sub, fontSize: 12 }}>Size</span>
              <input type="range" min={14} max={56} value={textFontSize}
                onChange={e => setTextFontSize(Number(e.target.value))}
                style={{ width: 100, accentColor: T.pri }} />
              <span style={{ color: '#8fc441', fontSize: 12, fontWeight: 600, minWidth: 24 }}>{textFontSize}</span>
            </div>

            {/* Color Palette - Perfect Circles */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: T.sub, marginBottom: 10, textAlign: 'center' }}>Color</div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                {TEXT_COLORS.map(c => (
                  <button key={c} className="ep-btn" onClick={() => setTextColor(c)}
                    style={{
                      width: 36, height: 36, borderRadius: '50%', background: c,
                      border: textColor === c ? '3px solid #fff' : '2px solid rgba(255,255,255,0.2)',
                      boxShadow: textColor === c ? `0 0 0 3px ${T.pri}, 0 4px 12px rgba(0,0,0,0.4)` : '0 2px 8px rgba(0,0,0,0.3)',
                      transform: textColor === c ? 'scale(1.15)' : 'scale(1)',
                      transition: 'all 0.15s ease',
                    }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SOUND SELECTOR SHEET ─────────────────────────────────────────────── */}
      {showSoundSheet && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9000,
          display: 'flex', alignItems: 'flex-end', animation: 'ep-fade-in 0.2s ease',
        }} onClick={() => setShowSoundSheet(false)}>
          <div style={{
            width: '100%', maxHeight: '70vh', background: '#111',
            borderRadius: '24px 24px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column',
            animation: 'ep-fade-in 0.25s ease',
          }} onClick={e => e.stopPropagation()}>
            {/* Sheet handle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 0 4px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 4, background: T.border }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 16px' }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#8fc441' }}>Select Sound</span>
              <button className="ep-btn" onClick={() => setShowSoundSheet(false)}
                style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} color={'#8fc441'} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', padding: '0 20px 32px', flex: 1 }}>
              {/* Upload custom */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0',
                borderBottom: `1px solid ${T.border}`,
                cursor: isRecording ? 'not-allowed' : 'pointer',
                opacity: isRecording ? 0.5 : 1,
                pointerEvents: isRecording ? 'none' : 'auto',
              }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(218,155,42,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Upload size={20} color={T.pri} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#8fc441' }}>Upload your own</div>
                  <div style={{ fontSize: 12, color: T.sub }}>MP3, AAC, WAV</div>
                </div>
                <input ref={audioFileInputRef} type="file" accept="audio/*"
                  onChange={handleCustomAudio} style={{ display: 'none' }} disabled={isRecording} />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ── SUCCESS OVERLAY ──────────────────────────────────────────────────── */}
      {showSuccess && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 20, animation: 'ep-fade-in 0.3s ease',
        }}>
          <div style={{
            width: 96, height: 96, borderRadius: '50%',
            background: 'linear-gradient(135deg, #10B981, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'ep-success 0.4s cubic-bezier(0.175,0.885,0.32,1.275)',
          }}>
            <Check size={48} color={T.white} strokeWidth={3} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.white }}>{isVideoFile ? 'Video is Live! 🎉' : 'Photo is Live! 🎉'}</div>
          <div style={{ fontSize: 15, color: T.sub }}>Your post has been uploaded</div>
        </div>
      )}

      {/* ── INSUFFICIENT COINS MODAL ──────────────────────────────────────────── */}
      {showInsufficientCoins && (
        <div
          onClick={(e) => {
            // Prevent closing when clicking outside the modal content
            e.stopPropagation();
          }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 20, animation: 'ep-fade-in 0.3s ease',
          }}>
          <div style={{
            width: 96, height: 96, borderRadius: '50%',
            background: 'linear-gradient(135deg, #EF4444, #DC2626)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Coins size={48} color={T.white} strokeWidth={3} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.white }}>Insufficient Coins</div>
          <div style={{ fontSize: 15, color: T.sub, textAlign: 'center', maxWidth: 300, padding: '0 20px' }}>
            You need {postCost} coins to create a post. Purchase coins to continue.
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
            <button
              onClick={() => setShowInsufficientCoins(false)}
              style={{
                padding: '12px 24px', borderRadius: 24, fontSize: 14, fontWeight: 700,
                background: 'rgba(255,255,255,0.1)', color: T.white, border: 'none', cursor: 'pointer',
              }}
            >
              OK
            </button>
            <button
              onClick={() => {
                console.log('[INSUFFICIENT_COINS] Purchase button clicked', { onShowCoinPurchase: !!onShowCoinPurchase });
                setShowInsufficientCoins(false);
                // Show coin purchase modal
                if (onShowCoinPurchase) {
                  onShowCoinPurchase();
                } else {
                  console.error('[INSUFFICIENT_COINS] onShowCoinPurchase not available');
                  // Fallback: navigate to profile
                  onNavProfile?.();
                }
              }}
              style={{
                padding: '12px 24px', borderRadius: 24, fontSize: 14, fontWeight: 700,
                background: T.pri, color: T.white, border: 'none', cursor: 'pointer',
              }}
            >
              Purchase Coins
            </button>
          </div>
        </div>
      )}

      {/* ── EXTENDED RECORDING INSUFFICIENT COINS MODAL ──────────────────────────── */}
      {showExtendedInsufficientModal && (
        <div
          onClick={(e) => {
            e.stopPropagation();
          }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 20, animation: 'ep-fade-in 0.3s ease',
          }}>
          <div style={{
            width: 96, height: 96, borderRadius: '50%',
            background: 'linear-gradient(135deg, #F59E0B, #D97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Coins size={48} color={T.white} strokeWidth={3} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.white }}>Extended Recording</div>
          <div style={{ fontSize: 15, color: T.sub, textAlign: 'center', maxWidth: 300, padding: '0 20px' }}>
            You need {EXTENDED_RECORDING_COST} coins to record beyond {FREE_LIMIT} seconds. Your current balance: {coinBalance} coins.
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
            <button
              onClick={() => {
                setShowExtendedInsufficientModal(false);
                // Stop recording since user cancelled
                stopRecording();
                setRecTime(0);
                setRecProgress(0);
              }}
              style={{
                padding: '12px 24px', borderRadius: 24, fontSize: 14, fontWeight: 700,
                background: 'rgba(255,255,255,0.1)', color: T.white, border: 'none', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                // Open coin purchase but keep this modal open for polling to detect balance change
                if (onShowCoinPurchase) {
                  onShowCoinPurchase();
                } else {
                  onNavProfile?.();
                }
              }}
              style={{
                padding: '12px 24px', borderRadius: 24, fontSize: 14, fontWeight: 700,
                background: T.pri, color: T.white, border: 'none', cursor: 'pointer',
              }}
            >
              Purchase Coins
            </button>
          </div>
        </div>
      )}

      {/* ── ERROR MODAL ─────────────────────────────────────────────────────── */}
      {/* Subscription required.
          Rendered over the post page rather than replacing it: the component
          stays mounted, so the video, caption, hashtags, overlays and chosen
          filter are all still there when the user dismisses it. */}
      {showSubscriptionModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ep-sub-title"
          onClick={(e) => { if (e.target === e.currentTarget && !savingDraftForSub) { setSubDraftError(''); setShowSubscriptionModal(false); } }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, animation: 'ep-fade-in 0.25s ease',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 380, boxSizing: 'border-box',
              background: T.card || '#1A1A1A',
              border: `1px solid ${T.border || '#262626'}`,
              borderRadius: 20, padding: '26px 22px 22px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
              boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{
              width: 62, height: 62, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #8fc441, #6ba835)',
              display: 'grid', placeItems: 'center',
            }}>
              <Crown size={30} color="#0B1207" strokeWidth={2.5} />
            </div>

            <div id="ep-sub-title" style={{
              fontSize: 19, fontWeight: 800, color: T.white || '#fff', textAlign: 'center',
            }}>
              Subscription Required
            </div>

            <div style={{
              fontSize: 14.5, lineHeight: 1.5, color: T.sub || '#8A8A8A',
              textAlign: 'center', maxWidth: 300,
            }}>
              Your subscription is not active. Activate it to post
              {isVideoFile ? ' this video' : ' this post'} — your
              {isVideoFile ? ' recording' : ' photo'} and caption are saved.
            </div>

            {subDraftError && (
              <div role="alert" style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.35)',
                borderRadius: 12, padding: '10px 12px',
                fontSize: 13.5, lineHeight: 1.45, color: '#FCA5A5', textAlign: 'center',
              }}>
                {subDraftError}
              </div>
            )}

            <button
              type="button"
              disabled={savingDraftForSub}
              onClick={async () => {
                // Navigating unmounts this page, and the selected file lives
                // only in memory. Save the draft through the existing /drafts/
                // endpoint first so the video survives the round trip, then go.
                setSavingDraftForSub(true);
                setSubDraftError('');
                let saved = false;
                try {
                  saved = await saveDraft({ silent: true });
                } catch (err) {
                  console.error('[POST] Could not save draft before subscribing:', err);
                }
                setSavingDraftForSub(false);

                if (!saved) {
                  // Stay put. Leaving now would take the video with it.
                  setSubDraftError(
                    "We couldn't save your video as a draft, so we've kept you here. " +
                    'Check your connection and try again.'
                  );
                  return;
                }
                setShowSubscriptionModal(false);
                onShowSubscription?.();
              }}
              style={{
                width: '100%', minHeight: 50, marginTop: 4,
                background: savingDraftForSub ? 'rgba(143,196,65,0.5)' : '#8fc441',
                color: '#0B1207', border: 'none', borderRadius: 14,
                fontSize: 15.5, fontWeight: 800,
                cursor: savingDraftForSub ? 'wait' : 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {savingDraftForSub ? 'Saving your video…' : 'Activate Subscription'}
            </button>

            <button
              type="button"
              disabled={savingDraftForSub}
              onClick={() => { setSubDraftError(''); setShowSubscriptionModal(false); }}
              style={{
                width: '100%', minHeight: 46,
                background: 'transparent', color: T.white || '#fff',
                border: 'none', borderRadius: 14,
                fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Continue Editing
            </button>
          </div>
        </div>
      )}

      {showErrorModal && (
        <div 
          onClick={(e) => {
            e.stopPropagation();
          }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 20, animation: 'ep-fade-in 0.3s ease',
          }}>
          <div style={{
            width: 96, height: 96, borderRadius: '50%',
            background: 'linear-gradient(135deg, #F59E0B, #D97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertCircle size={48} color={T.white} strokeWidth={3} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.white }}>Upload Error</div>
          <div style={{ fontSize: 15, color: T.sub, textAlign: 'center', maxWidth: 300, padding: '0 20px' }}>
            {errorMessage}
          </div>
          <button
            onClick={() => setShowErrorModal(false)}
            style={{
              padding: '12px 24px', borderRadius: 24, fontSize: 14, fontWeight: 700,
              background: T.pri, color: T.white, border: 'none', cursor: 'pointer',
            }}
          >
            OK
          </button>
        </div>
      )}

      {/* ── PREVIEW MODAL — exact ReelLayout feed card UI ─────────────────── */}
      {showPreview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: '#000' }}>
          {/* Full-screen card — same dimensions as ReelLayout mobile card */}
          <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden' }}>

            {/* 1 ── Background media (contain to show full video without zoom) */}
            {preview && (isVideoFile
              ? <video ref={previewVideoRef} src={preview}
                  autoPlay loop playsInline
                  controls
                  muted={previewMuted}
                  preload="auto"
                  onLoadedMetadata={(e) => {
                    const v = e.target;
                    logToBackend(`preview video loaded w=${v.videoWidth} h=${v.videoHeight} dur=${v.duration}`, 'info', 'drafts');
                    // FIX: MediaRecorder-produced WebMs have duration=Infinity because the
                    // header is written before the final cluster. Many players (including
                    // Chromium) refuse to seek/play these properly. The seek-to-end hack
                    // forces the browser to scan the whole file and recompute duration.
                    if (!isFinite(v.duration) || v.duration === 0) {
                      logToBackend('preview video has Infinity duration, applying seek hack', 'warn', 'drafts');
                      const onTimeUpdate = () => {
                        v.removeEventListener('timeupdate', onTimeUpdate);
                        v.currentTime = 0;
                        logToBackend(`seek hack done, new duration=${v.duration}`, 'info', 'drafts');
                        v.play().catch((err) => {
                          logToBackend(`preview play after seek-fix failed: ${err.name} - ${err.message}`, 'warn', 'drafts');
                        });
                      };
                      v.addEventListener('timeupdate', onTimeUpdate);
                      try {
                        v.currentTime = 1e101; // huge value → browser scans file → fires timeupdate at real end
                      } catch (_) {}
                    } else {
                      v.play().catch((err) => {
                        logToBackend(`preview video play() failed: ${err.name} - ${err.message}`, 'warn', 'drafts');
                      });
                    }
                  }}
                  onError={(e) => {
                    const code = e.target.error?.code;
                    const msg = e.target.error?.message;
                    logToBackend(`preview video ERROR code=${code} msg=${msg} src=${preview}`, 'error', 'drafts');
                  }}
                  onClick={(e) => { if (e.target.paused) e.target.play().catch(() => {}); }}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: 'block' }} />
              : <img src={preview} alt=""
                  onError={() => logToBackend(`preview img ERROR src=${preview}`, 'error', 'drafts')}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: 'block' }} />
            )}
            {!preview && (
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#1a1a1a,#2a2a2a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 48 }}>🎬</span>
              </div>
            )}

            {/* 2 ── Text overlays */}
            {textOverlays.map(ov => (
              <div key={ov.id} style={{ position: 'absolute', left: `${ov.x}%`, top: `${ov.y}%`, transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 5 }}>
                <span style={{ ...overlayCSS(ov), cursor: 'default' }}>{ov.text}</span>
              </div>
            ))}

            {/* 3 ── Bottom gradient + creator info (left side, same as feed) */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 72,
              background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 55%, transparent 100%)',
              padding: '80px 16px 28px', zIndex: 10, pointerEvents: 'none',
            }}>
              {/* Creator row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: T.pri, border: '2px solid rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                  {user?.profile_photo
                    ? <img src={user.profile_photo.startsWith('http') ? user.profile_photo : `${config.API_BASE_URL.replace('/api', '')}${user.profile_photo}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 20 }}>👤</span>}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>{user?.username || 'you'}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>@{user?.username || 'you'}</div>
                </div>
                <div style={{ marginLeft: 'auto', background: T.pri, borderRadius: 20, color: '#fff', padding: '6px 16px', fontSize: 13, fontWeight: 700, border: '1.5px solid rgba(255,255,255,0.25)' }}>Follow</div>
              </div>
              {/* Caption */}
              <div style={{ fontSize: 14, color: '#fff', lineHeight: 1.5, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
                {caption || <span style={{ color: 'rgba(255,255,255,0.45)' }}>Your caption will appear here…</span>}
              </div>
              {/* Background sound */}
              {backgroundSound && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <Music size={13} color="rgba(255,255,255,0.85)" />
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{backgroundSound.name}</span>
                </div>
              )}
            </div>

            {/* 4 ── Right action sidebar — exact same layout as ReelLayout */}
            <div style={{
              position: 'absolute', right: 12, bottom: 28,
              display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center',
              zIndex: 10,
            }}>
              {/* Like */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.9))' }}>
                  <Heart size={26} color="#fff" strokeWidth={2} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>0</span>
              </div>
              {/* Comment */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.9))' }}>
                  <MessageCircle size={26} color="#fff" fill="#fff" />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>0</span>
              </div>
              {/* Share */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.9))' }}>
                  <Share2 size={26} color="#fff" />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>0</span>
              </div>
              {/* Save */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.9))' }}>
                  <Bookmark size={26} color="#fff" />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>Save</span>
              </div>
              {/* Volume - clickable */}
              <button 
                onClick={() => setPreviewMuted(!previewMuted)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.9))' }}>
                  {previewMuted ? <VolumeX size={26} color="#fff" /> : <Volume2 size={26} color="#fff" />}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>{previewMuted ? 'Off' : 'On'}</span>
              </button>
            </div>

            {/* 5 ── Close button (top-right) */}
            <button className="ep-btn" onClick={() => setShowPreview(false)} style={{
              position: 'absolute', top: 'max(16px, env(safe-area-inset-top))', right: 16, zIndex: 20,
              background: 'rgba(0,0,0,0.55)', borderRadius: '50%', width: 42, height: 42,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)',
            }}>
              <X size={20} color="#fff" />
            </button>

            {/* 6 ── Preview badge (top-left) */}
            <div style={{
              position: 'absolute', top: 'max(20px, calc(env(safe-area-inset-top) + 4px))', left: 16, zIndex: 20,
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
              borderRadius: 20, padding: '6px 14px',
              fontSize: 12, color: T.pri, fontWeight: 800,
              border: '1px solid rgba(218,155,42,0.35)',
            }}>⚡ Preview</div>

          </div>
        </div>
      )}

      {/* ── DRAFTS SHEET ─────────────────────────────────────────────────────── */}
      {showDrafts && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 8500, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end' }}
          onClick={() => setShowDrafts(false)}>
          <div style={{ width: '100%', background: T.card, borderRadius: '24px 24px 0 0', padding: '20px 20px 40px', maxHeight: '80vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: T.white }}>Drafts ({drafts.length})</span>
              <button className="ep-btn" onClick={() => setShowDrafts(false)}
                style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} color={T.white} />
              </button>
            </div>
            {drafts.length === 0 && <div style={{ textAlign: 'center', color: T.sub, padding: '32px 0' }}>No drafts saved yet</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {drafts.map(d => (
                <div key={d.id} style={{ display: 'flex', gap: 14, alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: '12px 14px' }}>
                  {/* Thumb */}
                  <div style={{ width: 56, height: 76, borderRadius: 10, overflow: 'hidden', background: T.bg, flexShrink: 0, position: 'relative' }}>
                    {d.image
                      ? <img src={d.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : d.media
                      ? <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🎬</div>
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🖼️</div>
                    }
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.caption || '(no caption)'}
                    </div>
                    <div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>
                      {d.media ? 'Video' : 'Photo'} · {new Date(d.created_at).toLocaleDateString()}
                    </div>
                    {d.overlay_text && <div style={{ fontSize: 11, color: T.pri, marginTop: 2 }}>{JSON.parse(d.overlay_text).length} text overlay{JSON.parse(d.overlay_text).length > 1 ? 's' : ''}</div>}
                  </div>
                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button className="ep-btn" onClick={() => loadDraft(d)}
                      style={{ background: T.pri, borderRadius: 10, padding: '6px 14px', fontSize: 13, fontWeight: 700, color: '#000' }}>
                      Resume
                    </button>
                    <button className="ep-btn" onClick={() => deleteDraft(d.id)}
                      style={{ background: 'rgba(239,68,68,0.2)', borderRadius: 10, padding: '6px 14px', fontSize: 13, fontWeight: 700, color: '#EF4444' }}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST ──────────────────────────────────────────────────────────── */}
      {successMsg && (
        <div style={{ position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)', zIndex: 99999,
          background: 'rgba(30,30,30,0.95)', borderRadius: 24, padding: '10px 22px',
          color: T.white, fontSize: 14, fontWeight: 700, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(12px)', animation: 'ep-fade-in 0.2s ease' }}>
          {successMsg}
        </div>
      )}

      {/* Hidden audio player */}
      <audio ref={audioRef} onEnded={() => setIsPlayingSound(false)} style={{ display: 'none' }} />
    </div>
  );
}




