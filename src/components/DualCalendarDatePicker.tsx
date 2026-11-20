import React, { useMemo, useState } from 'react';
import { Calendar, ArrowLeftRight } from 'lucide-react';
import {
  ETHIOPIAN_MONTHS,
  ethiopianToGregorianIso,
  formatDualDate,
  getEthiopianMonthDays,
  gregorianIsoToEthiopian,
  isEthiopianLeapYear,
  todayAddisIsoDate,
} from '../lib/ethiopianCalendar';

interface DualCalendarDatePickerProps {
  /** Always stored and emitted as standard Gregorian YYYY-MM-DD */
  value: string;
  onChange: (gregorianIso: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  helperText?: string;
}

/**
 * Bidirectional Gregorian <-> Ethiopian (Ge'ez) calendar date picker.
 * Users can pick a date in EITHER calendar; the equivalent date in the
 * other calendar is calculated and shown live using Africa/Addis_Ababa rules.
 */
export function DualCalendarDatePicker({
  value,
  onChange,
  label = 'Date (Gregorian & Ethiopian Calendar)',
  required = false,
  disabled = false,
  id,
  helperText,
}: DualCalendarDatePickerProps) {
  const [inputMode, setInputMode] = useState<'GREGORIAN' | 'ETHIOPIAN'>('GREGORIAN');

  const safeIso = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayAddisIsoDate();
  const dual = useMemo(() => formatDualDate(safeIso, false), [safeIso]);
  const ethParts = useMemo(
    () => gregorianIsoToEthiopian(safeIso) ?? { year: 2019, month: 1, day: 1 },
    [safeIso]
  );

  const ethYearOptions = useMemo(() => {
    const base = ethParts.year;
    const years: number[] = [];
    for (let y = base - 10; y <= base + 5; y++) {
      years.push(y);
    }
    return years;
  }, [ethParts.year]);

  const maxEthDays = getEthiopianMonthDays(ethParts.year, ethParts.month);
  const ethDayOptions = useMemo(
    () => Array.from({ length: maxEthDays }, (_, idx) => idx + 1),
    [maxEthDays]
  );

  const handleEthiopianChange = (nextYear: number, nextMonth: number, nextDay: number) => {
    const clampedDay = Math.min(nextDay, getEthiopianMonthDays(nextYear, nextMonth));
    const converted = ethiopianToGregorianIso(nextYear, nextMonth, clampedDay);
    if (converted) {
      onChange(converted);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
        >
          <Calendar className="w-3.5 h-3.5 text-[#172DEB]" />
          <span>{label}</span>
          {required && <span className="text-[#E51B23]">*</span>}
        </label>

        <div
          className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold"
          role="group"
          aria-label="Select calendar entry mode"
        >
          <button
            type="button"
            disabled={disabled}
            onClick={() => setInputMode('GREGORIAN')}
            className={`px-2 py-0.5 rounded-md transition ${
              inputMode === 'GREGORIAN'
                ? 'bg-[#172DEB] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Gregorian
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setInputMode('ETHIOPIAN')}
            className={`px-2 py-0.5 rounded-md transition ${
              inputMode === 'ETHIOPIAN'
                ? 'bg-[#172DEB] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Ethiopian (E.C.)
          </button>
        </div>
      </div>

      {inputMode === 'GREGORIAN' ? (
        <input
          id={id}
          type="date"
          required={required}
          disabled={disabled}
          value={safeIso}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#172DEB]/20 focus:border-[#172DEB]"
        />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <select
            aria-label="Ethiopian Day"
            disabled={disabled}
            value={ethParts.day}
            onChange={(e) =>
              handleEthiopianChange(ethParts.year, ethParts.month, Number(e.target.value))
            }
            className="px-2.5 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#172DEB]/20 focus:border-[#172DEB]"
          >
            {ethDayOptions.map((d) => (
              <option key={d} value={d}>
                Day {d}
              </option>
            ))}
          </select>

          <select
            aria-label="Ethiopian Month"
            disabled={disabled}
            value={ethParts.month}
            onChange={(e) =>
              handleEthiopianChange(ethParts.year, Number(e.target.value), ethParts.day)
            }
            className="px-2.5 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#172DEB]/20 focus:border-[#172DEB]"
          >
            {ETHIOPIAN_MONTHS.map((m) => (
              <option key={m.number} value={m.number}>
                {m.name} ({m.amharic})
              </option>
            ))}
          </select>

          <select
            aria-label="Ethiopian Year"
            disabled={disabled}
            value={ethParts.year}
            onChange={(e) =>
              handleEthiopianChange(Number(e.target.value), ethParts.month, ethParts.day)
            }
            className="px-2.5 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#172DEB]/20 focus:border-[#172DEB]"
          >
            {ethYearOptions.map((y) => (
              <option key={y} value={y}>
                {y} E.C.{isEthiopianLeapYear(y) ? ' (Leap)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Live synchronized dual-calendar display */}
      <div className="rounded-lg border border-slate-200 bg-[#F5F7FC] px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-slate-700">
          <span className="font-semibold text-slate-500 uppercase text-[10px] tracking-wider">
            Gregorian
          </span>
          <span className="font-semibold text-slate-900 tabular-nums">{dual.gregorian}</span>
        </div>
        <ArrowLeftRight className="w-3.5 h-3.5 text-[#172DEB] hidden sm:block shrink-0" />
        <div className="flex items-center gap-2 text-slate-700">
          <span className="font-semibold text-[#172DEB] uppercase text-[10px] tracking-wider">
            Ethiopian
          </span>
          <span className="font-semibold text-slate-900 tabular-nums">
            {dual.ethiopian} E.C.
          </span>
        </div>
      </div>

      {helperText && <p className="text-[11px] text-slate-500">{helperText}</p>}
    </div>
  );
}

interface DualDateDisplayProps {
  isoDate: string | undefined;
  ethiopianOverride?: string;
  timeEat?: string;
  compact?: boolean;
  inline?: boolean;
  className?: string;
}

/**
 * Displays both Gregorian and Ethiopian dates simultaneously for tables,
 * student profiles, receipts, and payment histories.
 */
export function DualDateDisplay({
  isoDate,
  ethiopianOverride,
  timeEat,
  compact = true,
  inline = false,
  className = '',
}: DualDateDisplayProps) {
  const dual = useMemo(() => formatDualDate(isoDate, compact), [isoDate, compact]);
  if (!isoDate) return <span className="text-slate-400">—</span>;
  const ethText = ethiopianOverride || dual.ethiopian;

  if (inline) {
    return (
      <span className={`tabular-nums ${className}`}>
        <span className="font-medium text-slate-900">{dual.gregorian}</span>
        <span className="text-slate-400 mx-1">·</span>
        <span className="text-[#172DEB] font-medium">{ethText} E.C.</span>
        {timeEat && <span className="text-slate-500 ml-1">({timeEat})</span>}
      </span>
    );
  }

  return (
    <div className={`leading-tight tabular-nums ${className}`}>
      <div className="font-medium text-slate-900">{dual.gregorian}</div>
      <div className="text-[11px] text-[#172DEB] font-medium">
        {ethText} E.C.{timeEat ? ` · ${timeEat}` : ''}
      </div>
    </div>
  );
}
