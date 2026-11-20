import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db, handleFirestoreError, OperationType } from './firebase';
import { formatAddisTime, formatEthiopianDate } from './ethiopianCalendar';
import { triggerAutomatedEventSms } from './communicationService';
import type { ActorContext } from './zacmaService';
import {
  addDaysIso,
  Course,
  DecryptedIdVaultPayload,
  IdDocumentType,
  IdentityDocumentRecord,
  PaymentMethod,
  PaymentPlan,
  RoleCode,
  sanitizeRefId,
  StaffCompensation,
  StaffRecord,
  Student,
  todayIsoDate,
} from '../types/zacma';

// ---------------------------------------------------------------------------
// Canonical 18 ZACMA Technology Courses (Additive Sync — Preserves Existing)
// ---------------------------------------------------------------------------
export const CANONICAL_ZACMA_COURSES: Array<{
  id: string;
  code: string;
  name: string;
  category: string;
  durationWeeks: number;
  feeEtb: number;
  schedule: string;
  description: string;
}> = [
  {
    id: 'crs_graphics',
    code: 'ZAC-GD102',
    name: 'Graphics Design',
    category: 'Creative & Design',
    durationWeeks: 12,
    feeEtb: 16000,
    schedule: 'Tue, Thu, Sat · 14:00–17:00',
    description: 'Brand identity, layout systems, typography, Photoshop, Illustrator, and commercial print & digital portfolio.',
  },
  {
    id: 'crs_comp_maint',
    code: 'ZAC-CM105',
    name: 'Computer Maintenance',
    category: 'Hardware & Systems',
    durationWeeks: 10,
    feeEtb: 14500,
    schedule: 'Tue, Thu · 09:00–12:00',
    description: 'PC hardware diagnostics, motherboard troubleshooting, OS deployment, and workstation repair.',
  },
  {
    id: 'crs_mobile_maint',
    code: 'ZAC-MM108',
    name: 'Mobile Maintenance',
    category: 'Hardware & Systems',
    durationWeeks: 10,
    feeEtb: 15000,
    schedule: 'Mon, Wed, Fri · 14:00–17:00',
    description: 'Smartphone micro-soldering, schematic diagnostics, screen/IC replacement, and firmware flashing.',
  },
  {
    id: 'crs_digital_mkt',
    code: 'ZAC-DM103',
    name: 'Digital Marketing',
    category: 'Business & Growth',
    durationWeeks: 8,
    feeEtb: 12000,
    schedule: 'Mon, Wed · 17:30–19:30',
    description: 'Social media growth, SEO, paid campaign analytics, content strategy, and conversion copywriting.',
  },
  {
    id: 'crs_ai',
    code: 'ZAC-AI201',
    name: 'Artificial Intelligence (AI)',
    category: 'AI & Data',
    durationWeeks: 16,
    feeEtb: 28000,
    schedule: 'Mon, Wed, Fri · 09:00–12:00',
    description: 'Applied machine learning, neural networks, generative AI workflows, prompt engineering, and model deployment.',
  },
  {
    id: 'crs_cloud',
    code: 'ZAC-CC202',
    name: 'Cloud Computing',
    category: 'Cloud & Infrastructure',
    durationWeeks: 14,
    feeEtb: 25000,
    schedule: 'Tue, Thu, Sat · 09:00–12:00',
    description: 'Cloud architecture on GCP, AWS, and Azure, serverless APIs, IAM security, and scalable deployments.',
  },
  {
    id: 'crs_robotics',
    code: 'ZAC-RB203',
    name: 'Robotics',
    category: 'Engineering & Robotics',
    durationWeeks: 16,
    feeEtb: 27000,
    schedule: 'Sat, Sun · 09:00–13:00',
    description: 'Embedded microcontrollers, sensors, actuators, autonomous control logic, and robotic prototyping.',
  },
  {
    id: 'crs_data_science',
    code: 'ZAC-DS204',
    name: 'Data Science',
    category: 'AI & Data',
    durationWeeks: 16,
    feeEtb: 26000,
    schedule: 'Mon, Wed, Fri · 17:30–20:00',
    description: 'Python analytics, statistical modeling, data visualization, predictive analytics, and business intelligence.',
  },
  {
    id: 'crs_db_mgmt',
    code: 'ZAC-DB205',
    name: 'Database Management',
    category: 'Software Engineering',
    durationWeeks: 12,
    feeEtb: 18500,
    schedule: 'Tue, Thu · 17:30–20:00',
    description: 'Relational SQL (PostgreSQL, MySQL), NoSQL (Firestore, MongoDB), indexing, backups, and security.',
  },
  {
    id: 'crs_devops',
    code: 'ZAC-DO206',
    name: 'DevOps',
    category: 'Cloud & Infrastructure',
    durationWeeks: 14,
    feeEtb: 25500,
    schedule: 'Mon, Wed, Fri · 18:00–20:00',
    description: 'CI/CD pipelines, Docker, Kubernetes, Linux automation, observability, and Infrastructure as Code.',
  },
  {
    id: 'crs_help_desk',
    code: 'ZAC-HD109',
    name: 'IT Help Desk',
    category: 'Hardware & Systems',
    durationWeeks: 8,
    feeEtb: 11500,
    schedule: 'Mon, Wed · 09:00–12:00',
    description: 'Enterprise ticketing, end-user troubleshooting, Active Directory, SLA management, and ITIL foundations.',
  },
  {
    id: 'crs_mobile_dev',
    code: 'ZAC-MD207',
    name: 'Mobile Development',
    category: 'Software Engineering',
    durationWeeks: 16,
    feeEtb: 25000,
    schedule: 'Tue, Thu, Sat · 14:00–17:00',
    description: 'Cross-platform Android & iOS app engineering with Flutter and React Native, APIs, and store publishing.',
  },
  {
    id: 'crs_net_sys_admin',
    code: 'ZAC-NS208',
    name: 'Network and System Administration',
    category: 'Cloud & Infrastructure',
    durationWeeks: 14,
    feeEtb: 22000,
    schedule: 'Mon, Wed, Fri · 14:00–17:00',
    description: 'TCP/IP routing, switching, firewall hardening, Linux & Windows Server administration, and VPNs.',
  },
  {
    id: 'crs_soft_dev',
    code: 'ZAC-SD209',
    name: 'Software Development',
    category: 'Software Engineering',
    durationWeeks: 18,
    feeEtb: 26500,
    schedule: 'Mon, Wed, Fri · 09:00–12:00',
    description: 'Full-stack software engineering, algorithms, TypeScript/Python, API architecture, testing, and Git workflows.',
  },
  {
    id: 'crs_blockchain',
    code: 'ZAC-BC210',
    name: 'Blockchain',
    category: 'Emerging Tech',
    durationWeeks: 12,
    feeEtb: 23000,
    schedule: 'Sat, Sun · 14:00–17:30',
    description: 'Distributed ledgers, smart contract architecture, cryptographic hashing, and decentralized application design.',
  },
  {
    id: 'crs_crypto',
    code: 'ZAC-CR211',
    name: 'Cryptocurrency',
    category: 'Emerging Tech',
    durationWeeks: 8,
    feeEtb: 15500,
    schedule: 'Tue, Thu · 18:00–20:00',
    description: 'Digital asset fundamentals, wallet security, custody risk management, tokenomics, and regulatory literacy.',
  },
  {
    id: 'crs_ar_vr',
    code: 'ZAC-XR212',
    name: 'Augmented Reality and Virtual Reality',
    category: 'Emerging Tech',
    durationWeeks: 14,
    feeEtb: 24500,
    schedule: 'Sat, Sun · 09:00–12:30',
    description: 'Spatial 3D design, interactive AR/VR experiences, Unity/WebXR prototyping, and immersive simulations.',
  },
  {
    id: 'crs_dropshipping',
    code: 'ZAC-DR110',
    name: 'Dropshipping',
    category: 'Business & Growth',
    durationWeeks: 6,
    feeEtb: 11000,
    schedule: 'Tue, Thu · 14:00–16:30',
    description: 'E-commerce storefront launch, supplier vetting, global fulfillment logistics, and paid conversion funnels.',
  },
];

export const STAFF_JOB_POSITIONS = [
  'Accountant',
  'Instructor',
  'Receptionist',
  'Digital Marketer',
  'IT Support Staff',
  'Manager',
  'Other Employee',
] as const;

export const STAFF_DEPARTMENTS = [
  'Finance & Accounting',
  'Academic & Training',
  'Admissions & Front Desk',
  'Digital Marketing & Growth',
  'IT Support & Infrastructure',
  'Executive Management',
  'Campus Operations',
] as const;

export const ID_DOCUMENT_LABELS: Record<IdDocumentType, string> = {
  ETHIOPIAN_FAYDA_ID: 'Ethiopian Fayda National ID',
  NATIONAL_ID: 'National ID / Kebele ID',
  PASSPORT: 'Passport',
  DRIVING_LICENCE: 'Driving Licence',
};

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

function cleanObject<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== '') {
      out[k] = v;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cryptographic Hashing, Masking & AES-256-GCM Encryption at Rest
// ---------------------------------------------------------------------------

export function normalizeIdNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s\-_/]+/g, '');
}

export function maskIdNumber(raw: string): string {
  const cleaned = raw.trim();
  if (!cleaned) return '';
  if (cleaned.length <= 4) return '****';
  return `${'*'.repeat(Math.min(8, cleaned.length - 4))}${cleaned.slice(-4)}`;
}

export async function hashIdNumber(docType: IdDocumentType, rawIdNumber: string): Promise<string> {
  const normalized = `${docType}:${normalizeIdNumber(rawIdNumber)}`;
  const data = new TextEncoder().encode(`ZACMA_ID_HASH_V1|${normalized}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function makeIdLockDocId(idNumberHash: string): string {
  return `idlock_${idNumberHash.slice(0, 32)}`;
}

async function deriveVaultKey(subjectId: string): Promise<CryptoKey> {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
  const pepper = env.VITE_ZACMA_VAULT_PEPPER || 'ZACMA_TECH_INSTITUTE_ID_VAULT_2026_AES256';
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${pepper}::${subjectId}`),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(`zacma-id-vault-salt-${subjectId}`),
      iterations: 60000,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encryptIdVaultPayload(
  subjectId: string,
  payload: DecryptedIdVaultPayload
): Promise<{ encryptedPayload: string; encryptionIv: string }> {
  const key = await deriveVaultKey(subjectId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    encryptedPayload: bytesToBase64(new Uint8Array(cipherBuffer)),
    encryptionIv: bytesToBase64(iv),
  };
}

export async function decryptIdVaultPayload(
  subjectId: string,
  encryptedPayload: string,
  encryptionIv: string
): Promise<DecryptedIdVaultPayload> {
  const key = await deriveVaultKey(subjectId);
  const iv = base64ToBytes(encryptionIv);
  const cipherBytes = base64ToBytes(encryptedPayload);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    cipherBytes as BufferSource
  );
  const jsonText = new TextDecoder().decode(plainBuffer);
  return JSON.parse(jsonText) as DecryptedIdVaultPayload;
}

// ---------------------------------------------------------------------------
// Client-side Image Compression & Portrait Cropping Utilities
// ---------------------------------------------------------------------------

export async function compressDocumentImage(
  fileOrDataUrl: File | string,
  maxDimension = 1150,
  quality = 0.78
): Promise<{ dataUrl: string; mimeType: string }> {
  let sourceUrl: string;
  let originalMime = 'image/jpeg';

  if (typeof fileOrDataUrl === 'string') {
    sourceUrl = fileOrDataUrl;
    const match = fileOrDataUrl.match(/^data:([^;]+);base64,/);
    if (match) originalMime = match[1];
  } else {
    originalMime = fileOrDataUrl.type || 'image/jpeg';
    sourceUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Failed to read selected file.'));
      reader.readAsDataURL(fileOrDataUrl);
    });
  }

  // Return PDF directly (with size guard handled by caller)
  if (originalMime === 'application/pdf' || sourceUrl.startsWith('data:application/pdf')) {
    return { dataUrl: sourceUrl, mimeType: 'application/pdf' };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * ratio));
      const h = Math.max(1, Math.round(img.height * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context unavailable.'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', quality),
        mimeType: 'image/jpeg',
      });
    };
    img.onerror = () => reject(new Error('Invalid image file.'));
    img.src = sourceUrl;
  });
}

export async function cropPortraitFromDocument(
  imageDataUrl: string,
  box: { ymin: number; xmin: number; ymax: number; xmax: number }
): Promise<string | null> {
  if (!imageDataUrl.startsWith('data:image/')) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const padX = Math.round(((box.xmax - box.xmin) * 0.08 * img.width) / 1000);
        const padY = Math.round(((box.ymax - box.ymin) * 0.08 * img.height) / 1000);
        const sx = Math.max(0, Math.round((box.xmin * img.width) / 1000) - padX);
        const sy = Math.max(0, Math.round((box.ymin * img.height) / 1000) - padY);
        const ex = Math.min(img.width, Math.round((box.xmax * img.width) / 1000) + padX);
        const ey = Math.min(img.height, Math.round((box.ymax * img.height) / 1000) + padY);
        const sw = Math.max(24, ex - sx);
        const sh = Math.max(24, ey - sy);

        const targetSize = 240;
        const scale = Math.min(1, targetSize / Math.max(sw, sh));
        const cw = Math.max(24, Math.round(sw * scale));
        const ch = Math.max(24, Math.round(sh * scale));

        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageDataUrl;
  });
}

// ---------------------------------------------------------------------------
// Idempotent Sync of All 18 Required ZACMA Courses
// ---------------------------------------------------------------------------

export async function ensureCanonicalZacmaCourses(
  existingCourses: Course[],
  actor: ActorContext
): Promise<number> {
  if (actor.role !== 'ADMIN') return 0;
  const existingNames = new Set(existingCourses.map((c) => c.name.trim().toLowerCase()));
  const existingIds = new Set(existingCourses.map((c) => c.id));
  const missing = CANONICAL_ZACMA_COURSES.filter(
    (c) => !existingIds.has(c.id) && !existingNames.has(c.name.trim().toLowerCase())
  );
  if (missing.length === 0) return 0;

  const now = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    for (const c of missing) {
      const { id, ...data } = c;
      batch.set(doc(db, 'courses', id), {
        ...data,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    batch.set(doc(db, 'audit_logs', makeId('aud_crs_sync')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'COURSES_CATALOG_SYNCED',
      entityType: 'course',
      entityId: 'canonical_18',
      summary: `Synchronized ${missing.length} ZACMA Technology courses into dynamic catalog (${missing.map((m) => m.name).slice(0, 4).join(', ')}${missing.length > 4 ? '...' : ''}).`,
      createdAt: now,
    });
    await batch.commit();
    return missing.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'courses');
  }
}

// ---------------------------------------------------------------------------
// Duplicate ID Number Check (Real-Time + Pre-Submit)
// ---------------------------------------------------------------------------

export interface DuplicateIdCheckResult {
  isDuplicate: boolean;
  existingSubjectType?: 'STUDENT' | 'STAFF';
  existingSubjectCode?: string;
  existingSubjectName?: string;
  idNumberHash: string;
}

export async function checkDuplicateIdNumber(
  docType: IdDocumentType,
  rawIdNumber: string
): Promise<DuplicateIdCheckResult> {
  const idNumberHash = await hashIdNumber(docType, rawIdNumber);
  const lockId = makeIdLockDocId(idNumberHash);
  try {
    const snap = await getDoc(doc(db, 'id_number_locks', lockId));
    if (snap.exists()) {
      const d = snap.data();
      return {
        isDuplicate: true,
        existingSubjectType: d.subjectType as 'STUDENT' | 'STAFF',
        existingSubjectCode: String(d.subjectCode || ''),
        existingSubjectName: String(d.subjectName || ''),
        idNumberHash,
      };
    }
    return { isDuplicate: false, idNumberHash };
  } catch {
    return { isDuplicate: false, idNumberHash };
  }
}

// ---------------------------------------------------------------------------
// Concurrency-Safe Atomic Sequential ID Generation (ZAC-STU-XXXX / ZAC-STA-XXXX)
// ---------------------------------------------------------------------------

export async function allocateAtomicInstitutionalCode(
  kind: 'STUDENT' | 'STAFF',
  existingCountHint: number,
  actor: ActorContext
): Promise<string> {
  const tenantId = actor.tenantId || 'zacma_default';
  const counterDocId =
    tenantId === 'zacma_default'
      ? kind === 'STUDENT'
        ? 'student_seq'
        : 'staff_seq'
      : `${tenantId}_${kind === 'STUDENT' ? 'student_seq' : 'staff_seq'}`;
  const rawPrefix =
    kind === 'STUDENT'
      ? actor.studentIdPrefix || 'ZAC-STU'
      : actor.staffIdPrefix || 'ZAC-STA';
  const prefix = rawPrefix.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').replace(/-+$/, '') || (kind === 'STUDENT' ? 'ZAC-STU' : 'ZAC-STA');
  const counterRef = doc(db, 'id_counters', counterDocId);
  const now = new Date().toISOString();

  try {
    const nextValue = await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      if (snap.exists()) {
        const cur = Number(snap.data().currentValue || 0);
        const next = cur + 1;
        tx.update(counterRef, {
          tenantId,
          prefix,
          currentValue: next,
          updatedBy: actor.uid,
          updatedAt: now,
        });
        return next;
      } else {
        const start = Math.max(1, existingCountHint + 1);
        tx.set(counterRef, {
          tenantId,
          prefix,
          currentValue: start,
          updatedBy: actor.uid,
          updatedAt: now,
        });
        return start;
      }
    });

    return `${prefix}-${String(nextValue).padStart(4, '0')}`;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `id_counters/${counterDocId}`);
  }
}

// ---------------------------------------------------------------------------
// AI-Assisted Student Registration (Atomic Code + Encrypted ID Vault + Plan)
// ---------------------------------------------------------------------------

export interface AiStudentRegistrationInput {
  fullName: string;
  address: string;
  phone: string;
  altPhone?: string;
  email?: string;
  dateOfBirth?: string;
  gender: 'Male' | 'Female' | 'Unspecified';
  nationality?: string;
  idDocumentType: IdDocumentType;
  idDocumentNumber: string;
  idExpiryDate?: string;
  course: Course;
  agreedFeeEtb?: number;
  enrollmentDate: string;
  paymentPlan: PaymentPlan;
  customInstallments?: number;
  customIntervalDays?: number;
  initialPaymentAmount?: number;
  initialPaymentMethod?: PaymentMethod;
  initialTransactionRef?: string;
  photoUrl?: string;
  frontDocumentDataUrl?: string;
  backDocumentDataUrl?: string;
  fileMimeType?: string;
  ocrConfidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'MANUAL';
  ocrWarnings?: string[];
  ocrSummary?: string;
  allowDuplicateOverride?: boolean;
  suppressIndividualNotification?: boolean;
}

export async function submitAiStudentRegistration(
  input: AiStudentRegistrationInput,
  existingStudentsCount: number,
  actor: ActorContext
): Promise<{ studentId: string; studentCode: string; vaultId?: string }> {
  if (actor.tenantStatus === 'SUSPENDED') {
    throw new Error('This institute account is currently SUSPENDED. Contact ZACMA Platform Support.');
  }
  if (actor.studentLimit && actor.studentLimit > 0 && existingStudentsCount >= actor.studentLimit) {
    throw new Error(
      `Student limit (${actor.studentLimit}) reached for your current SaaS subscription plan. Please upgrade to register more students.`
    );
  }
  const tenantId = actor.tenantId || 'zacma_default';
  const now = new Date().toISOString();
  const studentId = makeId('stu');
  const enrollmentId = makeId('enr');

  const trimmedIdNumber = input.idDocumentNumber.trim();
  if (!trimmedIdNumber) {
    throw new Error('Identification document number is required.');
  }

  // 1. Check duplicate identification number
  const dup = await checkDuplicateIdNumber(input.idDocumentType, trimmedIdNumber);
  if (dup.isDuplicate && !input.allowDuplicateOverride) {
    throw new Error(
      `Duplicate ID number detected! Already registered to ${dup.existingSubjectName} (${dup.existingSubjectCode} · ${dup.existingSubjectType}).`
    );
  }

  // 2. Validate initial payment ref if initial payment > 0
  if (input.initialPaymentAmount && input.initialPaymentAmount > 0) {
    if (
      !input.initialTransactionRef ||
      !/^[A-Za-z0-9\-_]+$/.test(input.initialTransactionRef.trim())
    ) {
      throw new Error(
        'A valid transaction reference (letters, numbers, hyphens, underscores) is required for the initial payment.'
      );
    }
    const refId = sanitizeRefId(input.initialTransactionRef);
    const existingRef = await getDoc(doc(db, 'payment_refs', refId));
    if (existingRef.exists()) {
      throw new Error(
        `Duplicate transaction reference "${input.initialTransactionRef}" already exists.`
      );
    }
  }

  // 3. Allocate concurrency-safe atomic student code (ZAC-STU-XXXX)
  const studentCode = await allocateAtomicInstitutionalCode('STUDENT', existingStudentsCount, actor);

  // 4. Encrypt sensitive ID vault payload (AES-256-GCM at rest)
  const vaultId = makeId('idv');
  const vaultPlain: DecryptedIdVaultPayload = {
    documentNumber: trimmedIdNumber,
    drivingLicenceNumber:
      input.idDocumentType === 'DRIVING_LICENCE' ? trimmedIdNumber : undefined,
    frontDataUrl: input.frontDocumentDataUrl,
    backDataUrl: input.backDocumentDataUrl,
    extractedSummary: input.ocrSummary,
  };
  let encrypted = await encryptIdVaultPayload(studentId, vaultPlain);
  // Ensure Firestore document stays comfortably below 750KB limit
  if (encrypted.encryptedPayload.length > 720000 && vaultPlain.backDataUrl) {
    const compactedFront = vaultPlain.frontDataUrl
      ? (await compressDocumentImage(vaultPlain.frontDataUrl, 900, 0.65)).dataUrl
      : undefined;
    const compactedBack = (await compressDocumentImage(vaultPlain.backDataUrl, 900, 0.65)).dataUrl;
    encrypted = await encryptIdVaultPayload(studentId, {
      ...vaultPlain,
      frontDataUrl: compactedFront,
      backDataUrl: compactedBack,
    });
  }
  if (encrypted.encryptedPayload.length > 740000) {
    throw new Error(
      'Scanned ID attachment exceeds secure storage limit (550 KB). Please upload a smaller image or retake at lower resolution.'
    );
  }

  const feeEtb =
    input.agreedFeeEtb && input.agreedFeeEtb > 0 ? Number(input.agreedFeeEtb) : input.course.feeEtb;
  const registrationDateEthiopian = formatEthiopianDate(input.enrollmentDate);
  const registrationTimeEat = formatAddisTime(now);
  const maskedId = maskIdNumber(trimmedIdNumber);
  const retentionDeleteAfter = addDaysIso(todayIsoDate(), 365 * 3); // 3-year default retention

  try {
    const batch = writeBatch(db);

    const studentDoc = cleanObject({
      tenantId,
      studentCode,
      fullName: input.fullName.trim().slice(0, 120),
      gender: input.gender,
      phone: input.phone.trim().slice(0, 30),
      altPhone: input.altPhone?.trim().slice(0, 30),
      email: input.email?.trim().slice(0, 160),
      dateOfBirth: input.dateOfBirth?.trim().slice(0, 20),
      nationality: input.nationality?.trim().slice(0, 80),
      address: input.address.trim().slice(0, 240),
      photoUrl: input.photoUrl?.slice(0, 90000),
      idDocumentType: input.idDocumentType,
      idNumberMasked: maskedId,
      idNumberHash: dup.idNumberHash,
      idExpiryDate: input.idExpiryDate?.trim().slice(0, 20),
      idVaultRefId: vaultId,
      idVerificationStatus: 'PENDING_REVIEW',
      ocrConfidenceSummary: (input.ocrSummary || `OCR ${input.ocrConfidence || 'MANUAL'}`).slice(0, 240),
      initialPaymentEtb: Number(input.initialPaymentAmount || 0),
      courseId: input.course.id,
      courseName: input.course.name.slice(0, 120),
      enrollmentDate: input.enrollmentDate,
      registrationDateEthiopian,
      registrationTimeEat,
      courseFeeEtb: feeEtb,
      paymentPlanCode: input.paymentPlan.code,
      registrationStatus: 'PENDING',
      registeredBy: actor.uid,
      registeredByName: actor.fullName.slice(0, 120),
      createdAt: now,
      updatedAt: now,
    });
    batch.set(doc(db, 'students', studentId), studentDoc);

    // Restricted Encrypted Identity Document Vault record
    batch.set(
      doc(db, 'identity_documents', vaultId),
      cleanObject({
        tenantId,
        subjectType: 'STUDENT',
        subjectId: studentId,
        subjectCode: studentCode,
        subjectName: input.fullName.trim().slice(0, 120),
        documentType: input.idDocumentType,
        idNumberMasked: maskedId,
        idNumberHash: dup.idNumberHash,
        documentExpiryDate: input.idExpiryDate?.trim().slice(0, 20),
        encryptionAlg: 'AES-GCM-256',
        encryptionIv: encrypted.encryptionIv,
        encryptedPayload: encrypted.encryptedPayload,
        fileMimeType: input.fileMimeType || 'image/jpeg',
        hasFrontImage: Boolean(input.frontDocumentDataUrl),
        hasBackImage: Boolean(input.backDocumentDataUrl),
        ocrConfidence: input.ocrConfidence || 'MANUAL',
        ocrWarnings: (input.ocrWarnings || []).slice(0, 12),
        verificationStatus: 'PENDING_REVIEW',
        uploadedBy: actor.uid,
        uploadedByName: actor.fullName.slice(0, 120),
        retentionDeleteAfter,
        isRedacted: false,
        createdAt: now,
        updatedAt: now,
      })
    );

    // Claim hashed duplicate ID lock if not already locked
    if (!dup.isDuplicate) {
      batch.set(doc(db, 'id_number_locks', makeIdLockDocId(dup.idNumberHash)), {
        tenantId,
        idNumberHash: dup.idNumberHash,
        documentType: input.idDocumentType,
        subjectType: 'STUDENT',
        subjectId: studentId,
        subjectCode: studentCode,
        subjectName: input.fullName.trim().slice(0, 120),
        createdBy: actor.uid,
        createdAt: now,
      });
    }

    // Enrollment record
    batch.set(
      doc(db, 'enrollments', enrollmentId),
      cleanObject({
        tenantId,
        studentId,
        studentCode,
        studentName: input.fullName.trim().slice(0, 120),
        courseId: input.course.id,
        courseName: input.course.name.slice(0, 120),
        instructorId: input.course.instructorId,
        paymentPlanCode: input.paymentPlan.code,
        paymentPlanName: input.paymentPlan.name.slice(0, 80),
        enrollmentDate: input.enrollmentDate,
        agreedFeeEtb: feeEtb,
        approvedPaidEtb: 0,
        remainingBalanceEtb: feeEtb,
        status: 'PENDING',
        registeredBy: actor.uid,
        createdAt: now,
        updatedAt: now,
      })
    );

    // Scheduled installments
    const count =
      input.paymentPlan.code === 'CUSTOM' && input.customInstallments
        ? Math.max(1, Math.min(12, Math.round(input.customInstallments)))
        : Math.max(1, input.paymentPlan.installmentCount);
    const interval =
      input.paymentPlan.code === 'CUSTOM' && input.customIntervalDays !== undefined
        ? Math.max(0, Math.round(input.customIntervalDays))
        : input.paymentPlan.intervalDays;

    const baseAmount = Math.floor((feeEtb / count) * 100) / 100;
    let allocated = 0;

    for (let i = 1; i <= count; i++) {
      const amountDue = i === count ? Number((feeEtb - allocated).toFixed(2)) : baseAmount;
      allocated += amountDue;
      const dueDate = addDaysIso(input.enrollmentDate, (i - 1) * interval);
      batch.set(doc(db, 'payment_installments', makeId(`inst_${i}`)), {
        tenantId,
        enrollmentId,
        studentId,
        studentCode,
        studentName: input.fullName.trim().slice(0, 120),
        courseId: input.course.id,
        courseName: input.course.name.slice(0, 120),
        installmentNumber: i,
        dueDate,
        amountDueEtb: amountDue,
        amountPaidEtb: 0,
        status: 'UNPAID',
        createdAt: now,
        updatedAt: now,
      });
    }

    // Optional initial payment (PENDING until Admin approves)
    if (input.initialPaymentAmount && input.initialPaymentAmount > 0 && input.initialTransactionRef) {
      const paymentId = makeId('pay');
      const txRef = input.initialTransactionRef.trim();
      batch.set(
        doc(db, 'payments', paymentId),
        cleanObject({
          tenantId,
          transactionRef: txRef,
          enrollmentId,
          studentId,
          studentCode,
          studentName: input.fullName.trim().slice(0, 120),
          courseId: input.course.id,
          courseName: input.course.name.slice(0, 120),
          amountEtb: Number(input.initialPaymentAmount),
          paymentDate: input.enrollmentDate,
          paymentMethod: input.initialPaymentMethod || 'Cash',
          recordedBy: actor.uid,
          recordedByName: actor.fullName.slice(0, 120),
          status: 'PENDING',
          notes: 'Initial registration fee payment submitted with ID-verified intake.',
          createdAt: now,
          updatedAt: now,
        })
      );
      batch.set(doc(db, 'payment_refs', sanitizeRefId(txRef)), {
        tenantId,
        paymentId,
        transactionRef: txRef,
        recordedBy: actor.uid,
        createdAt: now,
      });
    }

    // Admin Notification (suppressed during bulk batches so a single summary notification is emitted instead)
    if (!input.suppressIndividualNotification) {
      batch.set(doc(db, 'notifications', makeId('not')), {
        tenantId,
        type: 'PENDING_REGISTRATION',
        title: `AI Student Registration: ${input.fullName.trim().slice(0, 55)}`,
        message: `${studentCode} (${ID_DOCUMENT_LABELS[input.idDocumentType]} ${maskedId}) for ${input.course.name} submitted by ${actor.fullName}. Pending Admin verification & approval.`,
        targetRole: 'ADMIN',
        actionSection: 'registrations',
        entityType: 'student',
        entityId: studentId,
        isRead: false,
        createdAt: now,
      });
    }

    // Immutable Audit Log
    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'AI_STUDENT_REGISTERED',
      entityType: 'student',
      entityId: studentId,
      summary: `Registered student ${input.fullName.trim()} (${studentCode}) with encrypted ${ID_DOCUMENT_LABELS[input.idDocumentType]} (${maskedId}) for ${input.course.name}. Status: PENDING.`,
      createdAt: now,
    });

    await batch.commit();
    return { studentId, studentCode, vaultId };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'students');
  }
}

// ---------------------------------------------------------------------------
// AI-Assisted Staff Registration (Atomic ZAC-STA-XXXX + Admin-Only Salary)
// ---------------------------------------------------------------------------

export interface AiStaffRegistrationInput {
  fullName: string;
  address: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  nationality: string;
  gender: 'Male' | 'Female' | 'Unspecified';
  idDocumentType: IdDocumentType;
  idDocumentNumber: string;
  idExpiryDate?: string;
  department: string;
  jobPosition: string;
  portalRole: Exclude<RoleCode, 'STUDENT'>;
  employmentStartDate: string;
  salaryEtb?: number;
  payFrequency?: 'MONTHLY' | 'BIWEEKLY' | 'CONTRACT';
  compensationNotes?: string;
  photoUrl?: string;
  frontDocumentDataUrl?: string;
  backDocumentDataUrl?: string;
  fileMimeType?: string;
  ocrConfidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'MANUAL';
  ocrWarnings?: string[];
  ocrSummary?: string;
  allowDuplicateOverride?: boolean;
}

export async function submitAiStaffRegistration(
  input: AiStaffRegistrationInput,
  existingStaffCount: number,
  actor: ActorContext
): Promise<{ staffId: string; staffCode: string; vaultId: string }> {
  if (actor.tenantStatus === 'SUSPENDED') {
    throw new Error('This institute account is currently SUSPENDED. Contact ZACMA Platform Support.');
  }
  if (actor.staffLimit && actor.staffLimit > 0 && existingStaffCount >= actor.staffLimit) {
    throw new Error(
      `Staff capacity limit (${actor.staffLimit}) reached for your current SaaS subscription plan. Please upgrade to register more staff.`
    );
  }
  const tenantId = actor.tenantId || 'zacma_default';
  const now = new Date().toISOString();
  const staffId = makeId('stf');
  const trimmedIdNumber = input.idDocumentNumber.trim();
  if (!trimmedIdNumber) {
    throw new Error('Staff identification document number is required.');
  }

  // Non-admin cannot assign ADMIN role
  const safePortalRole: Exclude<RoleCode, 'STUDENT'> =
    actor.role === 'ADMIN'
      ? input.portalRole
      : input.portalRole === 'ADMIN'
      ? 'GENERAL_STAFF'
      : input.portalRole;

  const dup = await checkDuplicateIdNumber(input.idDocumentType, trimmedIdNumber);
  if (dup.isDuplicate && !input.allowDuplicateOverride) {
    throw new Error(
      `Duplicate ID number detected! Already registered to ${dup.existingSubjectName} (${dup.existingSubjectCode} · ${dup.existingSubjectType}).`
    );
  }

  const staffCode = await allocateAtomicInstitutionalCode('STAFF', existingStaffCount, actor);
  const vaultId = makeId('idv');
  const vaultPlain: DecryptedIdVaultPayload = {
    documentNumber: trimmedIdNumber,
    drivingLicenceNumber:
      input.idDocumentType === 'DRIVING_LICENCE' ? trimmedIdNumber : undefined,
    frontDataUrl: input.frontDocumentDataUrl,
    backDataUrl: input.backDocumentDataUrl,
    extractedSummary: input.ocrSummary,
  };
  let encrypted = await encryptIdVaultPayload(staffId, vaultPlain);
  if (encrypted.encryptedPayload.length > 720000 && vaultPlain.backDataUrl) {
    const compactedFront = vaultPlain.frontDataUrl
      ? (await compressDocumentImage(vaultPlain.frontDataUrl, 900, 0.65)).dataUrl
      : undefined;
    const compactedBack = (await compressDocumentImage(vaultPlain.backDataUrl, 900, 0.65)).dataUrl;
    encrypted = await encryptIdVaultPayload(staffId, {
      ...vaultPlain,
      frontDataUrl: compactedFront,
      backDataUrl: compactedBack,
    });
  }
  if (encrypted.encryptedPayload.length > 740000) {
    throw new Error('Scanned ID attachment exceeds secure storage limit. Please upload a smaller image.');
  }

  const maskedId = maskIdNumber(trimmedIdNumber);
  const startDateEthiopian = formatEthiopianDate(input.employmentStartDate);
  const retentionDeleteAfter = addDaysIso(todayIsoDate(), 365 * 5); // 5-year HR retention

  try {
    const batch = writeBatch(db);

    batch.set(
      doc(db, 'staff_records', staffId),
      cleanObject({
        tenantId,
        staffCode,
        fullName: input.fullName.trim().slice(0, 120),
        address: input.address.trim().slice(0, 240),
        phone: input.phone.trim().slice(0, 30),
        email: input.email.trim().toLowerCase().slice(0, 160),
        dateOfBirth: input.dateOfBirth.trim().slice(0, 20),
        nationality: input.nationality.trim().slice(0, 80),
        gender: input.gender,
        idDocumentType: input.idDocumentType,
        idNumberMasked: maskedId,
        idNumberHash: dup.idNumberHash,
        idExpiryDate: input.idExpiryDate?.trim().slice(0, 20),
        idVaultRefId: vaultId,
        idVerificationStatus: 'PENDING_REVIEW',
        department: input.department.trim().slice(0, 80),
        jobPosition: input.jobPosition.trim().slice(0, 80),
        portalRole: safePortalRole,
        employmentStartDate: input.employmentStartDate,
        employmentStartDateEthiopian: startDateEthiopian,
        photoUrl: input.photoUrl?.slice(0, 90000),
        registrationStatus: 'PENDING',
        registeredBy: actor.uid,
        registeredByName: actor.fullName.slice(0, 120),
        ocrConfidenceSummary: (input.ocrSummary || `OCR ${input.ocrConfidence || 'MANUAL'}`).slice(0, 240),
        createdAt: now,
        updatedAt: now,
      })
    );

    // Strictly Admin-only isolated salary record
    if (actor.role === 'ADMIN' && input.salaryEtb !== undefined && input.salaryEtb >= 0) {
      batch.set(
        doc(db, 'staff_compensation', staffId),
        cleanObject({
          tenantId,
          staffId,
          staffCode,
          salaryEtb: Number(input.salaryEtb),
          payFrequency: input.payFrequency || 'MONTHLY',
          notes: input.compensationNotes?.trim().slice(0, 300),
          updatedBy: actor.uid,
          updatedByName: actor.fullName.slice(0, 120),
          createdAt: now,
          updatedAt: now,
        })
      );
    }

    // Encrypted Identity Vault Record
    batch.set(
      doc(db, 'identity_documents', vaultId),
      cleanObject({
        tenantId,
        subjectType: 'STAFF',
        subjectId: staffId,
        subjectCode: staffCode,
        subjectName: input.fullName.trim().slice(0, 120),
        documentType: input.idDocumentType,
        idNumberMasked: maskedId,
        idNumberHash: dup.idNumberHash,
        documentExpiryDate: input.idExpiryDate?.trim().slice(0, 20),
        encryptionAlg: 'AES-GCM-256',
        encryptionIv: encrypted.encryptionIv,
        encryptedPayload: encrypted.encryptedPayload,
        fileMimeType: input.fileMimeType || 'image/jpeg',
        hasFrontImage: Boolean(input.frontDocumentDataUrl),
        hasBackImage: Boolean(input.backDocumentDataUrl),
        ocrConfidence: input.ocrConfidence || 'MANUAL',
        ocrWarnings: (input.ocrWarnings || []).slice(0, 12),
        verificationStatus: 'PENDING_REVIEW',
        uploadedBy: actor.uid,
        uploadedByName: actor.fullName.slice(0, 120),
        retentionDeleteAfter,
        isRedacted: false,
        createdAt: now,
        updatedAt: now,
      })
    );

    if (!dup.isDuplicate) {
      batch.set(doc(db, 'id_number_locks', makeIdLockDocId(dup.idNumberHash)), {
        tenantId,
        idNumberHash: dup.idNumberHash,
        documentType: input.idDocumentType,
        subjectType: 'STAFF',
        subjectId: staffId,
        subjectCode: staffCode,
        subjectName: input.fullName.trim().slice(0, 120),
        createdBy: actor.uid,
        createdAt: now,
      });
    }

    batch.set(doc(db, 'notifications', makeId('not')), {
      tenantId,
      type: 'PENDING_STAFF_REGISTRATION',
      title: `Staff Registration Pending: ${input.fullName.trim().slice(0, 55)}`,
      message: `${staffCode} (${input.jobPosition} · ${input.department}) submitted by ${actor.fullName}. Pending Admin ID verification & approval.`,
      targetRole: 'ADMIN',
      actionSection: 'registrations',
      entityType: 'staff',
      entityId: staffId,
      isRead: false,
      createdAt: now,
    });

    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'STAFF_REGISTERED',
      entityType: 'staff',
      entityId: staffId,
      summary: `Registered staff member ${input.fullName.trim()} (${staffCode}, ${input.jobPosition}, ${input.department}) with encrypted ${ID_DOCUMENT_LABELS[input.idDocumentType]} (${maskedId}).`,
      createdAt: now,
    });

    await batch.commit();
    return { staffId, staffCode, vaultId };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'staff_records');
  }
}

// ---------------------------------------------------------------------------
// Admin Approval, Rejection, OCR Correction & Secure ID Vault Management
// ---------------------------------------------------------------------------

export async function approveStaffRegistration(
  staff: StaffRecord,
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can approve staff registrations.');
  }
  const now = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    const linkedProfileUid = staff.linkedProfileUid || `staff_${staff.id}`;
    batch.update(doc(db, 'staff_records', staff.id), {
      registrationStatus: 'APPROVED',
      idVerificationStatus: 'VERIFIED',
      linkedProfileUid,
      approvedBy: actor.uid,
      approvedByName: actor.fullName.slice(0, 120),
      approvedAt: now,
      updatedAt: now,
    });

    // Provision corresponding staff profile for portal role management
    batch.set(
      doc(db, 'profiles', linkedProfileUid),
      cleanObject({
        uid: linkedProfileUid,
        tenantId: staff.tenantId || actor.tenantId || 'zacma_default',
        email: staff.email,
        fullName: staff.fullName,
        phone: staff.phone,
        role: staff.portalRole,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
    );

    if (staff.idVaultRefId) {
      batch.update(doc(db, 'identity_documents', staff.idVaultRefId), {
        verificationStatus: 'VERIFIED',
        verifiedBy: actor.uid,
        verifiedByName: actor.fullName.slice(0, 120),
        verifiedAt: now,
        updatedAt: now,
      });
    }

    batch.set(doc(db, 'notifications', makeId('not_stf_app')), {
      type: 'STAFF_REGISTRATION_APPROVED',
      title: `Staff Approved: ${staff.fullName}`,
      message: `${staff.staffCode} (${staff.jobPosition} · ${staff.department}) approved and portal role ${staff.portalRole} provisioned.`,
      targetRole: 'ADMIN',
      actionSection: 'registrations',
      entityType: 'staff',
      entityId: staff.id,
      isRead: false,
      createdAt: now,
    });

    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'STAFF_REGISTRATION_APPROVED',
      entityType: 'staff',
      entityId: staff.id,
      summary: `Approved staff registration for ${staff.fullName} (${staff.staffCode}, ${staff.jobPosition}) and provisioned ${staff.portalRole} role.`,
      createdAt: now,
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `staff_records/${staff.id}`);
  }
}

export async function rejectStaffRegistration(
  staff: StaffRecord,
  reason: string,
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can reject staff registrations.');
  }
  const now = new Date().toISOString();
  const cleanReason = reason.trim().slice(0, 300) || 'Identity verification or HR requirements incomplete.';
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'staff_records', staff.id), {
      registrationStatus: 'REJECTED',
      idVerificationStatus: 'REJECTED',
      approvedBy: actor.uid,
      approvedByName: actor.fullName.slice(0, 120),
      approvedAt: now,
      rejectionReason: cleanReason,
      updatedAt: now,
    });
    if (staff.idVaultRefId) {
      batch.update(doc(db, 'identity_documents', staff.idVaultRefId), {
        verificationStatus: 'REJECTED',
        verificationNotes: cleanReason,
        verifiedBy: actor.uid,
        verifiedByName: actor.fullName.slice(0, 120),
        verifiedAt: now,
        updatedAt: now,
      });
    }
    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'STAFF_REGISTRATION_REJECTED',
      entityType: 'staff',
      entityId: staff.id,
      summary: `Rejected staff registration for ${staff.fullName} (${staff.staffCode}): ${cleanReason}`,
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `staff_records/${staff.id}`);
  }
}

export async function updateStaffCompensation(
  staff: StaffRecord,
  salaryEtb: number,
  payFrequency: 'MONTHLY' | 'BIWEEKLY' | 'CONTRACT',
  notes: string,
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Salary records are restricted strictly to Administrators.');
  }
  const now = new Date().toISOString();
  try {
    const existing = await getDoc(doc(db, 'staff_compensation', staff.id));
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'staff_compensation', staff.id),
      cleanObject({
        staffId: staff.id,
        staffCode: staff.staffCode,
        salaryEtb: Math.max(0, Number(salaryEtb)),
        payFrequency,
        notes: notes.trim().slice(0, 300),
        updatedBy: actor.uid,
        updatedByName: actor.fullName.slice(0, 120),
        createdAt: existing.exists() ? String(existing.data().createdAt || now) : now,
        updatedAt: now,
      })
    );
    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'STAFF_SALARY_UPDATED',
      entityType: 'staff_compensation',
      entityId: staff.id,
      summary: `Updated compensation record for ${staff.fullName} (${staff.staffCode}) — ${payFrequency}.`,
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `staff_compensation/${staff.id}`);
  }
}

export async function logIdDocumentAccess(
  docRecord: IdentityDocumentRecord,
  actor: ActorContext
): Promise<void> {
  const now = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'audit_logs', makeId('aud_id_view')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'ID_DOCUMENT_ACCESSED',
      entityType: 'identity_document',
      entityId: docRecord.id,
      summary: `Decrypted and inspected sensitive ${ID_DOCUMENT_LABELS[docRecord.documentType]} (${docRecord.idNumberMasked}) for ${docRecord.subjectName} (${docRecord.subjectCode}).`,
      createdAt: now,
    });
    await batch.commit();
  } catch {
    // Do not crash decryption view if secondary audit write fails transiently
  }
}

export async function updateIdVerificationDecision(
  docRecord: IdentityDocumentRecord,
  status: 'VERIFIED' | 'FLAGGED' | 'REJECTED',
  notes: string,
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can verify or flag identification documents.');
  }
  const now = new Date().toISOString();
  const cleanNotes = notes.trim().slice(0, 400);
  try {
    const batch = writeBatch(db);
    batch.update(
      doc(db, 'identity_documents', docRecord.id),
      cleanObject({
        verificationStatus: status,
        verificationNotes: cleanNotes || undefined,
        verifiedBy: actor.uid,
        verifiedByName: actor.fullName.slice(0, 120),
        verifiedAt: now,
        updatedAt: now,
      })
    );

    const parentCol = docRecord.subjectType === 'STUDENT' ? 'students' : 'staff_records';
    batch.update(doc(db, parentCol, docRecord.subjectId), {
      idVerificationStatus: status,
      updatedAt: now,
    });

    if (status === 'FLAGGED') {
      batch.set(doc(db, 'notifications', makeId('not_flag')), {
        type: 'ID_VERIFICATION_FLAGGED',
        title: `ID Flagged for Review: ${docRecord.subjectName}`,
        message: `${docRecord.subjectCode} (${docRecord.idNumberMasked}) flagged by ${actor.fullName}: ${cleanNotes || 'Discrepancy detected.'}`,
        targetRole: 'ADMIN',
        actionSection: 'registrations',
        entityType: 'identity_document',
        entityId: docRecord.id,
        isRead: false,
        createdAt: now,
      });
    }

    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: `ID_DOCUMENT_${status}`,
      entityType: 'identity_document',
      entityId: docRecord.id,
      summary: `Marked ${ID_DOCUMENT_LABELS[docRecord.documentType]} for ${docRecord.subjectName} (${docRecord.subjectCode}) as ${status}.${cleanNotes ? ` Note: ${cleanNotes}` : ''}`,
      createdAt: now,
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `identity_documents/${docRecord.id}`);
  }
}

export async function correctRegistrationOcrFields(
  subjectType: 'STUDENT' | 'STAFF',
  subjectId: string,
  subjectCode: string,
  updates: {
    fullName: string;
    phone: string;
    address: string;
    email?: string;
    dateOfBirth?: string;
    nationality?: string;
    gender?: 'Male' | 'Female' | 'Unspecified';
    idExpiryDate?: string;
    idVaultRefId?: string;
  },
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can correct verified registration records.');
  }
  const now = new Date().toISOString();
  const col = subjectType === 'STUDENT' ? 'students' : 'staff_records';
  try {
    const batch = writeBatch(db);
    batch.update(
      doc(db, col, subjectId),
      cleanObject({
        fullName: updates.fullName.trim().slice(0, 120),
        phone: updates.phone.trim().slice(0, 30),
        address: updates.address.trim().slice(0, 240),
        email: updates.email?.trim().slice(0, 160),
        dateOfBirth: updates.dateOfBirth?.trim().slice(0, 20),
        nationality: updates.nationality?.trim().slice(0, 80),
        gender: updates.gender,
        idExpiryDate: updates.idExpiryDate?.trim().slice(0, 20),
        updatedAt: now,
      })
    );
    if (updates.idVaultRefId) {
      batch.update(
        doc(db, 'identity_documents', updates.idVaultRefId),
        cleanObject({
          subjectName: updates.fullName.trim().slice(0, 120),
          documentExpiryDate: updates.idExpiryDate?.trim().slice(0, 20),
          updatedAt: now,
        })
      );
    }
    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'OCR_RECORD_CORRECTED',
      entityType: subjectType.toLowerCase(),
      entityId: subjectId,
      summary: `Corrected identity/OCR fields for ${updates.fullName.trim()} (${subjectCode}).`,
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${col}/${subjectId}`);
  }
}

export async function redactIdentityDocumentImages(
  docRecord: IdentityDocumentRecord,
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can redact stored identification images.');
  }
  const now = new Date().toISOString();
  try {
    const encrypted = await encryptIdVaultPayload(docRecord.subjectId, {
      documentNumber: docRecord.idNumberMasked,
      extractedSummary: 'Raw ID scan images permanently purged by Administrator per data retention policy.',
    });
    const batch = writeBatch(db);
    batch.update(doc(db, 'identity_documents', docRecord.id), {
      encryptedPayload: encrypted.encryptedPayload,
      encryptionIv: encrypted.encryptionIv,
      hasFrontImage: false,
      hasBackImage: false,
      isRedacted: true,
      verificationNotes: `Images redacted on ${todayIsoDate()} by ${actor.fullName}.`,
      updatedAt: now,
    });
    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'ID_DOCUMENT_REDACTED',
      entityType: 'identity_document',
      entityId: docRecord.id,
      summary: `Purged raw ID document images for ${docRecord.subjectName} (${docRecord.subjectCode}) while retaining compliance metadata.`,
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `identity_documents/${docRecord.id}`);
  }
}

export async function deleteIdentityDocumentRecord(
  docRecord: IdentityDocumentRecord,
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can delete identification document records.');
  }
  const now = new Date().toISOString();
  try {
    await deleteDoc(doc(db, 'identity_documents', docRecord.id));
    await updateDoc(doc(db, docRecord.subjectType === 'STUDENT' ? 'students' : 'staff_records', docRecord.subjectId), {
      idVerificationStatus: 'UNVERIFIED',
      updatedAt: now,
    }).catch(() => undefined);
    const batch = writeBatch(db);
    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'ID_DOCUMENT_DELETED',
      entityType: 'identity_document',
      entityId: docRecord.id,
      summary: `Permanently deleted ID document vault record for ${docRecord.subjectName} (${docRecord.subjectCode}) per retention policy.`,
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `identity_documents/${docRecord.id}`);
  }
}

export async function updateRetentionDate(
  docRecord: IdentityDocumentRecord,
  retentionDeleteAfter: string,
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can update retention schedules.');
  }
  const now = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'identity_documents', docRecord.id), {
      retentionDeleteAfter: retentionDeleteAfter.slice(0, 20),
      updatedAt: now,
    });
    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'ID_RETENTION_UPDATED',
      entityType: 'identity_document',
      entityId: docRecord.id,
      summary: `Set ID retention review/deletion date for ${docRecord.subjectName} (${docRecord.subjectCode}) to ${retentionDeleteAfter}.`,
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `identity_documents/${docRecord.id}`);
  }
}

// Also allow Admin to trigger welcome SMS cleanly on student approval if needed
export { triggerAutomatedEventSms };

// ---------------------------------------------------------------------------
// Authorized Excel (.xlsx) Export for Student & Staff Registrations
// ---------------------------------------------------------------------------

export async function exportRegistrationsReport(
  params: {
    students: Student[];
    staffRecords: StaffRecord[];
    compensations: StaffCompensation[];
    includeSalary: boolean;
  },
  actor: ActorContext
): Promise<void> {
  const wb = XLSX.utils.book_new();

  const studentRows = params.students.map((s) => ({
    'Student ID': s.studentCode,
    'Full Name': s.fullName,
    Phone: s.phone,
    Email: s.email || '—',
    'Date of Birth': s.dateOfBirth || '—',
    Gender: s.gender,
    Nationality: s.nationality || '—',
    Address: s.address,
    'ID Type': s.idDocumentType ? ID_DOCUMENT_LABELS[s.idDocumentType] : '—',
    'ID Number (Masked)': s.idNumberMasked || '—',
    'ID Verification': s.idVerificationStatus || 'UNVERIFIED',
    Course: s.courseName,
    'Course Fee (ETB)': s.courseFeeEtb,
    'Registration Date (GC)': s.enrollmentDate,
    'Registration Date (EC)': s.registrationDateEthiopian || '—',
    Status: s.registrationStatus,
    'Registered By': s.registeredByName || s.registeredBy,
    'Approved By': s.approvedByName || '—',
  }));
  const wsStudents = XLSX.utils.json_to_sheet(
    studentRows.length > 0 ? studentRows : [{ Info: 'No student registrations found' }]
  );
  XLSX.utils.book_append_sheet(wb, wsStudents, 'Student Registrations');

  const compMap = new Map(params.compensations.map((c) => [c.staffId, c]));
  const staffRows = params.staffRecords.map((st) => {
    const comp = compMap.get(st.id);
    const base: Record<string, unknown> = {
      'Staff ID': st.staffCode,
      'Full Name': st.fullName,
      Department: st.department,
      'Job Position': st.jobPosition,
      'Portal Role': st.portalRole,
      Phone: st.phone,
      Email: st.email,
      'Date of Birth': st.dateOfBirth,
      Nationality: st.nationality,
      'ID Type': ID_DOCUMENT_LABELS[st.idDocumentType],
      'ID Number (Masked)': st.idNumberMasked || '—',
      'ID Verification': st.idVerificationStatus || 'PENDING_REVIEW',
      'Start Date (GC)': st.employmentStartDate,
      'Start Date (EC)': st.employmentStartDateEthiopian || '—',
      Status: st.registrationStatus,
      'Approved By': st.approvedByName || '—',
    };
    if (params.includeSalary && actor.role === 'ADMIN') {
      base['Salary (ETB)'] = comp ? comp.salaryEtb : '—';
      base['Pay Frequency'] = comp ? comp.payFrequency : '—';
    }
    return base;
  });
  const wsStaff = XLSX.utils.json_to_sheet(
    staffRows.length > 0 ? staffRows : [{ Info: 'No staff registrations found' }]
  );
  XLSX.utils.book_append_sheet(wb, wsStaff, 'Staff Registrations');

  const filename = `ZACMA_Registrations_Report_${todayIsoDate()}.xlsx`;
  XLSX.writeFile(wb, filename);

  // Record audit trail for authorized export
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'audit_logs', makeId('aud_exp')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'REGISTRATIONS_REPORT_EXPORTED',
      entityType: 'report',
      entityId: filename,
      summary: `Exported authorized registrations report (${params.students.length} students, ${params.staffRecords.length} staff${params.includeSalary ? ', including Admin salary sheet' : ''}).`,
      createdAt: new Date().toISOString(),
    });
    await batch.commit();
  } catch {
    // Non-fatal
  }
}

export async function getActiveStaffCountFallback(): Promise<number> {
  try {
    const snap = await getDocs(collection(db, 'staff_records'));
    return snap.size;
  } catch {
    return 0;
  }
}
