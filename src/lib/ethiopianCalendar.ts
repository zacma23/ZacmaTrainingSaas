/**
 * ZACMA Technology & Training Institute
 * Dual Calendar Conversion Engine (Gregorian <-> Ethiopian / Ge'ez Calendar)
 *
 * Implements the exact Beyene-Kudlek Julian Day Number (JDN) algorithm
 * with Africa/Addis_Ababa (EAT, UTC+3) timezone support, accurate Ethiopian
 * leap-year handling (Pagume 5 vs 6 days), and bidirectional conversion.
 */

export const ADDIS_ABABA_TZ = 'Africa/Addis_Ababa';

export const ETHIOPIAN_MONTHS = [
  { number: 1, name: 'Meskerem', amharic: 'መስከረም', shortName: 'Mesk' },
  { number: 2, name: 'Tikimt', amharic: 'ጥቅምት', shortName: 'Tik' },
  { number: 3, name: 'Hidar', amharic: 'ኅዳር', shortName: 'Hid' },
  { number: 4, name: 'Tahsas', amharic: 'ታኅሣሥ', shortName: 'Tah' },
  { number: 5, name: 'Tir', amharic: 'ጥር', shortName: 'Tir' },
  { number: 6, name: 'Yekatit', amharic: 'የካቲት', shortName: 'Yek' },
  { number: 7, name: 'Megabit', amharic: 'መጋቢት', shortName: 'Meg' },
  { number: 8, name: 'Miazia', amharic: 'ሚያዝያ', shortName: 'Mia' },
  { number: 9, name: 'Ginbot', amharic: 'ግንቦት', shortName: 'Gin' },
  { number: 10, name: 'Sene', amharic: 'ሰኔ', shortName: 'Sen' },
  { number: 11, name: 'Hamle', amharic: 'ሐምሌ', shortName: 'Ham' },
  { number: 12, name: 'Nehase', amharic: 'ነሐሴ', shortName: 'Neh' },
  { number: 13, name: 'Pagume', amharic: 'ጳጉሜ', shortName: 'Pag' },
] as const;

export const GREGORIAN_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export interface EthiopianDateParts {
  year: number;
  month: number; // 1..13
  day: number; // 1..30 (or 1..5/6 for Pagume)
}

export interface GregorianDateParts {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
}

const JD_EPOCH_OFFSET_AMETE_MIHRET = 1723856;

/**
 * In the Ethiopian calendar, a year is a leap year (Pagume has 6 days)
 * when (year % 4 === 3), e.g., 2015 EC, 2019 EC, 2023 EC.
 */
export function isEthiopianLeapYear(ethiopianYear: number): boolean {
  return ((ethiopianYear % 4) + 4) % 4 === 3;
}

export function getEthiopianMonthDays(ethiopianYear: number, ethiopianMonth: number): number {
  if (ethiopianMonth >= 1 && ethiopianMonth <= 12) return 30;
  if (ethiopianMonth === 13) return isEthiopianLeapYear(ethiopianYear) ? 6 : 5;
  return 30;
}

export function isValidEthiopianDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2200) return false;
  if (month < 1 || month > 13) return false;
  const maxDay = getEthiopianMonthDays(year, month);
  return day >= 1 && day <= maxDay;
}

export function isGregorianLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function getGregorianMonthDays(year: number, month: number): number {
  const days = [31, isGregorianLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1] ?? 30;
}

export function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

export function jdnToGregorian(jdn: number): GregorianDateParts {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

export function ethiopianToJdn(year: number, month: number, day: number): number {
  return (
    JD_EPOCH_OFFSET_AMETE_MIHRET +
    365 +
    365 * (year - 1) +
    Math.floor(year / 4) +
    30 * (month - 1) +
    (day - 1)
  );
}

export function jdnToEthiopian(jdn: number): EthiopianDateParts {
  const r = (jdn - JD_EPOCH_OFFSET_AMETE_MIHRET) % 1461;
  const normalizedR = r < 0 ? r + 1461 : r;
  const n = (normalizedR % 365) + 365 * Math.floor(normalizedR / 1460);
  const year =
    4 * Math.floor((jdn - JD_EPOCH_OFFSET_AMETE_MIHRET) / 1461) +
    Math.floor(normalizedR / 365) -
    Math.floor(normalizedR / 1460);
  const month = Math.floor(n / 30) + 1;
  const day = (n % 30) + 1;
  return { year, month, day };
}

/**
 * Parse a YYYY-MM-DD string or ISO timestamp into GregorianDateParts in Africa/Addis_Ababa timezone.
 */
export function parseIsoToGregorianParts(isoOrDate: string | undefined): GregorianDateParts | null {
  if (!isoOrDate) return null;
  const dateOnlyMatch = isoOrDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= getGregorianMonthDays(year, month)) {
      return { year, month, day };
    }
    return null;
  }

  const parsed = new Date(isoOrDate);
  if (Number.isNaN(parsed.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ADDIS_ABABA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(parsed);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const d = Number(parts.find((p) => p.type === 'day')?.value);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return { year: y, month: m, day: d };
}

export function gregorianPartsToIso(parts: GregorianDateParts): string {
  const y = String(parts.year).padStart(4, '0');
  const m = String(parts.month).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function gregorianIsoToEthiopian(isoOrDate: string | undefined): EthiopianDateParts | null {
  const g = parseIsoToGregorianParts(isoOrDate);
  if (!g) return null;
  const jdn = gregorianToJdn(g.year, g.month, g.day);
  return jdnToEthiopian(jdn);
}

export function ethiopianToGregorianIso(year: number, month: number, day: number): string | null {
  if (!isValidEthiopianDate(year, month, day)) return null;
  const jdn = ethiopianToJdn(year, month, day);
  const g = jdnToGregorian(jdn);
  return gregorianPartsToIso(g);
}

export function formatGregorianDate(isoOrDate: string | undefined, compact = false): string {
  const g = parseIsoToGregorianParts(isoOrDate);
  if (!g) return isoOrDate || '—';
  const monthName = GREGORIAN_MONTHS[g.month - 1] || '';
  if (compact) {
    return `${g.day} ${monthName.slice(0, 3)} ${g.year}`;
  }
  return `${g.day} ${monthName} ${g.year}`;
}

export function formatEthiopianDate(
  input: string | EthiopianDateParts | undefined,
  compact = false
): string {
  if (!input) return '—';
  const ec = typeof input === 'string' ? gregorianIsoToEthiopian(input) : input;
  if (!ec) return typeof input === 'string' ? input : '—';
  const m = ETHIOPIAN_MONTHS[ec.month - 1];
  if (!m) return `${ec.day}/${ec.month}/${ec.year}`;
  return compact ? `${ec.day} ${m.shortName} ${ec.year}` : `${ec.day} ${m.name} ${ec.year}`;
}

export function formatEthiopianIso(ec: EthiopianDateParts): string {
  return `${String(ec.year).padStart(4, '0')}-${String(ec.month).padStart(2, '0')}-${String(ec.day).padStart(2, '0')}`;
}

export function formatDualDate(isoOrDate: string | undefined, compact = false): {
  gregorian: string;
  ethiopian: string;
  ethiopianParts: EthiopianDateParts | null;
} {
  const ec = gregorianIsoToEthiopian(isoOrDate);
  return {
    gregorian: formatGregorianDate(isoOrDate, compact),
    ethiopian: ec ? formatEthiopianDate(ec, compact) : '—',
    ethiopianParts: ec,
  };
}

/**
 * Returns today's date in YYYY-MM-DD strictly in Africa/Addis_Ababa timezone.
 */
export function todayAddisIsoDate(): string {
  const parts = parseIsoToGregorianParts(new Date().toISOString());
  if (!parts) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  return gregorianPartsToIso(parts);
}

/**
 * Returns formatted local time in Africa/Addis_Ababa (e.g., "02:45 PM EAT").
 */
export function formatAddisTime(isoTimestamp?: string): string {
  const date = isoTimestamp ? new Date(isoTimestamp) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const timeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: ADDIS_ABABA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
  return `${timeStr} EAT`;
}

/**
 * Returns dual-calendar timestamp suitable for messages, audit records, and SMS history.
 */
export function formatAddisDateTimeDual(isoTimestamp: string | undefined): string {
  if (!isoTimestamp) return '—';
  const dual = formatDualDate(isoTimestamp, true);
  const t = formatAddisTime(isoTimestamp);
  return `${dual.gregorian} (${dual.ethiopian} E.C.) · ${t}`;
}
