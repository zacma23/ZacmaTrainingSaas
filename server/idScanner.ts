import { type GenerateContentResponse, ThinkingLevel, Type } from '@google/genai';
import { getAiModelName, getGeminiClient, type HandlerResult } from './handlers.ts';

export type SupportedIdDocumentType =
  | 'ETHIOPIAN_FAYDA_ID'
  | 'NATIONAL_ID'
  | 'PASSPORT'
  | 'DRIVING_LICENCE'
  | 'UNKNOWN';

export type FieldConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'MISSING';

export interface ScanIdRequestBody {
  registrationType?: 'STUDENT' | 'STAFF';
  consentConfirmed?: boolean;
  frontDataUrl?: string;
  frontMimeType?: string;
  backDataUrl?: string;
  backMimeType?: string;
}

export interface ScannedIdExtraction {
  detectedDocumentType: SupportedIdDocumentType;
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

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

function parseDataUrl(
  dataUrl: string,
  fallbackMime?: string
): { mimeType: string; base64: string } | null {
  const trimmed = dataUrl.trim();
  const match = trimmed.match(/^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/);
  if (match) {
    const rawMime = match[1].toLowerCase();
    const mimeType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
    return { mimeType, base64: match[2].replace(/\s+/g, '') };
  }
  if (fallbackMime) {
    const mimeType = fallbackMime.toLowerCase() === 'image/jpg' ? 'image/jpeg' : fallbackMime.toLowerCase();
    return { mimeType, base64: trimmed.replace(/\s+/g, '') };
  }
  return null;
}

function normalizeIsoDate(raw: string | undefined): string {
  if (!raw) return '';
  const cleaned = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }
  // Try DD/MM/YYYY or DD-MM-YYYY
  const dmy = cleaned.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    if (y >= 1900 && y <= 2100) {
      return `${y}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }
  }
  return '';
}

function normalizeGender(raw: string | undefined): 'Male' | 'Female' | '' {
  const val = (raw || '').trim().toLowerCase();
  if (val === 'm' || val === 'male' || val === 'ወንድ') return 'Male';
  if (val === 'f' || val === 'female' || val === 'ሴት') return 'Female';
  return '';
}

function normalizeDocType(raw: string | undefined): SupportedIdDocumentType {
  const v = (raw || '').trim().toUpperCase();
  if (v === 'ETHIOPIAN_FAYDA_ID' || v.includes('FAYDA')) return 'ETHIOPIAN_FAYDA_ID';
  if (v === 'NATIONAL_ID' || v.includes('NATIONAL') || v.includes('KEBELE')) return 'NATIONAL_ID';
  if (v === 'PASSPORT') return 'PASSPORT';
  if (v === 'DRIVING_LICENCE' || v.includes('DRIV')) return 'DRIVING_LICENCE';
  return 'UNKNOWN';
}

function normalizeConfidence(raw: string | undefined): FieldConfidenceLevel {
  const v = (raw || '').trim().toUpperCase();
  if (v === 'HIGH' || v === 'MEDIUM' || v === 'LOW' || v === 'MISSING') return v;
  return 'LOW';
}

const SCAN_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    detectedDocumentType: {
      type: Type.STRING,
      description:
        'Must be one of: ETHIOPIAN_FAYDA_ID, NATIONAL_ID, PASSPORT, DRIVING_LICENCE, UNKNOWN',
    },
    fullName: {
      type: Type.STRING,
      description: 'Full legal name in English/Latin characters (transliterate if only in Amharic/Geʽez). Empty string if unreadable.',
    },
    dateOfBirth: {
      type: Type.STRING,
      description: 'Gregorian date of birth formatted strictly as YYYY-MM-DD. Empty string if missing or unclear.',
    },
    dateOfBirthRaw: {
      type: Type.STRING,
      description: 'Exact date of birth text as printed on document (including Ethiopian calendar if printed).',
    },
    gender: {
      type: Type.STRING,
      description: 'Male, Female, or empty string if not shown.',
    },
    nationality: {
      type: Type.STRING,
      description: 'Nationality (e.g., Ethiopian). Empty string if missing.',
    },
    documentNumber: {
      type: Type.STRING,
      description: 'Primary ID number: Fayda FAN/FIN, National ID number, Passport number, or Driving Licence number.',
    },
    drivingLicenceNumber: {
      type: Type.STRING,
      description: 'Driving licence number if the document is a driving licence; otherwise empty string.',
    },
    documentExpiryDate: {
      type: Type.STRING,
      description: 'Gregorian expiry date formatted strictly as YYYY-MM-DD if present; otherwise empty string.',
    },
    address: {
      type: Type.STRING,
      description: 'Printed residential address (Region, Sub-city, Woreda, City, House No) if present; otherwise empty string.',
    },
    phone: {
      type: Type.STRING,
      description: 'Phone number if printed on the document; otherwise empty string.',
    },
    detectedLanguages: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Languages/scripts visible on the ID document (e.g. English, Amharic).',
    },
    overallConfidence: {
      type: Type.STRING,
      description: 'HIGH, MEDIUM, or LOW based on image sharpness, lighting, and readability.',
    },
    fieldConfidence: {
      type: Type.OBJECT,
      properties: {
        fullName: { type: Type.STRING },
        dateOfBirth: { type: Type.STRING },
        gender: { type: Type.STRING },
        nationality: { type: Type.STRING },
        documentNumber: { type: Type.STRING },
        documentExpiryDate: { type: Type.STRING },
        address: { type: Type.STRING },
      },
    },
    uncertainFields: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Field keys where text was blurry, partially occluded, or ambiguous.',
    },
    warnings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'Specific human-review warnings: blurry areas, cropped edges, expired date, mismatch between front/back, or if image does not appear to be an official ID.',
    },
    portraitBox: {
      type: Type.OBJECT,
      description:
        'Normalized 0-1000 bounding box of the ID holder face portrait photograph if clearly visible on the document; omit or set all 0 if not visible.',
      properties: {
        ymin: { type: Type.INTEGER },
        xmin: { type: Type.INTEGER },
        ymax: { type: Type.INTEGER },
        xmax: { type: Type.INTEGER },
        side: { type: Type.STRING, description: 'FRONT or BACK' },
      },
    },
    summaryNote: {
      type: Type.STRING,
      description: 'Short 1-2 sentence neutral summary of what was extracted and what staff should double-check.',
    },
  },
};

export async function handleScanIdDocument(body: ScanIdRequestBody): Promise<HandlerResult> {
  if (!body || body.consentConfirmed !== true) {
    return {
      status: 400,
      body: {
        code: 'CONSENT_REQUIRED',
        error:
          'Explicit privacy and authorization confirmation is required before analyzing an identification document.',
      },
    };
  }

  if (!body.frontDataUrl || typeof body.frontDataUrl !== 'string') {
    return {
      status: 400,
      body: {
        code: 'MISSING_DOCUMENT',
        error: 'Please upload or capture the front side of an identification document (JPG, PNG, WebP, or PDF).',
      },
    };
  }

  const frontParsed = parseDataUrl(body.frontDataUrl, body.frontMimeType);
  if (!frontParsed || !ALLOWED_MIME_TYPES.has(frontParsed.mimeType)) {
    return {
      status: 400,
      body: {
        code: 'UNSUPPORTED_MEDIA',
        error: 'Unsupported document format. Supported formats: JPEG, PNG, WebP, and PDF.',
      },
    };
  }

  // Guard size (max ~8MB base64 per file)
  if (frontParsed.base64.length > 10_500_000) {
    return {
      status: 413,
      body: {
        code: 'DOCUMENT_TOO_LARGE',
        error: 'The uploaded document exceeds the 7.5 MB scan limit. Please compress or retake the photo.',
      },
    };
  }

  let backParsed: { mimeType: string; base64: string } | null = null;
  if (body.backDataUrl && typeof body.backDataUrl === 'string') {
    const parsed = parseDataUrl(body.backDataUrl, body.backMimeType);
    if (!parsed || !ALLOWED_MIME_TYPES.has(parsed.mimeType)) {
      return {
        status: 400,
        body: {
          code: 'UNSUPPORTED_BACK_MEDIA',
          error: 'Back side format is unsupported. Use JPEG, PNG, WebP, or PDF.',
        },
      };
    }
    if (parsed.base64.length > 10_500_000) {
      return {
        status: 413,
        body: {
          code: 'BACK_DOCUMENT_TOO_LARGE',
          error: 'Back side image exceeds the 7.5 MB scan limit.',
        },
      };
    }
    backParsed = parsed;
  }

  const ai = getGeminiClient();
  if (!ai) {
    return {
      status: 503,
      body: {
        code: 'AI_UNCONFIGURED',
        error:
          'AI OCR service is not configured yet. Please ensure GEMINI_API_KEY is set in Settings > Secrets (or Vercel Environment Variables).',
      },
    };
  }

  const regContext = body.registrationType === 'STAFF' ? 'staff member' : 'student';

  const systemInstruction = `You are a high-precision OCR and identity document extraction assistant for ZACMA Technology & Training Institute in Ethiopia.
Your job is strictly to read visible text from official identification documents (Ethiopian Fayda National ID / Digital ID, Ethiopian Kebele/National ID, international Passports including Ethiopian Passports, and Driving Licences) to assist authorized staff in filling out a ${regContext} registration form.

CRITICAL RULES:
1. NEVER invent, guess, or fabricate any field that is not clearly visible on the document. If a field is unreadable or absent, return "" and set its fieldConfidence to "MISSING" or "LOW", and include its key in uncertainFields.
2. NEVER claim that the document is genuine, authentic, or verified. You only extract visible OCR text.
3. For Ethiopian Fayda ID cards, carefully read BOTH English and Amharic fields (including FAN / FIN 12-16 digit numbers, Gregorian DOB alongside Ethiopian DOB, Sex/Gender, Nationality, Phone, Region/Sub-city/Woreda Address, and Expiry Date). Prefer the Gregorian date in YYYY-MM-DD for dateOfBirth and documentExpiryDate, and put the raw printed date in dateOfBirthRaw.
4. For Passports, cross-check the visual inspection zone against the MRZ (Machine Readable Zone) lines at the bottom. If there is a mismatch between the visual zone and MRZ, add a clear warning.
5. For Driving Licences, populate both documentNumber and drivingLicenceNumber with the licence number.
6. If the holder's face portrait photograph is clearly visible inside the ID image, return portraitBox with normalized integer coordinates [0..1000] (ymin, xmin, ymax, xmax) and side ("FRONT" or "BACK") tightly framing the ID portrait photo (including head & shoulders). If the input is a PDF or no face portrait is visible, set portraitBox coordinates to 0.
7. If the uploaded image does not appear to be an identification document, set detectedDocumentType to "UNKNOWN", overallConfidence to "LOW", and add a clear warning explaining that no supported ID document was recognized.`;

  const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [
    {
      inlineData: {
        mimeType: frontParsed.mimeType,
        data: frontParsed.base64,
      },
    },
  ];

  if (backParsed) {
    parts.push({
      inlineData: {
        mimeType: backParsed.mimeType,
        data: backParsed.base64,
      },
    });
  }

  parts.push({
    text: backParsed
      ? 'Analyze the FRONT side (first attachment) and BACK side (second attachment) of this identification document. Combine information from both sides accurately and return the structured JSON extraction.'
      : 'Analyze this identification document (FRONT side) and return the structured JSON extraction.',
  });

  const model = getAiModelName();

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: SCAN_RESPONSE_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      return {
        status: 502,
        body: {
          code: 'EMPTY_OCR_RESPONSE',
          error: 'The AI OCR engine returned an empty response. Please retake a clearer photo and try again.',
        },
      };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          status: 502,
          body: {
            code: 'INVALID_OCR_JSON',
            error: 'Could not parse structured fields from OCR output. Please rescan with better lighting.',
          },
        };
      }
      parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    }

    const detectedDocumentType = normalizeDocType(String(parsed.detectedDocumentType || ''));
    const fullName = String(parsed.fullName || '').trim().slice(0, 120);
    const dateOfBirthRaw = String(parsed.dateOfBirthRaw || '').trim().slice(0, 60);
    const dateOfBirth = normalizeIsoDate(String(parsed.dateOfBirth || '')) || normalizeIsoDate(dateOfBirthRaw);
    const gender = normalizeGender(String(parsed.gender || ''));
    const nationality = String(parsed.nationality || '').trim().slice(0, 80);
    const drivingLicenceNumber = String(parsed.drivingLicenceNumber || '').trim().slice(0, 60);
    const documentNumber = (
      String(parsed.documentNumber || '').trim() || drivingLicenceNumber
    ).slice(0, 60);
    const documentExpiryDate = normalizeIsoDate(String(parsed.documentExpiryDate || ''));
    const address = String(parsed.address || '').trim().slice(0, 240);
    const phone = String(parsed.phone || '').trim().slice(0, 30);

    const detectedLanguages = Array.isArray(parsed.detectedLanguages)
      ? parsed.detectedLanguages.map((l) => String(l).trim()).filter(Boolean).slice(0, 6)
      : [];

    const rawConf = (parsed.fieldConfidence || {}) as Record<string, unknown>;
    const fieldConfidence = {
      fullName: fullName ? normalizeConfidence(String(rawConf.fullName || 'MEDIUM')) : 'MISSING',
      dateOfBirth: dateOfBirth ? normalizeConfidence(String(rawConf.dateOfBirth || 'MEDIUM')) : 'MISSING',
      gender: gender ? normalizeConfidence(String(rawConf.gender || 'MEDIUM')) : 'MISSING',
      nationality: nationality ? normalizeConfidence(String(rawConf.nationality || 'MEDIUM')) : 'MISSING',
      documentNumber: documentNumber ? normalizeConfidence(String(rawConf.documentNumber || 'MEDIUM')) : 'MISSING',
      documentExpiryDate: documentExpiryDate
        ? normalizeConfidence(String(rawConf.documentExpiryDate || 'MEDIUM'))
        : 'MISSING',
      address: address ? normalizeConfidence(String(rawConf.address || 'MEDIUM')) : 'MISSING',
    } as ScannedIdExtraction['fieldConfidence'];

    const uncertainSet = new Set<string>(
      Array.isArray(parsed.uncertainFields)
        ? parsed.uncertainFields.map((f) => String(f).trim()).filter(Boolean)
        : []
    );
    (Object.entries(fieldConfidence) as Array<[string, FieldConfidenceLevel]>).forEach(([k, v]) => {
      if (v === 'LOW' || v === 'MISSING') {
        if (k === 'fullName' || k === 'documentNumber' || k === 'dateOfBirth') {
          uncertainSet.add(k);
        }
      }
    });

    const warnings: string[] = Array.isArray(parsed.warnings)
      ? parsed.warnings.map((w) => String(w).trim()).filter(Boolean).slice(0, 10)
      : [];

    // Automatic expiry date validation
    if (documentExpiryDate) {
      const todayIso = new Date().toISOString().slice(0, 10);
      if (documentExpiryDate < todayIso) {
        warnings.unshift(`Document expiry date (${documentExpiryDate}) has already passed — verify validity before approval.`);
      } else {
        const diffDays = Math.round(
          (new Date(`${documentExpiryDate}T00:00:00Z`).getTime() -
            new Date(`${todayIso}T00:00:00Z`).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        if (diffDays <= 30) {
          warnings.push(`Document expires soon (${documentExpiryDate}, in ${diffDays} day(s)).`);
        }
      }
    }

    if (detectedDocumentType === 'UNKNOWN') {
      warnings.unshift(
        'Document format could not be confidently classified as National ID, Fayda ID, Passport, or Driving Licence.'
      );
    }

    // Parse portrait bounding box if valid
    let portraitBox: ScannedIdExtraction['portraitBox'] = null;
    if (parsed.portraitBox && typeof parsed.portraitBox === 'object') {
      const pb = parsed.portraitBox as Record<string, unknown>;
      const ymin = Number(pb.ymin);
      const xmin = Number(pb.xmin);
      const ymax = Number(pb.ymax);
      const xmax = Number(pb.xmax);
      const side = String(pb.side || 'FRONT').toUpperCase() === 'BACK' ? 'BACK' : 'FRONT';
      if (
        Number.isFinite(ymin) &&
        Number.isFinite(xmin) &&
        Number.isFinite(ymax) &&
        Number.isFinite(xmax) &&
        ymax > ymin + 30 &&
        xmax > xmin + 30 &&
        ymin >= 0 &&
        xmin >= 0 &&
        ymax <= 1000 &&
        xmax <= 1000
      ) {
        portraitBox = { ymin, xmin, ymax, xmax, side };
      }
    }

    const overallRaw = String(parsed.overallConfidence || 'MEDIUM').toUpperCase();
    const overallConfidence: 'HIGH' | 'MEDIUM' | 'LOW' =
      overallRaw === 'HIGH' || overallRaw === 'MEDIUM' || overallRaw === 'LOW'
        ? overallRaw
        : 'MEDIUM';

    const extraction: ScannedIdExtraction = {
      detectedDocumentType,
      fullName,
      dateOfBirth,
      dateOfBirthRaw,
      gender,
      nationality,
      documentNumber,
      drivingLicenceNumber,
      documentExpiryDate,
      address,
      phone,
      detectedLanguages,
      overallConfidence,
      fieldConfidence,
      uncertainFields: Array.from(uncertainSet).slice(0, 12),
      warnings: Array.from(new Set(warnings)).slice(0, 10),
      portraitBox,
      summaryNote: String(parsed.summaryNote || '').trim().slice(0, 320),
      verificationNotice:
        'AI OCR extracts visible text to speed up registration only. It does NOT verify document authenticity — physical inspection and Admin approval are strictly required.',
    };

    return {
      status: 200,
      body: {
        ok: true,
        model,
        extraction,
      },
    };
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : 'Unexpected OCR processing error';
    const isAuthErr =
      rawMessage.includes('API_KEY_INVALID') ||
      rawMessage.includes('PERMISSION_DENIED') ||
      rawMessage.includes('403');
    const isQuotaErr = rawMessage.includes('RESOURCE_EXHAUSTED') || rawMessage.includes('429');
    return {
      status: isQuotaErr ? 429 : isAuthErr ? 403 : 502,
      body: {
        code: isQuotaErr ? 'AI_QUOTA_EXCEEDED' : isAuthErr ? 'AI_AUTH_ERROR' : 'OCR_FAILED',
        error: isAuthErr
          ? 'Gemini API key was rejected. Please verify GEMINI_API_KEY in Settings > Secrets.'
          : isQuotaErr
          ? 'AI OCR quota temporarily reached. Please retry in a moment or enter details manually.'
          : `Document OCR failed: ${rawMessage}`,
      },
    };
  }
}
