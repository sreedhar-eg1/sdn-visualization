import {
  ComplianceStatus,
  SanctionsRecord,
  ScreeningCategory,
  ScreeningSource,
} from '../models/sanctions.models';

/**
 * Parses an RFC-4180 CSV string (supporting quoted fields with "" escapes and commas inside quotes)
 * into a 2D array of string cells.
 */
export function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  const text = csvText.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentCell);
        currentCell = '';
      } else if (ch === '\r') {
        if (text[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else if (ch === '\n') {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += ch;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0));
}

function cleanText(raw: string | undefined | null): string {
  return String(raw ?? '')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function safeJsonParse<T>(raw: string | undefined, fallback: T): T {
  const cleaned = cleanText(raw);
  if (!cleaned) return fallback;
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

function normalizeCountry(raw: string): string {
  const trimmed = cleanText(raw);
  if (!trimmed) return 'Unspecified';
  if (/^p\.?\s*r\.?\s*china$/i.test(trimmed)) return 'China';
  return trimmed;
}

function normalizeSource(raw: string): ScreeningSource {
  const upper = cleanText(raw).toUpperCase();
  if (upper === 'PAPERCEPT' || upper === 'S1M' || upper === 'IDAMS' || upper === 'EMS') {
    return upper;
  }
  if (upper.includes('IEEE')) return 'IEEE XPLORE';
  return 'IDAMS';
}

function parseMatchedTerms(raw: string): ScreeningCategory[] {
  const parts = cleanText(raw)
    .split('|')
    .map((p) => cleanText(p).toUpperCase())
    .filter((p): p is ScreeningCategory => p === 'PAL' || p === 'PCL' || p === 'SDN');
  return parts.length > 0 ? Array.from(new Set(parts)) : ['PAL'];
}

function normalizeStatus(raw: string): ComplianceStatus {
  return cleanText(raw).toUpperCase() === 'GREEN' ? 'Green' : 'Red';
}

function normalizeDecisionDate(raw: string): string {
  const cleaned = cleanText(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    return cleaned.slice(0, 10);
  }
  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const monthMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const namedMatch =
    cleaned.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})\b.*?\b(\d{4})\b/i) ||
    cleaned.match(/\b(\d{1,2})[-/\s]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/\s]+(\d{4})\b/i);
  if (namedMatch) {
    const isFirstAlpha = isNaN(Number(namedMatch[1]));
    const monStr = (isFirstAlpha ? namedMatch[1] : namedMatch[2]).slice(0, 3).toLowerCase();
    const dayStr = (isFirstAlpha ? namedMatch[2] : namedMatch[1]).padStart(2, '0');
    const yearStr = namedMatch[3];
    return `${yearStr}-${monthMap[monStr] ?? '01'}-${dayStr}`;
  }
  if (cleaned) {
    const parsed = new Date(cleaned);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return new Date().toISOString().slice(0, 10);
}

function parseBracketedAffiliation(raw: string): RawAffiliation {
  const cleaned = cleanText(raw).replace(/^\[|\]$/g, '').trim();
  if (!cleaned) return {};
  const aff: RawAffiliation = {};
  const tokens = cleaned.split(/,\s*(?=[A-Za-z\s]+:)/);
  for (const token of tokens) {
    const colonIdx = token.indexOf(':');
    if (colonIdx === -1) continue;
    const key = token.slice(0, colonIdx).trim().toLowerCase().replace(/[\s_-]+/g, '');
    const val = token.slice(colonIdx + 1).trim();
    if (key === 'city') aff.city = val;
    else if (key === 'country') aff.country = val;
    else if (key === 'organisationname' || key === 'organizationname' || key === 'institution') aff.organisationName = val;
    else if (key === 'organisationdivision' || key === 'department') aff.organisationDivision = val;
    else if (key === 'organisationdepartment') aff.organisationDepartment = val;
  }
  return aff;
}

interface RawAffiliation {
  city?: string;
  country?: string;
  organisationName?: string;
  organisationDivision?: string;
  organisationDepartment?: string;
}

interface RawMatchHit {
  name?: string;
  formattedName?: string;
  palId?: string;
  sdnId?: string;
  id?: string;
  score?: string | number;
  affiliation?: string[];
  country?: string[];
  role?: string;
}

export function recomputeCoAuthorsByDocument(records: SanctionsRecord[]): SanctionsRecord[] {
  const docAuthorsMap = new Map<string, string[]>();
  for (const rec of records) {
    const list = docAuthorsMap.get(rec.documentId) ?? [];
    if (!list.includes(rec.authorName)) {
      list.push(rec.authorName);
    }
    docAuthorsMap.set(rec.documentId, list);
  }

  return records.map((rec) => {
    const allAuthors = docAuthorsMap.get(rec.documentId) ?? [];
    const coAuthors = allAuthors.filter((name) => name !== rec.authorName);
    return {
      ...rec,
      coAuthors,
      coAuthorCount: coAuthors.length,
    };
  });
}

const EXPECTED_SCREENING_HEADERS = [
  'documentid',
  'docid',
  'authorfullname',
  'authorname',
  'matchedterm',
  'reason',
  'status',
  'documentsource',
  'manuscriptid',
  'journalname',
  'palscore',
  'pclscore',
  'sdnscore',
  'palid',
];

/**
 * Maps a 2D table (header row + data rows from CSV or Excel sheet) into typed SanctionsRecords.
 * Returns [] if the sheet does not contain recognizable sanctions screening columns.
 */
export function parseSanctionsTableRows(
  rawRows: string[][],
  batchId = 'batch-default',
  fileName = 'uploaded.csv'
): SanctionsRecord[] {
  const rows = rawRows.filter((row) => row.some((cell) => cleanText(cell).length > 0));
  if (rows.length < 2) return [];

  const normHeaders = rows[0].map((h) => cleanText(h).toLowerCase().replace(/[\s_-]+/g, ''));
  const matchedHeaderCount = EXPECTED_SCREENING_HEADERS.filter((h) =>
    normHeaders.includes(h)
  ).length;
  if (matchedHeaderCount < 2) {
    return [];
  }

  const findCol = (...candidates: string[]): number => {
    return normHeaders.findIndex((h) => candidates.includes(h));
  };

  const docIdIdx = findCol('documentid', 'docid');
  const idIdx = findCol('id');
  const manuscriptIdIdx = findCol('manuscriptid');
  const authorNameIdx = findCol('authorfullname', 'authorname');
  const authorFirstIdx = findCol('authorfirstname', 'firstname');
  const authorLastIdx = findCol('authorlastname', 'lastname');
  const emailIdx = findCol('authoremailaddress', 'email', 'authoremail');
  const statusIdx = findCol('status');
  const sourceIdx = findCol('documentsource', 'source');
  const journalIdx = findCol('journalname', 'journal');
  const docTitleIdx = findCol('documenttitle', 'title');
  const docTypeIdx = findCol('documenttype', 'type');
  const reasonIdx = findCol('matchedterm', 'reason');
  const countryIdx = findCol('country');
  const affilIdx = findCol('affiliations', 'affiliation');
  const palIdIdx = findCol('palid');
  const authorIdIdx = findCol('authorid', 'authorrecordid');
  const dateIdx = findCol('decisiondate', 'startdate', 'enddate');
  const palScoreIdx = findCol('palscore');
  const sdnScoreIdx = findCol('sdnscore');
  const pclScoreIdx = findCol('pclscore');
  const commentsIdx = findCol('comments', 'curationcomments');

  let currentDocId = '';
  let currentDocTitle = '';
  let currentManuscriptId = '';
  let currentJournalName = '';
  let currentDocType = 'Article';
  let currentSource: ScreeningSource = 'IDAMS';
  let currentDecisionDate = '';
  let currentStatus: ComplianceStatus = 'Red';
  let isCoAuthorsSection = false;

  const parsedRecords: SanctionsRecord[] = [];

  for (let rIdx = 1; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    const getVal = (idx: number): string => (idx >= 0 && idx < row.length ? cleanText(row[idx]) : '');

    const rawAuthor =
      getVal(authorNameIdx) ||
      `${getVal(authorFirstIdx)} ${getVal(authorLastIdx)}`.trim();

    if (/^co-?authors?$/i.test(rawAuthor)) {
      isCoAuthorsSection = true;
      continue;
    }

    const explicitDocId = getVal(docIdIdx);
    const rowId = getVal(idIdx) || String(rIdx);

    if (explicitDocId) {
      currentDocId = explicitDocId;
      currentManuscriptId = getVal(manuscriptIdIdx);
      currentJournalName = getVal(journalIdx);
      currentDocTitle = getVal(docTitleIdx) || currentJournalName || `Screened Document ${explicitDocId}`;
      currentDocType = getVal(docTypeIdx) || 'Article';
      if (getVal(sourceIdx)) {
        currentSource = normalizeSource(getVal(sourceIdx));
      }
      if (getVal(statusIdx)) {
        currentStatus = normalizeStatus(getVal(statusIdx));
      }
      if (getVal(dateIdx)) {
        currentDecisionDate = normalizeDecisionDate(getVal(dateIdx));
      }
      isCoAuthorsSection = false;
    } else {
      if (!currentDocId) {
        currentDocId = `DOC-XLS-${rowId}`;
        currentDocTitle = `Screened Document ${currentDocId}`;
      }
    }

    if (!rawAuthor && !getVal(emailIdx) && !getVal(reasonIdx)) {
      continue;
    }

    const authorName = rawAuthor || 'Unknown Author';
    const email = getVal(emailIdx).toLowerCase();
    const orcid = getVal(findCol('authororcidid'));
    const rawAuthorId = getVal(authorIdIdx);
    const authorId = orcid
      ? `ORCID-${orcid}`
      : email
        ? `EMAIL-${email}`
        : `AUTH-${rawAuthorId || rowId}`;

    const rawPalId = getVal(palIdIdx).replace(/^\[|\]$/g, '').trim();

    const rawAffil = getVal(affilIdx);
    let affilObj: RawAffiliation = {};
    if (rawAffil) {
      const parsedJson = safeJsonParse<RawAffiliation[]>(rawAffil, []);
      if (Array.isArray(parsedJson) && parsedJson.length > 0 && typeof parsedJson[0] === 'object') {
        affilObj = parsedJson[0];
      } else if (rawAffil.trim().startsWith('[') && rawAffil.includes(':')) {
        affilObj = parseBracketedAffiliation(rawAffil);
      }
    }

    const rawCountry = getVal(countryIdx).replace(/^\[|\]$/g, '').trim();
    const country = normalizeCountry(rawCountry || affilObj.country || '');
    const city = cleanText(affilObj.city) || 'N/A';
    const organization =
      cleanText(affilObj.organisationName) ||
      cleanText(affilObj.organisationDivision) ||
      'Unspecified Affiliation';

    const rawReason = getVal(reasonIdx);
    const palHits = safeJsonParse<RawMatchHit[]>(getVal(palScoreIdx), []);
    const sdnHits = safeJsonParse<RawMatchHit[]>(getVal(sdnScoreIdx), []);
    const pclHits = safeJsonParse<RawMatchHit[]>(getVal(pclScoreIdx), []);

    const matchedTerms: ScreeningCategory[] = [];
    if (/pcl/i.test(rawReason) || pclHits.length > 0) matchedTerms.push('PCL');
    if (/pal/i.test(rawReason) || palHits.length > 0 || rawPalId.length > 0) matchedTerms.push('PAL');
    if (/sdn|ofac/i.test(rawReason) || sdnHits.length > 0) matchedTerms.push('SDN');
    if (matchedTerms.length === 0) {
      const parsed = parseMatchedTerms(rawReason);
      if (parsed.length > 0) {
        matchedTerms.push(...parsed);
      } else if (!isCoAuthorsSection) {
        matchedTerms.push('PAL');
      }
    }

    const primaryCategory: ScreeningCategory = matchedTerms.includes('PCL')
      ? 'PCL'
      : matchedTerms.includes('SDN')
        ? 'SDN'
        : 'PAL';

    const rowStatusRaw = getVal(statusIdx);
    const rowStatus: ComplianceStatus = rowStatusRaw
      ? normalizeStatus(rowStatusRaw)
      : isCoAuthorsSection
        ? 'Green'
        : currentStatus;

    let reasonText = rawReason;
    if (isCoAuthorsSection && !rawReason) {
      reasonText = `Co-Author on Document ${currentDocId}`;
    } else if (!reasonText) {
      const parts = matchedTerms.map((t) =>
        t === 'PAL' ? 'PAL Match' : t === 'SDN' ? 'SDN Match' : 'PCL Country Rule'
      );
      reasonText = parts.join(' + ') || 'Screening Alert';
    }

    const topPal = palHits[0];
    const topSdn = sdnHits[0];
    const topPcl = pclHits[0];
    const rawScores = [topPal?.score, topSdn?.score, topPcl?.score]
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0);
    const maxScore = rawScores.length > 0 ? Math.max(...rawScores) : 3.5;
    const riskScore =
      rowStatus === 'Red'
        ? Math.min(99, Math.max(68, Math.round(52 + maxScore * 5.8)))
        : Math.min(59, Math.max(20, Math.round(20 + maxScore * 4.5)));

    const matchedParts: string[] = [];
    if (topPal?.formattedName || topPal?.name) {
      matchedParts.push(`PAL: ${topPal.formattedName ?? topPal.name}`);
    }
    if (topSdn?.formattedName || topSdn?.name) {
      matchedParts.push(`SDN: ${topSdn.formattedName ?? topSdn.name}`);
    }
    if (topPcl?.name) {
      matchedParts.push(`PCL: ${topPcl.name}`);
    }

    const comments = getVal(commentsIdx);
    const notes = comments && comments !== '[]' ? `${organization}. ${comments}` : `${organization} (${currentDocType}).`;

    parsedRecords.push({
      id: `${batchId}-${rowId}-${rIdx}`,
      documentId: currentDocId,
      documentTitle: currentDocTitle,
      manuscriptId: currentManuscriptId || undefined,
      journalName: currentJournalName || undefined,
      documentType: currentDocType,
      source: currentSource,
      decisionDate: currentDecisionDate || new Date().toISOString().slice(0, 10),
      status: rowStatus,
      authorName,
      authorEmail: email || undefined,
      authorId,
      palId: rawPalId || undefined,
      coAuthors: [],
      coAuthorCount: 0,
      country,
      city,
      organization,
      affiliationsRaw: rawAffil || undefined,
      matchedTerms,
      category: primaryCategory,
      reason: reasonText,
      riskScore,
      notes,
      matchedEntitySummary: matchedParts.join(' • ') || undefined,
      dataOrigin: 'UPLOADED_EXCEL',
      batchId,
      sourceFileName: fileName,
      matchedWatchlist: matchedTerms.join(' | '),
    });
  }

  return recomputeCoAuthorsByDocument(parsedRecords);
}

export function parseSanctionsCsvExport(
  csvText: string,
  batchId = 'batch-default',
  fileName = 'uploaded.csv'
): SanctionsRecord[] {
  // Reject binary payloads (such as ZIP/.xlsx containers or NUL-byte binaries)
  if (!csvText || csvText.startsWith('PK\x03\x04') || csvText.includes('\u0000')) {
    return [];
  }
  const rows = parseCsvRows(csvText);
  return parseSanctionsTableRows(rows, batchId, fileName);
}

/**
 * Parses an Excel workbook (.xlsx or .xls) binary buffer into SanctionsRecords.
 * Uses dynamic import so SheetJS loads only when a workbook is uploaded.
 */
export async function parseSanctionsExcelWorkbook(
  buffer: ArrayBuffer,
  batchId = 'batch-default',
  fileName = 'uploaded.xlsx'
): Promise<SanctionsRecord[]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const allRecords: SanctionsRecord[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });
    const stringRows = rows.map((r) => r.map((cell) => String(cell ?? '')));
    const parsed = parseSanctionsTableRows(stringRows, batchId, fileName);
    if (parsed.length > 0) {
      allRecords.push(...parsed);
    }
  }

  return recomputeCoAuthorsByDocument(allRecords);
}
