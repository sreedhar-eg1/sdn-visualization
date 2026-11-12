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
  if (cleaned) {
    const parsed = new Date(cleaned);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return new Date().toISOString().slice(0, 10);
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
  'authorfullname',
  'matchedterm',
  'status',
  'documentsource',
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

  const headers = rows[0].map((h) => cleanText(h).toLowerCase());
  const matchedHeaderCount = EXPECTED_SCREENING_HEADERS.filter((h) =>
    headers.includes(h)
  ).length;
  if (matchedHeaderCount < 2) {
    return [];
  }

  const indexOf = (col: string): number => headers.indexOf(col.toLowerCase());

  const getCell = (row: string[], col: string): string => {
    const idx = indexOf(col);
    return idx >= 0 && idx < row.length ? cleanText(row[idx]) : '';
  };

  // First pass: group author names per documentId so we can compute co-authors accurately
  const docAuthorsMap = new Map<string, string[]>();
  for (const row of rows.slice(1)) {
    const docId = getCell(row, 'documentid') || `DOC-${getCell(row, 'id')}`;
    const fullName =
      getCell(row, 'authorfullname') ||
      `${getCell(row, 'authorfirstname')} ${getCell(row, 'authorlastname')}`.trim();
    if (!fullName) continue;
    const list = docAuthorsMap.get(docId) ?? [];
    if (!list.includes(fullName)) {
      list.push(fullName);
    }
    docAuthorsMap.set(docId, list);
  }

  const parsedRecords: SanctionsRecord[] = [];

  rows.slice(1).forEach((row, idx) => {
    const rowId = getCell(row, 'id') || String(idx + 1);
    const authorName =
      getCell(row, 'authorfullname') ||
      `${getCell(row, 'authorfirstname')} ${getCell(row, 'authorlastname')}`.trim() ||
      'Unknown Author';

    const documentId = getCell(row, 'documentid') || `DOC-XLS-${rowId}`;
    const documentTitle = getCell(row, 'documenttitle') || 'Untitled Document';
    const documentType = getCell(row, 'documenttype') || 'Article';
    const source = normalizeSource(getCell(row, 'documentsource'));
    const status = normalizeStatus(getCell(row, 'status'));
    const matchedTerms = parseMatchedTerms(getCell(row, 'matchedterm'));
    const primaryCategory: ScreeningCategory = matchedTerms.includes('PCL')
      ? 'PCL'
      : matchedTerms.includes('SDN')
        ? 'SDN'
        : 'PAL';

    const affiliations = safeJsonParse<RawAffiliation[]>(getCell(row, 'affiliations'), []);
    const primaryAffil = affiliations[0] ?? {};
    const country = normalizeCountry(primaryAffil.country ?? '');
    const city = cleanText(primaryAffil.city) || 'N/A';
    const organization =
      cleanText(primaryAffil.organisationName) ||
      cleanText(primaryAffil.organisationDivision) ||
      'Unspecified Affiliation';

    const palHits = safeJsonParse<RawMatchHit[]>(getCell(row, 'palscore'), []);
    const sdnHits = safeJsonParse<RawMatchHit[]>(getCell(row, 'sdnscore'), []);
    const pclHits = safeJsonParse<RawMatchHit[]>(getCell(row, 'pclscore'), []);

    const topPal = palHits[0];
    const topSdn = sdnHits[0];
    const topPcl = pclHits[0];

    const rawScoreValues = [topPal?.score, topSdn?.score, topPcl?.score]
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0);
    const maxRawScore = rawScoreValues.length > 0 ? Math.max(...rawScoreValues) : 3.5;
    // Scale Lucene/Elasticsearch match scores (~3.0 - 8.0) onto a 0-100 risk index
    const riskScore =
      status === 'Red'
        ? Math.min(99, Math.max(68, Math.round(52 + maxRawScore * 5.8)))
        : Math.min(59, Math.max(20, Math.round(20 + maxRawScore * 4.5)));

    const matchedParts: string[] = [];
    if (topPal?.formattedName || topPal?.name) {
      matchedParts.push(
        `PAL: ${topPal.formattedName ?? topPal.name} (${topPal.id ?? topPal.palId ?? 'PAL'})`
      );
    }
    if (topSdn?.formattedName || topSdn?.name) {
      matchedParts.push(
        `SDN: ${topSdn.formattedName ?? topSdn.name} (${topSdn.id ?? topSdn.sdnId ?? 'SDN'})`
      );
    }
    if (topPcl?.name) {
      matchedParts.push(`PCL: ${topPcl.name}`);
    }

    const allDocAuthors = docAuthorsMap.get(documentId) ?? [];
    const coAuthors = allDocAuthors.filter((name) => name !== authorName);

    const decisionDate = normalizeDecisionDate(
      getCell(row, 'startdate') || getCell(row, 'enddate')
    );

    const orcid = getCell(row, 'authororcidid');
    const email = getCell(row, 'authoremailaddress').toLowerCase();
    const authorId = orcid
      ? `ORCID-${orcid}`
      : email
        ? `EMAIL-${email}`
        : `AUTH-${getCell(row, 'authorid') || rowId}`;

    const reasonParts = matchedTerms.map((term) => {
      if (term === 'PAL') return `PAL Match (${palHits.length || 1} hit${palHits.length === 1 ? '' : 's'})`;
      if (term === 'SDN') return `SDN Match (${sdnHits.length || 1} hit${sdnHits.length === 1 ? '' : 's'})`;
      return `PCL Country Rule`;
    });

    const comments = getCell(row, 'comments');
    const notes =
      comments && comments !== '[]'
        ? `${organization}. ${comments}`
        : `${organization} (${documentType}).`;

    parsedRecords.push({
      id: `${batchId}-${rowId}-${idx + 1}`,
      documentId,
      documentTitle,
      source,
      authorName,
      authorId,
      coAuthors,
      coAuthorCount: coAuthors.length,
      country,
      city,
      category: primaryCategory,
      matchedTerms,
      reason: reasonParts.join(' + '),
      status,
      riskScore,
      decisionDate,
      matchedWatchlist: matchedTerms.join(' | '),
      notes,
      dataOrigin: 'UPLOADED_EXCEL',
      batchId,
      sourceFileName: fileName,
      authorEmail: getCell(row, 'authoremailaddress') || undefined,
      organization,
      documentType,
      matchedEntitySummary: matchedParts.join(' • ') || undefined,
    });
  });

  return parsedRecords;
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
