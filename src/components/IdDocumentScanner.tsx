import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileText,
  FlipHorizontal,
  Loader2,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import {
  compressDocumentImage,
  cropPortraitFromDocument,
  ID_DOCUMENT_LABELS,
} from '../lib/registrationService';
import { IdDocumentType } from '../types/zacma';

export type FieldConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'MISSING';

export interface ScannedIdExtractionClient {
  detectedDocumentType: IdDocumentType | 'UNKNOWN';
  fullName: string;
  dateOfBirth: string;
  dateOfBirthRaw: string;
  gender: 'Male' | 'Female' | '';
  nationality: string;
  documentNumber: string;
  drivingLicenceNumber: string;
  documentExpiryDate: string;
  address: string;
  phone: string;
  detectedLanguages: string[];
  overallConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  fieldConfidence: {
    fullName: FieldConfidenceLevel;
    dateOfBirth: FieldConfidenceLevel;
    gender: FieldConfidenceLevel;
    nationality: FieldConfidenceLevel;
    documentNumber: FieldConfidenceLevel;
    documentExpiryDate: FieldConfidenceLevel;
    address: FieldConfidenceLevel;
  };
  uncertainFields: string[];
  warnings: string[];
  portraitBox?: {
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
    side: 'FRONT' | 'BACK';
  } | null;
  summaryNote: string;
  verificationNotice: string;
}

export interface AppliedScanPayload {
  extraction: ScannedIdExtractionClient;
  frontDataUrl: string;
  frontMimeType: string;
  backDataUrl?: string;
  backMimeType?: string;
  croppedPortraitUrl?: string | null;
}

interface IdDocumentScannerProps {
  registrationType: 'STUDENT' | 'STAFF';
  onApplyExtraction: (payload: AppliedScanPayload) => void;
  onDocumentsChanged?: (docs: {
    frontDataUrl?: string;
    frontMimeType?: string;
    backDataUrl?: string;
    backMimeType?: string;
  }) => void;
}

function confidenceLabel(level: FieldConfidenceLevel): {
  text: string;
  colorClass: string;
} {
  switch (level) {
    case 'HIGH':
      return { text: 'Clear', colorClass: 'text-emerald-700' };
    case 'MEDIUM':
      return { text: 'Verify', colorClass: 'text-amber-700' };
    case 'LOW':
      return { text: 'Uncertain', colorClass: 'text-red-600' };
    default:
      return { text: 'Not found', colorClass: 'text-slate-400' };
  }
}

export function IdDocumentScanner({
  registrationType,
  onApplyExtraction,
  onDocumentsChanged,
}: IdDocumentScannerProps) {
  const [captureMode, setCaptureMode] = useState<'UPLOAD' | 'CAMERA'>('UPLOAD');
  const [consentConfirmed, setConsentConfirmed] = useState(false);

  const [frontDataUrl, setFrontDataUrl] = useState<string | null>(null);
  const [frontMimeType, setFrontMimeType] = useState<string>('image/jpeg');
  const [frontFileName, setFrontFileName] = useState<string>('');

  const [backDataUrl, setBackDataUrl] = useState<string | null>(null);
  const [backMimeType, setBackMimeType] = useState<string>('image/jpeg');
  const [backFileName, setBackFileName] = useState<string>('');

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraSide, setCameraSide] = useState<'FRONT' | 'BACK'>('FRONT');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // OCR scan state
  const [scanning, setScanning] = useState(false);
  const [scanStageText, setScanStageText] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ScannedIdExtractionClient | null>(null);
  const [croppedPortrait, setCroppedPortrait] = useState<string | null>(null);
  const [appliedTimestamp, setAppliedTimestamp] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (onDocumentsChanged) {
      onDocumentsChanged({
        frontDataUrl: frontDataUrl || undefined,
        frontMimeType,
        backDataUrl: backDataUrl || undefined,
        backMimeType,
      });
    }
  }, [frontDataUrl, frontMimeType, backDataUrl, backMimeType, onDocumentsChanged]);

  const startCamera = async (desiredFacing: 'environment' | 'user' = facingMode) => {
    setCameraError(null);
    stopCamera();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        'Camera capture is not available in this browser or context. Please use the Upload Document tab.'
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: desiredFacing },
          width: { ideal: 1600 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      window.setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          void videoRef.current.play().catch(() => undefined);
        }
      }, 60);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to access camera. Check browser camera permissions.';
      setCameraError(
        msg.includes('Permission') || msg.includes('NotAllowed')
          ? 'Camera permission was denied. Allow camera access in your browser settings or upload an existing photo.'
          : msg
      );
      setCameraActive(false);
    }
  };

  const captureCameraFrame = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('Camera preview is still initializing. Wait a moment and tap Capture again.');
      return;
    }
    const maxDim = 1280;
    const ratio = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(1, Math.round(video.videoWidth * ratio));
    const h = Math.max(1, Math.round(video.videoHeight * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    if (cameraSide === 'FRONT') {
      setFrontDataUrl(dataUrl);
      setFrontMimeType('image/jpeg');
      setFrontFileName(`Camera_Front_${new Date().toLocaleTimeString()}.jpg`);
      setCameraSide('BACK');
    } else {
      setBackDataUrl(dataUrl);
      setBackMimeType('image/jpeg');
      setBackFileName(`Camera_Back_${new Date().toLocaleTimeString()}.jpg`);
      stopCamera();
    }
    setScanError(null);
    setExtraction(null);
    setAppliedTimestamp(null);
  };

  const handleFileUpload = async (side: 'FRONT' | 'BACK', file: File | null) => {
    if (!file) return;
    setScanError(null);

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (file.type && !allowed.includes(file.type.toLowerCase())) {
      setScanError('Unsupported file type. Upload a JPG, PNG, WebP image, or PDF document.');
      return;
    }
    if (file.size > 7.5 * 1024 * 1024) {
      setScanError('File exceeds 7.5 MB limit. Please choose a smaller scan or photo.');
      return;
    }

    try {
      const processed = await compressDocumentImage(file, 1280, 0.82);
      if (side === 'FRONT') {
        setFrontDataUrl(processed.dataUrl);
        setFrontMimeType(processed.mimeType);
        setFrontFileName(file.name);
      } else {
        setBackDataUrl(processed.dataUrl);
        setBackMimeType(processed.mimeType);
        setBackFileName(file.name);
      }
      setExtraction(null);
      setCroppedPortrait(null);
      setAppliedTimestamp(null);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Unable to process selected file.');
    }
  };

  const runAiOcrScan = async () => {
    if (!frontDataUrl) {
      setScanError('Please upload or capture the front side of an ID document first.');
      return;
    }
    if (!consentConfirmed) {
      setScanError(
        'Please confirm authorization and privacy consent before sending the ID document for AI OCR extraction.'
      );
      return;
    }

    stopCamera();
    setScanning(true);
    setScanError(null);
    setExtraction(null);
    setCroppedPortrait(null);
    setAppliedTimestamp(null);
    setScanStageText('Analyzing document layout, language, and identity fields...');

    const stageTimer = window.setTimeout(() => {
      setScanStageText('Validating dates, ID numbers, and extracting holder portrait...');
    }, 2400);

    try {
      const res = await fetch('/api/ai/scan-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          registrationType,
          consentConfirmed: true,
          frontDataUrl,
          frontMimeType,
          backDataUrl: backDataUrl || undefined,
          backMimeType: backDataUrl ? backMimeType : undefined,
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        extraction?: ScannedIdExtractionClient;
        error?: string;
      };

      if (!res.ok || !payload.ok || !payload.extraction) {
        throw new Error(
          payload.error || 'AI document extraction failed. You can retry or complete the form manually.'
        );
      }

      const ext = payload.extraction;
      setExtraction(ext);

      // Auto-crop holder portrait photograph if bounding box was detected on an image side
      let portraitUrl: string | null = null;
      if (ext.portraitBox) {
        const sourceImg =
          ext.portraitBox.side === 'BACK' && backDataUrl ? backDataUrl : frontDataUrl;
        if (sourceImg && sourceImg.startsWith('data:image/')) {
          portraitUrl = await cropPortraitFromDocument(sourceImg, ext.portraitBox);
          setCroppedPortrait(portraitUrl);
        }
      }

      // Auto-populate form immediately while preserving full human review & editing
      onApplyExtraction({
        extraction: ext,
        frontDataUrl,
        frontMimeType,
        backDataUrl: backDataUrl || undefined,
        backMimeType: backDataUrl ? backMimeType : undefined,
        croppedPortraitUrl: portraitUrl,
      });
      setAppliedTimestamp(new Date().toLocaleTimeString());
    } catch (err) {
      setScanError(
        err instanceof Error
          ? err.message
          : 'Unable to reach AI OCR service. You can still enter fields manually below.'
      );
    } finally {
      window.clearTimeout(stageTimer);
      setScanning(false);
      setScanStageText('');
    }
  };

  const resetAll = () => {
    stopCamera();
    setFrontDataUrl(null);
    setFrontFileName('');
    setBackDataUrl(null);
    setBackFileName('');
    setExtraction(null);
    setCroppedPortrait(null);
    setScanError(null);
    setAppliedTimestamp(null);
    setCameraSide('FRONT');
  };

  const detectedLabel =
    extraction && extraction.detectedDocumentType !== 'UNKNOWN'
      ? ID_DOCUMENT_LABELS[extraction.detectedDocumentType]
      : 'Unclassified Document';

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Scanner Header */}
      <div className="px-5 py-4 border-b border-slate-200 bg-[#F5F7FC] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#172DEB] text-white flex items-center justify-center shrink-0">
            <ScanLine className="w-4.5 h-4.5" />
          </div>
          <div>
            <h2 className="text-sm font-display font-bold text-slate-900">
              AI Identification Document Scanner (OCR Auto-Fill)
            </h2>
            <p className="text-xs text-slate-500">
              Supports Ethiopian Fayda ID, National/Kebele ID, Passport, and Driving Licence (English &amp; Amharic).
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="inline-flex items-center bg-white border border-slate-200 rounded-lg p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setCaptureMode('UPLOAD');
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
              captureMode === 'UPLOAD'
                ? 'bg-[#172DEB] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Upload File
          </button>
          <button
            type="button"
            onClick={() => {
              setCaptureMode('CAMERA');
              setCameraError(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
              captureMode === 'CAMERA'
                ? 'bg-[#172DEB] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            Live Camera
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Capture Zone */}
        {captureMode === 'UPLOAD' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Front Side Dropzone */}
            <div className="border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50/70 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">
                  Front Side <span className="text-[#E51B23]">*</span>
                </span>
                {frontDataUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setFrontDataUrl(null);
                      setFrontFileName('');
                      setExtraction(null);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-[#E51B23]"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove
                  </button>
                )}
              </div>

              {frontDataUrl ? (
                <div className="rounded-lg border border-slate-200 bg-white p-2 space-y-2">
                  {frontMimeType === 'application/pdf' ? (
                    <div className="h-36 flex flex-col items-center justify-center bg-slate-50 rounded-md text-slate-700 gap-1.5">
                      <FileText className="w-8 h-8 text-[#172DEB]" />
                      <span className="text-xs font-semibold truncate max-w-[90%]">
                        {frontFileName || 'ID_Document.pdf'}
                      </span>
                      <span className="text-[11px] text-slate-500">PDF Document Ready for OCR</span>
                    </div>
                  ) : (
                    <img
                      src={frontDataUrl}
                      alt="Front side of identification document"
                      className="w-full h-36 object-contain rounded-md bg-slate-950/5"
                    />
                  )}
                  <p className="text-[11px] text-slate-500 truncate">{frontFileName || 'Front captured'}</p>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-36 rounded-lg border border-slate-200 bg-white hover:border-[#172DEB] transition-colors cursor-pointer px-4 text-center">
                  <Upload className="w-5 h-5 text-[#172DEB] mb-2" />
                  <span className="text-xs font-semibold text-slate-800">
                    Click to upload ID front (JPG, PNG, WebP, PDF)
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1">
                    Fayda ID, Kebele/National ID, Passport bio page, or Driving Licence
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="sr-only"
                    onChange={(e) => {
                      void handleFileUpload('FRONT', e.target.files?.[0] || null);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>

            {/* Optional Back Side Dropzone */}
            <div className="border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50/70 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">
                  Back Side <span className="text-slate-400 font-normal">(Optional — recommended for Fayda ID)</span>
                </span>
                {backDataUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setBackDataUrl(null);
                      setBackFileName('');
                      setExtraction(null);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-[#E51B23]"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove
                  </button>
                )}
              </div>

              {backDataUrl ? (
                <div className="rounded-lg border border-slate-200 bg-white p-2 space-y-2">
                  {backMimeType === 'application/pdf' ? (
                    <div className="h-36 flex flex-col items-center justify-center bg-slate-50 rounded-md text-slate-700 gap-1.5">
                      <FileText className="w-8 h-8 text-[#172DEB]" />
                      <span className="text-xs font-semibold truncate max-w-[90%]">
                        {backFileName || 'ID_Back.pdf'}
                      </span>
                      <span className="text-[11px] text-slate-500">PDF Back Side Ready</span>
                    </div>
                  ) : (
                    <img
                      src={backDataUrl}
                      alt="Back side of identification document"
                      className="w-full h-36 object-contain rounded-md bg-slate-950/5"
                    />
                  )}
                  <p className="text-[11px] text-slate-500 truncate">{backFileName || 'Back captured'}</p>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-36 rounded-lg border border-slate-200 bg-white hover:border-[#172DEB] transition-colors cursor-pointer px-4 text-center">
                  <Upload className="w-5 h-5 text-slate-400 mb-2" />
                  <span className="text-xs font-semibold text-slate-700">
                    Upload back side for address &amp; FIN/QR details
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1">
                    JPG, PNG, WebP, or PDF up to 7.5 MB
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="sr-only"
                    onChange={(e) => {
                      void handleFileUpload('BACK', e.target.files?.[0] || null);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        ) : (
          /* Live Camera Scanner */
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 text-xs">
                <span className="text-slate-600 font-medium">Capturing:</span>
                <button
                  type="button"
                  onClick={() => setCameraSide('FRONT')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition ${
                    cameraSide === 'FRONT'
                      ? 'bg-[#172DEB] text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Front Side {frontDataUrl ? '✓' : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setCameraSide('BACK')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition ${
                    cameraSide === 'BACK'
                      ? 'bg-[#172DEB] text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Back Side {backDataUrl ? '✓' : ''}
                </button>
              </div>

              <div className="flex items-center gap-2">
                {cameraActive && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = facingMode === 'environment' ? 'user' : 'environment';
                      setFacingMode(next);
                      void startCamera(next);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                    Switch Camera
                  </button>
                )}
                {cameraActive ? (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    Stop Camera
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#172DEB] hover:bg-blue-800 rounded-lg"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Start Camera
                  </button>
                )}
              </div>
            </div>

            {cameraError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{cameraError}</span>
              </div>
            )}

            <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 aspect-[16/10] max-h-[340px] w-full flex items-center justify-center">
              {cameraActive ? (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-cover"
                  />
                  {/* ID Card Alignment Frame Overlay */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                    <div className="w-full max-w-md aspect-[1.58/1] border-2 border-white/85 rounded-xl shadow-[0_0_0_9999px_rgba(15,23,42,0.45)] relative">
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[11px] font-semibold text-white tracking-wide whitespace-nowrap">
                        Align {cameraSide} of ID inside frame — ensure bright even lighting
                      </span>
                    </div>
                  </div>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={captureCameraFrame}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-[#172DEB] hover:bg-blue-700 rounded-lg shadow-lg border border-white/20"
                    >
                      <Camera className="w-4 h-4" />
                      Capture {cameraSide === 'FRONT' ? 'Front Side' : 'Back Side'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center px-6 py-8 space-y-3">
                  <Camera className="w-8 h-8 text-slate-400 mx-auto" />
                  <div>
                    <p className="text-xs font-semibold text-white">
                      Mobile &amp; Desktop Camera Scanner Ready
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Tap &ldquo;Start Camera&rdquo; to photograph the front (and optional back) of an ID card or passport.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#172DEB] hover:bg-blue-700 rounded-lg"
                  >
                    <Camera className="w-4 h-4" />
                    Launch Camera Preview
                  </button>
                </div>
              )}
            </div>

            {/* Captured Camera Thumbnails */}
            {(frontDataUrl || backDataUrl) && (
              <div className="grid grid-cols-2 gap-3">
                {frontDataUrl && (
                  <div className="border border-slate-200 rounded-lg p-2 bg-slate-50">
                    <p className="text-[11px] font-semibold text-slate-700 mb-1">Captured Front</p>
                    <img
                      src={frontDataUrl}
                      alt="Captured ID front"
                      className="w-full h-24 object-contain rounded bg-white"
                    />
                  </div>
                )}
                {backDataUrl && (
                  <div className="border border-slate-200 rounded-lg p-2 bg-slate-50">
                    <p className="text-[11px] font-semibold text-slate-700 mb-1">Captured Back</p>
                    <img
                      src={backDataUrl}
                      alt="Captured ID back"
                      className="w-full h-24 object-contain rounded bg-white"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Privacy Consent & Scan Action Bar */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={consentConfirmed}
              onChange={(e) => setConsentConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-[#172DEB] focus:ring-[#172DEB]"
            />
            <span className="text-xs text-slate-700 leading-relaxed">
              <strong>Privacy &amp; Authorization Confirmation:</strong> I confirm the applicant has consented to identity document capture for ZACMA Technology registration. Documents are analyzed for OCR text auto-fill only, encrypted with AES-256-GCM in the restricted Admin vault, and require human verification before approval.
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={scanning || !frontDataUrl || !consentConfirmed}
                onClick={() => void runAiOcrScan()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#172DEB] hover:bg-blue-800 rounded-lg transition-colors disabled:opacity-50"
              >
                {scanning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Scanning Document...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>{extraction ? 'Rescan with AI OCR' : 'Analyze ID & Auto-Fill Form'}</span>
                  </>
                )}
              </button>

              {(frontDataUrl || backDataUrl || extraction) && (
                <button
                  type="button"
                  disabled={scanning}
                  onClick={resetAll}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Clear &amp; Start Over
                </button>
              )}
            </div>

            {appliedTimestamp && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Auto-filled at {appliedTimestamp} — review &amp; edit all fields below
              </span>
            )}
          </div>

          {/* Animated Scanning Progress */}
          {scanning && (
            <div className="pt-2 space-y-2">
              <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full w-2/5 zacma-brand-stripe rounded-full animate-zacma-loader" />
              </div>
              <p className="text-xs text-[#172DEB] font-medium">{scanStageText}</p>
            </div>
          )}

          {scanError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{scanError}</span>
            </div>
          )}
        </div>

        {/* Structured OCR Extraction Preview & Review Panel */}
        {extraction && (
          <div className="rounded-xl border border-blue-200 bg-[#F5F7FC]/60 p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-blue-100">
              <div className="flex items-start gap-3">
                {croppedPortrait ? (
                  <img
                    src={croppedPortrait}
                    alt="Auto-cropped ID holder portrait"
                    className="w-14 h-16 rounded-lg object-cover border border-slate-200 bg-white shrink-0"
                  />
                ) : (
                  <div className="w-12 h-14 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-400 shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                    <span className="font-display font-bold text-slate-900">{detectedLabel}</span>
                    <span className="text-slate-300">·</span>
                    <span
                      className={`font-semibold ${
                        extraction.overallConfidence === 'HIGH'
                          ? 'text-emerald-700'
                          : extraction.overallConfidence === 'MEDIUM'
                          ? 'text-amber-700'
                          : 'text-[#E51B23]'
                      }`}
                    >
                      OCR Clarity: {extraction.overallConfidence}
                    </span>
                    {extraction.detectedLanguages.length > 0 && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-500">
                          Scripts: {extraction.detectedLanguages.join(', ')}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    {extraction.summaryNote || 'Visible fields extracted and populated into the registration form.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!frontDataUrl) return;
                  onApplyExtraction({
                    extraction,
                    frontDataUrl,
                    frontMimeType,
                    backDataUrl: backDataUrl || undefined,
                    backMimeType: backDataUrl ? backMimeType : undefined,
                    croppedPortraitUrl: croppedPortrait,
                  });
                  setAppliedTimestamp(new Date().toLocaleTimeString());
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#172DEB] bg-white border border-blue-200 hover:bg-blue-50 rounded-lg shrink-0"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Re-Apply OCR Fields
              </button>
            </div>

            {/* Extracted Fields Grid with Confidence Metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {(
                [
                  ['Full Legal Name', extraction.fullName, extraction.fieldConfidence.fullName],
                  ['ID / Document Number', extraction.documentNumber, extraction.fieldConfidence.documentNumber],
                  ['Date of Birth', extraction.dateOfBirth || extraction.dateOfBirthRaw, extraction.fieldConfidence.dateOfBirth],
                  ['Gender', extraction.gender, extraction.fieldConfidence.gender],
                  ['Nationality', extraction.nationality, extraction.fieldConfidence.nationality],
                  ['Document Expiry', extraction.documentExpiryDate, extraction.fieldConfidence.documentExpiryDate],
                  ['Address', extraction.address, extraction.fieldConfidence.address],
                  ['Phone (if printed)', extraction.phone, extraction.phone ? 'MEDIUM' : 'MISSING'],
                ] as Array<[string, string, FieldConfidenceLevel]>
              ).map(([label, val, conf]) => {
                const c = confidenceLabel(conf);
                return (
                  <div key={label} className="bg-white border border-slate-200 rounded-lg p-2.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-slate-500 font-medium">{label}</span>
                      <span className={`font-semibold ${c.colorClass}`}>{c.text}</span>
                    </div>
                    <p className="font-semibold text-slate-900 mt-1 truncate tabular-nums">
                      {val || <span className="text-slate-400 font-normal">Manual entry required</span>}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* OCR Warnings & Expiry Alerts */}
            {extraction.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 space-y-1.5">
                <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                  Human Review Alerts ({extraction.warnings.length})
                </p>
                <ul className="list-disc pl-5 text-xs text-amber-800 space-y-0.5">
                  {extraction.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Mandatory Non-Authenticity Notice */}
            <div className="flex items-start gap-2 text-[11px] text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2">
              <ShieldCheck className="w-4 h-4 text-[#172DEB] shrink-0 mt-0.5" />
              <span>{extraction.verificationNotice}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
