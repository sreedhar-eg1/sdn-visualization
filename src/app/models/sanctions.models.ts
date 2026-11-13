export type ScreeningSource = 'PAPERCEPT' | 'S1M' | 'IDAMS' | 'EMS' | 'IEEE XPLORE';

export type ScreeningCategory = 'PAL' | 'PCL' | 'SDN';

export type ComplianceStatus = 'Red' | 'Green';

export type DatasetMode = 'COMBINED' | 'UPLOADED_ONLY' | 'MOCK_ONLY';

export type DateRangePreset =
  | 'ALL_DATES'
  | 'LAST_7_DAYS'
  | 'LAST_30_DAYS'
  | 'LAST_QUARTER'
  | 'YTD'
  | 'CUSTOM';

export type ReportType =
  | 'ScreenedAuthor'
  | 'SanctionedDocumentsDetails'
  | 'BlockedArticle'
  | 'JournalStats'
  | 'DocumentHistory'
  | 'AuthorsHistory'
  | 'Document History'
  | 'Authors History';

export interface SanctionsRecord {
  id: string;
  documentId: string;
  documentTitle: string;
  journalName?: string;
  manuscriptId?: string;
  source: ScreeningSource;
  authorName: string;
  authorId: string;
  palId?: string;
  coAuthors: string[];
  coAuthorCount: number;
  country: string;
  city: string;
  category: ScreeningCategory;
  matchedTerms?: ScreeningCategory[];
  reason: string;
  status: ComplianceStatus;
  riskScore: number;
  decisionDate: string; // YYYY-MM-DD
  matchedWatchlist: string;
  notes: string;
  dataOrigin?: 'MOCK' | 'UPLOADED_EXCEL';
  batchId?: string;
  sourceFileName?: string;
  authorEmail?: string;
  organization?: string;
  documentType?: string;
  matchedEntitySummary?: string;
  affiliationsRaw?: string;
}

export interface UploadedFileBatch {
  id: string;
  fileName: string;
  recordCount: number;
  uploadedAt: string;
}

export interface WatchlistSourceConfig {
  id: string;
  name: string;
  code: string;
  group: 'External Databases' | 'In-House Lists' | 'Ingestion Feeds';
  description: string;
  enabled: boolean;
  lastSynced: string;
  recordCount: number;
}

export interface RestrictedLocation {
  id: string;
  country: string;
  isoCode: string;
  city: string;
  riskLevel: 'Critical' | 'High' | 'Elevated';
  listSource: 'PCL' | 'OFAC' | 'OFSI' | 'DFAT';
  active: boolean;
  addedAt: string;
}

export interface PalEntry {
  id: string;
  fullName: string;
  authorId: string;
  affiliation: string;
  country: string;
  listSource: string;
  severity: 'Red' | 'Amber';
  notes: string;
  addedAt: string;
  importMethod: 'Manual' | 'File Upload';
}

export interface KpiModalContext {
  title: string;
  subtitle: string;
  categoryFilter: ScreeningCategory | 'ALL';
  metricKey: string;
}

export interface CategoryRedGreenSummary {
  category: ScreeningCategory;
  label: string;
  fullName: string;
  redDocs: number;
  greenDocs: number;
  totalDocs: number;
}

export interface ArticleSubmissionTrend {
  documentId: string;
  documentTitle: string;
  journalName?: string;
  manuscriptId?: string;
  submissionCount: number;
  redCount: number;
  greenCount: number;
  sources: ScreeningSource[];
  authors: string[];
  primaryAuthor: string;
  latestDate: string;
}

export interface SourceRedTrend {
  source: ScreeningSource;
  redCount: number;
  totalCount: number;
  redPercentage: number;
  sourceRedRate: number;
  isTopSource: boolean;
}

export interface TrendsSummary {
  hasData: boolean;
  totalRecords: number;
  uniqueArticlesCount: number;
  mostSubmittedArticle: ArticleSubmissionTrend | null;
  topSubmittedArticles: ArticleSubmissionTrend[];
  topRedSource: SourceRedTrend | null;
  sourceRedBreakdown: SourceRedTrend[];
  mostFlaggedAuthor: {
    name: string;
    email?: string;
    organization?: string;
    country: string;
    submissionCount: number;
    redCount: number;
  } | null;
  highestRiskJurisdiction: {
    country: string;
    flagCount: number;
    redCount: number;
  } | null;
}
