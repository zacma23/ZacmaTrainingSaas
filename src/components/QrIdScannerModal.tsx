import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { QRCodeCanvas } from 'qrcode.react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Download,
  FlipHorizontal,
  Keyboard,
  QrCode,
  RefreshCw,
  Search,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import {
  buildZacmaQrBadgePayload,
  ParsedQrIdentity,
  parseQrIdentityPayload,
} from '../lib/qrIdParser';
import { ID_DOCUMENT_LABELS } from '../lib/registrationService';
import { StaffRecord, Student } from '../types/zacma';

interface QrIdScannerModalProps {
  open: boolean;
  defaultMode: 'STUDENT' | 'STAFF';
  students: Student[];
  staffRecords: StaffRecord[];
  onClose: () => void;
  onApplyToForm: (parsed: ParsedQrIdentity) => void;
  onJumpToExisting?: (parsed: ParsedQrIdentity) => void;
}

type InputTab = 'CAMERA' | 'UPLOAD' | 'MANUAL';

export function QrIdScannerModal({
  open,
  defaultMode,
  students,
  staffRecords,
  onClose,
  onApplyToForm,
  onJumpToExisting,
}: QrIdScannerModalProps) {
  const [tab, setTab] = useState<InputTab>('CAMERA');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [parsedResult, setParsedResult] = useState<ParsedQrIdentity | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const handleDecodedString = useCallback(
    (rawText: string) => {
      const parsed = parseQrIdentityPayload(rawText, students, staffRecords);
      setParsedResult(parsed);
      setDecodeError(null);
      stopCamera();
    },
    [students, staffRecords, stopCamera]
  );

  const scanFrameLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return;

    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      const targetW = Math.min(video.videoWidth, 800);
      const scale = targetW / video.videoWidth;
      const targetH = Math.round(video.videoHeight * scale);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, targetW, targetH);
        const imageData = ctx.getImageData(0, 0, targetW, targetH);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });
        if (code && code.data && code.data.trim()) {
          handleDecodedString(code.data.trim());
          return;
        }
      }
    }
    rafRef.current = window.requestAnimationFrame(scanFrameLoop);
  }, [handleDecodedString]);

  const startCamera = useCallback(
    async (desiredFacing: 'environment' | 'user' = facingMode) => {
      stopCamera();
      setCameraError(null);
      setDecodeError(null);
      setParsedResult(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Camera QR scanning is unavailable in this browser. Switch to Upload QR Image or USB Scanner / Paste.'
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: desiredFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        streamRef.current = stream;
        setCameraActive(true);

        window.setTimeout(() => {
          if (videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            void videoRef.current
              .play()
              .then(() => {
                rafRef.current = window.requestAnimationFrame(scanFrameLoop);
              })
              .catch(() => {
                rafRef.current = window.requestAnimationFrame(scanFrameLoop);
              });
          }
        }, 80);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to start camera.';
        setCameraError(
          msg.includes('Permission') || msg.includes('NotAllowed')
            ? 'Camera permission denied. Allow camera access or upload a QR image instead.'
            : msg
        );
        setCameraActive(false);
      }
    },
    [facingMode, scanFrameLoop, stopCamera]
  );

  // Auto-start camera when modal opens on CAMERA tab, clean up on close/unmount
  useEffect(() => {
    if (!open) {
      stopCamera();
      setParsedResult(null);
      setDecodeError(null);
      setUploadedPreview(null);
      setManualInput('');
      return;
    }
    if (tab === 'CAMERA' && !parsedResult) {
      void startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  if (!open) return null;

  const handleUploadQrImage = async (file: File | null) => {
    if (!file) return;
    setDecodeError(null);
    setParsedResult(null);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(file);
      });
      setUploadedPreview(dataUrl);

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Invalid image file.'));
        image.src = dataUrl;
      });

      const maxDim = 1400;
      const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * ratio));
      const h = Math.max(1, Math.round(img.height * ratio));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas unavailable.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const imageData = ctx.getImageData(0, 0, w, h);
      const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });

      if (!decoded || !decoded.data.trim()) {
        setDecodeError(
          'No readable QR code was found in that image. Ensure the QR square is clear, well-lit, and uncropped.'
        );
        return;
      }

      handleDecodedString(decoded.data.trim());
    } catch (err) {
      setDecodeError(err instanceof Error ? err.message : 'Unable to decode uploaded QR image.');
    }
  };

  const handleManualParse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) {
      setDecodeError('Scan with a USB/Bluetooth QR reader or paste a QR ID payload first.');
      return;
    }
    handleDecodedString(manualInput.trim());
  };

  const effectiveKind = parsedResult?.registrationType || defaultMode;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[1px] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden my-auto">
        {/* Top Brand Stripe */}
        <div className="h-1 w-full zacma-brand-stripe" />

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#172DEB] text-white flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-display font-bold text-slate-900">
                Quick QR ID Code Scanner
              </h2>
              <p className="text-xs text-slate-500">
                Scan a ZACMA Student/Staff QR badge, Fayda/Digital ID QR, or vCard to auto-fill registration instantly.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-md"
            aria-label="Close QR scanner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-5 pt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center bg-slate-100 rounded-lg p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setTab('CAMERA');
                setDecodeError(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
                tab === 'CAMERA'
                  ? 'bg-[#172DEB] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              Live Camera
            </button>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setTab('UPLOAD');
                setDecodeError(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
                tab === 'UPLOAD'
                  ? 'bg-[#172DEB] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Upload QR Image
            </button>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setTab('MANUAL');
                setDecodeError(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
                tab === 'MANUAL'
                  ? 'bg-[#172DEB] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Keyboard className="w-3.5 h-3.5" />
              USB Scanner / Paste
            </button>
          </div>

          {tab === 'CAMERA' && cameraActive && (
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
        </div>

        {/* Hidden canvas for real-time QR frame sampling */}
        <canvas ref={canvasRef} className="hidden" />

        <div className="p-5 space-y-4">
          {/* Camera Mode */}
          {tab === 'CAMERA' && !parsedResult && (
            <div className="space-y-3">
              {cameraError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{cameraError}</span>
                </div>
              )}

              <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 aspect-[16/10] max-h-[320px] w-full flex items-center justify-center">
                {cameraActive ? (
                  <>
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className="w-full h-full object-cover"
                    />
                    {/* Square QR Targeting Reticle */}
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="w-48 h-48 sm:w-56 sm:h-56 border-2 border-[#172DEB] rounded-xl shadow-[0_0_0_9999px_rgba(15,23,42,0.5)] relative">
                        <span className="absolute -top-0.5 -left-0.5 w-5 h-5 border-t-4 border-l-4 border-white rounded-tl-md" />
                        <span className="absolute -top-0.5 -right-0.5 w-5 h-5 border-t-4 border-r-4 border-white rounded-tr-md" />
                        <span className="absolute -bottom-0.5 -left-0.5 w-5 h-5 border-b-4 border-l-4 border-white rounded-bl-md" />
                        <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 border-b-4 border-r-4 border-white rounded-br-md" />
                        <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[11px] font-semibold text-white whitespace-nowrap">
                          Hold QR code steady inside square — decodes automatically
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center px-6 py-8 space-y-3">
                    <QrCode className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-xs text-slate-300">
                      Position a student or staff QR ID code in front of the camera for instant recognition.
                    </p>
                    <button
                      type="button"
                      onClick={() => void startCamera(facingMode)}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#172DEB] hover:bg-blue-700 rounded-lg"
                    >
                      <Camera className="w-4 h-4" />
                      Start Live QR Camera
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Upload QR Image Mode */}
          {tab === 'UPLOAD' && !parsedResult && (
            <div className="space-y-3">
              <label className="flex flex-col items-center justify-center h-44 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:border-[#172DEB] hover:bg-blue-50/30 transition cursor-pointer px-4 text-center">
                {uploadedPreview ? (
                  <img
                    src={uploadedPreview}
                    alt="Uploaded QR code preview"
                    className="h-32 object-contain rounded"
                  />
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-[#172DEB] mb-2" />
                    <span className="text-xs font-semibold text-slate-800">
                      Click to upload a QR code image or screenshot (PNG, JPG, WebP)
                    </span>
                    <span className="text-[11px] text-slate-500 mt-1">
                      Decoded locally in your browser — instant form population
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    void handleUploadQrImage(e.target.files?.[0] || null);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          )}

          {/* USB / Bluetooth Handheld QR Scanner or Manual Payload Paste */}
          {tab === 'MANUAL' && !parsedResult && (
            <form onSubmit={handleManualParse} className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700">
                Scan with USB/Bluetooth 2D Scanner or Paste QR Payload
              </label>
              <textarea
                rows={4}
                autoFocus
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder='Supports ZACMA JSON, vCard, Fayda ID numbers, ZAC-STU-0001 / ZAC-STA-0001 codes, or Key:Value text (e.g. {"type":"STUDENT","fullName":"Abebe Kebede","phone":"+251911223344","fan":"123456789012","course":"Software Development"})'
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#172DEB]"
              />
              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#172DEB] hover:bg-blue-800 rounded-lg"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  Decode QR Payload
                </button>
              </div>
            </form>
          )}

          {decodeError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{decodeError}</span>
            </div>
          )}

          {/* Decoded QR Preview */}
          {parsedResult && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-emerald-200/70">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      QR Code Decoded ({parsedResult.format.replace('_', ' ')})
                    </p>
                    <p className="text-[11px] text-slate-600">
                      Target Registration Mode: <strong>{effectiveKind}</strong> ·{' '}
                      {parsedResult.extractedCount} field{parsedResult.extractedCount === 1 ? '' : 's'} extracted
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setParsedResult(null);
                    setUploadedPreview(null);
                    if (tab === 'CAMERA') void startCamera(facingMode);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Scan Another
                </button>
              </div>

              {/* Existing ZACMA Record Match Alert */}
              {(parsedResult.matchedStudent || parsedResult.matchedStaff) && (
                <div className="rounded-lg border border-blue-200 bg-[#F5F7FC] p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-start gap-2 text-slate-800">
                    <UserCheck className="w-4 h-4 text-[#172DEB] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-slate-900">
                        Existing ZACMA Record Found:{' '}
                        <span className="font-mono text-[#172DEB]">
                          {parsedResult.matchedStudent?.studentCode || parsedResult.matchedStaff?.staffCode}
                        </span>
                      </p>
                      <p className="text-slate-600 mt-0.5">
                        {parsedResult.matchedStudent
                          ? `${parsedResult.matchedStudent.fullName} — ${parsedResult.matchedStudent.courseName} (${parsedResult.matchedStudent.registrationStatus})`
                          : `${parsedResult.matchedStaff?.fullName} — ${parsedResult.matchedStaff?.jobPosition} (${parsedResult.matchedStaff?.registrationStatus})`}
                      </p>
                    </div>
                  </div>
                  {onJumpToExisting && (
                    <button
                      type="button"
                      onClick={() => {
                        onJumpToExisting(parsedResult);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#172DEB] bg-white border border-blue-200 hover:bg-blue-50 rounded-lg shrink-0"
                    >
                      <Search className="w-3.5 h-3.5" />
                      Open Existing Record
                    </button>
                  )}
                </div>
              )}

              {/* Parsed Field Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                {(
                  [
                    ['Full Name', parsedResult.fullName],
                    ['ID Type', parsedResult.idDocumentType ? ID_DOCUMENT_LABELS[parsedResult.idDocumentType] : undefined],
                    ['ID / Document No.', parsedResult.idDocumentNumber],
                    ['Phone', parsedResult.phone],
                    ['Email', parsedResult.email],
                    ['Date of Birth', parsedResult.dateOfBirth],
                    ['Gender', parsedResult.gender],
                    ['Nationality', parsedResult.nationality],
                    ['Address', parsedResult.address],
                    ['Course Hint', parsedResult.courseHint],
                    ['Department', parsedResult.department],
                    ['Job Position', parsedResult.jobPosition],
                    ['Institutional Code', parsedResult.institutionalCode],
                  ] as Array<[string, string | undefined]>
                )
                  .filter(([, val]) => Boolean(val))
                  .map(([label, val]) => (
                    <div key={label} className="bg-white border border-slate-200 rounded-lg p-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {label}
                      </p>
                      <p className="font-semibold text-slate-900 mt-0.5 truncate tabular-nums">
                        {val}
                      </p>
                    </div>
                  ))}
              </div>

              {parsedResult.extractedCount === 0 && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <p className="font-semibold">Unstructured QR Text Detected:</p>
                  <p className="font-mono text-[11px] break-all mt-1">{parsedResult.rawText}</p>
                </div>
              )}

              {/* Action Footer */}
              <div className="pt-2 border-t border-emerald-200/70 flex flex-wrap items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    onClose();
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApplyToForm(parsedResult);
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#172DEB] hover:bg-blue-800 rounded-lg"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Apply to {effectiveKind === 'STAFF' ? 'Staff' : 'Student'} Registration Form
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ZacmaQrBadgeModal({
  subject,
  onClose,
}: {
  subject:
    | { kind: 'STUDENT'; student: Student }
    | { kind: 'STAFF'; staff: StaffRecord }
    | null;
  onClose: () => void;
}) {
  const qrCanvasWrapperRef = useRef<HTMLDivElement | null>(null);

  if (!subject) return null;

  const qrPayload = buildZacmaQrBadgePayload(subject);
  const code = subject.kind === 'STUDENT' ? subject.student.studentCode : subject.staff.staffCode;
  const name = subject.kind === 'STUDENT' ? subject.student.fullName : subject.staff.fullName;
  const subtitle =
    subject.kind === 'STUDENT'
      ? subject.student.courseName
      : `${subject.staff.jobPosition} · ${subject.staff.department}`;

  const handleDownloadQrPng = () => {
    const canvas = qrCanvasWrapperRef.current?.querySelector('canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${code}_ZACMA_QR_ID.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-sm w-full shadow-2xl overflow-hidden">
        <div className="h-1.5 w-full zacma-brand-stripe" />
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-300">
              ZACMA Technology · {subject.kind === 'STUDENT' ? 'Student' : 'Staff'} QR ID
            </p>
            <p className="text-sm font-display font-bold truncate">{name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1"
            aria-label="Close QR ID badge"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 text-center space-y-4">
          <div
            ref={qrCanvasWrapperRef}
            className="inline-flex p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs"
          >
            <QRCodeCanvas
              value={qrPayload}
              size={196}
              level="M"
              includeMargin
              fgColor="#0F172A"
              bgColor="#FFFFFF"
            />
          </div>

          <div>
            <p className="font-mono text-sm font-bold text-[#172DEB] tabular-nums">{code}</p>
            <p className="text-xs font-medium text-slate-700 mt-0.5">{subtitle}</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Scan this QR code in Quick QR Scanner for instant intake lookup or secondary course enrollment.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleDownloadQrPng}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#172DEB] hover:bg-blue-800 rounded-lg"
            >
              <Download className="w-3.5 h-3.5" />
              Download QR PNG
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

