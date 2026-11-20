import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Download,
  Edit3,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import {
  BULK_TEMPLATE_COLUMNS,
  BulkImportProgress,
  BulkParsedStudentRow,
  BulkParseSummary,
  BulkStudentRowFields,
  checkLiveFirestoreDuplicatesForRow,
  downloadStudentBulkTemplate,
  executeBulkStudentImport,
  exportBulkImportResultsWorkbook,
  parseAndValidateBulkStudentFile,
  revalidateAllBulkRows,
} from '../lib/bulkRegistrationService';
import { ID_DOCUMENT_LABELS } from '../lib/registrationService';
import { formatEtb, IdDocumentType, PaymentMethod } from '../types/zacma';

interface BulkStudentImportPanelProps {
  onOpenPendingApprovals: () => void;
}

type FilterMode = 'ALL' | 'READY' | 'INVALID' | 'WARNINGS' | 'IMPORTED';

const ID_TYPE_OPTIONS: IdDocumentType[] = [
  'ETHIOPIAN_FAYDA_ID',
  'NATIONAL_ID',
  'PASSPORT',
  'DRIVING_LICENCE',
];

const PAYMENT_METHODS: PaymentMethod[] = [
  'Cash',
  'Bank Transfer',
  'Telebirr',
  'CBE Birr',
  'Check',
  'Chapa',
];

export function BulkStudentImportPanel({
  onOpenPendingApprovals,
}: BulkStudentImportPanelProps) {
  const {
    profile,
    effectiveRole,
    actorContext,
    activeTenant,
    students,
    courses,
    paymentPlans,
    pushToast,
  } = usePortal();

  const isAdmin = effectiveRole === 'ADMIN';
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeCourses = useMemo(
    () => courses.filter((c) => c.isActive).sort((a, b) => a.name.localeCompare(b.name)),
    [courses]
  );
  const activePlans = useMemo(
    () => paymentPlans.filter((p) => p.isActive),
    [paymentPlans]
  );

  const tenantName = activeTenant?.name || 'ZACMA Technology';
  const studentIdPrefix = actorContext?.studentIdPrefix || activeTenant?.studentIdPrefix || 'ZAC-STU';
  const studentLimit = actorContext?.studentLimit || activeTenant?.studentLimit || 0;
  const remainingSlots = studentLimit > 0 ? Math.max(0, studentLimit - students.length) : null;
  const isTenantSuspended = (actorContext?.tenantStatus || activeTenant?.status) === 'SUSPENDED';

  const [showSchemaMap, setShowSchemaMap] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseSummary, setParseSummary] = useState<BulkParseSummary | null>(null);
  const [rows, setRows] = useState<BulkParsedStudentRow[]>([]);
  const [allowDuplicateOverride, setAllowDuplicateOverride] = useState(false);

  const [filterMode, setFilterMode] = useState<FilterMode>('ALL');
  const [rowSearch, setRowSearch] = useState('');

  const [editingRow, setEditingRow] = useState<BulkParsedStudentRow | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<BulkImportProgress | null>(null);
  const [importResultBanner, setImportResultBanner] = useState<{
    succeeded: number;
    failed: number;
    importedCodes: string[];
  } | null>(null);

  const effectiveActor = useMemo(() => {
    if (actorContext) return actorContext;
    if (!profile) return null;
    return {
      uid: profile.uid,
      fullName: profile.fullName,
      role: profile.role,
      tenantId: activeTenant?.id || 'zacma_default',
      studentIdPrefix,
      studentLimit: studentLimit || undefined,
      tenantStatus: activeTenant?.status,
    };
  }, [actorContext, profile, activeTenant, studentIdPrefix, studentLimit]);

  // Derived metrics
  const metrics = useMemo(() => {
    const total = rows.length;
    const ready = rows.filter((r) => r.importStatus === 'READY').length;
    const selectedReady = rows.filter((r) => r.selected && r.importStatus === 'READY').length;
    const invalid = rows.filter((r) => r.importStatus === 'INVALID' || r.importStatus === 'FAILED').length;
    const duplicates = rows.filter((r) => r.isDuplicateIdInDb || r.isDuplicateIdInFile).length;
    const withWarnings = rows.filter((r) => r.warnings.length > 0).length;
    const imported = rows.filter((r) => r.importStatus === 'IMPORTED').length;
    return { total, ready, selectedReady, invalid, duplicates, withWarnings, imported };
  }, [rows]);

  const capacityExceeded =
    remainingSlots !== null && metrics.selectedReady > remainingSlots;

  const filteredRows = useMemo(() => {
    const q = rowSearch.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterMode === 'READY' && r.importStatus !== 'READY') return false;
      if (filterMode === 'INVALID' && r.importStatus !== 'INVALID' && r.importStatus !== 'FAILED') {
        return false;
      }
      if (filterMode === 'WARNINGS' && r.warnings.length === 0) return false;
      if (filterMode === 'IMPORTED' && r.importStatus !== 'IMPORTED') return false;

      if (!q) return true;
      return (
        r.fields.fullName.toLowerCase().includes(q) ||
        r.fields.phone.toLowerCase().includes(q) ||
        r.fields.idDocumentNumber.toLowerCase().includes(q) ||
        r.resolvedCourseName.toLowerCase().includes(q) ||
        r.fields.courseInput.toLowerCase().includes(q) ||
        (r.assignedStudentCode || '').toLowerCase().includes(q) ||
        String(r.rowNumber).includes(q)
      );
    });
  }, [rows, filterMode, rowSearch]);

  const handleDownloadTemplate = () => {
    downloadStudentBulkTemplate({
      courses,
      paymentPlans,
      tenantName,
      studentIdPrefix,
    });
    pushToast(
      'success',
      `Downloaded official bulk student Excel template with ${activeCourses.length} active courses & ${activePlans.length} payment plans.`
    );
  };

  const handleFileSelected = async (file: File | null) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls') && !lower.endsWith('.csv')) {
      pushToast('error', 'Please upload an Excel (.xlsx, .xls) or CSV (.csv) spreadsheet.');
      return;
    }

    setParsing(true);
    setImportResultBanner(null);
    setProgress(null);
    try {
      const summary = await parseAndValidateBulkStudentFile(file, {
        courses,
        paymentPlans,
        allowDuplicateOverride: isAdmin && allowDuplicateOverride,
      });
      setParseSummary(summary);
      setRows(summary.rows);
      setFilterMode('ALL');
      const readyCount = summary.rows.filter((r) => r.importStatus === 'READY').length;
      const errCount = summary.rows.length - readyCount;
      pushToast(
        errCount === 0 ? 'success' : 'info',
        `Parsed ${summary.totalRows} student row${summary.totalRows === 1 ? '' : 's'} from "${summary.fileName}": ${readyCount} ready, ${errCount} need attention.`
      );
    } catch (err) {
      pushToast(
        'error',
        err instanceof Error ? err.message : 'Unable to parse uploaded Excel workbook.'
      );
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleToggleOverride = (checked: boolean) => {
    setAllowDuplicateOverride(checked);
    setRows((prev) =>
      revalidateAllBulkRows(prev, {
        courses,
        paymentPlans,
        allowDuplicateOverride: isAdmin && checked,
      })
    );
  };

  const handleToggleRowSelected = (rowId: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.rowId === rowId && r.importStatus === 'READY'
          ? { ...r, selected: !r.selected }
          : r
      )
    );
  };

  const handleSelectAllReady = (select: boolean) => {
    setRows((prev) =>
      prev.map((r) =>
        r.importStatus === 'READY' ? { ...r, selected: select } : r
      )
    );
  };

  const handleRemoveRow = (rowId: string) => {
    setRows((prev) =>
      revalidateAllBulkRows(
        prev.filter((r) => r.rowId !== rowId),
        {
          courses,
          paymentPlans,
          allowDuplicateOverride: isAdmin && allowDuplicateOverride,
        }
      )
    );
  };

  const handleResetBatch = () => {
    setParseSummary(null);
    setRows([]);
    setProgress(null);
    setImportResultBanner(null);
    setRowSearch('');
    setFilterMode('ALL');
  };

  const handleSaveEditedRow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRow) return;
    setSavingEdit(true);
    try {
      const liveDup = await checkLiveFirestoreDuplicatesForRow(editingRow);
      const updatedRow: BulkParsedStudentRow = {
        ...editingRow,
        ...liveDup,
        importError: undefined,
        selected: true,
      };
      setRows((prev) =>
        revalidateAllBulkRows(
          prev.map((r) => (r.rowId === updatedRow.rowId ? updatedRow : r)),
          {
            courses,
            paymentPlans,
            allowDuplicateOverride: isAdmin && allowDuplicateOverride,
          }
        )
      );
      setEditingRow(null);
      pushToast('success', `Row #${updatedRow.rowNumber} updated and re-validated.`);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to re-validate row.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleStartImport = async () => {
    if (!effectiveActor || !parseSummary) return;
    if (isTenantSuspended) {
      pushToast('error', 'This institute account is suspended. Imports are disabled.');
      return;
    }
    if (metrics.selectedReady === 0) {
      pushToast('error', 'Select at least one valid student row to import.');
      return;
    }
    if (capacityExceeded) {
      pushToast(
        'error',
        `Selected rows (${metrics.selectedReady}) exceed your remaining SaaS student capacity (${remainingSlots}).`
      );
      return;
    }

    setImporting(true);
    setImportResultBanner(null);
    try {
      const result = await executeBulkStudentImport({
        rows,
        courses,
        paymentPlans,
        existingStudentsCount: students.length,
        actor: effectiveActor,
        fileName: parseSummary.fileName,
        allowDuplicateOverride: isAdmin && allowDuplicateOverride,
        onRowUpdate: (rowId, patch) => {
          setRows((prev) =>
            prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r))
          );
        },
        onProgress: (prog) => setProgress(prog),
      });

      setImportResultBanner(result);
      pushToast(
        result.failed === 0 ? 'success' : 'info',
        `Bulk import finished: ${result.succeeded} student${result.succeeded === 1 ? '' : 's'} registered to Pending Admin Approvals${result.failed > 0 ? `, ${result.failed} failed` : ''}.`
      );
    } catch (err) {
      pushToast(
        'error',
        err instanceof Error ? err.message : 'Bulk student import encountered an error.'
      );
    } finally {
      setImporting(false);
    }
  };

  const progressPct =
    progress && progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {isTenantSuspended && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3 text-xs text-red-800">
          <ShieldAlert className="w-4 h-4 shrink-0 text-[#E51B23]" />
          <span>
            <strong>Institute Suspended:</strong> Bulk student registration imports are locked until this institute subscription is reactivated.
          </span>
        </div>
      )}

      {/* Top Two-Column Step Bar: Step 1 Template + Step 2 Upload */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Step 1: Download Official Template */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#172DEB]">
                Step 1 · Official Schema Template
              </span>
              <span className="font-mono text-[11px] text-slate-500">
                Prefix: {studentIdPrefix}-XXXX
              </span>
            </div>
            <div>
              <h2 className="text-base font-display font-bold text-slate-900">
                Download AI Registration Excel Template
              </h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Pre-configured 3-sheet <span className="font-mono text-slate-800">.xlsx</span> workbook mapped directly to the <span className="font-mono text-slate-800">students</span>, encrypted <span className="font-mono text-slate-800">identity_documents</span> vault, <span className="font-mono text-slate-800">enrollments</span>, and <span className="font-mono text-slate-800">payment_installments</span> collections.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2.5">
                <p className="text-[10px] font-semibold uppercase text-slate-500">Active Courses</p>
                <p className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                  {activeCourses.length}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2.5">
                <p className="text-[10px] font-semibold uppercase text-slate-500">Payment Plans</p>
                <p className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                  {activePlans.length}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2.5">
                <p className="text-[10px] font-semibold uppercase text-slate-500">Student Slots</p>
                <p className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                  {remainingSlots === null ? 'Unlimited' : `${remainingSlots} left`}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-[#0B2545] hover:bg-slate-900 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Official Excel Template (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => setShowSchemaMap((v) => !v)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <Database className="w-3.5 h-3.5 text-[#172DEB]" />
              <span>
                {showSchemaMap
                  ? 'Hide Firestore Schema Mapping Reference'
                  : `View All ${BULK_TEMPLATE_COLUMNS.length} Mapped Schema Columns`}
              </span>
              {showSchemaMap ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Step 2: Upload Completed Spreadsheet */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#172DEB]">
              Step 2 · Upload &amp; Live Schema Validation
            </span>
            <span className="text-[11px] text-slate-500">
              Supports <span className="font-mono">.xlsx</span>, <span className="font-mono">.xls</span>, <span className="font-mono">.csv</span> · Max 500 rows
            </span>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!importing && !parsing) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (importing || parsing) return;
              const file = e.dataTransfer.files?.[0] || null;
              void handleFileSelected(file);
            }}
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
              dragging
                ? 'border-[#172DEB] bg-blue-50/60'
                : 'border-slate-300 hover:border-[#172DEB]/60 bg-slate-50/60'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={parsing || importing || isTenantSuspended}
              onChange={(e) => void handleFileSelected(e.target.files?.[0] || null)}
            />

            {parsing ? (
              <div className="py-4 flex flex-col items-center gap-2.5">
                <Loader2 className="w-7 h-7 text-[#172DEB] animate-spin" />
                <p className="text-xs font-bold text-slate-900">
                  Parsing workbook &amp; running live Firestore duplicate ID checks...
                </p>
                <p className="text-[11px] text-slate-500">
                  Verifying courses, payment plans, SHA-256 ID locks, and transaction references.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2.5">
                <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5 text-[#172DEB]" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    Drop your completed Student Registration spreadsheet here
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Every row is encrypted (AES-256-GCM ID Vault), duplicate-checked, and queued for Admin approval.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={importing || isTenantSuspended}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#172DEB] hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Choose Excel / CSV File
                  </button>
                  {parseSummary && (
                    <button
                      type="button"
                      disabled={importing}
                      onClick={handleResetBatch}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Clear Current Sheet
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-600 pt-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Maker-Checker Enforced: Imported students enter <strong>PENDING</strong> status until approved by an Admin.
              </span>
            </div>

            {isAdmin && (
              <label className="inline-flex items-center gap-2 cursor-pointer select-none text-slate-700 font-semibold">
                <input
                  type="checkbox"
                  checked={allowDuplicateOverride}
                  disabled={importing}
                  onChange={(e) => handleToggleOverride(e.target.checked)}
                  className="rounded border-slate-300 text-[#172DEB] focus:ring-[#172DEB]"
                />
                Admin Override Duplicate IDs
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Collapsible Database Schema Mapping Reference */}
      {showSchemaMap && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Excel-to-Firestore AI Registration Schema Mapping ({BULK_TEMPLATE_COLUMNS.length} Columns)
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Flexible column aliases (e.g., &ldquo;Full Name&rdquo;, &ldquo;Course&rdquo;, &ldquo;ID Number&rdquo;) are automatically recognized during upload.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSchemaMap(false)}
              className="p-1 text-slate-400 hover:text-slate-700 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase bg-white">
                  <th className="py-2.5 px-4">Excel Header</th>
                  <th className="py-2.5 px-4">Required</th>
                  <th className="py-2.5 px-4">Target Firestore Path</th>
                  <th className="py-2.5 px-4">Example</th>
                  <th className="py-2.5 px-4">Validation Rules</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {BULK_TEMPLATE_COLUMNS.map((col) => (
                  <tr key={col.key} className="hover:bg-slate-50/70">
                    <td className="py-2 px-4 font-mono font-semibold text-slate-900">
                      {col.header}
                    </td>
                    <td className="py-2 px-4">
                      {col.required ? (
                        <span className="text-[11px] font-bold text-[#E51B23]">REQUIRED</span>
                      ) : (
                        <span className="text-[11px] text-slate-400">Optional</span>
                      )}
                    </td>
                    <td className="py-2 px-4 font-mono text-[11px] text-[#172DEB]">
                      {col.firestorePath}
                    </td>
                    <td className="py-2 px-4 text-slate-600 font-mono text-[11px]">
                      {col.example || '—'}
                    </td>
                    <td className="py-2 px-4 text-slate-600">{col.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Post-Import Completion Banner */}
      {importResultBanner && (
        <div
          className={`rounded-xl border p-4 flex flex-wrap items-center justify-between gap-4 ${
            importResultBanner.failed === 0
              ? 'border-emerald-200 bg-emerald-50/80'
              : 'border-amber-200 bg-amber-50/80'
          }`}
        >
          <div className="flex items-start gap-3">
            <CheckCircle2
              className={`w-5 h-5 mt-0.5 shrink-0 ${
                importResultBanner.failed === 0 ? 'text-emerald-700' : 'text-amber-700'
              }`}
            />
            <div>
              <p className="text-sm font-bold text-slate-900">
                Bulk Student Import Complete — {importResultBanner.succeeded} Registered
                {importResultBanner.failed > 0 ? `, ${importResultBanner.failed} Failed` : ''}
              </p>
              <p className="text-xs text-slate-700 mt-0.5">
                {importResultBanner.importedCodes.length > 0 && (
                  <>
                    Assigned Institutional IDs:{' '}
                    <span className="font-mono font-semibold text-slate-900">
                      {importResultBanner.importedCodes.length <= 5
                        ? importResultBanner.importedCodes.join(', ')
                        : `${importResultBanner.importedCodes[0]} … ${
                            importResultBanner.importedCodes[
                              importResultBanner.importedCodes.length - 1
                            ]
                          } (${importResultBanner.importedCodes.length} codes)`}
                    </span>
                    .{' '}
                  </>
                )}
                All imported students are encrypted in the ID Vault and queued under Pending Approvals.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                exportBulkImportResultsWorkbook({
                  rows,
                  mode: 'ALL_RESULTS',
                  tenantName,
                })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-emerald-700" />
              Download Results (.xlsx)
            </button>
            <button
              type="button"
              onClick={onOpenPendingApprovals}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#172DEB] hover:bg-blue-800 rounded-lg transition-colors"
            >
              Review Pending Approvals
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Validation Preview, Inline Fix & Batch Execution */}
      {parseSummary && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Header & File Metadata */}
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#172DEB]">
                  Step 3 · Pre-Import Validation &amp; Mapping Review
                </span>
                <span className="text-xs font-mono font-semibold text-slate-700">
                  {parseSummary.fileName}
                </span>
                <span className="text-[11px] text-slate-500">
                  (Sheet: {parseSummary.sheetName} · {parseSummary.recognizedColumns.length} mapped columns)
                </span>
              </div>
              {parseSummary.unrecognizedColumns.length > 0 && (
                <p className="text-[11px] text-amber-700 mt-1">
                  Ignored extra columns: {parseSummary.unrecognizedColumns.slice(0, 6).join(', ')}
                  {parseSummary.unrecognizedColumns.length > 6 ? '...' : ''}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {metrics.invalid > 0 && (
                <button
                  type="button"
                  disabled={importing}
                  onClick={() =>
                    exportBulkImportResultsWorkbook({
                      rows,
                      mode: 'ERRORS_ONLY',
                      tenantName,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#E51B23] bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export {metrics.invalid} Invalid Row{metrics.invalid === 1 ? '' : 's'} (.xlsx)
                </button>
              )}
              {metrics.imported > 0 && (
                <button
                  type="button"
                  disabled={importing}
                  onClick={() =>
                    exportBulkImportResultsWorkbook({
                      rows,
                      mode: 'ALL_RESULTS',
                      tenantName,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Import Results (.xlsx)
                </button>
              )}
            </div>
          </div>

          {/* Summary KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border-b border-slate-200 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
            <div className="p-3.5">
              <p className="text-[11px] font-medium text-slate-500">Total Rows</p>
              <p className="text-lg font-display font-bold text-slate-900 tabular-nums mt-0.5">
                {metrics.total}
              </p>
            </div>
            <div className="p-3.5">
              <p className="text-[11px] font-medium text-slate-500">Ready to Import</p>
              <p className="text-lg font-display font-bold text-emerald-700 tabular-nums mt-0.5">
                {metrics.ready}
              </p>
            </div>
            <div className="p-3.5">
              <p className="text-[11px] font-medium text-slate-500">Selected</p>
              <p className="text-lg font-display font-bold text-[#172DEB] tabular-nums mt-0.5">
                {metrics.selectedReady}
              </p>
            </div>
            <div className="p-3.5">
              <p className="text-[11px] font-medium text-slate-500">Errors / Needs Fix</p>
              <p className="text-lg font-display font-bold text-[#E51B23] tabular-nums mt-0.5">
                {metrics.invalid}
              </p>
            </div>
            <div className="p-3.5">
              <p className="text-[11px] font-medium text-slate-500">Duplicate IDs</p>
              <p className="text-lg font-display font-bold text-amber-700 tabular-nums mt-0.5">
                {metrics.duplicates}
              </p>
            </div>
            <div className="p-3.5">
              <p className="text-[11px] font-medium text-slate-500">Imported</p>
              <p className="text-lg font-display font-bold text-slate-900 tabular-nums mt-0.5">
                {metrics.imported}
              </p>
            </div>
          </div>

          {/* Filter & Batch Controls Toolbar */}
          <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'ALL', label: 'All Rows', count: metrics.total },
                  { id: 'READY', label: 'Ready', count: metrics.ready },
                  { id: 'INVALID', label: 'Needs Fix', count: metrics.invalid },
                  { id: 'WARNINGS', label: 'Warnings', count: metrics.withWarnings },
                  { id: 'IMPORTED', label: 'Imported', count: metrics.imported },
                ] as Array<{ id: FilterMode; label: string; count: number }>
              ).map((tab) => {
                const active = filterMode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterMode(tab.id)}
                    className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      active
                        ? 'bg-[#0B2545] text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label}{' '}
                    <span className="font-mono text-[11px] opacity-80 tabular-nums">
                      ({tab.count})
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={rowSearch}
                onChange={(e) => setRowSearch(e.target.value)}
                placeholder="Filter rows by name, phone, ID, course..."
                className="w-56 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#172DEB]"
              />
              <button
                type="button"
                disabled={importing || metrics.ready === 0}
                onClick={() => handleSelectAllReady(metrics.selectedReady < metrics.ready)}
                className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors"
              >
                {metrics.selectedReady === metrics.ready && metrics.ready > 0
                  ? 'Deselect All'
                  : 'Select All Ready'}
              </button>
            </div>
          </div>

          {/* Capacity Exceeded Warning */}
          {capacityExceeded && (
            <div className="px-5 py-2.5 bg-red-50 border-b border-red-200 flex items-center gap-2 text-xs text-red-800">
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#E51B23]" />
              <span>
                Your SaaS plan allows <strong>{remainingSlots}</strong> more student
                {remainingSlots === 1 ? '' : 's'} (limit {studentLimit}), but{' '}
                <strong>{metrics.selectedReady}</strong> rows are selected. Uncheck extra rows or upgrade your plan.
              </span>
            </div>
          )}

          {/* Live Import Progress Bar */}
          {importing && progress && (
            <div className="px-5 py-3.5 bg-blue-50/70 border-b border-blue-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-semibold text-[#0B2545]">
                  <Loader2 className="w-4 h-4 animate-spin text-[#172DEB]" />
                  <span>
                    Importing {progress.completed} of {progress.total}
                    {progress.currentStudentName
                      ? ` · Row #${progress.currentRowNumber}: ${progress.currentStudentName}`
                      : ''}
                  </span>
                </div>
                <span className="font-mono font-bold text-[#172DEB] tabular-nums">
                  {progressPct}% ({progress.succeeded} ok · {progress.failed} failed)
                </span>
              </div>
              <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#172DEB] transition-all duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Data Preview & Validation Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                  <th className="py-2.5 px-3 w-10 text-center">Sel</th>
                  <th className="py-2.5 px-3">Row / Status</th>
                  <th className="py-2.5 px-3">Student &amp; Contact</th>
                  <th className="py-2.5 px-3">Official ID (Vault)</th>
                  <th className="py-2.5 px-3">Course &amp; Plan</th>
                  <th className="py-2.5 px-3">Initial Payment</th>
                  <th className="py-2.5 px-3">Validation &amp; Mapping Notes</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-500">
                      No rows match the current filter.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const f = row.fields;
                    const initPayNum = Number(f.initialPaymentAmount.replace(/,/g, '').trim() || 0);
                    return (
                      <tr
                        key={row.rowId}
                        className={
                          row.importStatus === 'IMPORTED'
                            ? 'bg-emerald-50/40'
                            : row.importStatus === 'INVALID' || row.importStatus === 'FAILED'
                            ? 'bg-red-50/35'
                            : 'hover:bg-slate-50/70'
                        }
                      >
                        <td className="py-3 px-3 text-center align-top">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            disabled={importing || row.importStatus !== 'READY'}
                            onChange={() => handleToggleRowSelected(row.rowId)}
                            className="mt-0.5 rounded border-slate-300 text-[#172DEB] focus:ring-[#172DEB]"
                          />
                        </td>

                        <td className="py-3 px-3 align-top whitespace-nowrap">
                          <div className="font-mono text-[11px] text-slate-500">
                            Row #{row.rowNumber}
                          </div>
                          {row.importStatus === 'READY' && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              READY
                            </span>
                          )}
                          {row.importStatus === 'INVALID' && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-[#E51B23]">
                              <XCircle className="w-3.5 h-3.5" />
                              NEEDS FIX
                            </span>
                          )}
                          {row.importStatus === 'IMPORTING' && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-[#172DEB]">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              IMPORTING
                            </span>
                          )}
                          {row.importStatus === 'IMPORTED' && (
                            <div className="mt-1 space-y-0.5">
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                IMPORTED
                              </span>
                              {row.assignedStudentCode && (
                                <div className="font-mono text-[11px] font-bold text-[#0B2545]">
                                  {row.assignedStudentCode}
                                </div>
                              )}
                            </div>
                          )}
                          {row.importStatus === 'FAILED' && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-[#E51B23]">
                              <XCircle className="w-3.5 h-3.5" />
                              FAILED
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 align-top min-w-[180px]">
                          <p className="font-bold text-slate-900">
                            {f.fullName || <span className="text-[#E51B23] italic">Missing name</span>}
                          </p>
                          <p className="text-[11px] text-slate-600 font-mono mt-0.5">
                            {f.phone || <span className="text-[#E51B23]">Missing phone</span>}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                            {f.address || <span className="text-[#E51B23]">Missing address</span>}
                          </p>
                          {f.email && (
                            <p className="text-[11px] text-slate-400 truncate max-w-[200px]">
                              {f.email}
                            </p>
                          )}
                        </td>

                        <td className="py-3 px-3 align-top min-w-[165px]">
                          <p className="text-[11px] font-semibold text-slate-700">
                            {ID_DOCUMENT_LABELS[f.idDocumentType]}
                          </p>
                          <p className="font-mono text-xs text-slate-900 mt-0.5">
                            {f.idDocumentNumber || (
                              <span className="text-[#E51B23] italic">Missing ID #</span>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {f.gender} · {f.nationality || 'Ethiopian'}
                            {f.dateOfBirth ? ` · DOB ${f.dateOfBirth}` : ''}
                          </p>
                        </td>

                        <td className="py-3 px-3 align-top min-w-[175px]">
                          <p className="font-semibold text-slate-900">
                            {row.resolvedCourseName || (
                              <span className="text-[#E51B23]">
                                {f.courseInput || 'Missing course'}
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-600 mt-0.5 tabular-nums">
                            Fee:{' '}
                            <span className="font-semibold text-slate-900">
                              {row.resolvedFeeEtb > 0 ? formatEtb(row.resolvedFeeEtb) : '—'}
                            </span>
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Plan: <span className="font-mono font-semibold">{row.resolvedPaymentPlanCode}</span> ·{' '}
                            {f.enrollmentDate || '—'}
                          </p>
                        </td>

                        <td className="py-3 px-3 align-top whitespace-nowrap">
                          {initPayNum > 0 ? (
                            <div>
                              <p className="font-bold text-slate-900 tabular-nums">
                                {formatEtb(initPayNum)}
                              </p>
                              <p className="text-[11px] text-slate-600">{f.initialPaymentMethod}</p>
                              <p className="font-mono text-[11px] text-slate-500">
                                {f.initialTransactionRef || (
                                  <span className="text-[#E51B23]">Missing TxRef</span>
                                )}
                              </p>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">None (0 ETB)</span>
                          )}
                        </td>

                        <td className="py-3 px-3 align-top min-w-[220px]">
                          {row.errors.length === 0 && !row.importError && row.warnings.length === 0 ? (
                            <span className="text-[11px] text-emerald-700 font-medium">
                              Schema valid · Ready for encrypted vault &amp; enrollment
                            </span>
                          ) : (
                            <div className="space-y-1">
                              {row.errors.map((err, i) => (
                                <p key={`e_${i}`} className="text-[11px] text-[#E51B23] font-medium">
                                  • {err}
                                </p>
                              ))}
                              {row.importError && (
                                <p className="text-[11px] text-[#E51B23] font-bold">
                                  • Import error: {row.importError}
                                </p>
                              )}
                              {row.warnings.map((w, i) => (
                                <p key={`w_${i}`} className="text-[11px] text-amber-700 font-medium">
                                  ! {w}
                                </p>
                              ))}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                          {row.importStatus !== 'IMPORTED' && (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                disabled={importing}
                                onClick={() => setEditingRow(row)}
                                title="Edit & fix row inline"
                                className="p-1.5 text-slate-500 hover:text-[#172DEB] hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={importing}
                                onClick={() => handleRemoveRow(row.rowId)}
                                title="Remove row from batch"
                                className="p-1.5 text-slate-500 hover:text-[#E51B23] hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Sticky Footer Action Bar */}
          <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs text-slate-600">
              <span className="font-bold text-slate-900 tabular-nums">{metrics.selectedReady}</span>{' '}
              valid student{metrics.selectedReady === 1 ? '' : 's'} selected for import
              {metrics.invalid > 0 && (
                <span className="text-[#E51B23] ml-2">
                  · {metrics.invalid} row{metrics.invalid === 1 ? '' : 's'} skipped until fixed
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={importing}
                onClick={handleResetBatch}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Reset
              </button>
              <button
                type="button"
                disabled={
                  importing ||
                  isTenantSuspended ||
                  metrics.selectedReady === 0 ||
                  capacityExceeded
                }
                onClick={() => void handleStartImport()}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-[#172DEB] hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importing Students...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Import {metrics.selectedReady} Student{metrics.selectedReady === 1 ? '' : 's'} to AI Registration Queue
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Row Fix Modal */}
      {editingRow && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-display font-bold text-slate-900">
                  Edit &amp; Validate Spreadsheet Row #{editingRow.rowNumber}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Saving re-checks live Firestore duplicate ID locks and payment references immediately.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveEditedRow(e)} className="p-5 space-y-4">
              {editingRow.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
                  <p className="text-[11px] font-bold text-[#E51B23] uppercase">
                    Current Row Errors
                  </p>
                  {editingRow.errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-800">
                      • {err}
                    </p>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <FieldInput
                  label="Full Legal Name *"
                  value={editingRow.fields.fullName}
                  onChange={(v) => updateEditingField(setEditingRow, 'fullName', v)}
                />
                <FieldInput
                  label="Phone Number *"
                  value={editingRow.fields.phone}
                  onChange={(v) => updateEditingField(setEditingRow, 'phone', v)}
                />
                <FieldInput
                  label="Email Address"
                  value={editingRow.fields.email}
                  onChange={(v) => updateEditingField(setEditingRow, 'email', v)}
                />
                <FieldInput
                  label="Residential Address *"
                  value={editingRow.fields.address}
                  onChange={(v) => updateEditingField(setEditingRow, 'address', v)}
                />
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    ID Document Type *
                  </label>
                  <select
                    value={editingRow.fields.idDocumentType}
                    onChange={(e) =>
                      updateEditingField(
                        setEditingRow,
                        'idDocumentType',
                        e.target.value as IdDocumentType
                      )
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#172DEB]"
                  >
                    {ID_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {ID_DOCUMENT_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <FieldInput
                  label="ID Document Number *"
                  value={editingRow.fields.idDocumentNumber}
                  onChange={(v) => updateEditingField(setEditingRow, 'idDocumentNumber', v)}
                />
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Training Course *
                  </label>
                  <select
                    value={editingRow.resolvedCourseId || ''}
                    onChange={(e) => {
                      const c = activeCourses.find((x) => x.id === e.target.value);
                      if (!c) return;
                      setEditingRow((prev) =>
                        prev
                          ? {
                              ...prev,
                              resolvedCourseId: c.id,
                              resolvedCourseName: c.name,
                              fields: { ...prev.fields, courseInput: c.code },
                            }
                          : null
                      );
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#172DEB]"
                  >
                    <option value="">-- Select Active Course --</option>
                    {activeCourses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} · {c.name} ({formatEtb(c.feeEtb)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Payment Plan *
                  </label>
                  <select
                    value={editingRow.resolvedPaymentPlanCode || 'FULL'}
                    onChange={(e) =>
                      updateEditingField(setEditingRow, 'paymentPlanInput', e.target.value)
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#172DEB]"
                  >
                    {activePlans.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.code} · {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <FieldInput
                  label="Enrollment Date (YYYY-MM-DD) *"
                  value={editingRow.fields.enrollmentDate}
                  onChange={(v) => updateEditingField(setEditingRow, 'enrollmentDate', v)}
                />
                <FieldInput
                  label="Agreed Course Fee Override (ETB)"
                  value={editingRow.fields.agreedFeeEtb}
                  placeholder="Leave blank for standard fee"
                  onChange={(v) => updateEditingField(setEditingRow, 'agreedFeeEtb', v)}
                />
                <FieldInput
                  label="Initial Payment Amount (ETB)"
                  value={editingRow.fields.initialPaymentAmount}
                  placeholder="0"
                  onChange={(v) => updateEditingField(setEditingRow, 'initialPaymentAmount', v)}
                />
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Initial Payment Method
                  </label>
                  <select
                    value={editingRow.fields.initialPaymentMethod}
                    onChange={(e) =>
                      updateEditingField(
                        setEditingRow,
                        'initialPaymentMethod',
                        e.target.value as PaymentMethod
                      )
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#172DEB]"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <FieldInput
                  label="Initial Transaction Ref"
                  value={editingRow.fields.initialTransactionRef}
                  placeholder="Required if initial payment > 0"
                  onChange={(v) => updateEditingField(setEditingRow, 'initialTransactionRef', v)}
                />
                <FieldInput
                  label="ID Expiry Date (YYYY-MM-DD)"
                  value={editingRow.fields.idExpiryDate}
                  onChange={(v) => updateEditingField(setEditingRow, 'idExpiryDate', v)}
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#172DEB] hover:bg-blue-800 disabled:opacity-50 rounded-lg"
                >
                  {savingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save &amp; Re-Validate Row
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function updateEditingField<K extends keyof BulkStudentRowFields>(
  setter: React.Dispatch<React.SetStateAction<BulkParsedStudentRow | null>>,
  key: K,
  value: BulkStudentRowFields[K]
) {
  setter((prev) =>
    prev
      ? {
          ...prev,
          fields: {
            ...prev.fields,
            [key]: value,
          },
        }
      : null
  );
}

function FieldInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (val: string) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#172DEB]"
      />
    </div>
  );
}
