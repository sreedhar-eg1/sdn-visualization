import { Injectable, computed, signal } from '@angular/core';
import { UPLOADED_SANCTIONS_CSV } from '../data/uploaded-sanctions-csv';
import {
  ComplianceStatus,
  DatasetMode,
  DateRangePreset,
  PalEntry,
  RestrictedLocation,
  SanctionsRecord,
  ScreeningCategory,
  ScreeningSource,
  UploadedFileBatch,
  WatchlistSourceConfig,
} from '../models/sanctions.models';
import {
  parseSanctionsCsvExport,
  parseSanctionsExcelWorkbook,
  recomputeCoAuthorsByDocument,
} from '../utils/sanctions-csv-parser.util';

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(base: Date, offsetDays: number): Date {
  const result = new Date(base);
  result.setDate(result.getDate() + offsetDays);
  return result;
}

const SOURCES: ScreeningSource[] = ['PAPERCEPT', 'S1M', 'IDAMS'];

const COUNTRY_SEEDS: ReadonlyArray<{
  country: string;
  city: string;
  pclWeight: number;
  redBias: number;
}> = [
  { country: 'Iran', city: 'Tehran', pclWeight: 26, redBias: 0.72 },
  { country: 'China', city: 'Beijing', pclWeight: 22, redBias: 0.48 },
  { country: 'India', city: 'Bengaluru', pclWeight: 15, redBias: 0.25 },
  { country: 'Norway', city: 'Oslo', pclWeight: 12, redBias: 0.22 },
  { country: 'Russia', city: 'Moscow', pclWeight: 13, redBias: 0.68 },
  { country: 'North Korea', city: 'Pyongyang', pclWeight: 7, redBias: 0.92 },
  { country: 'Syria', city: 'Damascus', pclWeight: 5, redBias: 0.85 },
];

const DOCUMENT_TITLES: readonly string[] = [
  'Next-Generation Radar Signal Processing for Maritime Surveillance',
  'Silicon Carbide Power Electronics in High-Voltage Traction Inverters',
  'Autonomous Multi-Agent Path Planning in GPS-Denied Environments',
  'Cryogenic Superconducting Resonators for Quantum Fault Tolerance',
  'Distributed Ledger Consensus Protocols for Cross-Border Settlement',
  'Sub-Nanometer FinFET Gate Dielectric Reliability Under Radiation',
  'Hypersonic Thermal Protection Coatings via Ceramic Matrix Composites',
  'Adaptive Beamforming Arrays for Low-Earth Orbit Satellite Links',
  'Zero-Knowledge Identity Proofs in Industrial Control Telemetry',
  'High-Torque Permanent Magnet Synchronous Motors for UAV Propulsion',
  'Post-Quantum Lattice Cryptography Hardware Accelerators',
  'Synthetic Aperture Imaging Algorithms for Atmospheric Sensing',
  'Federated Anomaly Detection in Critical Energy Substations',
  'Acoustic Metamaterials for Low-Frequency Vibration Isolation',
  'Microfluidic Biosensor Arrays for Rapid Pathogen Diagnostics',
  'High-Energy Laser Optics Thermal Distortion Compensation',
];

const AUTHOR_NAMES: readonly string[] = [
  'Dr. Amirhossein Rezai',
  'Prof. Wei-Lin Zhang',
  'Dr. Henrik Solberg',
  'Dr. Rajeshwar Kulkarni',
  'Dr. Sergey Volkov',
  'Dr. Farnaz Darvish',
  'Dr. Jin-Hao Chen',
  'Dr. Astrid Lindqvist',
  'Dr. Vikramaditya Nair',
  'Dr. Dmitry Kovalenko',
  'Dr. Reza Mohammadi',
  'Dr. Mei-Fang Liu',
  'Dr. Kwang-Su Park',
  'Dr. Tariq Al-Mansoor',
  'Dr. Elena Voronova',
  'Dr. Arjun Deshmukh',
  'Dr. Lars-Erik Haugen',
  'Dr. Behzad Sadeghi',
];

const CO_AUTHOR_POOL: readonly string[] = [
  'M. Rahman',
  'K. Takahashi',
  'S. Patel',
  'J. Andersen',
  'L. Chen',
  'A. Ivanova',
  'N. Haddad',
  'T. Bergstrom',
  'R. Verma',
  'D. Okafor',
  'H. Kim',
  'E. Morales',
];

const REASON_MAP: Record<ScreeningCategory, readonly string[]> = {
  PAL: [
    'Exact Name & Affiliation Match (PAL)',
    'Fuzzy Phonetic Author Match (PAL)',
    'Co-Author Network Proximity (PAL)',
  ],
  PCL: [
    'Restricted Jurisdiction Affiliation (PCL)',
    'Embargoed City / Lab Geolocation (PCL)',
    'Export-Controlled Territory Origin (PCL)',
  ],
  SDN: [
    'OFAC SDN Entity Alias Hit',
    'Sanctioned Institution Funding Link (SDN)',
    'OFSI / DFAT Consolidated List Match',
  ],
};

const WATCHLIST_MAP: Record<ScreeningCategory, readonly string[]> = {
  PAL: ['In-House PAL v4.2', 'Global Research Watchlist'],
  PCL: ['In-House PCL Registry', 'EAR / ITAR Country Matrix'],
  SDN: ['OFAC SDN List', 'UK OFSI Consolidated', 'Australia DFAT Sanctions'],
};

function buildInitialRecords(today: Date): SanctionsRecord[] {
  const records: SanctionsRecord[] = [];
  const totalCount = 246;

  for (let i = 0; i < totalCount; i++) {
    // Spread records across last 135 days, with higher density in recent 90 days
    const daysAgo = i < 195 ? (i * 90) % 90 : 90 + ((i - 195) * 45) % 45;
    const decisionDate = formatIsoDate(addDays(today, -daysAgo));

    // Deterministic weighted source selection
    const sourceMod = (i * 7 + 3) % 100;
    let source: ScreeningSource;
    if (sourceMod < 35) source = 'PAPERCEPT';
    else if (sourceMod < 63) source = 'S1M';
    else if (sourceMod < 83) source = 'IDAMS';
    else if (sourceMod < 93) source = 'EMS';
    else source = 'IEEE XPLORE';

    // Category distribution: ~42% PCL, ~36% PAL, ~22% SDN
    const catMod = (i * 11 + 5) % 100;
    let category: ScreeningCategory;
    if (catMod < 42) category = 'PCL';
    else if (catMod < 78) category = 'PAL';
    else category = 'SDN';

    // Country selection weighted toward Iran, China, India, Norway, etc.
    const countryRoll = (i * 13 + 7) % 100;
    let cumulative = 0;
    let countryEntry = COUNTRY_SEEDS[0];
    for (const seed of COUNTRY_SEEDS) {
      cumulative += seed.pclWeight;
      if (countryRoll < cumulative) {
        countryEntry = seed;
        break;
      }
    }

    const authorIndex = (i * 3 + 1) % AUTHOR_NAMES.length;
    const authorName = AUTHOR_NAMES[authorIndex];
    const authorId = `ORCID-000${(authorIndex + 1).toString().padStart(1, '0')}-${(1420 + (authorIndex * 73) % 8500).toString().padStart(4, '0')}`;

    const docIndex = i % 165; // Creates realistic reuse across Flag Events vs Unique Documents
    const documentId = `DOC-${source.slice(0, 3)}-${(2026000 + docIndex).toString()}`;
    const documentTitle = DOCUMENT_TITLES[docIndex % DOCUMENT_TITLES.length];

    const coAuthorCount = 1 + (i % 4);
    const coAuthors: string[] = [];
    for (let c = 0; c < coAuthorCount; c++) {
      coAuthors.push(CO_AUTHOR_POOL[(i + c * 3) % CO_AUTHOR_POOL.length]);
    }

    // Determine Red vs Green status
    const statusThreshold = Math.round(countryEntry.redBias * 100);
    const statusRoll = (i * 17 + 19) % 100;
    const status: ComplianceStatus =
      category === 'SDN'
        ? statusRoll < Math.min(85, statusThreshold + 18)
          ? 'Red'
          : 'Green'
        : statusRoll < statusThreshold
          ? 'Red'
          : 'Green';

    const reasonList = REASON_MAP[category];
    const reason = reasonList[i % reasonList.length];
    const watchlistList = WATCHLIST_MAP[category];
    const matchedWatchlist = watchlistList[i % watchlistList.length];

    const riskScore =
      status === 'Red' ? 76 + ((i * 7) % 24) : 18 + ((i * 5) % 39);

    records.push({
      id: `FLG-${(10001 + i).toString()}`,
      documentId,
      documentTitle,
      source,
      authorName,
      authorId,
      coAuthors,
      coAuthorCount,
      country: countryEntry.country,
      city: countryEntry.city,
      category,
      matchedTerms: [category],
      reason,
      status,
      riskScore,
      decisionDate,
      matchedWatchlist,
      notes:
        status === 'Red'
          ? `Escalated for compliance review under ${matchedWatchlist}.`
          : `Cleared after secondary identity and affiliation verification.`,
      dataOrigin: 'MOCK',
    });
  }

  return records;
}

export interface AvailableExcelFile {
  name: string;
  label: string;
  description: string;
  recordCount: number;
}

export const BUILT_IN_EXCEL_FILES: AvailableExcelFile[] = [
  {
    name: 'SanctionedReport_S1M_IDAMS_PAPERCEPT_12May2026.xlsx',
    label: 'Sanctioned Report (S1M + IDAMS)',
    description: 'Multi-source screened author & document report with co-authors',
    recordCount: 27,
  },
  {
    name: 'MQ601_1791978056557.xlsx',
    label: 'MQ601 Sanctions Export',
    description: '44 screened author & document records with match scores',
    recordCount: 44,
  },
  {
    name: 'PCL_Report_12May2026.xlsx',
    label: 'PCL Country Report',
    description: 'Prohibited Country List screened records (Venezuela & Crimea)',
    recordCount: 9,
  },
  {
    name: 'SanctionedReport_IDAMS_12May2026.xlsx',
    label: 'IDAMS Sanctioned Report',
    description: 'IDAMS feed records with author affiliations',
    recordCount: 8,
  },
];

@Injectable({
  providedIn: 'root',
})
export class SanctionsDataService {
  private readonly today = new Date();
  private batchCounter = 0;

  /** Synthetic mock JSON dataset preserved on hold (not shown until explicitly enabled) */
  readonly mockRecords = signal<SanctionsRecord[]>(buildInitialRecords(this.today));

  /** Parsed records from uploaded Excel/CSV files (starts empty until user uploads) */
  readonly uploadedExcelRecords = signal<SanctionsRecord[]>([]);

  /** Tracks each uploaded CSV/Excel file batch merged into the dashboard */
  readonly uploadedFiles = signal<UploadedFileBatch[]>([]);

  /** Default to UPLOADED_ONLY so data appears only when files are uploaded */
  readonly datasetMode = signal<DatasetMode>('UPLOADED_ONLY');

  readonly records = computed<SanctionsRecord[]>(() => {
    const mode = this.datasetMode();
    if (mode === 'UPLOADED_ONLY') {
      return this.uploadedExcelRecords();
    }
    if (mode === 'MOCK_ONLY') {
      return this.mockRecords();
    }
    return [...this.uploadedExcelRecords(), ...this.mockRecords()];
  });

  readonly watchlistSources = signal<WatchlistSourceConfig[]>([
    {
      id: 'src-ofac',
      name: 'OFAC SDN & Consolidated Sanctions',
      code: 'OFAC',
      group: 'External Databases',
      description: 'U.S. Department of the Treasury Specially Designated Nationals list',
      enabled: true,
      lastSynced: '12 mins ago',
      recordCount: 14820,
    },
    {
      id: 'src-uk-ofsi',
      name: 'UK Sanctions Database (OFSI)',
      code: 'UK OFSI',
      group: 'External Databases',
      description: 'HM Treasury Office of Financial Sanctions Implementation consolidated feed',
      enabled: true,
      lastSynced: '28 mins ago',
      recordCount: 6410,
    },
    {
      id: 'src-au-dfat',
      name: 'Australia Sanctions Database (DFAT)',
      code: 'AU DFAT',
      group: 'External Databases',
      description: 'Department of Foreign Affairs and Trade autonomous sanctions registry',
      enabled: true,
      lastSynced: '1 hour ago',
      recordCount: 4195,
    },
    {
      id: 'src-eu',
      name: 'EU Consolidated Financial Sanctions',
      code: 'EU CFSP',
      group: 'External Databases',
      description: 'European External Action Service restrictive measures directory',
      enabled: false,
      lastSynced: '2 days ago',
      recordCount: 9340,
    },
    {
      id: 'src-pal',
      name: 'In-House Prohibited Author List (PAL)',
      code: 'PAL',
      group: 'In-House Lists',
      description: 'Internal compliance-curated prohibited and restricted researcher list',
      enabled: true,
      lastSynced: 'Live',
      recordCount: 312,
    },
    {
      id: 'src-pcl',
      name: 'In-House Prohibited Country List (PCL)',
      code: 'PCL',
      group: 'In-House Lists',
      description: 'Embargoed and export-monitored country/city policy ruleset',
      enabled: true,
      lastSynced: 'Live',
      recordCount: 48,
    },
    {
      id: 'ing-papercept',
      name: 'PAPERCEPT Submission Feed',
      code: 'PAPERCEPT',
      group: 'Ingestion Feeds',
      description: 'Conference manuscript and author metadata screening connector',
      enabled: true,
      lastSynced: '4 mins ago',
      recordCount: 8420,
    },
    {
      id: 'ing-s1m',
      name: 'ScholarOne Manuscripts (S1M)',
      code: 'S1M',
      group: 'Ingestion Feeds',
      description: 'Peer-review journal ingestion webhook and batch pipeline',
      enabled: true,
      lastSynced: '9 mins ago',
      recordCount: 6150,
    },
    {
      id: 'ing-idams',
      name: 'IDAMS Identity & Affiliation Stream',
      code: 'IDAMS',
      group: 'Ingestion Feeds',
      description: 'Enterprise author identity disambiguation and institution matcher',
      enabled: true,
      lastSynced: '15 mins ago',
      recordCount: 5290,
    },
  ]);

  readonly restrictedLocations = signal<RestrictedLocation[]>([
    {
      id: 'loc-1',
      country: 'Iran',
      isoCode: 'IR',
      city: 'Tehran',
      riskLevel: 'Critical',
      listSource: 'OFAC',
      active: true,
      addedAt: '2026-08-14',
    },
    {
      id: 'loc-2',
      country: 'North Korea',
      isoCode: 'KP',
      city: 'Pyongyang',
      riskLevel: 'Critical',
      listSource: 'OFAC',
      active: true,
      addedAt: '2026-08-14',
    },
    {
      id: 'loc-3',
      country: 'Syria',
      isoCode: 'SY',
      city: 'Damascus',
      riskLevel: 'Critical',
      listSource: 'OFSI',
      active: true,
      addedAt: '2026-09-02',
    },
    {
      id: 'loc-4',
      country: 'Russia',
      isoCode: 'RU',
      city: 'Moscow',
      riskLevel: 'High',
      listSource: 'PCL',
      active: true,
      addedAt: '2026-09-18',
    },
    {
      id: 'loc-5',
      country: 'China',
      isoCode: 'CN',
      city: 'Beijing',
      riskLevel: 'Elevated',
      listSource: 'PCL',
      active: true,
      addedAt: '2026-10-01',
    },
    {
      id: 'loc-6',
      country: 'Norway',
      isoCode: 'NO',
      city: 'Oslo',
      riskLevel: 'Elevated',
      listSource: 'PCL',
      active: true,
      addedAt: '2026-10-12',
    },
    {
      id: 'loc-7',
      country: 'India',
      isoCode: 'IN',
      city: 'Bengaluru',
      riskLevel: 'Elevated',
      listSource: 'DFAT',
      active: true,
      addedAt: '2026-10-20',
    },
  ]);

  readonly palEntries = signal<PalEntry[]>([
    {
      id: 'PAL-101',
      fullName: 'Dr. Amirhossein Rezai',
      authorId: 'ORCID-0001-2491',
      affiliation: 'Sharif Aerospace Research Lab',
      country: 'Iran',
      listSource: 'In-House PAL',
      severity: 'Red',
      notes: 'Matched dual-use propulsion research restriction',
      addedAt: '2026-09-10',
      importMethod: 'Manual',
    },
    {
      id: 'PAL-102',
      fullName: 'Dr. Sergey Volkov',
      authorId: 'ORCID-0005-8832',
      affiliation: 'Moscow Institute of Precision Optics',
      country: 'Russia',
      listSource: 'OFAC / PAL Cross-Ref',
      severity: 'Red',
      notes: 'Designated research unit director',
      addedAt: '2026-09-25',
      importMethod: 'File Upload',
    },
    {
      id: 'PAL-103',
      fullName: 'Dr. Kwang-Su Park',
      authorId: 'ORCID-0013-5540',
      affiliation: 'Pyongyang Center for Computational Physics',
      country: 'North Korea',
      listSource: 'OFAC / PAL Cross-Ref',
      severity: 'Red',
      notes: 'Mandatory block on all conference & journal submissions',
      addedAt: '2026-10-05',
      importMethod: 'Manual',
    },
    {
      id: 'PAL-104',
      fullName: 'Dr. Wei-Lin Zhang',
      authorId: 'ORCID-0002-6104',
      affiliation: 'Harbin Photonics Institute',
      country: 'China',
      listSource: 'In-House PAL',
      severity: 'Amber',
      notes: 'Secondary affiliation review required for quantum submissions',
      addedAt: '2026-10-21',
      importMethod: 'File Upload',
    },
  ]);

  readonly availableSources = computed<ScreeningSource[]>(() => SOURCES);

  getDateRangeForPreset(preset: DateRangePreset): { start: string; end: string } {
    const end = formatIsoDate(this.today);
    switch (preset) {
      case 'ALL_DATES': {
        const allDates = this.records()
          .map((r) => r.decisionDate)
          .filter(Boolean)
          .sort();
        return {
          start: allDates[0] ?? formatIsoDate(addDays(this.today, -365)),
          end: allDates[allDates.length - 1] && allDates[allDates.length - 1] > end
            ? allDates[allDates.length - 1]
            : end,
        };
      }
      case 'LAST_7_DAYS':
        return { start: formatIsoDate(addDays(this.today, -7)), end };
      case 'LAST_30_DAYS':
        return { start: formatIsoDate(addDays(this.today, -30)), end };
      case 'LAST_QUARTER':
        return { start: formatIsoDate(addDays(this.today, -90)), end };
      case 'YTD':
        return { start: `${this.today.getFullYear()}-01-01`, end };
      case 'CUSTOM':
      default:
        return { start: formatIsoDate(addDays(this.today, -90)), end };
    }
  }

  private recordSignature(r: SanctionsRecord): string {
    return [
      r.documentId,
      r.authorName.trim().toLowerCase(),
      r.decisionDate,
      r.source,
      r.matchedWatchlist,
      r.status,
    ].join('::');
  }

  private mergeParsedRecords(
    parsed: SanctionsRecord[],
    fileName: string,
    batchId: string
  ): { parsed: number; added: number; skippedDuplicates: number } {
    if (parsed.length === 0) {
      return { parsed: 0, added: 0, skippedDuplicates: 0 };
    }

    const existing = this.uploadedExcelRecords();
    const existingSigs = new Set(existing.map((r) => this.recordSignature(r)));
    const newRecords: SanctionsRecord[] = [];

    for (const rec of parsed) {
      const sig = this.recordSignature(rec);
      if (!existingSigs.has(sig)) {
        existingSigs.add(sig);
        newRecords.push(rec);
      }
    }

    if (newRecords.length > 0) {
      const merged = recomputeCoAuthorsByDocument([...existing, ...newRecords]);
      this.uploadedExcelRecords.set(merged);
      this.uploadedFiles.update((files) => [
        ...files,
        {
          id: batchId,
          fileName,
          recordCount: newRecords.length,
          uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }

    return {
      parsed: parsed.length,
      added: newRecords.length,
      skippedDuplicates: parsed.length - newRecords.length,
    };
  }

  /**
   * Parses and merges a newly uploaded CSV/TSV export into existing uploaded records.
   * Multiple files (at once or sequentially) are merged and deduplicated cleanly,
   * and co-authors sharing a documentId across merged files are recomputed.
   */
  importUploadedCsv(
    csvText: string,
    fileName = 'uploaded.csv'
  ): { parsed: number; added: number; skippedDuplicates: number } {
    const batchId = `batch-${++this.batchCounter}-${Date.now()}`;
    const parsed = parseSanctionsCsvExport(csvText, batchId, fileName);
    return this.mergeParsedRecords(parsed, fileName, batchId);
  }

  /**
   * Parses and merges a real Excel workbook (.xlsx / .xls) into existing uploaded records.
   */
  async importUploadedExcel(
    buffer: ArrayBuffer,
    fileName = 'uploaded.xlsx'
  ): Promise<{ parsed: number; added: number; skippedDuplicates: number }> {
    const batchId = `batch-${++this.batchCounter}-${Date.now()}`;
    const parsed = await parseSanctionsExcelWorkbook(buffer, batchId, fileName);
    return this.mergeParsedRecords(parsed, fileName, batchId);
  }

  removeUploadedFile(batchId: string): void {
    this.uploadedFiles.update((files) => files.filter((f) => f.id !== batchId));
    const remaining = this.uploadedExcelRecords().filter((r) => r.batchId !== batchId);
    this.uploadedExcelRecords.set(recomputeCoAuthorsByDocument(remaining));
  }

  clearUploadedFiles(): void {
    this.uploadedFiles.set([]);
    this.uploadedExcelRecords.set([]);
  }

  loadBuiltInSampleCsv(): { parsed: number; added: number; skippedDuplicates: number } {
    return this.importUploadedCsv(UPLOADED_SANCTIONS_CSV, 'idams-sample-23-rows.csv');
  }

  /**
   * Loads an uploaded Excel workbook directly from the application's /data/ assets.
   */
  async loadBuiltInExcel(
    fileName: string
  ): Promise<{ parsed: number; added: number; skippedDuplicates: number }> {
    const response = await fetch(`data/${fileName}`);
    if (!response.ok) {
      throw new Error(`Failed to load ${fileName}: ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    return this.importUploadedExcel(buffer, fileName);
  }

  toggleWatchlistSource(id: string): void {
    this.watchlistSources.update((sources) =>
      sources.map((src) =>
        src.id === id
          ? {
              ...src,
              enabled: !src.enabled,
              lastSynced: !src.enabled ? 'Just now' : src.lastSynced,
            }
          : src
      )
    );
  }

  addRestrictedLocation(
    input: Omit<RestrictedLocation, 'id' | 'addedAt' | 'active'>
  ): RestrictedLocation {
    const todayStr = formatIsoDate(this.today);
    const created: RestrictedLocation = {
      ...input,
      id: `loc-${Date.now()}`,
      active: true,
      addedAt: todayStr,
    };
    this.restrictedLocations.update((list) => [created, ...list]);

    const demoRecord: SanctionsRecord = {
      id: `FLG-${Math.floor(20000 + Math.random() * 79999)}`,
      documentId: `DOC-PCL-${Math.floor(9000 + Math.random() * 999)}`,
      documentTitle: `Compliance Screening Alert: ${input.city}, ${input.country} Submission`,
      source: 'PAPERCEPT',
      authorName: 'Dr. Onboarding Verification',
      authorId: `ORCID-0099-${Math.floor(1000 + Math.random() * 8999)}`,
      coAuthors: ['S. Compliance', 'A. Auditor'],
      coAuthorCount: 2,
      country: input.country,
      city: input.city,
      category: 'PCL',
      matchedTerms: ['PCL'],
      reason: `Newly Onboarded Jurisdiction Rule (${input.listSource})`,
      status: input.riskLevel === 'Elevated' ? 'Green' : 'Red',
      riskScore: input.riskLevel === 'Critical' ? 94 : input.riskLevel === 'High' ? 82 : 41,
      decisionDate: todayStr,
      matchedWatchlist: `Admin ${input.listSource} Rule`,
      notes: `Auto-generated screening event from Admin Country/City onboarding.`,
      dataOrigin: 'MOCK',
    };
    this.mockRecords.update((recs) => [demoRecord, ...recs]);

    return created;
  }

  toggleRestrictedLocation(id: string): void {
    this.restrictedLocations.update((list) =>
      list.map((loc) => (loc.id === id ? { ...loc, active: !loc.active } : loc))
    );
  }

  removeRestrictedLocation(id: string): void {
    this.restrictedLocations.update((list) => list.filter((loc) => loc.id !== id));
  }

  addPalEntry(input: Omit<PalEntry, 'id' | 'addedAt'>): PalEntry {
    const todayStr = formatIsoDate(this.today);
    const created: PalEntry = {
      ...input,
      id: `PAL-${Math.floor(200 + Math.random() * 799)}`,
      addedAt: todayStr,
    };
    this.palEntries.update((list) => [created, ...list]);

    const demoRecord: SanctionsRecord = {
      id: `FLG-${Math.floor(30000 + Math.random() * 69999)}`,
      documentId: `DOC-PAL-${Math.floor(8000 + Math.random() * 1999)}`,
      documentTitle: `Manuscript Screening Hit: ${input.affiliation} Research Submission`,
      source: 'S1M',
      authorName: input.fullName,
      authorId: input.authorId || 'ORCID-PENDING',
      coAuthors: ['K. Reviewer'],
      coAuthorCount: 1,
      country: input.country,
      city: 'N/A',
      category: 'PAL',
      matchedTerms: ['PAL'],
      reason: `Manual PAL Entry Match (${input.listSource})`,
      status: input.severity === 'Red' ? 'Red' : 'Green',
      riskScore: input.severity === 'Red' ? 92 : 46,
      decisionDate: todayStr,
      matchedWatchlist: input.listSource,
      notes: input.notes || 'Flagged via Admin Configuration PAL entry.',
      dataOrigin: 'MOCK',
    };
    this.mockRecords.update((recs) => [demoRecord, ...recs]);

    return created;
  }

  addBulkPalEntries(inputs: Omit<PalEntry, 'id' | 'addedAt'>[]): PalEntry[] {
    return inputs.map((item) => this.addPalEntry(item));
  }

  removePalEntry(id: string): void {
    this.palEntries.update((list) => list.filter((item) => item.id !== id));
  }
}
