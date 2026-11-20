import {
  Course,
  IdDocumentType,
  RoleCode,
  StaffRecord,
  Student,
} from '../types/zacma';
import { STAFF_DEPARTMENTS, STAFF_JOB_POSITIONS } from './registrationService';

export interface ParsedQrIdentity {
  rawText: string;
  format: 'ZACMA_JSON' | 'GENERIC_JSON' | 'VCARD' | 'URL_PARAMS' | 'KEY_VALUE' | 'PLAIN_CODE';
  registrationType?: 'STUDENT' | 'STAFF';
  institutionalCode?: string;
  fullName?: string;
  phone?: string;
  altPhone?: string;
  email?: string;
  dateOfBirth?: string;
  gender?: 'Male' | 'Female' | 'Unspecified';
  nationality?: string;
  address?: string;
  idDocumentType?: IdDocumentType;
  idDocumentNumber?: string;
  idExpiryDate?: string;
  courseHint?: string;
  department?: string;
  jobPosition?: string;
  portalRole?: Exclude<RoleCode, 'STUDENT'>;
  matchedStudent?: Student;
  matchedStaff?: StaffRecord;
  extractedCount: number;
}

function normalizeIsoDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  // YYYYMMDD (common in vCard BDAY)
  const compact = cleaned.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}`;
  }
  const dmy = cleaned.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return undefined;
}

function normalizeGender(raw: string | undefined): 'Male' | 'Female' | 'Unspecified' | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === 'm' || v === 'male' || v === 'ወንድ') return 'Male';
  if (v === 'f' || v === 'female' || v === 'ሴት') return 'Female';
  if (v === 'unspecified' || v === 'other') return 'Unspecified';
  return undefined;
}

function normalizeIdDocType(raw: string | undefined): IdDocumentType | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toUpperCase();
  if (v.includes('FAYDA') || v === 'FAN' || v === 'FIN') return 'ETHIOPIAN_FAYDA_ID';
  if (v.includes('PASSPORT')) return 'PASSPORT';
  if (v.includes('DRIV') || v.includes('LICEN')) return 'DRIVING_LICENCE';
  if (v.includes('NATIONAL') || v.includes('KEBELE') || v === 'ID') return 'NATIONAL_ID';
  return undefined;
}

function normalizePortalRole(raw: string | undefined): Exclude<RoleCode, 'STUDENT'> | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toUpperCase();
  if (v === 'ADMIN' || v === 'ADMINISTRATOR') return 'ADMIN';
  if (v === 'ACCOUNTANT') return 'ACCOUNTANT';
  if (v === 'INSTRUCTOR' || v === 'TEACHER' || v === 'TRAINER') return 'INSTRUCTOR';
  if (v === 'GENERAL_STAFF' || v === 'STAFF' || v === 'RECEPTIONIST') return 'GENERAL_STAFF';
  return undefined;
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string | undefined {
  const lowerMap = new Map<string, unknown>();
  Object.entries(obj).forEach(([k, v]) => {
    lowerMap.set(k.toLowerCase().replace(/[^a-z0-9]/g, ''), v);
  });
  for (const key of keys) {
    const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const val = lowerMap.get(normKey);
    if (typeof val === 'string' && val.trim()) return val.trim();
    if (typeof val === 'number' && Number.isFinite(val)) return String(val);
  }
  return undefined;
}

function countFields(p: Partial<ParsedQrIdentity>): number {
  const keys: Array<keyof ParsedQrIdentity> = [
    'institutionalCode',
    'fullName',
    'phone',
    'email',
    'dateOfBirth',
    'gender',
    'nationality',
    'address',
    'idDocumentNumber',
    'idExpiryDate',
    'courseHint',
    'department',
    'jobPosition',
  ];
  return keys.filter((k) => Boolean(p[k])).length;
}

function applyKeyValueObject(
  obj: Record<string, unknown>,
  base: ParsedQrIdentity
): ParsedQrIdentity {
  const regTypeRaw = pickStr(obj, ['registrationType', 'type', 'kind', 'entityType', 'category']);
  if (regTypeRaw) {
    const upper = regTypeRaw.toUpperCase();
    if (upper.includes('STAFF') || upper.includes('EMP')) base.registrationType = 'STAFF';
    else if (upper.includes('STU') || upper.includes('TRAINEE')) base.registrationType = 'STUDENT';
  }

  const code = pickStr(obj, ['studentCode', 'staffCode', 'institutionalCode', 'zacmaId', 'code']);
  if (code) {
    base.institutionalCode = code.toUpperCase();
    if (!base.registrationType) {
      if (base.institutionalCode.startsWith('ZAC-STA')) base.registrationType = 'STAFF';
      else if (base.institutionalCode.startsWith('ZAC-STU') || base.institutionalCode.startsWith('ZAC-20')) {
        base.registrationType = 'STUDENT';
      }
    }
  }

  const firstName = pickStr(obj, ['firstName', 'givenName']);
  const middleName = pickStr(obj, ['middleName', 'fatherName']);
  const lastName = pickStr(obj, ['lastName', 'surname', 'familyName']);
  const combinedName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim();

  base.fullName =
    pickStr(obj, ['fullName', 'name', 'legalName', 'holderName', 'fn']) ||
    (combinedName || undefined);
  base.phone = pickStr(obj, ['phone', 'phoneNumber', 'mobile', 'tel', 'contact']);
  base.altPhone = pickStr(obj, ['altPhone', 'emergencyPhone', 'guardianPhone']);
  base.email = pickStr(obj, ['email', 'emailAddress', 'mail']);
  base.dateOfBirth = normalizeIsoDate(
    pickStr(obj, ['dateOfBirth', 'dob', 'birthDate', 'bday'])
  );
  base.gender = normalizeGender(pickStr(obj, ['gender', 'sex']));
  base.nationality = pickStr(obj, ['nationality', 'country', 'citizenship']);
  base.address = pickStr(obj, ['address', 'residentialAddress', 'location', 'city', 'region']);

  const fan = pickStr(obj, ['fan', 'fin', 'fcn', 'faydaId', 'faydaNumber']);
  const passport = pickStr(obj, ['passportNumber', 'passportNo', 'passport']);
  const licence = pickStr(obj, ['drivingLicenceNumber', 'licenceNumber', 'licenseNumber']);
  const genericId = pickStr(obj, ['idDocumentNumber', 'documentNumber', 'idNumber', 'nationalId', 'idNo', 'uin']);

  if (fan) {
    base.idDocumentType = 'ETHIOPIAN_FAYDA_ID';
    base.idDocumentNumber = fan;
  } else if (passport) {
    base.idDocumentType = 'PASSPORT';
    base.idDocumentNumber = passport;
  } else if (licence) {
    base.idDocumentType = 'DRIVING_LICENCE';
    base.idDocumentNumber = licence;
  } else if (genericId) {
    base.idDocumentNumber = genericId;
    base.idDocumentType =
      normalizeIdDocType(pickStr(obj, ['idDocumentType', 'documentType', 'idType'])) ||
      (/^\d{12,16}$/.test(genericId.replace(/[\s-]/g, '')) ? 'ETHIOPIAN_FAYDA_ID' : 'NATIONAL_ID');
  } else {
    const explicitType = normalizeIdDocType(
      pickStr(obj, ['idDocumentType', 'documentType', 'idType'])
    );
    if (explicitType) base.idDocumentType = explicitType;
  }

  base.idExpiryDate = normalizeIsoDate(
    pickStr(obj, ['idExpiryDate', 'documentExpiryDate', 'expiryDate', 'exp', 'validUntil'])
  );
  base.courseHint = pickStr(obj, ['course', 'courseName', 'courseCode', 'program', 'track']);

  const dept = pickStr(obj, ['department', 'dept', 'unit', 'org']);
  if (dept) {
    const matchedDept = STAFF_DEPARTMENTS.find(
      (d) => d.toLowerCase() === dept.toLowerCase() || d.toLowerCase().includes(dept.toLowerCase())
    );
    base.department = matchedDept || dept;
  }

  const pos = pickStr(obj, ['jobPosition', 'position', 'title', 'jobTitle']);
  if (pos) {
    const matchedPos = STAFF_JOB_POSITIONS.find(
      (p) => p.toLowerCase() === pos.toLowerCase() || p.toLowerCase().includes(pos.toLowerCase())
    );
    base.jobPosition = matchedPos || pos;
  }

  base.portalRole = normalizePortalRole(pickStr(obj, ['portalRole', 'role', 'accessRole']));
  return base;
}

export function parseQrIdentityPayload(
  rawText: string,
  existingStudents: Student[],
  existingStaff: StaffRecord[]
): ParsedQrIdentity {
  const trimmed = rawText.trim();
  const result: ParsedQrIdentity = {
    rawText: trimmed,
    format: 'PLAIN_CODE',
    extractedCount: 0,
  };

  if (!trimmed) return result;

  // 1. JSON payload (ZACMA QR ID or structured digital ID QR)
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        result.format =
          String(parsed.issuer || '').toUpperCase().includes('ZACMA') ||
          'studentCode' in parsed ||
          'staffCode' in parsed
            ? 'ZACMA_JSON'
            : 'GENERIC_JSON';
        applyKeyValueObject(parsed, result);
      }
    } catch {
      // Fall through to other parsers
    }
  }

  // 2. vCard payload (BEGIN:VCARD)
  if (result.format === 'PLAIN_CODE' && /^BEGIN:VCARD/i.test(trimmed)) {
    result.format = 'VCARD';
    const obj: Record<string, string> = {};
    const lines = trimmed.split(/\r?\n/);
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const rawKey = line.slice(0, idx).split(';')[0].trim().toUpperCase();
      const val = line.slice(idx + 1).trim();
      if (!val) continue;
      if (rawKey === 'FN') obj.fullName = val;
      else if (rawKey === 'TEL' && !obj.phone) obj.phone = val;
      else if (rawKey === 'EMAIL') obj.email = val;
      else if (rawKey === 'BDAY') obj.dateOfBirth = val;
      else if (rawKey === 'ADR') obj.address = val.replace(/;+/g, ', ').replace(/^,\s*|,\s*$/g, '');
      else if (rawKey === 'TITLE') obj.jobPosition = val;
      else if (rawKey === 'ORG') obj.department = val;
      else if (rawKey === 'UID') obj.idNumber = val;
    }
    applyKeyValueObject(obj, result);
  }

  // 3. URL with query parameters (e.g., https://zacma.edu.et/id?name=...&fan=...)
  if (result.format === 'PLAIN_CODE' && /^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const obj: Record<string, string> = {};
      u.searchParams.forEach((v, k) => {
        if (v.trim()) obj[k] = v.trim();
      });
      if (Object.keys(obj).length > 0) {
        result.format = 'URL_PARAMS';
        applyKeyValueObject(obj, result);
      } else {
        const lastSeg = u.pathname.split('/').filter(Boolean).pop() || '';
        if (/^ZAC-(?:STU|STA|\d{4})-\d{4,}$/i.test(lastSeg)) {
          result.institutionalCode = lastSeg.toUpperCase();
        }
      }
    } catch {
      // Ignore invalid URL
    }
  }

  // 4. Key:Value or Key=Value delimited lines / semicolons / pipes
  if (result.format === 'PLAIN_CODE' && /[:=]/.test(trimmed)) {
    const segments = trimmed.split(/[\r\n;|]+/).map((s) => s.trim()).filter(Boolean);
    const obj: Record<string, string> = {};
    let pairsFound = 0;
    for (const seg of segments) {
      const m = seg.match(/^([A-Za-z][A-Za-z0-9 _-]{1,30})\s*[:=]\s*(.+)$/);
      if (m) {
        obj[m[1].trim()] = m[2].trim();
        pairsFound += 1;
      }
    }
    if (pairsFound >= 2 || (pairsFound === 1 && segments.length === 1)) {
      result.format = 'KEY_VALUE';
      applyKeyValueObject(obj, result);
    }
  }

  // 5. Plain Institutional Code or Raw ID Number
  if (result.format === 'PLAIN_CODE') {
    const codeMatch = trimmed.match(/\b(ZAC-(?:STU|STA|\d{4})-\d{4,})\b/i);
    if (codeMatch) {
      result.institutionalCode = codeMatch[1].toUpperCase();
      if (result.institutionalCode.startsWith('ZAC-STA')) result.registrationType = 'STAFF';
      else result.registrationType = 'STUDENT';
    } else if (/^[A-Za-z0-9\-/ ]{5,32}$/.test(trimmed)) {
      const digitsOnly = trimmed.replace(/[\s-]/g, '');
      result.idDocumentNumber = trimmed;
      result.idDocumentType = /^\d{12,16}$/.test(digitsOnly)
        ? 'ETHIOPIAN_FAYDA_ID'
        : /^[A-Z]{1,2}\d{6,9}$/i.test(digitsOnly)
        ? 'PASSPORT'
        : 'NATIONAL_ID';
    }
  }

  // Match against existing ZACMA Student or Staff records if an institutional code was scanned
  if (result.institutionalCode) {
    const codeUpper = result.institutionalCode.toUpperCase();
    const stu = existingStudents.find((s) => s.studentCode.toUpperCase() === codeUpper);
    if (stu) {
      result.matchedStudent = stu;
      result.registrationType = 'STUDENT';
      if (!result.fullName) result.fullName = stu.fullName;
      if (!result.phone) result.phone = stu.phone;
      if (!result.email && stu.email) result.email = stu.email;
      if (!result.dateOfBirth && stu.dateOfBirth) result.dateOfBirth = stu.dateOfBirth;
      if (!result.gender) result.gender = stu.gender;
      if (!result.nationality && stu.nationality) result.nationality = stu.nationality;
      if (!result.address) result.address = stu.address;
      if (!result.idDocumentType && stu.idDocumentType) result.idDocumentType = stu.idDocumentType;
      if (!result.courseHint) result.courseHint = stu.courseName;
    } else {
      const stf = existingStaff.find((s) => s.staffCode.toUpperCase() === codeUpper);
      if (stf) {
        result.matchedStaff = stf;
        result.registrationType = 'STAFF';
        if (!result.fullName) result.fullName = stf.fullName;
        if (!result.phone) result.phone = stf.phone;
        if (!result.email) result.email = stf.email;
        if (!result.dateOfBirth) result.dateOfBirth = stf.dateOfBirth;
        if (!result.gender && stf.gender) result.gender = stf.gender;
        if (!result.nationality) result.nationality = stf.nationality;
        if (!result.address) result.address = stf.address;
        if (!result.idDocumentType) result.idDocumentType = stf.idDocumentType;
        if (!result.department) result.department = stf.department;
        if (!result.jobPosition) result.jobPosition = stf.jobPosition;
        if (!result.portalRole) result.portalRole = stf.portalRole;
      }
    }
  }

  result.extractedCount = countFields(result);
  return result;
}

export function matchCourseFromHint(
  hint: string | undefined,
  activeCourses: Course[]
): Course | undefined {
  if (!hint) return undefined;
  const h = hint.trim().toLowerCase();
  return (
    activeCourses.find((c) => c.code.toLowerCase() === h || c.name.toLowerCase() === h) ||
    activeCourses.find(
      (c) => c.name.toLowerCase().includes(h) || h.includes(c.name.toLowerCase())
    )
  );
}

/**
 * Generates a compact, PII-safe ZACMA QR ID payload suitable for Student or Staff ID cards.
 * Note: Never embeds raw unmasked national ID numbers in public QR badges — uses institutional code + masked ID.
 */
export function buildZacmaQrBadgePayload(
  subject:
    | { kind: 'STUDENT'; student: Student }
    | { kind: 'STAFF'; staff: StaffRecord }
): string {
  if (subject.kind === 'STUDENT') {
    const s = subject.student;
    return JSON.stringify({
      issuer: 'ZACMA_TECH',
      type: 'STUDENT',
      studentCode: s.studentCode,
      fullName: s.fullName,
      phone: s.phone,
      course: s.courseName,
      idType: s.idDocumentType || 'NATIONAL_ID',
      status: s.registrationStatus,
    });
  }
  const st = subject.staff;
  return JSON.stringify({
    issuer: 'ZACMA_TECH',
    type: 'STAFF',
    staffCode: st.staffCode,
    fullName: st.fullName,
    phone: st.phone,
    email: st.email,
    department: st.department,
    jobPosition: st.jobPosition,
    portalRole: st.portalRole,
    idType: st.idDocumentType,
    status: st.registrationStatus,
  });
}
