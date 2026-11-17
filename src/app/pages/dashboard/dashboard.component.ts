import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HighchartsChartComponent } from 'highcharts-angular';
import type * as Highcharts from 'highcharts';
import { RedRecordsModalComponent } from '../../components/red-records-modal/red-records-modal.component';
import {
  ArticleSubmissionTrend,
  CategoryRedGreenSummary,
  DatasetMode,
  DateRangePreset,
  JournalAppearanceTrend,
  KpiModalContext,
  PclCountryTrend,
  RepeatedlySanctionedAuthor,
  ReportType,
  SanctionsRecord,
  ScreeningCategory,
  ScreeningSource,
  SourceRedTrend,
  TrendsSummary,
} from '../../models/sanctions.models';
import { SanctionsDataService, BUILT_IN_EXCEL_FILES, type AvailableExcelFile } from '../../services/sanctions-data.service';
import { exportRecordsToCsv } from '../../utils/csv-export.util';
import { exportRecordsToExcel } from '../../utils/excel-export.util';
import { parseAffiliationOrganization } from '../../utils/sanctions-csv-parser.util';

function recordHasCategory(record: SanctionsRecord, category: ScreeningCategory): boolean {
  return (record.matchedTerms ?? [record.category]).includes(category);
}

export const TOTAL_SUBMISSIONS_SCREENED = 150000;

export interface RepeatOffender {
  name: string;
  email: string;
  eventCount: number;
  primaryReason: string;
  isHighRisk: boolean;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, HighchartsChartComponent, RedRecordsModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  protected readonly dataService = inject(SanctionsDataService);

  private readonly initialRange = this.dataService.getDateRangeForPreset('ALL_DATES');

  // Filter signals
  protected readonly selectedPlatform = signal<ScreeningSource | 'ALL'>('ALL');
  protected readonly selectedReason = signal<'ALL' | 'PAL' | 'PCL' | 'SDN'>('ALL');
  protected readonly selectedSource = this.selectedPlatform; // Alias for backward compatibility
  protected readonly selectedPreset = signal<DateRangePreset>('ALL_DATES');
  protected readonly startDate = signal<string>(this.initialRange.start);
  protected readonly endDate = signal<string>(this.initialRange.end);
  protected readonly selectedReport = signal<ReportType>('ScreenedAuthor');
  protected readonly selectedReportCountry = signal<string>('ALL');
  protected readonly uploadStatusMessage = signal<string | null>(null);
  protected readonly isDraggingFiles = signal<boolean>(false);
  protected readonly builtInExcelFiles = BUILT_IN_EXCEL_FILES;

  // Sheet 4 System Total Screened Counts (Baseline Ground Truth from Excel Sheet 4)
  protected readonly platformScreenedCounts = signal<Record<string, number>>({
    S1M: 3635232,
    IDAMS: 2439530,
    PAPERCEPT: 115141,
    TOTAL: 6189903,
  });

  protected readonly selectedPlatformScreenedCount = computed<string>(() => {
    const platform = this.selectedPlatform();
    const counts = this.platformScreenedCounts();
    const count = counts[platform] ?? 0;
    return `${count.toLocaleString('en-US')} Total Screened in ${platform}`;
  });

  // Modal state
  protected readonly modalContext = signal<KpiModalContext | null>(null);

  protected readonly platformOptions: ReadonlyArray<{
    label: string;
    value: ScreeningSource | 'ALL';
  }> = [
    { label: 'All Platforms', value: 'ALL' },
    { label: 'S1M', value: 'S1M' },
    { label: 'IDAMS', value: 'IDAMS' },
    { label: 'PAPERCEPT', value: 'PAPERCEPT' },
  ];
  protected readonly sourceOptions = this.platformOptions; // Alias

  protected readonly reasonOptions: ReadonlyArray<{
    label: string;
    value: 'ALL' | 'PAL' | 'PCL' | 'SDN';
  }> = [
    { label: 'All alerts', value: 'ALL' },
    { label: 'PAL', value: 'PAL' },
    { label: 'PCL', value: 'PCL' },
    { label: 'SDN', value: 'SDN' },
  ];

  protected readonly datePresets: ReadonlyArray<{
    label: string;
    value: DateRangePreset;
  }> = [
    { label: 'All Dates', value: 'ALL_DATES' },
    { label: 'Last Quarter', value: 'LAST_QUARTER' },
    { label: 'Last 30 Days', value: 'LAST_30_DAYS' },
    { label: 'Last 7 Days', value: 'LAST_7_DAYS' },
    { label: 'Year to Date', value: 'YTD' },
    { label: 'Custom Range', value: 'CUSTOM' },
  ];

  protected readonly reportOptions: ReadonlyArray<{
    label: string;
    value: ReportType;
  }> = [
    { label: 'ScreenedAuthor', value: 'ScreenedAuthor' },
    { label: 'SanctionedDocumentsDetails', value: 'SanctionedDocumentsDetails' },
    { label: 'BlockedArticle', value: 'BlockedArticle' },
    { label: 'JournalStats', value: 'JournalStats' },
    { label: 'DocumentHistory', value: 'DocumentHistory' },
    { label: 'AuthorsHistory', value: 'AuthorsHistory' },
    { label: 'Document History', value: 'Document History' },
    { label: 'Authors History', value: 'Authors History' },
  ];

  // Filtered dataset based on Base Filter + Platform + Reason + Date Range
  protected readonly filteredRecords = computed<SanctionsRecord[]>(() => {
    const platform = this.selectedPlatform();
    const reason = this.selectedReason();
    const start = this.startDate();
    const end = this.endDate();
    const preset = this.selectedPreset();

    return this.dataService.records().filter((record) => {
      // Platform filter
      if (platform !== 'ALL' && record.source.toUpperCase() !== platform.toUpperCase()) {
        return false;
      }
      // Reason filter (matches PAL, PCL, or SDN with trim and trailing space safety)
      if (reason !== 'ALL') {
        const recReason = (record.reason || '').trim().toUpperCase();
        if (reason === 'PAL' && recReason !== 'PAL' && record.category !== 'PAL') {
          return false;
        }
        if (reason === 'PCL' && recReason !== 'PCL' && record.category !== 'PCL') {
          return false;
        }
        if (reason === 'SDN' && recReason !== 'SDN' && record.category !== 'SDN') {
          return false;
        }
      }
      // Date range filter
      if (preset !== 'ALL_DATES' && record.decisionDate) {
        if (start && record.decisionDate < start) {
          return false;
        }
        if (end && record.decisionDate > end) {
          return false;
        }
      }
      return true;
    });
  });

  // Dataset records scoped to the selected report view
  protected readonly reportScopedRecords = computed<SanctionsRecord[]>(() => {
    const report = this.selectedReport();
    let records = this.filteredRecords();

    if (report === 'SanctionedDocumentsDetails') {
      records = records.filter(
        (r) => r.status === 'Red' || (r.matchedTerms && r.matchedTerms.length > 0)
      );
    } else if (report === 'BlockedArticle') {
      records = records.filter((r) => r.status === 'Red');
    } else if (report === 'DocumentHistory' || report === 'Document History') {
      records = [...records].sort((a, b) => b.decisionDate.localeCompare(a.decisionDate));
    } else if (report === 'AuthorsHistory' || report === 'Authors History') {
      records = [...records].sort((a, b) => a.authorName.localeCompare(b.authorName));
    }

    return records;
  });

  // Automated Trend Extraction based on uploaded Excel records & active reports
  protected readonly trendsSummary = computed<TrendsSummary>(() => {
    const records = this.reportScopedRecords();
    if (records.length === 0) {
      return {
        hasData: false,
        totalRecords: 0,
        uniqueArticlesCount: 0,
        mostSubmittedArticle: null,
        topSubmittedArticles: [],
        topRedSource: null,
        sourceRedBreakdown: [],
        mostFlaggedAuthor: null,
        highestRiskJurisdiction: null,
      };
    }

    // 1. Group by Article: Document Title or Document ID
    const docMap = new Map<
      string,
      {
        documentId: string;
        documentTitle: string;
        journalName?: string;
        manuscriptId?: string;
        submissionCount: number;
        redCount: number;
        greenCount: number;
        sources: Set<ScreeningSource>;
        authors: Set<string>;
        primaryAuthor: string;
        latestDate: string;
      }
    >();

    // 2. Source tally for "Most REDs in which source - based on the reports"
    const sourceStatsMap = new Map<ScreeningSource, { redCount: number; totalCount: number }>();

    // 3. Author tally for most flagged author
    const authorStatsMap = new Map<
      string,
      {
        name: string;
        email?: string;
        organization?: string;
        country: string;
        submissionCount: number;
        redCount: number;
      }
    >();

    // 4. Country tally for highest risk jurisdiction
    const countryStatsMap = new Map<string, { flagCount: number; redCount: number }>();

    for (const r of records) {
      const docKey = r.documentId || r.documentTitle;
      let docEntry = docMap.get(docKey);
      if (!docEntry) {
        docEntry = {
          documentId: r.documentId,
          documentTitle: r.documentTitle,
          journalName: r.journalName,
          manuscriptId: r.manuscriptId,
          submissionCount: 0,
          redCount: 0,
          greenCount: 0,
          sources: new Set(),
          authors: new Set(),
          primaryAuthor: r.authorName,
          latestDate: r.decisionDate,
        };
        docMap.set(docKey, docEntry);
      }

      docEntry.submissionCount++;
      if (r.status === 'Red') {
        docEntry.redCount++;
      } else {
        docEntry.greenCount++;
      }
      docEntry.sources.add(r.source);
      if (r.authorName && r.authorName !== 'Unknown Author') {
        docEntry.authors.add(r.authorName);
      }
      if (r.decisionDate > docEntry.latestDate) {
        docEntry.latestDate = r.decisionDate;
      }
      if (!docEntry.journalName && r.journalName) {
        docEntry.journalName = r.journalName;
      }
      if (!docEntry.manuscriptId && r.manuscriptId) {
        docEntry.manuscriptId = r.manuscriptId;
      }

      // Source tally
      const sStat = sourceStatsMap.get(r.source) ?? { redCount: 0, totalCount: 0 };
      sStat.totalCount++;
      if (r.status === 'Red') {
        sStat.redCount++;
      }
      sourceStatsMap.set(r.source, sStat);

      // Author tally
      if (r.authorName && r.authorName !== 'Unknown Author') {
        const aStat = authorStatsMap.get(r.authorName) ?? {
          name: r.authorName,
          email: r.authorEmail,
          organization: r.organization,
          country: r.country,
          submissionCount: 0,
          redCount: 0,
        };
        aStat.submissionCount++;
        if (r.status === 'Red') aStat.redCount++;
        authorStatsMap.set(r.authorName, aStat);
      }

      // Country tally
      if (r.country && r.country !== 'Unspecified') {
        const cStat = countryStatsMap.get(r.country) ?? { flagCount: 0, redCount: 0 };
        cStat.flagCount++;
        if (r.status === 'Red') cStat.redCount++;
        countryStatsMap.set(r.country, cStat);
      }
    }

    // Exclude EMS and IEEE XPLORE from trends
    const EXCLUDED_TREND_SOURCES = new Set<string>(['EMS', 'IEEE XPLORE']);

    // Sort articles by repeating submission count descending, then red count descending
    const sortedArticles: ArticleSubmissionTrend[] = Array.from(docMap.values())
      .map((entry) => ({
        documentId: entry.documentId,
        documentTitle: entry.documentTitle,
        journalName: entry.journalName,
        manuscriptId: entry.manuscriptId,
        submissionCount: entry.submissionCount,
        redCount: entry.redCount,
        greenCount: entry.greenCount,
        sources: Array.from(entry.sources).filter((s) => !EXCLUDED_TREND_SOURCES.has(s)),
        authors: Array.from(entry.authors),
        primaryAuthor: entry.primaryAuthor,
        latestDate: entry.latestDate,
      }))
      .sort((a, b) => b.submissionCount - a.submissionCount || b.redCount - a.redCount);

    const mostSubmittedArticle = sortedArticles[0] ?? null;
    const topSubmittedArticles = sortedArticles.slice(0, 5);

    // Source Red Trends (excluding EMS and IEEE XPLORE)
    const totalRedAcrossSources = Array.from(sourceStatsMap.entries())
      .filter(([src]) => !EXCLUDED_TREND_SOURCES.has(src))
      .reduce((sum, [, s]) => sum + s.redCount, 0);

    const sourceRedBreakdown: SourceRedTrend[] = Array.from(sourceStatsMap.entries())
      .filter(([src]) => !EXCLUDED_TREND_SOURCES.has(src))
      .map(([src, stat]) => ({
        source: src,
        redCount: stat.redCount,
        totalCount: stat.totalCount,
        redPercentage:
          totalRedAcrossSources > 0
            ? Math.round((stat.redCount / totalRedAcrossSources) * 100)
            : 0,
        sourceRedRate:
          stat.totalCount > 0
            ? Math.round((stat.redCount / stat.totalCount) * 100)
            : 0,
        isTopSource: false,
      }))
      .sort((a, b) => b.redCount - a.redCount || b.totalCount - a.totalCount);

    const topRedSource = sourceRedBreakdown[0] ?? null;
    if (topRedSource && topRedSource.redCount > 0) {
      topRedSource.isTopSource = true;
    }

    // Most flagged author
    const sortedAuthors = Array.from(authorStatsMap.values()).sort(
      (a, b) => b.redCount - a.redCount || b.submissionCount - a.submissionCount
    );
    const mostFlaggedAuthor = sortedAuthors[0] ?? null;

    // Highest risk jurisdiction
    const sortedCountries = Array.from(countryStatsMap.entries()).sort(
      (a, b) => b[1].redCount - a[1].redCount || b[1].flagCount - a[1].flagCount
    );
    const topCountry = sortedCountries[0];
    const highestRiskJurisdiction = topCountry
      ? {
          country: topCountry[0],
          flagCount: topCountry[1].flagCount,
          redCount: topCountry[1].redCount,
        }
      : null;

    return {
      hasData: true,
      totalRecords: records.length,
      uniqueArticlesCount: docMap.size,
      mostSubmittedArticle,
      topSubmittedArticles,
      topRedSource,
      sourceRedBreakdown,
      mostFlaggedAuthor,
      highestRiskJurisdiction,
    };
  });

  protected readonly availableCountries = computed<string[]>(() => {
    const countries = new Set(this.dataService.records().map((r) => r.country));
    return Array.from(countries).sort();
  });

  protected readonly redRecords = computed<SanctionsRecord[]>(() =>
    this.filteredRecords().filter((r) => r.status === 'Red')
  );

  protected readonly pclEventCount = computed<number>(
    () => this.filteredRecords().filter((r) => recordHasCategory(r, 'PCL')).length
  );

  // Top-Level Stats Refactoring (Exactly 4 Cards: Title and Count/Percentage only)
  protected readonly kpiStats = computed(() => {
    const recs = this.filteredRecords();

    // 1. Total Flagged Events: Count of all Valid Events
    const totalFlaggedEvents = recs.length;

    // 2. Flagged Event Rate: (Total Valid Events / TOTAL_SUBMISSIONS_SCREENED) * 1000
    const flaggedEventRateValue =
      TOTAL_SUBMISSIONS_SCREENED > 0
        ? (totalFlaggedEvents / TOTAL_SUBMISSIONS_SCREENED) * 1000
        : 0;
    const flaggedEventRate = `${flaggedEventRateValue.toFixed(2)} flagged events per 1,000 submissions`;

    // 3. PAL vs PCL Alerts: Displayed as "X PAL / Y PCL"
    const palAlerts = recs.filter((r) => {
      const recReason = (r.reason || '').trim().toUpperCase();
      return recReason === 'PAL' || r.category === 'PAL';
    }).length;

    const pclAlerts = recs.filter((r) => {
      const recReason = (r.reason || '').trim().toUpperCase();
      return recReason === 'PCL' || r.category === 'PCL';
    }).length;

    const sdnAlerts = recs.filter((r) => {
      const recReason = (r.reason || '').trim().toUpperCase();
      return recReason === 'SDN' || r.category === 'SDN';
    }).length;

    const palVsPclAlerts = `${palAlerts} PAL / ${pclAlerts} PCL`;

    // 4. New vs Recurring Authors: (First-time flagged authors / Total unique flagged authors) * 100
    const emailCounts = new Map<string, number>();
    for (const r of recs) {
      if (r.authorEmail) {
        const email = r.authorEmail.trim().toLowerCase();
        if (email) {
          emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
        }
      }
    }

    const uniqueFlaggedAuthors = emailCounts.size;
    let firstTimeCount = 0;
    let recurringCount = 0;

    for (const count of emailCounts.values()) {
      if (count === 1) {
        firstTimeCount++;
      } else if (count > 1) {
        recurringCount++;
      }
    }

    const newVsRecurringAuthors =
      uniqueFlaggedAuthors > 0
        ? `${((firstTimeCount / uniqueFlaggedAuthors) * 100).toFixed(1)}%`
        : '0.0%';

    return {
      totalFlaggedEvents,
      flaggedEventRate,
      flaggedEventRateValue,
      palAlerts,
      pclAlerts,
      sdnAlerts,
      palVsPclAlerts,
      uniqueFlaggedAuthors,
      firstTimeCount,
      recurringCount,
      newVsRecurringAuthors,
    };
  });

  // Leaderboard sorting state (default descending by Event Count)
  protected readonly leaderboardSortOrder = signal<'asc' | 'desc'>('desc');

  toggleLeaderboardSort(): void {
    this.leaderboardSortOrder.update((order) => (order === 'desc' ? 'asc' : 'desc'));
  }

  // Repeat Offender Leaderboard: authors with event count > 1
  protected readonly repeatOffenderLeaderboard = computed<RepeatOffender[]>(() => {
    const recs = this.filteredRecords();
    const emailGroup = new Map<
      string,
      {
        name: string;
        email: string;
        eventCount: number;
        reasonCounts: Map<string, number>;
      }
    >();

    for (const r of recs) {
      if (!r.authorEmail) continue;
      const email = r.authorEmail.trim().toLowerCase();
      if (!email) continue;

      let entry = emailGroup.get(email);
      if (!entry) {
        entry = {
          name: r.authorName || 'Unknown Author',
          email,
          eventCount: 0,
          reasonCounts: new Map<string, number>(),
        };
        emailGroup.set(email, entry);
      }

      entry.eventCount++;
      const reason = (r.reason || '').trim().toUpperCase() || r.category || 'PAL';
      entry.reasonCounts.set(reason, (entry.reasonCounts.get(reason) ?? 0) + 1);
    }

    const list: RepeatOffender[] = [];
    for (const entry of emailGroup.values()) {
      if (entry.eventCount > 1) {
        let primaryReason = 'PAL';
        let maxReasonCount = 0;
        for (const [res, cnt] of entry.reasonCounts.entries()) {
          if (cnt > maxReasonCount) {
            maxReasonCount = cnt;
            primaryReason = res;
          }
        }
        list.push({
          name: entry.name,
          email: entry.email,
          eventCount: entry.eventCount,
          primaryReason,
          isHighRisk: entry.eventCount > 3,
        });
      }
    }

    const sortOrder = this.leaderboardSortOrder();
    list.sort((a, b) =>
      sortOrder === 'desc' ? b.eventCount - a.eventCount : a.eventCount - b.eventCount
    );
    return list;
  });

  // Primary KPI Metrics + SDN counts with strict primary-author mapping & zero fallback
  protected readonly kpiMetrics = computed(() => {
    const stats = this.kpiStats();
    const recs = this.filteredRecords();
    const redRecs = recs.filter((r) => r.status === 'Red');
    const uniqueDocs = new Set(recs.map((r) => r.documentId));

    return {
      totalFlaggedEvents: stats.totalFlaggedEvents,
      palAlerts: stats.palAlerts,
      pclAlerts: stats.pclAlerts,
      uniqueFlaggedAuthors: stats.uniqueFlaggedAuthors,
      flagEvents: stats.totalFlaggedEvents,
      flagEventsRed: redRecs.length,
      uniqueDocuments: uniqueDocs.size,
      redDocuments: new Set(redRecs.map((r) => r.documentId)).size,
      greenDocuments: Array.from(uniqueDocs).filter(
        (id) => !new Set(redRecs.map((r) => r.documentId)).has(id)
      ).length,
      flaggedAuthorIden: stats.uniqueFlaggedAuthors,
      flaggedAuthorsRed: stats.uniqueFlaggedAuthors,
      coAuthorRecords: 0,
      coAuthorsRed: 0,
      palEvents: stats.palAlerts,
      palRed: recs.filter((r) => r.status === 'Red' && ((r.reason || '').trim().toUpperCase() === 'PAL' || r.category === 'PAL')).length,
      pclEvents: stats.pclAlerts,
      pclRed: recs.filter((r) => r.status === 'Red' && ((r.reason || '').trim().toUpperCase() === 'PCL' || r.category === 'PCL')).length,
      sdnEvents: recs.filter((r) => (r.reason || '').trim().toUpperCase() === 'SDN' || r.category === 'SDN').length,
      sdnRed: recs.filter((r) => r.status === 'Red' && ((r.reason || '').trim().toUpperCase() === 'SDN' || r.category === 'SDN')).length,
    };
  });

  // Single-line stat for PAL: extracts organization from JSON/affiliation and returns highest count (or 0)
  protected readonly palTopOrganization = computed<{ organization: string; count: number }>(() => {
    const recs = this.filteredRecords();
    const palRecords = recs.filter(
      (r) =>
        !r.isCoAuthor &&
        (recordHasCategory(r, 'PAL') ||
          (r.reason && r.reason.toUpperCase().includes('PAL')))
    );

    const counts = new Map<string, number>();
    for (const r of palRecords) {
      const org =
        r.organization && r.organization !== 'Unspecified Affiliation'
          ? r.organization
          : parseAffiliationOrganization(r.affiliationsRaw);
      if (org && org.trim().length > 0) {
        const cleanOrg = org.trim();
        counts.set(cleanOrg, (counts.get(cleanOrg) || 0) + 1);
      }
    }

    if (counts.size === 0) {
      return { organization: 'None', count: 0 };
    }

    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    return {
      organization: sorted[0][0],
      count: sorted[0][1],
    };
  });

  // Document Red vs Green breakdown across PAL, PCL, and SDN with zero fallback
  protected readonly watchlistDispositions = computed<CategoryRedGreenSummary[]>(() => {
    const recs = this.filteredRecords();
    const categories: ReadonlyArray<{
      category: ScreeningCategory;
      label: string;
      fullName: string;
    }> = [
      { category: 'PAL', label: 'PAL', fullName: 'Prohibited Author List' },
      { category: 'PCL', label: 'PCL', fullName: 'Prohibited Country List' },
      { category: 'SDN', label: 'SDN', fullName: 'Specially Designated Nationals' },
    ];

    return categories.map(({ category, label, fullName }) => {
      const catRecs = recs.filter((r) => recordHasCategory(r, category));
      const redDocIds = new Set(
        catRecs.filter((r) => r.status === 'Red').map((r) => r.documentId)
      );
      const allDocIds = new Set(catRecs.map((r) => r.documentId));
      const greenDocs = Array.from(allDocIds).filter((id) => !redDocIds.has(id)).length;

      return {
        category,
        label,
        fullName,
        redDocs: redDocIds.size ?? 0,
        greenDocs: greenDocs ?? 0,
        totalDocs: allDocIds.size ?? 0,
      };
    });
  });

  // 1. Monthly sanctioned author: bar or line chart showing total valid events grouped by month from Decision_Date
  protected readonly monthlyTrendChartOptions = computed<Highcharts.Options>(() => {
    const recs = this.filteredRecords();
    const MONTH_KEYS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthMap: Record<string, number> = {
      '01': 0, '02': 1, '03': 2, '04': 3, '05': 4, '06': 5,
      '07': 6, '08': 7, '09': 8, '10': 9, '11': 10, '12': 11,
    };
    const counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    for (const r of recs) {
      if (r.decisionDate) {
        const match = r.decisionDate.match(/^\d{4}-(\d{2})/);
        if (match && monthMap[match[1]] !== undefined) {
          counts[monthMap[match[1]]] += 1;
        }
      }
    }

    return {
      chart: { type: 'column', height: 320, backgroundColor: 'transparent' },
      title: {
        text: 'Monthly sanctioned author',
        align: 'left',
        style: {
          fontFamily: "'Fraunces', serif",
          fontSize: '18px',
          fontWeight: '500',
          color: '#481111',
        },
      },
      credits: { enabled: false },
      xAxis: {
        categories: MONTH_KEYS,
        lineColor: 'rgba(72, 17, 17, 0.15)',
        labels: {
          style: {
            fontFamily: "'Inter', sans-serif",
            color: '#481111',
            fontSize: '11px',
            fontWeight: '500',
          },
        },
      },
      yAxis: {
        min: 0,
        allowDecimals: false,
        title: {
          text: 'Events',
          style: { fontFamily: "'Inter', sans-serif", color: 'rgba(72, 17, 17, 0.65)', fontSize: '11px' },
        },
        gridLineColor: 'rgba(72, 17, 17, 0.08)',
      },
      legend: { enabled: false },
      tooltip: {
        pointFormat: '<b>{point.y}</b> events in {point.key}',
        backgroundColor: '#FFFFFF',
        borderColor: 'rgba(72, 17, 17, 0.18)',
        style: { fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#1D0E0A' },
      },
      plotOptions: {
        column: {
          borderRadius: 4,
          color: '#3C476A',
          dataLabels: {
            enabled: true,
            style: { fontFamily: "'Inter', sans-serif", fontSize: '10px', fontWeight: 'bold', color: '#481111' },
          },
        },
      },
      series: [
        {
          type: 'column',
          name: 'Events',
          data: counts,
        },
      ],
    };
  });

  // 2. Top High-Risk Institutions (Horizontal Bar Chart)
  protected readonly institutionsChartOptions = computed<Highcharts.Options>(() => {
    const recs = this.filteredRecords();
    const orgMap = new Map<string, number>();

    for (const r of recs) {
      let org = (r.organization || '').trim();
      if (!org || org === 'Unspecified Affiliation' || org === 'Not Recorded') {
        const parsed = parseAffiliationOrganization(r.affiliationsRaw);
        org = parsed ? parsed.trim() : 'Not Recorded';
      }
      orgMap.set(org, (orgMap.get(org) ?? 0) + 1);
    }

    const sorted = Array.from(orgMap.entries())
      .filter(([name]) => name !== 'Not Recorded')
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const categories = sorted.length > 0 ? sorted.map((s) => s.name) : ['No Institutions Recorded'];
    const data = sorted.length > 0 ? sorted.map((s) => s.count) : [0];

    return {
      chart: { type: 'bar', height: 340, backgroundColor: 'transparent' },
      title: {
        text: 'Top High-Risk Institutions',
        align: 'left',
        style: {
          fontFamily: "'Fraunces', serif",
          fontSize: '18px',
          fontWeight: '500',
          color: '#481111',
        },
      },
      credits: { enabled: false },
      xAxis: {
        categories,
        lineColor: 'rgba(72, 17, 17, 0.15)',
        labels: {
          style: { fontFamily: "'Inter', sans-serif", fontSize: '11px', color: '#481111' },
          formatter(): string {
            const val = String(this.value);
            return val.length > 28 ? val.substring(0, 26) + '…' : val;
          },
        },
      },
      yAxis: {
        min: 0,
        allowDecimals: false,
        title: {
          text: 'Flagged Events',
          style: { fontFamily: "'Inter', sans-serif", color: 'rgba(72, 17, 17, 0.65)', fontSize: '11px' },
        },
        gridLineColor: 'rgba(72, 17, 17, 0.08)',
      },
      legend: { enabled: false },
      tooltip: {
        pointFormat: '<b>{point.y}</b> flagged events',
        backgroundColor: '#FFFFFF',
        borderColor: 'rgba(72, 17, 17, 0.18)',
        style: { fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#1D0E0A' },
      },
      plotOptions: {
        bar: {
          borderRadius: 4,
          color: '#8B263E',
          dataLabels: {
            enabled: true,
            style: { fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: 'bold', color: '#481111' },
          },
        },
      },
      series: [
        {
          type: 'bar',
          name: 'Flagged Events',
          data,
        },
      ],
    };
  });

  // 3. Alert Reason by Country (100% Stacked Bar Chart)
  protected readonly alertReasonByCountryChartOptions = computed<Highcharts.Options>(() => {
    const recs = this.filteredRecords();
    const countryMap = new Map<string, { pal: number; pcl: number; total: number }>();

    for (const r of recs) {
      let country = (r.country || '').replace(/[\[\]]/g, '').trim();
      if (!country || country === 'Unspecified' || country.toLowerCase() === 'not recorded') {
        country = 'Not Recorded';
      }
      let entry = countryMap.get(country);
      if (!entry) {
        entry = { pal: 0, pcl: 0, total: 0 };
        countryMap.set(country, entry);
      }
      entry.total++;
      const reason = (r.reason || '').trim().toUpperCase();
      if (reason === 'PCL' || r.category === 'PCL') {
        entry.pcl++;
      } else {
        entry.pal++;
      }
    }

    const sorted = Array.from(countryMap.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const categories = sorted.length > 0 ? sorted.map((c) => c.name) : ['No Countries Recorded'];
    const palData = sorted.length > 0 ? sorted.map((c) => c.pal) : [0];
    const pclData = sorted.length > 0 ? sorted.map((c) => c.pcl) : [0];

    return {
      chart: { type: 'bar', height: 340, backgroundColor: 'transparent' },
      title: {
        text: 'Alert Reason by Country (100% Stacked)',
        align: 'left',
        style: {
          fontFamily: "'Fraunces', serif",
          fontSize: '18px',
          fontWeight: '500',
          color: '#481111',
        },
      },
      credits: { enabled: false },
      xAxis: {
        categories,
        lineColor: 'rgba(72, 17, 17, 0.15)',
        labels: {
          style: { fontFamily: "'Inter', sans-serif", fontSize: '11px', color: '#481111', fontWeight: '500' },
        },
      },
      yAxis: {
        min: 0,
        max: 100,
        title: {
          text: 'Alert Share (%)',
          style: { fontFamily: "'Inter', sans-serif", color: 'rgba(72, 17, 17, 0.65)', fontSize: '11px' },
        },
        labels: { format: '{value}%' },
        gridLineColor: 'rgba(72, 17, 17, 0.08)',
      },
      legend: {
        itemStyle: { fontFamily: "'Inter', sans-serif", fontSize: '11px', color: '#481111' },
      },
      plotOptions: {
        series: {
          stacking: 'percent',
          borderRadius: 2,
        },
      },
      tooltip: {
        pointFormat: '{series.name}: <b>{point.y}</b> ({point.percentage:.1f}%)<br/>',
        shared: true,
        backgroundColor: '#FFFFFF',
        borderColor: 'rgba(72, 17, 17, 0.18)',
        style: { fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#1D0E0A' },
      },
      series: [
        {
          type: 'bar',
          name: 'PAL Alerts',
          data: palData,
          color: '#3C476A',
        },
        {
          type: 'bar',
          name: 'PCL Alerts',
          data: pclData,
          color: '#A86A1E',
        },
      ],
    };
  });

  // 4. Journal Risk Concentration (Bar Chart)
  protected readonly journalConcentrationChartOptions = computed<Highcharts.Options>(() => {
    const recs = this.filteredRecords();
    const journalMap = new Map<string, number>();

    for (const r of recs) {
      let journal = (r.journalName || '').trim();
      if (!journal || journal.toLowerCase() === 'not recorded') {
        journal = 'Not Recorded';
      }
      journalMap.set(journal, (journalMap.get(journal) ?? 0) + 1);
    }

    const sorted = Array.from(journalMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const categories = sorted.length > 0 ? sorted.map((j) => j.name) : ['No Journals Recorded'];
    const data = sorted.length > 0 ? sorted.map((j) => j.count) : [0];

    return {
      chart: { type: 'column', height: 340, backgroundColor: 'transparent' },
      title: {
        text: 'Journal Risk Concentration',
        align: 'left',
        style: {
          fontFamily: "'Fraunces', serif",
          fontSize: '18px',
          fontWeight: '500',
          color: '#481111',
        },
      },
      credits: { enabled: false },
      xAxis: {
        categories,
        lineColor: 'rgba(72, 17, 17, 0.15)',
        labels: {
          rotation: -25,
          style: { fontFamily: "'Inter', sans-serif", fontSize: '10px', color: '#481111' },
          formatter(): string {
            const val = String(this.value);
            return val.length > 24 ? val.substring(0, 22) + '…' : val;
          },
        },
      },
      yAxis: {
        min: 0,
        allowDecimals: false,
        title: {
          text: 'Flagged Events',
          style: { fontFamily: "'Inter', sans-serif", color: 'rgba(72, 17, 17, 0.65)', fontSize: '11px' },
        },
        gridLineColor: 'rgba(72, 17, 17, 0.08)',
      },
      legend: { enabled: false },
      tooltip: {
        pointFormat: '<b>{point.y}</b> flagged events in {point.key}',
        backgroundColor: '#FFFFFF',
        borderColor: 'rgba(72, 17, 17, 0.18)',
        style: { fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#1D0E0A' },
      },
      plotOptions: {
        column: {
          borderRadius: 4,
          color: '#5C1D24',
          dataLabels: {
            enabled: true,
            style: { fontFamily: "'Inter', sans-serif", fontSize: '10px', fontWeight: 'bold', color: '#481111' },
          },
        },
      },
      series: [
        {
          type: 'column',
          name: 'Flagged Events',
          data,
        },
      ],
    };
  });

  // ==========================================
  // SECTION 1: RESTORED EXISTING VISUALIZATIONS
  // ==========================================

  // Restored Visualization 1: Screening Reason Distribution (Donut Chart)
  protected readonly screeningReasonChartOptions = computed<Highcharts.Options>(() => {
    const recs = this.filteredRecords();
    const pal = recs.filter((r) => (r.reason || '').trim().toUpperCase() === 'PAL' || r.category === 'PAL').length;
    const pcl = recs.filter((r) => (r.reason || '').trim().toUpperCase() === 'PCL' || r.category === 'PCL').length;
    const sdn = recs.filter((r) => (r.reason || '').trim().toUpperCase() === 'SDN' || r.category === 'SDN').length;

    return {
      chart: { type: 'pie', height: 280, backgroundColor: 'transparent' },
      title: {
        text: 'Screening Reason Distribution',
        align: 'left',
        style: { fontFamily: "'Fraunces', serif", fontSize: '16px', fontWeight: '600', color: '#2B0707' },
      },
      legend: {
        enabled: true,
        align: 'center',
        verticalAlign: 'bottom',
        itemStyle: { fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#333333' },
      },
      tooltip: {
        useHTML: true,
        headerFormat: '',
        pointFormat: '<span style="color: #333333; font-family: Inter, sans-serif; font-size: 12px; font-weight: 600;">{point.name}: {point.y} events</span>',
        backgroundColor: '#FFFFFF',
        borderColor: 'rgba(72, 17, 17, 0.25)',
        borderRadius: 8,
        shadow: true,
        style: {
          color: '#333333',
          fontFamily: "'Inter', sans-serif",
          fontSize: '12px',
        },
      },
      plotOptions: {
        pie: {
          innerSize: '60%',
          borderRadius: 4,
          dataLabels: {
            enabled: true,
            format: '{point.name}: {point.y} ({point.percentage:.1f}%)',
            style: {
              fontFamily: "'Inter', sans-serif",
              fontSize: '11px',
              color: '#333333',
              textOutline: 'none',
              fontWeight: '600',
            },
          },
          showInLegend: true,
        },
      },
      series: [
        {
          type: 'pie',
          name: 'Screening Reasons',
          data: [
            { name: 'PAL', y: pal, color: '#3C476A' },
            { name: 'PCL', y: pcl, color: '#A86A1E' },
            { name: 'SDN', y: sdn, color: '#4A6F56' },
          ],
        },
      ],
    };
  });

  // Restored Visualization 2: Events by Platform (Vertical Bar Chart)
  protected readonly eventsByPlatformChartOptions = computed<Highcharts.Options>(() => {
    const recs = this.filteredRecords();
    let s1m = 0, idams = 0, papercept = 0;
    for (const r of recs) {
      const src = (r.source || '').trim().toUpperCase();
      if (src.includes('S1M') || src.includes('SCHOLARONE')) s1m++;
      else if (src.includes('PAPERCEPT')) papercept++;
      else idams++;
    }

    return {
      chart: { type: 'column', height: 280, backgroundColor: 'transparent' },
      title: {
        text: 'Events by Platform',
        align: 'left',
        style: { fontFamily: "'Fraunces', serif", fontSize: '16px', fontWeight: '600', color: '#2B0707' },
      },
      xAxis: {
        categories: ['S1M', 'IDAMS', 'PAPERCEPT'],
        labels: { style: { fontFamily: "'Inter', sans-serif", fontSize: '11px', color: '#481111' } },
      },
      yAxis: {
        min: 0,
        allowDecimals: false,
        title: { text: 'Events', style: { fontFamily: "'Inter', sans-serif", fontSize: '11px', color: 'rgba(72, 17, 17, 0.65)' } },
        gridLineColor: 'rgba(72, 17, 17, 0.08)',
      },
      legend: { enabled: false },
      plotOptions: {
        column: {
          borderRadius: 6,
          color: '#8B263E',
          dataLabels: { enabled: true, style: { fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: 'bold' } },
        },
      },
      series: [
        {
          type: 'column',
          name: 'Events',
          data: [s1m, idams, papercept],
        },
      ],
    };
  });

  // Restored Visualization 3: PCL Match by Country (Horizontal Bar Chart)
  protected readonly pclMatchByCountryChartOptions = computed<Highcharts.Options>(() => {
    const recs = this.filteredRecords();
    const pclRecs = recs.filter((r) => (r.reason || '').trim().toUpperCase() === 'PCL' || r.category === 'PCL');
    const countryMap = new Map<string, number>();

    for (const r of pclRecs) {
      const country = (r.country || '').replace(/[\[\]]/g, '').trim() || 'Not Recorded';
      countryMap.set(country, (countryMap.get(country) ?? 0) + 1);
    }

    const sorted = Array.from(countryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const categories = sorted.length > 0 ? sorted.map((s) => s[0]) : ['No PCL Matches'];
    const data = sorted.length > 0 ? sorted.map((s) => s[1]) : [0];

    return {
      chart: { type: 'bar', height: 280, backgroundColor: 'transparent' },
      title: {
        text: 'PCL Match by Country',
        align: 'left',
        style: { fontFamily: "'Fraunces', serif", fontSize: '16px', fontWeight: '600', color: '#2B0707' },
      },
      xAxis: {
        categories,
        labels: { style: { fontFamily: "'Inter', sans-serif", fontSize: '11px', color: '#481111' } },
      },
      yAxis: {
        min: 0,
        allowDecimals: false,
        title: { text: 'PCL Matches', style: { fontFamily: "'Inter', sans-serif", fontSize: '11px', color: 'rgba(72, 17, 17, 0.65)' } },
        gridLineColor: 'rgba(72, 17, 17, 0.08)',
      },
      legend: { enabled: false },
      plotOptions: {
        bar: {
          borderRadius: 4,
          color: '#A86A1E',
          dataLabels: { enabled: true, style: { fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: 'bold' } },
        },
      },
      series: [
        {
          type: 'bar',
          name: 'PCL Matches',
          data,
        },
      ],
    };
  });

  // Backward compatibility aliases
  protected readonly reasonDistributionChartOptions = this.screeningReasonChartOptions;
  protected readonly platformChartOptions = this.eventsByPlatformChartOptions;
  protected readonly pclCountryChartOptions = this.pclMatchByCountryChartOptions;

  // Aliases for backward compatibility
  protected readonly pclChartOptions = this.pclCountryChartOptions;
  protected readonly sourceChartOptions = this.platformChartOptions;
  protected readonly reasonMixChartOptions = this.reasonDistributionChartOptions;
  protected readonly dailyTrendChartOptions = this.monthlyTrendChartOptions;

  // Trends Section Chart: RED Escalations by Source (Bar chart on dark cocoa card)
  protected readonly trendsSourceChartOptions = computed<Highcharts.Options>(() => {
    const trends = this.trendsSummary();
    const sources = trends.sourceRedBreakdown.filter(
      (s) => s.source !== 'EMS' && s.source !== 'IEEE XPLORE'
    );

    const categories = sources.map((s) => s.source);
    const redData = sources.map((s) => s.redCount);
    const greenData = sources.map((s) => Math.max(0, s.totalCount - s.redCount));

    return {
      chart: {
        type: 'bar',
        height: 220,
        backgroundColor: 'transparent',
        spacingTop: 10,
        spacingBottom: 10,
      },
      title: { text: undefined },
      credits: { enabled: false },
      xAxis: {
        categories,
        lineColor: 'rgba(255, 255, 255, 0.14)',
        labels: {
          style: {
            fontFamily: "'Inter', sans-serif",
            color: 'rgba(255, 255, 255, 0.90)',
            fontSize: '11px',
            fontWeight: '600',
          },
        },
      },
      yAxis: {
        min: 0,
        allowDecimals: false,
        title: {
          text: 'Flag Events',
          style: {
            fontFamily: "'Inter', sans-serif",
            color: 'rgba(255, 255, 255, 0.70)',
            fontSize: '10px',
          },
        },
        gridLineColor: 'rgba(255, 255, 255, 0.12)',
      },
      legend: {
        enabled: true,
        align: 'right',
        verticalAlign: 'top',
        itemStyle: {
          fontFamily: "'Inter', sans-serif",
          fontSize: '11px',
          color: '#FFFFFF',
        },
      },
      tooltip: {
        shared: true,
        shadow: false,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.20)',
        backgroundColor: '#3E2923',
        style: {
          color: '#FFFFFF',
          fontFamily: "'Inter', sans-serif",
          fontSize: '12px',
        },
      },
      plotOptions: {
        series: {
          stacking: 'normal',
          borderRadius: 2,
        },
      },
      series: [
        {
          type: 'bar',
          name: 'Red Violations',
          data: redData,
          color: '#B5524A',
        },
        {
          type: 'bar',
          name: 'Cleared / Green',
          data: greenData,
          color: '#3E7D69',
        },
      ],
    };
  });

  // Dynamic Trend 1: Most Appeared Journal
  protected readonly mostAppearedJournals = computed<JournalAppearanceTrend[]>(() => {
    const recs = this.filteredRecords();
    const map = new Map<string, { count: number; redCount: number }>();
    for (const r of recs) {
      const jName = r.journalName?.trim();
      if (!jName || jName === 'N/A' || jName === 'null') continue;
      const current = map.get(jName) ?? { count: 0, redCount: 0 };
      current.count += 1;
      if (r.status === 'Red') current.redCount += 1;
      map.set(jName, current);
    }
    return Array.from(map.entries())
      .map(([journalName, val]) => ({
        journalName,
        count: val.count,
        redCount: val.redCount,
      }))
      .sort((a, b) => b.count - a.count || b.redCount - a.redCount)
      .slice(0, 6);
  });

  protected readonly journalTrendChartOptions = computed<Highcharts.Options>(() => {
    const journals = this.mostAppearedJournals();
    const hasData = journals.length > 0;
    const categories = hasData ? journals.map((j) => j.journalName) : ['No Journal Recorded'];
    const totalData = hasData ? journals.map((j) => j.count) : [0];
    const redData = hasData ? journals.map((j) => j.redCount) : [0];

    return {
      chart: { type: 'bar', height: 260, backgroundColor: 'transparent' },
      title: {
        text: 'Most Appeared Journal',
        align: 'left',
        style: {
          fontFamily: "'Fraunces', serif",
          fontSize: '17px',
          fontWeight: '400',
          color: '#481111',
        },
      },
      subtitle: {
        text: 'Top journals by submission frequency in screened pipeline',
        align: 'left',
        style: {
          fontFamily: "'Inter', sans-serif",
          fontSize: '12px',
          color: 'rgba(72, 17, 17, 0.65)',
        },
      },
      credits: { enabled: false },
      xAxis: {
        categories,
        lineColor: 'rgba(72, 17, 17, 0.14)',
        labels: {
          style: {
            fontFamily: "'Inter', sans-serif",
            color: '#481111',
            fontSize: '11px',
            fontWeight: '500',
          },
        },
      },
      yAxis: {
        min: 0,
        allowDecimals: false,
        title: {
          text: 'Frequency',
          style: {
            fontFamily: "'Inter', sans-serif",
            color: 'rgba(72, 17, 17, 0.65)',
            fontSize: '10px',
          },
        },
        gridLineColor: 'rgba(72, 17, 17, 0.10)',
      },
      legend: {
        enabled: true,
        align: 'right',
        verticalAlign: 'top',
        itemStyle: {
          fontFamily: "'Inter', sans-serif",
          fontSize: '11px',
          color: '#481111',
        },
      },
      tooltip: {
        shared: true,
        backgroundColor: '#FFFFFF',
        borderColor: 'rgba(72, 17, 17, 0.18)',
        style: { fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#1D0E0A' },
      },
      plotOptions: {
        bar: {
          borderRadius: 3,
          dataLabels: { enabled: true, style: { fontSize: '10px', fontWeight: 'bold' } },
        },
      },
      series: [
        {
          type: 'bar',
          name: 'Total Submissions',
          data: totalData,
          color: '#3C476A',
        },
        {
          type: 'bar',
          name: 'Red Violations',
          data: redData,
          color: '#B5524A',
        },
      ],
    };
  });

  // Dynamic Trend 2: PCL Match by Country
  protected readonly pclCountryTrends = computed<PclCountryTrend[]>(() => {
    const recs = this.filteredRecords();
    const pclRecs = recs.filter(
      (r) =>
        recordHasCategory(r, 'PCL') ||
        (r.reason && r.reason.toUpperCase().includes('PCL'))
    );
    const countryMap = new Map<string, { count: number; redCount: number }>();
    for (const r of pclRecs) {
      const c = r.country?.trim();
      if (!c || c === 'Unspecified') continue;
      const current = countryMap.get(c) ?? { count: 0, redCount: 0 };
      current.count += 1;
      if (r.status === 'Red') current.redCount += 1;
      countryMap.set(c, current);
    }
    return Array.from(countryMap.entries())
      .map(([country, val]) => ({
        country,
        count: val.count,
        redCount: val.redCount,
      }))
      .sort((a, b) => b.count - a.count || b.redCount - a.redCount)
      .slice(0, 6);
  });

  protected readonly pclCountryTrendChartOptions = computed<Highcharts.Options>(() => {
    const list = this.pclCountryTrends();
    const hasData = list.length > 0;
    const categories = hasData ? list.map((c) => c.country) : ['No PCL Matches'];
    const counts = hasData ? list.map((c) => c.count) : [0];
    const redCounts = hasData ? list.map((c) => c.redCount) : [0];

    return {
      chart: { type: 'column', height: 260, backgroundColor: 'transparent' },
      title: {
        text: 'PCL Match by Country',
        align: 'left',
        style: {
          fontFamily: "'Fraunces', serif",
          fontSize: '17px',
          fontWeight: '400',
          color: '#481111',
        },
      },
      subtitle: {
        text: 'Countries appearing most frequently when Reason contains PCL match',
        align: 'left',
        style: {
          fontFamily: "'Inter', sans-serif",
          fontSize: '12px',
          color: 'rgba(72, 17, 17, 0.65)',
        },
      },
      credits: { enabled: false },
      xAxis: {
        categories,
        lineColor: 'rgba(72, 17, 17, 0.14)',
        labels: {
          style: {
            fontFamily: "'Inter', sans-serif",
            color: '#481111',
            fontSize: '11px',
            fontWeight: '500',
          },
        },
      },
      yAxis: {
        min: 0,
        allowDecimals: false,
        title: {
          text: 'PCL Frequency',
          style: {
            fontFamily: "'Inter', sans-serif",
            color: 'rgba(72, 17, 17, 0.65)',
            fontSize: '10px',
          },
        },
        gridLineColor: 'rgba(72, 17, 17, 0.10)',
      },
      legend: {
        enabled: true,
        align: 'right',
        verticalAlign: 'top',
        itemStyle: {
          fontFamily: "'Inter', sans-serif",
          fontSize: '11px',
          color: '#481111',
        },
      },
      tooltip: {
        shared: true,
        backgroundColor: '#FFFFFF',
        borderColor: 'rgba(72, 17, 17, 0.18)',
        style: { fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#1D0E0A' },
      },
      plotOptions: {
        column: {
          borderRadius: 4,
          dataLabels: { enabled: true, style: { fontSize: '10px', fontWeight: 'bold' } },
        },
      },
      series: [
        {
          type: 'column',
          name: 'PCL Matches',
          data: counts,
          color: '#A86A1E',
        },
        {
          type: 'column',
          name: 'Red Flagged',
          data: redCounts,
          color: '#B5524A',
        },
      ],
    };
  });

  // Dynamic Trend 3: Repeatedly Sanctioned Authors
  protected readonly repeatedlySanctionedAuthors = computed<RepeatedlySanctionedAuthor[]>(() => {
    const recs = this.filteredRecords();
    const primaryRedRecs = recs.filter(
      (r) =>
        !r.isCoAuthor &&
        r.status === 'Red' &&
        (recordHasCategory(r, 'PAL') ||
          recordHasCategory(r, 'PCL') ||
          recordHasCategory(r, 'SDN'))
    );

    const authorMap = new Map<
      string,
      {
        authorName: string;
        repeatCount: number;
        sources: Set<ScreeningSource>;
        reasons: Set<string>;
        organization?: string;
        country: string;
      }
    >();

    for (const r of primaryRedRecs) {
      const name = r.authorName?.trim();
      if (!name || name === 'Unknown Author') continue;
      const entry = authorMap.get(name) ?? {
        authorName: name,
        repeatCount: 0,
        sources: new Set(),
        reasons: new Set(),
        organization: r.organization,
        country: r.country,
      };
      entry.repeatCount += 1;
      entry.sources.add(r.source);
      if (r.reason) entry.reasons.add(r.reason);
      if (!entry.organization && r.organization) entry.organization = r.organization;
      if (entry.country === 'Unspecified' && r.country && r.country !== 'Unspecified') {
        entry.country = r.country;
      }
      authorMap.set(name, entry);
    }

    const repeats = Array.from(authorMap.values())
      .filter((a) => a.repeatCount > 1)
      .map((a) => ({
        authorName: a.authorName,
        repeatCount: a.repeatCount,
        sources: Array.from(a.sources),
        reasons: Array.from(a.reasons),
        organization: a.organization,
        country: a.country,
      }))
      .sort((a, b) => b.repeatCount - a.repeatCount);

    if (repeats.length > 0) return repeats.slice(0, 8);

    // Fallback to top single violations if no repeat > 1 in current slice
    return Array.from(authorMap.values())
      .map((a) => ({
        authorName: a.authorName,
        repeatCount: a.repeatCount,
        sources: Array.from(a.sources),
        reasons: Array.from(a.reasons),
        organization: a.organization,
        country: a.country,
      }))
      .sort((a, b) => b.repeatCount - a.repeatCount)
      .slice(0, 8);
  });

  protected readonly repeatAuthorsChartOptions = computed<Highcharts.Options>(() => {
    const authors = this.repeatedlySanctionedAuthors();
    const hasData = authors.length > 0;
    const categories = hasData ? authors.map((a) => a.authorName) : ['No Sanctioned Authors'];
    const data = hasData ? authors.map((a) => a.repeatCount) : [0];

    return {
      chart: { type: 'bar', height: 260, backgroundColor: 'transparent' },
      title: {
        text: 'Repeatedly Sanctioned Authors',
        align: 'left',
        style: {
          fontFamily: "'Fraunces', serif",
          fontSize: '17px',
          fontWeight: '400',
          color: '#481111',
        },
      },
      subtitle: {
        text: 'Authors sanctioned multiple times displaying unique repeat counts',
        align: 'left',
        style: {
          fontFamily: "'Inter', sans-serif",
          fontSize: '12px',
          color: 'rgba(72, 17, 17, 0.65)',
        },
      },
      credits: { enabled: false },
      xAxis: {
        categories,
        lineColor: 'rgba(72, 17, 17, 0.14)',
        labels: {
          style: {
            fontFamily: "'Inter', sans-serif",
            color: '#481111',
            fontSize: '11px',
            fontWeight: '500',
          },
        },
      },
      yAxis: {
        min: 0,
        allowDecimals: false,
        title: {
          text: 'Repeat Count',
          style: {
            fontFamily: "'Inter', sans-serif",
            color: 'rgba(72, 17, 17, 0.65)',
            fontSize: '10px',
          },
        },
        gridLineColor: 'rgba(72, 17, 17, 0.10)',
      },
      legend: { enabled: false },
      tooltip: {
        pointFormat: '<b>{point.y}</b> sanctioned red violations',
        backgroundColor: '#FFFFFF',
        borderColor: 'rgba(72, 17, 17, 0.18)',
        style: { fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#1D0E0A' },
      },
      plotOptions: {
        bar: {
          borderRadius: 3,
          dataLabels: {
            enabled: true,
            format: '{point.y} repeats',
            style: { fontSize: '10px', fontWeight: 'bold', color: '#481111' },
          },
        },
      },
      series: [
        {
          type: 'bar',
          name: 'Unique Repeat Count',
          data,
          color: '#B5524A',
        },
      ],
    };
  });

  protected setDatasetMode(mode: DatasetMode): void {
    this.dataService.datasetMode.set(mode);
    if (mode === 'UPLOADED_ONLY') {
      this.onPresetChange('ALL_DATES');
    } else if (mode === 'MOCK_ONLY' && this.selectedPreset() === 'ALL_DATES') {
      this.onPresetChange('LAST_QUARTER');
    } else if (this.selectedPreset() === 'ALL_DATES') {
      this.onPresetChange('ALL_DATES');
    }
  }

  protected onCsvFileUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    void this.processUploadedFiles(Array.from(input.files)).then(() => {
      input.value = '';
    });
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingFiles.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingFiles.set(false);
  }

  protected onDropFiles(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingFiles.set(false);
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      void this.processUploadedFiles(Array.from(files));
    }
  }

  private async processUploadedFiles(files: File[]): Promise<void> {
    let totalAdded = 0;
    let totalSkipped = 0;
    let processedCount = 0;

    for (const file of files) {
      const isExcelWorkbook = /\.(xlsx|xls)$/i.test(file.name);
      const result = isExcelWorkbook
        ? await this.dataService.importUploadedExcel(await file.arrayBuffer(), file.name)
        : this.dataService.importUploadedCsv(await file.text(), file.name);
      if (result.parsed > 0) {
        processedCount += 1;
        totalAdded += result.added;
        totalSkipped += result.skippedDuplicates;
      }
    }

    if (processedCount === 0) {
      this.uploadStatusMessage.set(
        `No valid screening rows found in the selected file(s). Please upload a valid Excel (.xlsx/.xls) or CSV screening export.`
      );
      return;
    }

    if (this.dataService.datasetMode() === 'MOCK_ONLY') {
      this.dataService.datasetMode.set('UPLOADED_ONLY');
    }
    this.onPresetChange('ALL_DATES');

    const totalRecords = this.dataService.uploadedExcelRecords().length;
    const totalFiles = this.dataService.uploadedFiles().length;
    const dupNote = totalSkipped > 0 ? ` (${totalSkipped} duplicate row(s) skipped)` : '';
    this.uploadStatusMessage.set(
      `Merged +${totalAdded} record(s) from ${processedCount} file(s)${dupNote}. Active total: ${totalRecords} records across ${totalFiles} file(s).`
    );
  }

  protected loadSampleExcel(): void {
    const result = this.dataService.loadBuiltInSampleCsv();
    this.dataService.datasetMode.set('UPLOADED_ONLY');
    this.onPresetChange('ALL_DATES');
    this.uploadStatusMessage.set(
      `Loaded ${result.added} sample records (idams-sample-23-rows.csv). Upload additional files anytime to merge.`
    );
  }

  protected removeUploadedFile(batchId: string): void {
    this.dataService.removeUploadedFile(batchId);
    this.onPresetChange('ALL_DATES');
    const remaining = this.dataService.uploadedExcelRecords().length;
    this.uploadStatusMessage.set(
      remaining > 0
        ? `File removed. ${remaining} merged record(s) remaining.`
        : null
    );
  }

  protected clearUploadedFiles(): void {
    this.dataService.clearUploadedFiles();
    this.uploadStatusMessage.set(null);
  }

  protected onPresetChange(preset: DateRangePreset): void {
    this.selectedPreset.set(preset);
    if (preset !== 'CUSTOM') {
      const range = this.dataService.getDateRangeForPreset(preset);
      this.startDate.set(range.start);
      this.endDate.set(range.end);
    }
  }

  protected onCustomStartDate(date: string): void {
    this.startDate.set(date);
    this.selectedPreset.set('CUSTOM');
  }

  protected onCustomEndDate(date: string): void {
    this.endDate.set(date);
    this.selectedPreset.set('CUSTOM');
  }

  protected onReportChange(report: ReportType): void {
    this.selectedReport.set(report);
  }

  protected resetFilters(): void {
    this.selectedPlatform.set('ALL');
    this.selectedReason.set('ALL');
    this.selectedPreset.set('ALL_DATES');
    const range = this.dataService.getDateRangeForPreset('ALL_DATES');
    this.startDate.set(range.start);
    this.endDate.set(range.end);
    this.selectedReport.set('ScreenedAuthor');
    this.selectedReportCountry.set('ALL');
  }

  protected openRedModal(
    title: string,
    subtitle: string,
    categoryFilter: ScreeningCategory | 'ALL',
    metricKey: string
  ): void {
    this.modalContext.set({
      title,
      subtitle,
      categoryFilter,
      metricKey,
    });
  }

  protected closeRedModal(): void {
    this.modalContext.set(null);
  }

  protected async loadDirectExcel(fileName: string): Promise<void> {
    try {
      const result = await this.dataService.loadBuiltInExcel(fileName);
      this.dataService.datasetMode.set('UPLOADED_ONLY');
      this.onPresetChange('ALL_DATES');
      this.uploadStatusMessage.set(
        `Loaded ${result.added} records directly from ${fileName}. Active total: ${this.dataService.uploadedExcelRecords().length} records across ${this.dataService.uploadedFiles().length} file(s).`
      );
    } catch (err) {
      this.uploadStatusMessage.set(
        `Could not load ${fileName}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  protected onDirectExcelSelect(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    if (!select || !select.value) return;
    const fileName = select.value;
    select.value = '';
    void this.loadDirectExcel(fileName);
  }

  protected async exportReportBriefExcel(): Promise<void> {
    const report = this.selectedReport();
    let records = this.filteredRecords();

    if (report === 'SanctionedDocumentsDetails') {
      records = records.filter(
        (r) => r.status === 'Red' || (r.matchedTerms && r.matchedTerms.length > 0)
      );
    } else if (report === 'BlockedArticle') {
      records = records.filter((r) => r.status === 'Red');
    } else if (report === 'DocumentHistory' || report === 'Document History') {
      records = [...records].sort((a, b) => b.decisionDate.localeCompare(a.decisionDate));
    } else if (report === 'AuthorsHistory' || report === 'Authors History') {
      records = [...records].sort((a, b) => a.authorName.localeCompare(b.authorName));
    }

    const uploadedFileName = this.dataService.uploadedFiles()[0]?.fileName ?? null;
    await exportRecordsToExcel(records, {
      categoryOrReport: report,
      uploadedFileName,
    });
  }

  protected exportReportBriefCsv(): void {
    const report = this.selectedReport();
    let records = this.filteredRecords();

    if (report === 'SanctionedDocumentsDetails') {
      records = records.filter(
        (r) => r.status === 'Red' || (r.matchedTerms && r.matchedTerms.length > 0)
      );
    } else if (report === 'BlockedArticle') {
      records = records.filter((r) => r.status === 'Red');
    } else if (report === 'DocumentHistory' || report === 'Document History') {
      records = [...records].sort((a, b) => b.decisionDate.localeCompare(a.decisionDate));
    } else if (report === 'AuthorsHistory' || report === 'Authors History') {
      records = [...records].sort((a, b) => a.authorName.localeCompare(b.authorName));
    }

    const safeReportName = report.toLowerCase().replace(/\s+/g, '-');
    const timestamp = new Date().toISOString().slice(0, 10);
    exportRecordsToCsv(records, `report-${safeReportName}-${timestamp}.csv`);
  }
}
