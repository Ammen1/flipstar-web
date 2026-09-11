// ─── Reel-grade Create Page ──────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback, useMemo, useReducer } from 'react';
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
import { VIDEO_FILTERS, getFilter, isNeutralFilter, resolveFilterId } from '../../components/camera/filters/registry';
import { availableFilters, createFilterRenderer } from '../../components/camera/filters/createRenderer';
import { filterReducer, initialFilterState } from '../../components/camera/filters/selection';
import { FilterThumbnailer } from '../../components/camera/filters/thumbnails';
import { startFrameLoop } from '../../components/camera/frameLoop';
import { rasterizeOverlays } from '../../components/camera/overlayRaster';
import { cameraPermissionState, openCamera, openVideoTrack, setTorch, torchAvailable } from '../../components/camera/cameraSession';
import { CAMERA_ERROR, MIC_NOTICE, RECORDING_ERROR, cameraErrorCopy, classifyCameraError } from '../../components/camera/cameraErrors';
import { extensionFor, pickMimeType, recorderOptions, recordingSupport } from '../../components/camera/recorder';
import { ActiveFilterChip, FilterTray } from '../../components/camera/FilterTray';
import { RecordingReview } from '../../components/camera/RecordingReview';
import { CameraErrorPanel } from '../../components/camera/CameraErrorPanel';
import { friendlyUploadError } from '../../utils/uploadErrors';
import { forgetUploadId, newUploadId, uploadIdFor } from '../../utils/uploadId';
import { mediaStatus } from '../../utils/media';

// Text colour that stays readable on the theme's accent. The accent is chosen
// in the admin panel, so it can be a light green or a near-black; dark text on
// the first, white on the second.
function readableOn(hex) {
  const h = String(hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return '#FFFFFF';
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0B0F07' : '#FFFFFF';
}
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
export function EnhancedPostPage({ user, onBack, onPostSuccess, onNavHome, onNavReels, onNavMessages, onNavProfile, unreadDmCount = 0, onShowCoinPurchase, onRequireAuth, subscriptionStatus, onShowSubscription }) {
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
  const [canTorch, setCanTorch] = useState(false);
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [recTime, setRecTime] = useState(0);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState(null); // copy from cameraErrorCopy()
  const [micState, setMicState] = useState('on');       // 'on' | 'denied' | 'unavailable'
  const [micNoticeDismissed, setMicNoticeDismissed] = useState(false);
  const [recProgress, setRecProgress] = useState(0);
  // Filters: the registry lists them, the reducer owns which one is chosen
  // and which ones this device's renderer can actually draw.
  const [filterState, dispatchFilter] = useReducer(filterReducer, initialFilterState);
  const selectedFilter = filterState.filterId;
  const [showFilters, setShowFilters] = useState(false);
  const [filterThumbs, setFilterThumbs] = useState({});
  const [filterToast, setFilterToast] = useState('');
  const [rendererKind, setRendererKind] = useState(null);
  const [recordCaps, setRecordCaps] = useState({ canRecord: true, canRecordFiltered: true });
  // Width / height of the rendered frame, and the preview box that fits it.
  // Text stickers are positioned in % of that box, so they land on the same
  // pixels in the preview and in the recording.
  const [frameAspect, setFrameAspect] = useState(null);
  const [stageBox, setStageBox] = useState(null);
  // The filter baked into the current media (null for gallery uploads).
  const [recordedFilterId, setRecordedFilterId] = useState(null);
  // The take on the review screen: { url }.
  const [review, setReview] = useState(null);

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
  // Categories come from /categories/ rather than a hardcoded list: they are
  // admin-managed, and the backend now rejects ids it does not recognise, so a
  // stale constant here would surface as a 400 on publish.
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [categoriesError, setCategoriesError] = useState(false);
  // Separate from categories.length: a successful fetch returning zero rows
  // is not the same as 'still loading', and conflating them left the picker
  // showing a spinner forever on an empty table.
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  // Loaded once on mount. This used to live inside handlePost, so the list
  // was only fetched when the user pressed Post -- the picker sat on
  // 'Loading categories...' for the entire session.
  useEffect(() => {
    let cancelled = false;
    api
      .request('/categories/')
      .then((rows) => {
        if (cancelled) return;
        setCategories(Array.isArray(rows) ? rows : []);
        setCategoriesError(false);
      })
      .catch(() => {
        if (!cancelled) setCategoriesError(true);
      })
      .finally(() => {
        if (!cancelled) setCategoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  // True when the API accepted the post but is still encoding it: it reaches
  // feeds when that finishes, so "it's live" would not be true yet.
  const [postIsProcessing, setPostIsProcessing] = useState(false);
  const [showInsufficientCoins, setShowInsufficientCoins] = useState(false);
  const [postCost, setPostCost] = useState(0);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  // Empty keeps the modal's historical "Upload Error" heading; camera and
  // recording problems set their own so they are not mislabelled as uploads.
  const [errorTitle, setErrorTitle] = useState('');

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
  // One id per post being published, kept across retries of that post (see
  // utils/uploadId.js). Cleared when the media changes: that is a new post.
  const uploadIdRef = useRef(null);
  useEffect(() => { uploadIdRef.current = null; }, [selectedFile, preview]);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);        // filter renderer bound to canvasRef (WebGL, or 2D fallback)
  const stopFrameLoopRef = useRef(null);   // stops the per-camera-frame render
  const overlayCanvasRef = useRef(null);   // text stickers, rasterised once per change
  const thumbnailerRef = useRef(null);
  const facingModeRef = useRef('user');    // read by the async camera code, which must not see a stale render's value
  const switchingRef = useRef(false);
  const hasExtendedRef = useRef(false);
  const discardTakeRef = useRef(false);    // set when the camera is closed mid-recording: drop the take
  const stageRef = useRef(null);
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

  // ── Load drafts on mount ─────────────────────────────────────────────────
  useEffect(() => {
    loadDrafts();
  }, []);

  // ── Filter rendering ─────────────────────────────────────────────────────
  // The canvas is both the preview and what MediaRecorder captures, so the
  // filter on screen is the filter in the file. Per camera frame the renderer
  // uploads the frame and runs one GPU pass; text stickers are a texture that
  // only changes when the stickers do.

  // Re-rasterise the stickers at the frame's size and hand them over.
  const syncOverlay = useCallback(() => {
    const renderer = rendererRef.current;
    const cvs = canvasRef.current;
    if (!renderer || !cvs) return;
    const overlay = rasterizeOverlays(liveRef.current.overlays, cvs.width, cvs.height, overlayCanvasRef.current);
    if (overlay) overlayCanvasRef.current = overlay;
    renderer.setOverlay(overlay);
  }, []);

  useEffect(() => {
    liveRef.current.filter = selectedFilter;
    if (rendererRef.current) rendererRef.current.setFilter(getFilter(selectedFilter));
  }, [selectedFilter]);

  useEffect(() => {
    liveRef.current.overlays = textOverlays;
    syncOverlay();
  }, [textOverlays, syncOverlay]);

  // Kept in a ref so the renderer's context-loss hook always reaches the
  // current stopRecording rather than the one from the render that made it.
  const onContextLostRef = useRef(() => {});

  const ensureRenderer = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return null;
    if (rendererRef.current && rendererRef.current.canvas === cvs) return rendererRef.current;
    if (rendererRef.current) rendererRef.current.destroy();
    const renderer = createFilterRenderer(cvs, {
      hooks: {
        onResize: (w, h) => {
          setFrameAspect(w / h);
          syncOverlay();
        },
        onContextLost: () => onContextLostRef.current(),
      },
    });
    renderer.setFilter(getFilter(liveRef.current.filter));
    rendererRef.current = renderer;
    setRendererKind(renderer.kind);
    setRecordCaps(recordingSupport(cvs));
    dispatchFilter({ type: 'available', ids: availableFilters(renderer, VIDEO_FILTERS).map((f) => f.id) });
    logToBackend(`filter renderer=${renderer.kind}`, 'info', 'camera');
    syncOverlay();
    return renderer;
  }, [syncOverlay]);

  const stopDrawLoop = useCallback(() => {
    if (stopFrameLoopRef.current) {
      stopFrameLoopRef.current();
      stopFrameLoopRef.current = null;
    }
  }, []);

  const startDrawLoop = useCallback(() => {
    stopDrawLoop();
    const renderer = ensureRenderer();
    const vid = videoRef.current;
    if (!renderer || !vid) return;
    stopFrameLoopRef.current = startFrameLoop(vid, () => renderer.render(vid));
  }, [ensureRenderer, stopDrawLoop]);

  const destroyRenderer = useCallback(() => {
    stopDrawLoop();
    if (rendererRef.current) {
      rendererRef.current.destroy();
      rendererRef.current = null;
    }
  }, [stopDrawLoop]);

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

  // ── Notices ─────────────────────────────────────────────────────────────
  const noticeTimerRef = useRef(null);
  // A short, non-blocking message in the toast (flash unavailable, switch
  // failed): things worth saying that should not stop the person recording.
  const showNotice = useCallback((message) => {
    setSuccessMsg(message);
    clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setSuccessMsg(''), 2600);
  }, []);

  // A blocking message in the error modal, under a heading that fits.
  const showProblem = useCallback((message, title = 'Recording problem') => {
    setErrorTitle(title);
    setErrorMessage(message);
    setShowErrorModal(true);
  }, []);

  // Assigned below, once stopRecording exists; the camera callbacks call
  // through this so they never hold a stale copy.
  const stopRecordingRef = useRef(() => {});

  // ── Camera start/stop ───────────────────────────────────────────────────
  // Point the hidden <video> at `stream` and wait until it knows its size.
  const attachStream = useCallback(async (stream) => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    videoEl.srcObject = stream;
    await new Promise((resolve) => {
      if (videoEl.readyState >= 1 && videoEl.videoWidth && videoEl.videoHeight) {
        resolve();
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
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
    } catch (playError) {
      logToBackend(`camera preview play() failed: ${playError && playError.name}`, 'warn', 'camera');
    }
  }, []);

  // Torch support belongs to the track, so it changes with every camera.
  // Some Android builds only report it once frames are flowing: ask twice.
  const refreshTorch = useCallback((stream) => {
    const track = stream && stream.getVideoTracks()[0];
    setFlashOn(false);
    setCanTorch(torchAvailable(track));
    setTimeout(() => {
      if (streamRef.current === stream) setCanTorch(torchAvailable(track));
    }, 800);
  }, []);

  const startCamera = useCallback(async () => {
    const gen = ++cameraGenRef.current;  // capture generation token
    setCameraLoading(true);
    setCameraError(null);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    logToBackend(`Starting camera, facingMode=${facingModeRef.current}`, 'info', 'camera');
    try {
      // openCamera asks once for camera + microphone and only narrows the
      // request when that fails -- a refused camera is never asked again.
      const { stream, audio } = await openCamera({
        facingMode: facingModeRef.current,
        log: (message) => logToBackend(`camera ${message}`, 'warn', 'camera'),
      });
      // stopCamera ran while the browser was asking: this stream is unwanted.
      if (gen !== cameraGenRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      streamRef.current = stream;
      setMicState(audio);
      if (audio !== 'on') logToBackend(`camera started without microphone: ${audio}`, 'warn', 'camera');
      await attachStream(stream);
      if (gen !== cameraGenRef.current) return;
      refreshTorch(stream);
      startDrawLoop();
    } catch (e) {
      if (gen !== cameraGenRef.current) return;
      const kind = classifyCameraError(e);
      const cause = (e && e.cause) || e;
      // The exception is for us; the person gets cameraErrorCopy's wording.
      logToBackend(`camera failed kind=${kind} name=${cause && cause.name} msg=${cause && cause.message}`, 'error', 'camera');
      const permissionState = kind === CAMERA_ERROR.PERMISSION_DENIED ? await cameraPermissionState() : undefined;
      if (gen !== cameraGenRef.current) return;
      setCameraError(cameraErrorCopy(kind, { permissionState }));
    } finally {
      if (gen === cameraGenRef.current) setCameraLoading(false);
    }
  }, [attachStream, refreshTorch, startDrawLoop]);

  const stopCamera = useCallback(() => {
    cameraGenRef.current++;              // invalidate any in-flight startCamera
    destroyRenderer();
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) { videoRef.current.srcObject = null; }
    clearInterval(timerRef.current);
    setCameraLoading(false);
    setFlashOn(false);
  }, [destroyRenderer]);

  // Front <-> back by swapping only the video track. The microphone track
  // stays, and the recorder records the canvas rather than the camera, so a
  // recording in progress carries on across the switch -- the preview holds
  // its last frame for the moment the other camera takes to open.
  const switchCamera = useCallback(async () => {
    if (switchingRef.current) return;
    const current = streamRef.current;
    const next = facingModeRef.current === 'user' ? 'environment' : 'user';
    if (!current) {
      facingModeRef.current = next;
      setFacingMode(next);
      startCamera();
      return;
    }
    switchingRef.current = true;
    setSwitchingCamera(true);
    const gen = cameraGenRef.current;
    const audioTracks = current.getAudioTracks();
    // Many phones cannot open a second camera while the first is running.
    current.getVideoTracks().forEach(t => t.stop());
    try {
      let track;
      let switched = true;
      try {
        track = await openVideoTrack({ facingMode: next });
      } catch (e) {
        logToBackend(`camera switch to ${next} failed: ${e && e.kind}`, 'warn', 'camera');
        switched = false;
        // Put the previous camera back rather than leave a frozen frame.
        track = await openVideoTrack({ facingMode: facingModeRef.current });
      }
      if (gen !== cameraGenRef.current) {
        track.stop();
        return;
      }
      const stream = new MediaStream([track, ...audioTracks]);
      streamRef.current = stream;
      await attachStream(stream);
      if (switched) {
        facingModeRef.current = next;
        setFacingMode(next);
      } else {
        showNotice(RECORDING_ERROR.SWITCH_FAILED);
      }
      refreshTorch(stream);
    } catch (e) {
      // Neither camera came back.
      if (gen !== cameraGenRef.current) return;
      logToBackend(`camera lost during switch: ${e && e.kind}`, 'error', 'camera');
      if (isRecordingRef.current) stopRecordingRef.current({ force: true });
      setCameraError(cameraErrorCopy(classifyCameraError(e)));
    } finally {
      switchingRef.current = false;
      setSwitchingCamera(false);
    }
  }, [attachStream, refreshTorch, showNotice, startCamera]);

  const flipCamera = useCallback((event) => {
    event?.preventDefault?.();
    const now = Date.now();
    if (now - lastFlipAtRef.current < 350) return;
    lastFlipAtRef.current = now;
    switchCamera();
  }, [switchCamera]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current && streamRef.current.getVideoTracks()[0];
    if (!track || !canTorch) return;
    const next = !flashOn;
    try {
      await setTorch(track, next);
      setFlashOn(next);
    } catch (e) {
      logToBackend(`torch failed: ${e && e.name}`, 'warn', 'camera');
      setCanTorch(false);
      setFlashOn(false);
      showNotice(RECORDING_ERROR.FLASH_FAILED);
    }
  }, [canTorch, flashOn, showNotice]);

  // Start the camera on entering camera mode, stop it on leaving. Switching
  // front/back is no longer a restart -- see switchCamera.
  useEffect(() => {
    if (captureMode === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    // No cleanup function - it causes the camera to stop immediately after starting
    // Camera will be stopped by the other useEffect on unmount or stage change
  }, [captureMode]); // eslint-disable-line

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
      clearTimeout(noticeTimerRef.current);
      if (thumbnailerRef.current) {
        thumbnailerRef.current.destroy();
        thumbnailerRef.current = null;
      }
    };
  }, []); // eslint-disable-line

  // ── Preview box ─────────────────────────────────────────────────────────
  // The largest box of the frame's aspect that fits the camera area, so the
  // canvas is shown without distortion and stickers, positioned in % of this
  // box, sit on the same pixels the recording will have.
  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el || !frameAspect || captureMode !== 'camera' || stage !== 'capture') {
      setStageBox(null);
      return undefined;
    }
    const fit = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (!cw || !ch) return;
      const w = Math.min(cw, ch * frameAspect);
      setStageBox({ width: Math.round(w), height: Math.round(w / frameAspect) });
    };
    fit();
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(fit);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [frameAspect, captureMode, stage]);

  // ── Filter tray ─────────────────────────────────────────────────────────
  const trayFilters = useMemo(
    () => (filterState.available ? VIDEO_FILTERS.filter((f) => filterState.available.includes(f.id)) : VIDEO_FILTERS),
    [filterState.available]
  );

  // Live thumbnails while the tray is open: a small render per filter every
  // 1.5s, nothing at all while it is closed.
  useEffect(() => {
    if (!showFilters || captureMode !== 'camera' || stage !== 'capture') return undefined;
    let cancelled = false;
    const refresh = () => {
      const vid = videoRef.current;
      if (cancelled || !vid || vid.readyState < 2) return;
      try {
        if (!thumbnailerRef.current) thumbnailerRef.current = new FilterThumbnailer();
        setFilterThumbs(thumbnailerRef.current.render(vid, trayFilters));
      } catch (e) {
        // Thumbnails are a nicety: without them the tray shows swatches.
        logToBackend(`filter thumbnails failed: ${e && e.message}`, 'warn', 'camera');
      }
    };
    const first = setTimeout(refresh, 250);
    const every = setInterval(refresh, 1500);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(every);
    };
  }, [showFilters, captureMode, stage, trayFilters]);

  const toastTimerRef = useRef(null);
  const chooseFilter = useCallback((id) => {
    dispatchFilter({ type: 'select', id });
    const name = getFilter(id).name;
    setFilterToast(name);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setFilterToast(''), 900);
  }, []);

  // Filters are baked into the canvas the recorder captures; where the canvas
  // cannot be captured, a filter would show in the preview and be missing
  // from the video. Say so instead of letting that happen.
  const trayNotice = (() => {
    if (trayFilters.length <= 1) return "Filters aren't supported in this browser.";
    if (camMode === 'video' && !recordCaps.canRecordFiltered) {
      return "This browser can't record filters. They still apply to photos.";
    }
    if (rendererKind === 'canvas2d') return 'Some filters need a newer browser and are hidden.';
    return '';
  })();

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
      showProblem('Camera not ready. Please wait a moment and try again.');
      return;
    }
    const support = recordingSupport(canvasRef.current);
    if (!support.canRecord) {
      logToBackend('MediaRecorder unavailable', 'error');
      showProblem(RECORDING_ERROR.UNSUPPORTED);
      return;
    }
    // What the canvas adds on top of the raw camera. With nothing to add the
    // raw camera is an identical recording, so it is an acceptable fallback;
    // with a filter or text it is not -- that would be the preview showing
    // something the video does not have.
    const needsCanvas = !isNeutralFilter(getFilter(liveRef.current.filter)) || textOverlays.length > 0;

    // ── Step 1: canvas video track ───────────────────────────────────────
    let videoTrack = null;
    try {
      const cvs = canvasRef.current;
      if (support.canRecordFiltered) {
        videoTrack = cvs.captureStream(30).getVideoTracks()[0] || null;
      }
    } catch (e) {
      logToBackend(`canvas captureStream failed: ${e && e.name}`, 'warn');
    }
    if (!videoTrack && needsCanvas) {
      showProblem(RECORDING_ERROR.FILTERS_UNSUPPORTED);
      return;
    }

    console.log('[RECORDING] Starting recording, setting lock');
    isRecordingRef.current = true;   // set lock NOW — before awaits
    recordingStartRef.current = Date.now();
    discardTakeRef.current = false;
    setUserPaused(false);

    // Kill any stale timer / audio from a previous session
    clearInterval(timerRef.current);
    _cleanupAudio('startRecording-pre');
    chunksRef.current = [];
    setRecTime(0);
    setRecProgress(0);
    console.log('[RECORDING] Cleanup complete, setting recording state');

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
    // The filtered canvas when there is one; otherwise the raw camera, which
    // is only reachable when nothing needed baking (see needsCanvas above).
    const cameraVideo = videoTrack ? [videoTrack] : streamRef.current.getVideoTracks();
    const recordStream = new MediaStream([...cameraVideo, ...audioTracks]);

    // ── Step 4: container and bitrate ────────────────────────────────────
    const cvs = canvasRef.current;
    const mimeType = pickMimeType();
    const options = recorderOptions({
      mimeType,
      width: (cvs && cvs.width) || 480,
      height: (cvs && cvs.height) || 640,
    });
    const attempts = [
      () => new MediaRecorder(recordStream, options),
      // Some engines reject the bitrate hints: the container alone.
      () => new MediaRecorder(recordStream, mimeType ? { mimeType } : {}),
    ];
    if (!needsCanvas && videoTrack) {
      // Nothing to bake, so the raw camera records the same picture.
      attempts.push(() => new MediaRecorder(
        new MediaStream([...streamRef.current.getVideoTracks(), ...audioTracks]),
        mimeType ? { mimeType } : {}
      ));
    }
    let mr = null;
    for (const attempt of attempts) {
      try {
        mr = attempt();
        break;
      } catch (e) {
        logToBackend(`MediaRecorder construct failed: ${e && e.name} - ${e && e.message}`, 'warn');
      }
    }
    if (!mr) {
      _cleanupAudio('mr-construct-failed');
      isRecordingRef.current = false;
      showProblem(RECORDING_ERROR.UNSUPPORTED);
      return;
    }

    const actualMime = mr.mimeType || mimeType || 'video/webm';
    const ext = extensionFor(actualMime);

    // ── Step 5: wire events ──────────────────────────────────────────────
    mr.ondataavailable = e => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onpause = () => {
      console.warn('[RECORDER] MediaRecorder PAUSED');
      logToBackend('MediaRecorder PAUSED', 'warn');
    };
    mr.onresume = () => {
      console.log('[RECORDER] MediaRecorder RESUMED');
      logToBackend('MediaRecorder RESUMED');
    };
    mr.onstart = () => {
      console.log('[RECORDER] MediaRecorder STARTED');
      logToBackend(`MediaRecorder STARTED, mimeType=${actualMime} vbps=${options.videoBitsPerSecond} renderer=${rendererRef.current && rendererRef.current.kind}`);
    };

    mr.onstop = () => {
      console.log('[RECORDER] onstop triggered, chunks:', chunksRef.current.length);
      logToBackend(`MediaRecorder onstop chunks=${chunksRef.current.length}`, 'warn');
      const chunks = chunksRef.current;
      const endWithout = (message) => {
        isRecordingRef.current = false;
        setIsRecording(false);
        setUserPaused(false);
        if (message) showProblem(message);
      };
      // The camera was closed mid-recording: the person asked for this take to go.
      if (discardTakeRef.current) {
        discardTakeRef.current = false;
        chunksRef.current = [];
        endWithout(null);
        return;
      }
      if (!chunks.length) {
        console.log('[RECORDER] No chunks in recording');
        endWithout(RECORDING_ERROR.EMPTY);
        return;
      }
      const blob = new Blob(chunks, { type: actualMime });
      if (blob.size === 0) {
        console.log('[RECORDER] Blob is empty');
        endWithout(RECORDING_ERROR.EMPTY);
        return;
      }
      console.log('[RECORDER] Recording successful, blob size:', blob.size);
      // The filter in the pixels -- the one showing when recording ended.
      const bakedFilter = liveRef.current.filter;

      // Fix duration metadata for webm files by using a video element to force duration calculation
      const processBlob = async () => {
        if (ext === 'webm') {
          try {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.src = URL.createObjectURL(blob);

            await new Promise((resolve, reject) => {
              video.onloadedmetadata = () => {
                // Seek to end to force duration calculation. A WebM from
                // MediaRecorder reports Infinity, and assigning Infinity to
                // currentTime throws -- which left this waiting out the 2s
                // timeout below on every WebM take. 1e101 is finite.
                video.currentTime = isFinite(video.duration) && video.duration > 0 ? video.duration : 1e101;
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
        setRecordedFilterId(bakedFilter);
        // Review before anything else: the take plays back with Retake,
        // Change filter and Next. Next leads to the existing details page.
        setReview({ url });
        setShowFilters(false);
        setCaptureMode('upload');
        setStage('review');
        isRecordingRef.current = false;
        setIsRecording(false);
        setUserPaused(false);
      };

      processBlob();
    };

    mr.onerror = e => {
      console.error('[RECORDER] MediaRecorder error:', e.error?.name, e.error?.message);
      logToBackend(`MediaRecorder onerror: ${e.error?.name} - ${e.error?.message}`, 'error');
      _cleanupAudio('mr-onerror');
      isRecordingRef.current = false;
      setIsRecording(false);
      setUserPaused(false);
      if (rendererRef.current) rendererRef.current.setFixedSize(null);
      showProblem(RECORDING_ERROR.FAILED);
    };

    // ── Step 6: go ───────────────────────────────────────────────────────
    mediaRecorderRef.current = mr;
    mr.start(250);
    setIsRecording(true);
    console.log('[RECORDING] MediaRecorder started, mimeType:', actualMime);
    // Hold the frame size for the length of the take: the other camera may
    // deliver a different size, and not every encoder (MP4/H.264 in
    // particular) accepts a resolution change mid-stream.
    if (rendererRef.current && cvs) rendererRef.current.setFixedSize(cvs.width, cvs.height);

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

    startRecTimer();
  };

  useEffect(() => { hasExtendedRef.current = hasExtendedRecording; }, [hasExtendedRecording]);

  // One tick per recorded second: the clock, the progress ring, the coin
  // check at the free limit and the hard stop at MAX_REC. Outside
  // startRecording so resuming from a pause can restart it.
  const startRecTimer = () => {
    clearInterval(timerRef.current);
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
        if (next === FREE_LIMIT + 1 && !hasExtendedRef.current) {
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

  // `force` skips the ghost-click guard, for stops nobody tapped: the camera
  // closing, the preview's GPU context being lost.
  const stopRecording = ({ force = false } = {}) => {
    if (!isRecordingRef.current) return;
    // Ghost-click guard: ignore stop calls within 1s of start
    if (!force && Date.now() - recordingStartRef.current < 1000) return;

    logToBackend(`stopRecording called elapsedMs=${Date.now() - recordingStartRef.current} mrState=${mediaRecorderRef.current?.state} force=${force}`, 'warn');
    clearInterval(timerRef.current);
    _cleanupAudio('stopRecording'); // stop monitor + AudioContext immediately (no music after stop)

    // Reset extended recording state
    setHasExtendedRecording(false);
    setIsRecordingPaused(false);
    setUserPaused(false);

    const mr = mediaRecorderRef.current;
    // 'paused' as well: a stop during a pause -- the person's, or the coin
    // limit's Cancel -- must still finish the file. It used to fall through
    // to the else branch and leave the recorder paused with the take in it.
    if (mr && (mr.state === 'recording' || mr.state === 'paused')) {
      try { mr.requestData(); } catch (_) {}
      mr.stop(); // triggers onstop asynchronously
    } else {
      isRecordingRef.current = false;
      setIsRecording(false);
    }
    if (rendererRef.current) rendererRef.current.setFixedSize(null);
  };
  stopRecordingRef.current = stopRecording;

  // The preview's GPU context can be lost (driver reset, memory pressure). The
  // renderer asks the browser to restore it; a recording cannot wait, so it
  // ends with what it has.
  onContextLostRef.current = () => {
    logToBackend(`webgl context lost isRecording=${isRecordingRef.current}`, 'warn', 'camera');
    if (isRecordingRef.current) {
      stopRecording({ force: true });
      showNotice(RECORDING_ERROR.INTERRUPTED);
    }
  };

  const canPause = typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.prototype.pause === 'function';

  // The person's pause. The coin limit's pause is separate (isRecordingPaused
  // + resumeRecording) and this stays out of its way.
  const togglePause = () => {
    const mr = mediaRecorderRef.current;
    if (!mr || !isRecordingRef.current || isRecordingPaused) return;
    if (mr.state === 'recording') {
      try { mr.pause(); } catch (e) { logToBackend(`pause failed: ${e && e.name}`, 'warn'); return; }
      clearInterval(timerRef.current);
      // Music stops with the picture, or it would run ahead of the video.
      if (audioCtxRef.current && audioCtxRef.current.state === 'running') audioCtxRef.current.suspend().catch(() => {});
      if (monitorAudioRef.current) monitorAudioRef.current.pause();
      setUserPaused(true);
    } else if (mr.state === 'paused') {
      try { mr.resume(); } catch (e) { logToBackend(`resume failed: ${e && e.name}`, 'warn'); return; }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume().catch(() => {});
      if (monitorAudioRef.current) monitorAudioRef.current.play().catch(() => {});
      startRecTimer();
      setUserPaused(false);
    }
  };

  // Close the camera. Mid-recording that is a cancel, and the take is dropped.
  const closeCamera = () => {
    if (isRecordingRef.current) {
      discardTakeRef.current = true;
      stopRecording({ force: true });
    }
    setShowFilters(false);
    stopCamera();
    setCaptureMode('upload');
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

  // ── Review ──────────────────────────────────────────────────────────────
  const discardTake = () => {
    if (review && review.url) URL.revokeObjectURL(review.url);
    setReview(null);
    setSelectedFile(null);
    setPreview(null);
    setRecordedFilterId(null);
  };

  const retake = ({ openFilters = false } = {}) => {
    discardTake();
    setStage('capture');
    setCamMode('video');
    setCaptureMode('camera');
    setShowFilters(openFilters);
  };

  // ── Photo capture ───────────────────────────────────────────────────────
  const takePhoto = () => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    // Draw a fresh frame and read it in the same task: a WebGL canvas keeps
    // no pixels once they have been composited to the screen.
    const renderer = rendererRef.current;
    if (renderer && videoRef.current) renderer.render(videoRef.current);
    const bakedFilter = liveRef.current.filter;
    cvs.toBlob(blob => {
      if (!blob) {
        showProblem("Couldn't take the photo. Please try again.", 'Camera');
        return;
      }
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      setSelectedFile(file);
      setPreview(url);
      setIsPreviewThumbnail(false);
      setIsVideoFile(false);
      setRecordedFilterId(bakedFilter);
      setShowFilters(false);
      stopCamera();
      setCaptureMode('upload');
      setStage('details');
    }, 'image/jpeg', 0.92);
  };

  // ── File upload from device ─────────────────────────────────────────────
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // A gallery file has no filter baked in, whatever the camera was set to.
    setRecordedFilterId(null);

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

      // WebM files written by MediaRecorder (older Android Chrome, other web
      // apps) report Infinity until the whole file has been scanned, and
      // Infinity > PAID_LIMIT rejected every one of them as "too long".
      // Seeking far past the end makes the browser work the length out.
      video.onloadedmetadata = () => {
        if (isFinite(video.duration) && video.duration > 0) {
          checkDuration(video.duration);
          return;
        }
        let done = false;
        const settle = () => {
          if (done) return;
          done = true;
          video.removeEventListener('durationchange', onChange);
          // Still unknown after the scan: let it through, as a short clip
          // would be, rather than refuse a file we cannot measure.
          checkDuration(isFinite(video.duration) ? video.duration : 0);
        };
        const onChange = () => { if (isFinite(video.duration)) settle(); };
        video.addEventListener('durationchange', onChange);
        setTimeout(settle, 3000);
        try { video.currentTime = 1e101; } catch (_) { settle(); }
      };

      const checkDuration = (duration) => {
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
    // Stickers are positioned in % of the preview box (the frame), not of the
    // whole camera area, so drags are measured against the same box.
    const el = stageRef.current || previewContainerRef.current;
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
      // The filter already baked into the media -- a label for the draft,
      // not an instruction: nothing re-applies it.
      formData.append('filter', recordedFilterId || 'none');
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
    // Older drafts carry the previous camera's filter ids; resolveFilterId
    // maps them to the current names.
    setRecordedFilterId(resolveFilterId(draft.filter));
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
      // Optional. Omitted entirely when unset, so the post is created
      // uncategorised rather than with an empty string the API would reject.
      if (categoryId) fd.append('category', categoryId);
      if (customAudioFile) {
        fd.append('audio_file', customAudioFile);
        fd.append('audio_volume_level', addedVol);
        fd.append('original_volume_level', origVol);
      }
      if (textOverlays.length) {
        fd.append('overlay_text', JSON.stringify(textOverlays));
      }
      // Same id on every retry of this post, so a retry after a lost
      // response returns the post already made instead of a duplicate.
      // A form field rather than an Idempotency-Key header: no CORS
      // preflight change, and a server that predates it simply ignores it.
      // A gallery file keeps its id across a reload too (uploadIdFor).
      if (!uploadIdRef.current) {
        uploadIdRef.current = selectedFile ? uploadIdFor(selectedFile) : newUploadId();
      }
      fd.append('client_upload_id', uploadIdRef.current);
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
        setErrorMessage(friendlyUploadError(err));
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

        uploadIdRef.current = null;
        if (selectedFile) forgetUploadId(selectedFile);
        setPostIsProcessing(mediaStatus(newReel) === 'PROCESSING');
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
      setErrorMessage(friendlyUploadError(e));
      setShowErrorModal(true);
      console.error('[UPLOAD TRACEBACK]', detail);
    } finally {
      setIsUploading(false);
    }
  };

  const fmtTime = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

  const bottomNavItems = [
    { id: 'home',     label: 'Home',     Icon: Home,       action: onNavHome },
    { id: 'reels',    label: 'Reels',    Icon: Film,       action: onNavReels },
    { id: 'create',   label: 'New',      Icon: PlusSquare, action: null, isCreate: true },
    { id: 'messages', label: 'Messages', Icon: MessageCircle, action: onNavMessages, badge: unreadDmCount },
    { id: 'profile',  label: 'Profile',  Icon: User,       action: onNavProfile },
  ];

  // ── Camera controls ──────────────────────────────────────────────────────
  // Buttons over the camera act on touchend: in the SuperApp WebView the
  // click that follows a touch on the preview arrives late or not at all.
  // preventDefault on touchend cancels that click, so each tap acts once.
  const tap = (fn) => ({
    onClick: (e) => fn(e),
    onTouchEnd: (e) => { if (e.cancelable) e.preventDefault(); fn(e); },
  });

  const pressShutter = (source) => {
    // Touch events still reach a disabled button in some WebViews.
    if (cameraLoading && !isRecordingRef.current) return;
    // Block start while audio is still decoding
    if (isDecodingAudio && !isRecordingRef.current) {
      logToBackend(`record-btn ${source} BLOCKED: audio still decoding`, 'warn');
      showProblem('Music is still loading. Please wait a moment.', 'Sound');
      return;
    }
    // Debounce: ignore if another toggle just fired (touch+click double-fire)
    const now = Date.now();
    if (now - lastToggleRef.current < 500) {
      logToBackend(`record-btn ${source} IGNORED (debounce ${now - lastToggleRef.current}ms)`, 'warn');
      return;
    }
    lastToggleRef.current = now;
    logToBackend(`record-btn ${source} fired isRecording=${isRecordingRef.current}`, 'info');
    if (camMode === 'video') {
      isRecordingRef.current ? stopRecording() : startRecording().catch(console.error);
    } else {
      takePhoto();
    }
  };

  const openSoundSheet = () => {
    if (isRecordingRef.current) {
      console.log('[SOUND ICON] Recording in progress, blocking sound selection');
      showProblem('Please pick music before starting to record. Stop the current recording, choose your sound, then record again.', 'Sound');
      return;
    }
    setShowSoundSheet(true);
  };

  const REC_RED = '#EF4444';
  const srOnly = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0, padding: 0, margin: -1 };
  const glassCircle = (size) => ({
    width: size, height: size, borderRadius: '50%',
    background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.18)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  });

  // ── Render ───────────────────────────────────────────────────────────────
  const heroText = readableOn(T.pri);
  const filterOn = selectedFilter !== 'none';
  const shutterLabel = camMode === 'video' ? (isRecording ? 'Stop recording' : 'Start recording') : 'Take photo';
  const cameraTools = [
    {
      id: 'filters', label: 'Filters', aria: showFilters ? 'Hide filters' : 'Show filters', pressed: showFilters,
      active: showFilters, dot: filterOn && !showFilters,
      icon: <Sparkles size={21} color={showFilters ? heroText : '#fff'} />,
      onPress: () => setShowFilters((v) => !v),
    },
    {
      id: 'text', label: 'Text', aria: 'Add text',
      icon: <Type size={21} color="#fff" />,
      onPress: () => setShowTextInput(true),
    },
    {
      id: 'sound', label: 'Sound', aria: backgroundSound ? `Sound: ${backgroundSound.name}` : 'Add sound',
      icon: <Music size={21} color={backgroundSound ? T.pri : '#fff'} />,
      onPress: openSoundSheet,
    },
  ];

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
        .ep-btn:focus-visible { outline: 2px solid ${T.pri}; outline-offset: 2px; }
        .ep-btn:disabled { cursor: default; }
        .ep-filter-scroll::-webkit-scrollbar { display:none; }
        @keyframes ep-toast { 0% { opacity: 0; transform: translate(-50%,-50%) scale(.92); } 15% { opacity: 1; transform: translate(-50%,-50%) scale(1); } 75% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes ep-spin-slow { to { transform: rotate(360deg); } }
        .ep-hash { color:${T.pri}; font-weight:700; }
        .ep-rise { animation: ep-fade-in .45s cubic-bezier(.2,.8,.2,1) both; }
        .ep-card { transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
        @media (hover: hover) { .ep-card:hover { transform: translateY(-3px); box-shadow: 0 14px 34px rgba(0,0,0,0.22); } }
        .ep-card:active { transform: scale(0.97); }
        .ep-card:focus-visible { outline: 2px solid ${T.pri}; outline-offset: 3px; }
        @keyframes ep-rec { 0%,100% { transform: scale(1); } 50% { transform: scale(0.84); } }
        .ep-rec-dot { animation: ep-rec 1.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ep-rise, .ep-rec-dot, .ep-toast { animation: none !important; }
          .ep-card { transition: none; }
        }
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
            <div ref={previewContainerRef} style={{ position: 'absolute', inset: 0, background: '#000', touchAction: dragging ? 'none' : 'auto' }}
              onMouseMove={moveOverlayDrag} onMouseUp={endOverlayDrag} onMouseLeave={endOverlayDrag}>

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

              {/* Preview. The box has the frame's aspect, so stickers placed in %
                  of it land on the same pixels in the recording. */}
              <div ref={stageRef} style={{
                position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                width: stageBox ? stageBox.width : '100%', height: stageBox ? stageBox.height : '100%',
              }}>
                <canvas ref={canvasRef}
                  role="img"
                  aria-label={filterOn ? `Camera preview, ${getFilter(selectedFilter).name} filter` : 'Camera preview'}
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
                      <button type="button" aria-label={`Remove text: ${ov.text}`}
                        style={{ position: 'absolute', top: -12, right: -12, width: 24, height: 24, borderRadius: '50%', background: REC_RED, color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 21, padding: 0 }}
                        onMouseDown={e => e.stopPropagation()}
                        onTouchStart={e => e.stopPropagation()}
                        onClick={() => removeOverlay(ov.id)}>
                        <X size={13} color="#fff" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Camera loading indicator — under the top bar, so Close still works
                  while the browser is asking for permission. */}
              {cameraLoading && !cameraError && (
                <div role="status" aria-live="polite" style={{
                  position: 'absolute', inset: 0, background: '#0B0B0B', zIndex: 29,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center',
                }}>
                  <RefreshCw size={30} color={T.pri} style={{ animation: 'ep-spin-slow 1s linear infinite' }} />
                  <div style={{ marginTop: 16, fontSize: 15, color: '#fff', fontWeight: 700 }}>Starting camera…</div>
                  <div style={{ marginTop: 6, fontSize: 12.5, color: 'rgba(255,255,255,0.65)' }}>
                    Allow camera and microphone access if asked
                  </div>
                </div>
              )}

              {cameraError && (
                <CameraErrorPanel
                  {...cameraError}
                  accent={T.pri}
                  onRetry={() => startCamera()}
                  onUpload={() => fileInputRef.current?.click()}
                  onClose={closeCamera}
                />
              )}

              {/* Recording progress along the top edge */}
              {isRecording && (
                <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.2)', zIndex: 31 }}>
                  <div style={{ height: '100%', width: `${recProgress}%`, background: hasExtendedRecording ? '#F59E0B' : REC_RED, transition: 'width 0.5s linear' }} />
                </div>
              )}

              {/* Top bar */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30,
                padding: 'max(12px, env(safe-area-inset-top)) 12px 12px',
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}>
                <button type="button" className="ep-btn"
                  aria-label={isRecording ? 'Cancel recording and close camera' : 'Close camera'}
                  {...tap(closeCamera)}
                  style={glassCircle(44)}>
                  <X size={20} color="#fff" />
                </button>

                {/* Mode tabs — force light text on dark overlay so the Photo/
                    Video labels are readable regardless of theme. Locked while
                    recording: the shutter's meaning must not change mid-take. */}
                <div role="group" aria-label="Camera mode" style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.45)', borderRadius: 24, padding: 4 }}>
                  {['photo', 'video'].map(m => (
                    <button key={m} type="button" className="ep-btn"
                      aria-pressed={camMode === m}
                      disabled={isRecording}
                      {...tap(() => { if (!isRecordingRef.current) setCamMode(m); })}
                      style={{
                        minHeight: 36, padding: '0 16px', borderRadius: 20,
                        background: camMode === m ? T.pri : 'transparent',
                        color: camMode === m ? heroText : '#fff',
                        fontSize: 13, fontWeight: 700,
                        opacity: isRecording && camMode !== m ? 0.45 : 1,
                      }}>
                      {m === 'photo' ? 'Photo' : 'Video'}
                    </button>
                  ))}
                </div>

                {/* Flash — a real torch where the camera has one (rear cameras on
                    Android); shown disabled, and says why, where it does not. */}
                <button type="button" className="ep-btn"
                  disabled={!canTorch}
                  aria-label={canTorch ? (flashOn ? 'Turn flash off' : 'Turn flash on') : 'Flash not available on this camera'}
                  aria-pressed={canTorch ? flashOn : undefined}
                  title={canTorch ? undefined : 'Flash not available on this camera'}
                  {...tap(toggleTorch)}
                  style={{ ...glassCircle(44), opacity: canTorch ? 1 : 0.45 }}>
                  {flashOn ? <Zap size={18} color={T.pri} fill={T.pri} /> : <ZapOff size={18} color="#fff" />}
                </button>
              </div>

              {/* Status: timer, active filter, microphone */}
              <div style={{
                position: 'absolute', top: 'calc(max(12px, env(safe-area-inset-top)) + 58px)', left: 12, right: 12, zIndex: 25,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none',
              }}>
                {isRecording && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.55)', borderRadius: 20, padding: '6px 14px' }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: hasExtendedRecording ? '#F59E0B' : REC_RED,
                      animation: userPaused || isRecordingPaused ? 'none' : 'ep-pulse 1s infinite',
                    }} />
                    <span style={{ fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums', color: hasExtendedRecording ? '#F59E0B' : '#fff' }}>
                      {fmtTime(recTime)} / {fmtTime(MAX_REC)}
                    </span>
                    {(userPaused || isRecordingPaused) && (
                      <span style={{ fontSize: 11.5, fontWeight: 800, color: '#FCD34D', letterSpacing: '.06em', textTransform: 'uppercase' }}>Paused</span>
                    )}
                    {hasExtendedRecording && <Coins size={14} color="#F59E0B" />}
                  </div>
                )}

                {filterOn && !showFilters && (
                  <div style={{ pointerEvents: 'auto' }}>
                    <ActiveFilterChip
                      name={getFilter(selectedFilter).name}
                      onOpen={() => setShowFilters(true)}
                      onClear={() => chooseFilter('none')}
                    />
                  </div>
                )}

                {micState !== 'on' && !micNoticeDismissed && camMode === 'video' && !cameraError && (
                  <div role="status" style={{
                    pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 8, maxWidth: 420,
                    background: 'rgba(0,0,0,0.62)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 14,
                    padding: '6px 6px 6px 12px', color: '#fff', fontSize: 12.5, lineHeight: 1.35,
                  }}>
                    <MicOff size={16} color="#FCA5A5" style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{MIC_NOTICE[micState]}</span>
                    {micState === 'denied' && !isRecording && (
                      <button type="button" className="ep-btn" onClick={() => startCamera()}
                        style={{ minHeight: 32, padding: '0 10px', borderRadius: 10, background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                        Try again
                      </button>
                    )}
                    <button type="button" className="ep-btn" aria-label="Dismiss microphone notice" onClick={() => setMicNoticeDismissed(true)}
                      style={{ width: 32, height: 32, borderRadius: 10, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <X size={14} color="#fff" />
                    </button>
                  </div>
                )}
              </div>

              {/* Filter name, big and brief, as a filter is picked */}
              {filterToast && (
                <div className="ep-toast" aria-hidden="true" style={{
                  position: 'absolute', left: '50%', top: '40%', transform: 'translate(-50%,-50%)', zIndex: 26,
                  pointerEvents: 'none', fontSize: 30, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap',
                  textShadow: '0 2px 14px rgba(0,0,0,0.65)', animation: 'ep-toast .9s ease both',
                }}>
                  {filterToast}
                </div>
              )}
              <div aria-live="polite" style={srOnly}>{filterToast ? `${filterToast} filter` : ''}</div>

              {/* Right side tools. Hidden while the filter tray is open: on short
                  phones the two would overlap. */}
              {!showFilters && (
                <div role="toolbar" aria-label="Camera tools" aria-orientation="vertical" style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', zIndex: 30,
                }}>
                  {cameraTools.map(tool => (
                    <button key={tool.id} type="button" className="ep-btn"
                      aria-label={tool.aria}
                      aria-pressed={tool.pressed}
                      {...tap(tool.onPress)}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', padding: 4, minWidth: 56 }}>
                      <span style={{ ...glassCircle(44), position: 'relative', background: tool.active ? T.pri : 'rgba(0,0,0,0.5)' }}>
                        {tool.icon}
                        {tool.dot && (
                          <span aria-hidden="true" style={{ position: 'absolute', top: 2, right: 2, width: 9, height: 9, borderRadius: '50%', background: T.pri, border: '1.5px solid #000' }} />
                        )}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>{tool.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Bottom controls: filter tray (when open) above the shutter row, in
                  one column, so the tray can never cover the record button. */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30,
                background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
                padding: '36px 12px max(22px, env(safe-area-inset-bottom))',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
              }}>
                {showFilters && (
                  <FilterTray
                    filters={trayFilters}
                    selectedId={selectedFilter}
                    thumbnails={filterThumbs}
                    onSelect={chooseFilter}
                    onClose={() => setShowFilters(false)}
                    notice={trayNotice}
                    accent={T.pri}
                  />
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: 420, padding: '0 8px', boxSizing: 'border-box' }}>
                  {/* Left: pause while recording, gallery otherwise. The gallery
                      is off mid-take: opening the file picker suspends the camera
                      and the recorder on most phones. */}
                  {isRecording ? (
                    canPause && !isRecordingPaused ? (
                      <button type="button" className="ep-btn"
                        aria-label={userPaused ? 'Resume recording' : 'Pause recording'}
                        {...tap(togglePause)}
                        style={glassCircle(56)}>
                        {userPaused ? <Play size={22} color="#fff" fill="#fff" /> : <Pause size={22} color="#fff" fill="#fff" />}
                      </button>
                    ) : <div style={{ width: 56 }} />
                  ) : (
                    <button type="button" className="ep-btn" aria-label="Upload from gallery"
                      {...tap(() => fileInputRef.current?.click())}
                      style={glassCircle(56)}>
                      <Upload size={22} color="#fff" />
                    </button>
                  )}

                  {/* Record / Shutter button */}
                  <div style={{ position: 'relative', width: 80, height: 80 }}>
                    {camMode === 'video' && isRecording && (
                      <ProgressRing radius={40} stroke={4} progress={recProgress} color={REC_RED} />
                    )}
                    <button type="button" className="ep-btn"
                      aria-label={cameraLoading && !isRecording ? 'Camera starting' : shutterLabel}
                      disabled={(isDecodingAudio && !isRecordingRef.current) || !!cameraError || (cameraLoading && !isRecording)}
                      onClick={() => pressShutter('onClick')}
                      onTouchEnd={(e) => { e.preventDefault(); pressShutter('onTouchEnd'); }}
                      style={{
                        width: 80, height: 80, borderRadius: '50%',
                        background: camMode === 'video' ? (isRecording ? REC_RED : '#FFFFFF') : '#FFFFFF',
                        border: '4px solid rgba(255,255,255,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: isRecording ? `0 0 0 6px ${REC_RED}55` : '0 4px 16px rgba(0,0,0,0.4)',
                        transition: 'all 0.2s',
                        opacity: ((isDecodingAudio || cameraLoading) && !isRecording) ? 0.4 : 1,
                        cursor: ((isDecodingAudio || cameraLoading) && !isRecording) ? 'wait' : 'pointer',
                      }}>
                      {camMode === 'video'
                        ? (isRecording
                          ? <Square size={26} color="#fff" fill="#fff" />
                          : (isDecodingAudio
                            ? <RefreshCw size={26} color="#666" style={{ animation: 'ep-spin-slow 1s linear infinite' }} />
                            : <div style={{ width: 22, height: 22, borderRadius: '50%', background: REC_RED }} />))
                        : <div style={{ width: 58, height: 58, borderRadius: '50%', background: '#fff', border: '3px solid rgba(0,0,0,0.12)' }} />
                      }
                    </button>
                    {isDecodingAudio && !isRecording && (
                      <div style={{
                        position: 'absolute', bottom: -28, left: '50%', transform: 'translateX(-50%)',
                        whiteSpace: 'nowrap', background: 'rgba(0,0,0,0.85)', color: '#fff',
                        fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.25)',
                      }}>
                        Loading music…
                      </div>
                    )}
                  </div>

                  {/* Switch camera — also mid-recording: only the video track is
                      swapped, so the take carries on. */}
                  <button type="button" className="ep-btn"
                    aria-label={switchingCamera ? 'Switching camera' : 'Switch camera'}
                    aria-busy={switchingCamera}
                    disabled={switchingCamera || !!cameraError}
                    onClick={flipCamera}
                    onTouchEnd={flipCamera}
                    style={glassCircle(56)}>
                    <RefreshCw size={22} color="#fff" style={switchingCamera ? { animation: 'ep-spin-slow .8s linear infinite' } : undefined} />
                  </button>
                </div>

                {/* Background sound pill */}
                {backgroundSound && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'rgba(0,0,0,0.55)', borderRadius: 24, padding: '6px 6px 6px 14px',
                    backdropFilter: 'blur(10px)', color: '#fff', maxWidth: '100%',
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.pri, animation: isRecording ? 'ep-pulse 1s infinite' : 'none' }} />
                    <Music size={14} color={T.pri} />
                    <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{backgroundSound.name}</span>
                    <button type="button" className="ep-btn" aria-label="Remove sound"
                      disabled={isRecording}
                      onClick={() => { setBackgroundSound(null); setCustomAudioFile(null); setDecodedAudioBuffer(null); }}
                      style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <X size={13} color="#fff" />
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
              paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
              // A soft glow of the accent behind the header, the rest plain page.
              background: `radial-gradient(120% 55% at 50% -12%, ${T.pri}2E 0%, transparent 62%), ${T.bg}`,
            }}>

              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: 'max(14px, env(safe-area-inset-top)) 16px 8px',
                width: '100%', maxWidth: 520, margin: '0 auto', boxSizing: 'border-box',
              }}>
                <button type="button" aria-label="Go back" className="ep-btn" onClick={onBack}
                  style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ArrowLeft size={20} color={T.txt} />
                </button>
                <span style={{ fontSize: 17, fontWeight: 800, color: T.txt, letterSpacing: '-0.01em' }}>Create</span>
                {drafts.length > 0 ? (
                  <button type="button" className="ep-btn" onClick={() => setShowDrafts(true)}
                    aria-label={`Open drafts (${drafts.length})`}
                    style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 999, padding: '0 12px 0 10px', height: 36, color: T.txt, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileText size={15} color={T.pri} />
                    Drafts
                    <span style={{ minWidth: 20, height: 20, padding: '0 6px', boxSizing: 'border-box', borderRadius: 999, background: T.pri, color: heroText, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {drafts.length}
                    </span>
                  </button>
                ) : <div style={{ width: 40 }} />}
              </div>

              <div style={{ width: '100%', maxWidth: 520, margin: '0 auto', padding: '8px 20px 0', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Hero */}
                <div className="ep-rise" style={{ padding: '6px 2px 4px' }}>
                  <h1 style={{ margin: 0, fontSize: 27, lineHeight: 1.15, fontWeight: 800, letterSpacing: '-0.025em', color: T.txt }}>
                    What will you<br />create today?
                  </h1>
                  <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.45, color: T.sub }}>
                    Share a moment with the FlipStar community.
                  </p>
                </div>

                {/* ── Primary: record a video ── */}
                <button type="button" className="ep-btn ep-card ep-rise"
                  onClick={() => { setCamMode('video'); setCaptureMode('camera'); }}
                  style={{
                    animationDelay: '60ms',
                    position: 'relative', overflow: 'hidden',
                    width: '100%', minHeight: 156, padding: 20, borderRadius: 24,
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 18,
                    textAlign: 'left', color: heroText,
                    background: `radial-gradient(circle at 88% 12%, rgba(255,255,255,0.38) 0%, transparent 46%), radial-gradient(circle at 100% 100%, rgba(0,0,0,0.20) 0%, transparent 58%), ${T.pri}`,
                    boxShadow: `0 12px 30px ${T.pri}45`,
                  }}>
                  {/* Watermark */}
                  <Video size={132} color={heroText} strokeWidth={1.4} aria-hidden="true"
                    style={{ position: 'absolute', right: -22, bottom: -30, opacity: 0.12, transform: 'rotate(-12deg)', pointerEvents: 'none' }} />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    {/* Record button */}
                    <div aria-hidden="true" style={{
                      width: 56, height: 56, borderRadius: '50%',
                      border: '4px solid rgba(255,255,255,0.95)', background: 'rgba(0,0,0,0.16)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.18)', boxSizing: 'border-box',
                    }}>
                      <div className="ep-rec-dot" style={{ width: 30, height: 30, borderRadius: '50%', background: '#FF3B5C' }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 999, background: `${heroText}1F`, border: `1px solid ${heroText}26` }}>
                      Most popular
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, width: '100%', position: 'relative' }}>
                    <div>
                      <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.015em' }}>Record a video</div>
                      <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.8, marginTop: 4 }}>
                        Up to {FREE_LIMIT}s · music, filters &amp; text
                      </div>
                    </div>
                    <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: '50%', background: `${heroText}1F`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <ChevronRight size={20} color={heroText} />
                    </div>
                  </div>
                </button>

                {/* ── Secondary: photo + upload ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { key: 'photo', Icon: Camera, title: 'Take a photo', sub: 'Snap with your camera', onClick: () => { setCamMode('photo'); setCaptureMode('camera'); } },
                    { key: 'upload', Icon: ImageIcon, title: 'Upload', sub: 'Photos & videos from your gallery', onClick: () => fileInputRef.current?.click() },
                  ].map(({ key, Icon, title, sub, onClick }, i) => (
                    <button key={key} type="button" className="ep-btn ep-card ep-rise" onClick={onClick}
                      style={{
                        animationDelay: `${120 + i * 60}ms`,
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14,
                        minHeight: 138, padding: 16, borderRadius: 20, textAlign: 'left',
                        background: T.cardBg, border: `1px solid ${T.border}`,
                        boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
                      }}>
                      <div style={{ width: 44, height: 44, borderRadius: 14, background: `${T.pri}1F`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={22} color={T.pri} />
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.txt }}>{title}</div>
                        <div style={{ fontSize: 12, lineHeight: 1.35, color: T.sub, marginTop: 3 }}>{sub}</div>
                      </div>
                    </button>
                  ))}
                </div>

                {/* ── What the camera can do ── */}
                <div className="ep-rise" style={{ animationDelay: '240ms', marginTop: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.sub, margin: '0 2px 10px' }}>
                    Built into the camera
                  </div>
                  <div role="list" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '14px 8px', borderRadius: 20, background: T.cardBg, border: `1px solid ${T.border}` }}>
                    {[
                      { Icon: Music, label: 'Music' },
                      { Icon: Sparkles, label: `${VIDEO_FILTERS.length - 1} filters` },
                      { Icon: Type, label: 'Text' },
                      { Icon: RefreshCw, label: 'Front & back' },
                    ].map(({ Icon, label }) => (
                      <div key={label} role="listitem" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 38, height: 38, borderRadius: '50%', background: `${T.pri}17`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon size={18} color={T.pri} aria-hidden="true" />
                        </div>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: T.txt, whiteSpace: 'nowrap' }}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Hidden input -- outside the buttons: an input nested in a button is invalid markup */}
              <input ref={fileInputRef} type="file" accept="image/*,video/*"
                onChange={handleFileSelect} style={{ display: 'none' }} />
            </div>
          )}
        </div>
      )}

      {/* ── REVIEW STAGE ───────────────────────────────────────────────────── */}
      {/* The recorded file plays back as it will be posted. Next continues to
          the details page below, where the existing subscription and coin
          checks run on Post exactly as for any other video. */}
      {stage === 'review' && review && (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <RecordingReview
            url={review.url}
            filterName={recordedFilterId && recordedFilterId !== 'none' ? getFilter(recordedFilterId).name : ''}
            accent={T.pri}
            onRetake={() => retake()}
            onChangeFilter={() => retake({ openFilters: true })}
            onNext={() => setStage('details')}
          />
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
            {/* Back from a fresh recording returns to its review, so the take
                is not thrown away by a back tap; otherwise to the chooser. */}
            <button className="ep-btn" aria-label="Back"
              onClick={() => {
                if (review && selectedFile) { setStage('review'); return; }
                setStage('capture'); setPreview(null); setSelectedFile(null);
              }}
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
                {/* Filter label — the filter baked into this media. No tint over
                    the thumbnail: the pixels already carry the filter. */}
                {recordedFilterId && recordedFilterId !== 'none' && (
                  <div style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0,
                    display: 'flex', justifyContent: 'center', padding: 6, pointerEvents: 'none',
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '2px 7px', borderRadius: 8 }}>
                      {getFilter(recordedFilterId).name}
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

            {/* Category */}
            <div style={{
              background: '#000', borderRadius: 16, padding: '14px 16px',
              border: '1px solid rgba(255,255,255,0.2)',
            }}>
              <div style={{
                color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 700,
                letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10,
              }}>
                Category
              </div>

              {categoriesError ? (
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
                  Categories unavailable - your post will be uncategorised.
                </div>
              ) : categoriesLoading ? (
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
                  Loading categories...
                </div>
              ) : categories.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
                  No categories yet - your post will be uncategorised.
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button
                    type="button"
                    className="ep-btn"
                    onClick={() => setCategoryId('')}
                    aria-pressed={categoryId === ''}
                    style={{
                      padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                      background: categoryId === '' ? T.pri : 'transparent',
                      color: categoryId === '' ? '#000' : 'rgba(255,255,255,0.75)',
                      border: '1px solid ' + (categoryId === '' ? T.pri : 'rgba(255,255,255,0.25)'),
                    }}
                  >
                    None
                  </button>
                  {categories.map((c) => {
                    const active = String(categoryId) === String(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="ep-btn"
                        onClick={() => setCategoryId(active ? '' : c.id)}
                        aria-pressed={active}
                        style={{
                          padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                          background: active ? T.pri : 'transparent',
                          color: active ? '#000' : 'rgba(255,255,255,0.75)',
                          border: '1px solid ' + (active ? T.pri : 'rgba(255,255,255,0.25)'),
                        }}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              )}
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
          {postIsProcessing ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, color: T.white }}>Posted! 🎉</div>
              <div style={{ fontSize: 15, color: T.sub, textAlign: 'center', maxWidth: 300, lineHeight: 1.45 }}>
                Your post is being prepared. We're optimizing your {isVideoFile ? 'video' : 'photo'} for
                faster playback; it will appear in the feed in a moment.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, color: T.white }}>{isVideoFile ? 'Video is Live! 🎉' : 'Photo is Live! 🎉'}</div>
              <div style={{ fontSize: 15, color: T.sub }}>Your post has been uploaded</div>
            </>
          )}
        </div>
      )}

      {/* ── INSUFFICIENT COINS MODAL ──────────────────────────────────────────── */}
      {/* Not enough coins to post. The old inline panel's only real action
          was onShowCoinPurchase(), which navigated to /buy-coins and unmounted
          this page -- taking the recording, caption and overlays with it. The
          shared popup buys in place, so the draft is still here afterwards and
          the user just presses Post again. */}
      <InsufficientCoinsModal
        visible={showInsufficientCoins}
        requiredCoins={postCost}
        currentCoins={coinBalance}
        actionLabel="post this video"
        onClose={() => setShowInsufficientCoins(false)}
        onRequireAuth={onRequireAuth}
        onPurchased={(newBalance) => {
          setCoinBalance(newBalance);
          setShowInsufficientCoins(false);
        }}
        onBuyCoins={onShowCoinPurchase}
      />

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
          <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', textAlign: 'center', padding: '0 20px' }}>{errorTitle || 'Upload Error'}</div>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.75)', textAlign: 'center', maxWidth: 320, padding: '0 20px', lineHeight: 1.5 }}>
              {errorMessage}
            </div>
          </div>
          <button
            onClick={() => { setShowErrorModal(false); setErrorTitle(''); }}
            style={{
              padding: '12px 28px', borderRadius: 24, fontSize: 14, fontWeight: 700,
              background: T.pri, color: heroText, border: 'none', cursor: 'pointer',
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




