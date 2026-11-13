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
  KpiModalContext,
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

function recordHasCategory(record: SanctionsRecord, category: ScreeningCategory): boolean {
  return (record.matchedTerms ?? [record.category]).includes(category);
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
  protected readonly selectedSource = signal<ScreeningSource | 'ALL'>('ALL');
  protected readonly selectedPreset = signal<DateRangePreset>('ALL_DATES');
  protected readonly startDate = signal<string>(this.initialRange.start);
  protected readonly endDate = signal<string>(this.initialRange.end);
  protected readonly selectedReport = signal<ReportType>('ScreenedAuthor');
  protected readonly selectedReportCountry = signal<string>('ALL');
  protected readonly uploadStatusMessage = signal<string | null>(null);
  protected readonly isDraggingFiles = signal<boolean>(false);
  protected readonly builtInExcelFiles = BUILT_IN_EXCEL_FILES;

  // Modal state
  protected readonly modalContext = signal<KpiModalContext | null>(null);

  protected readonly sourceOptions: ReadonlyArray<{
    label: string;
    value: ScreeningSource | 'ALL';
  }> = [
    { label: 'All Sources', value: 'ALL' },
    { label: 'PAPERCEPT', value: 'PAPERCEPT' },
    { label: 'S1M', value: 'S1M' },
    { label: 'IDAMS', value: 'IDAMS' }
  ];

  protected readonly datePresets: ReadonlyArray<{
    label: string;
    value: DateRangePreset;
  }> = [
    { label: 'All Dates (Mock + Excel)', value: 'ALL_DATES' },
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

  // Filtered dataset based on DatasetMode + Source + Date Range + optional Report country focus
  protected readonly filteredRecords = computed<SanctionsRecord[]>(() => {
    const source = this.selectedSource();
    const start = this.startDate();
    const end = this.endDate();
    const report = this.selectedReport();
    const reportCountry = this.selectedReportCountry();

    return this.dataService.records().filter((record) => {
      if (source !== 'ALL' && record.source !== source) {
        return false;
      }
      if (start && record.decisionDate < start) {
        return false;
      }
      if (end && record.decisionDate > end) {
        return false;
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
        sources: Array.from(entry.sources),
        authors: Array.from(entry.authors),
        primaryAuthor: entry.primaryAuthor,
        latestDate: entry.latestDate,
      }))
      .sort((a, b) => b.submissionCount - a.submissionCount || b.redCount - a.redCount);

    const mostSubmittedArticle = sortedArticles[0] ?? null;
    const topSubmittedArticles = sortedArticles.slice(0, 5);

    // Source Red Trends
    const totalRedAcrossSources = Array.from(sourceStatsMap.values()).reduce(
      (sum, s) => sum + s.redCount,
      0
    );

    const sourceRedBreakdown: SourceRedTrend[] = Array.from(sourceStatsMap.entries())
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

  // Primary 6 KPI Metrics
  protected readonly kpiMetrics = computed(() => {
    const recs = this.filteredRecords();
    const authorIdentityKey = (r: SanctionsRecord): string =>
      r.authorEmail ? r.authorEmail.toLowerCase() : r.authorId;

    const uniqueDocs = new Set(recs.map((r) => r.documentId));
    const uniqueFlaggedAuthors = new Set(recs.map(authorIdentityKey));
    const totalCoAuthors = recs.reduce((sum, r) => sum + r.coAuthorCount, 0);
    const palEvents = recs.filter((r) => recordHasCategory(r, 'PAL'));
    const pclEvents = recs.filter((r) => recordHasCategory(r, 'PCL'));

    const redDocsSet = new Set(
      recs.filter((r) => r.status === 'Red').map((r) => r.documentId)
    );
    const greenDocsCount = Array.from(uniqueDocs).filter(
      (docId) => !redDocsSet.has(docId)
    ).length;

    return {
      flagEvents: recs.length,
      flagEventsRed: recs.filter((r) => r.status === 'Red').length,
      uniqueDocuments: uniqueDocs.size,
      redDocuments: redDocsSet.size,
      greenDocuments: greenDocsCount,
      flaggedAuthorIden: uniqueFlaggedAuthors.size,
      flaggedAuthorsRed: new Set(
        recs.filter((r) => r.status === 'Red').map(authorIdentityKey)
      ).size,
      coAuthorRecords: totalCoAuthors,
      coAuthorsRed: recs
        .filter((r) => r.status === 'Red')
        .reduce((sum, r) => sum + r.coAuthorCount, 0),
      palEvents: palEvents.length,
      palRed: palEvents.filter((r) => r.status === 'Red').length,
      pclEvents: pclEvents.length,
      pclRed: pclEvents.filter((r) => r.status === 'Red').length,
    };
  });

  // Document Red vs Green breakdown across PAL, PCL, and SDN
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
        redDocs: redDocIds.size,
        greenDocs,
        totalDocs: allDocIds.size,
      };
    });
  });

  // Chart 1: PCL Breakdown (Column chart by country)
  protected readonly pclChartOptions = computed<Highcharts.Options>(() => {
    const pclRecords = this.filteredRecords().filter((r) =>
      recordHasCategory(r, 'PCL')
    );
    const countryMap = new Map<string, { red: number; green: number }>();

    for (const rec of pclRecords) {
      const current = countryMap.get(rec.country) ?? { red: 0, green: 0 };
      if (rec.status === 'Red') current.red += 1;
      else current.green += 1;
      countryMap.set(rec.country, current);
    }

    const sorted = Array.from(countryMap.entries()).sort(
      (a, b) => b[1].red + b[1].green - (a[1].red + a[1].green)
    );

    const categories = sorted.map(([country]) => country);
    const redSeries = sorted.map(([, counts]) => counts.red);
    const greenSeries = sorted.map(([, counts]) => counts.green);

    return {
      chart: { type: 'column', height: 320, backgroundColor: 'transparent' },
      title: {
        text: 'PCL Breakdown by Country',
        align: 'left',
        style: {
          fontFamily: "'Fraunces', serif",
          fontSize: '18px',
          fontWeight: '400',
          color: '#481111',
        },
      },
      subtitle: {
        text: 'Prohibited Country List events split by Red (Flagged) vs Green (Cleared)',
        align: 'left',
        style: {
          fontFamily: "'Inter', sans-serif",
          fontSize: '13px',
          color: 'rgba(72, 17, 17, 0.62)',
        },
      },
      credits: { enabled: false },
      xAxis: {
        categories,
        crosshair: false,
        lineColor: 'rgba(72, 17, 17, 0.14)',
        labels: {
          style: {
            fontFamily: "'Inter', sans-serif",
            color: 'rgba(72, 17, 17, 0.75)',
            fontSize: '11px',
            fontWeight: '500',
          },
        },
      },
      yAxis: {
        min: 0,
        allowDecimals: false,
        title: {
          text: 'PCL Events',
          style: {
            fontFamily: "'Inter', sans-serif",
            color: 'rgba(72, 17, 17, 0.62)',
            fontSize: '11px',
          },
        },
        stackLabels: {
          enabled: true,
          style: {
            fontFamily: "'Inter', sans-serif",
            fontWeight: '600',
            color: '#481111',
            fontSize: '11px',
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
        shadow: false,
        borderWidth: 1,
        borderColor: 'rgba(72, 17, 17, 0.18)',
        backgroundColor: '#FFFFFF',
        style: { fontFamily: "'Inter', sans-serif", color: '#1D0E0A', fontSize: '12px' },
      },
      plotOptions: {
        column: {
          stacking: 'normal',
          borderRadius: 4,
          borderWidth: 0,
          shadow: false,
        },
      },
      series: [
        {
          id: 'pcl-red',
          name: 'Red (Flagged)',
          type: 'column',
          data: redSeries,
          color: '#B5524A',
        },
        {
          id: 'pcl-green',
          name: 'Green (Cleared)',
          type: 'column',
          data: greenSeries,
          color: '#3E7D69',
        },
      ],
    };
  });

  // Trends Section Chart: RED Escalations by Source (Bar chart on dark cocoa card)
  protected readonly trendsSourceChartOptions = computed<Highcharts.Options>(() => {
    const trends = this.trendsSummary();
    const sources = trends.sourceRedBreakdown;

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

  // Chart 2: Flag Events by Source (Column/Bar chart on dark cocoa card)
  protected readonly sourceChartOptions = computed<Highcharts.Options>(() => {
    const recs = this.filteredRecords();
    const sources = this.dataService.availableSources();
    const activeSources =
      this.selectedSource() === 'ALL'
        ? sources
        : sources.filter((s) => s === this.selectedSource());

    const counts = activeSources.map((src) => ({
      name: src,
      total: recs.filter((r) => r.source === src).length,
      red: recs.filter((r) => r.source === src && r.status === 'Red').length,
    }));

    return {
      chart: { type: 'column', height: 320, backgroundColor: 'transparent' },
      title: {
        text: 'Flag Events by Source',
        align: 'left',
        style: {
          fontFamily: "'Fraunces', serif",
          fontSize: '18px',
          fontWeight: '400',
          color: '#FFFFFF',
        },
      },
      subtitle: {
        text: 'Screening volume & Red escalations across ingest pipelines',
        align: 'left',
        style: {
          fontFamily: "'Inter', sans-serif",
          fontSize: '13px',
          color: 'rgba(255, 255, 255, 0.70)',
        },
      },
      credits: { enabled: false },
      xAxis: {
        categories: counts.map((c) => c.name),
        lineColor: 'rgba(255, 255, 255, 0.14)',
        labels: {
          style: {
            fontFamily: "'Inter', sans-serif",
            color: 'rgba(255, 255, 255, 0.85)',
            fontSize: '11px',
            fontWeight: '500',
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
            fontSize: '11px',
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
        style: { fontFamily: "'Inter', sans-serif", color: '#FFFFFF', fontSize: '12px' },
      },
      plotOptions: {
        column: {
          borderRadius: 4,
          borderWidth: 0,
          shadow: false,
          dataLabels: {
            enabled: true,
            style: {
              fontFamily: "'Inter', sans-serif",
              fontSize: '11px',
              fontWeight: '500',
              color: '#FFFFFF',
              textOutline: 'none',
            },
          },
        },
      },
      series: [
        {
          id: 'src-total',
          name: 'Total Flag Events',
          type: 'column',
          data: counts.map((c) => c.total),
          color: '#E6D0B5',
        },
        {
          id: 'src-red',
          name: 'Red Status',
          type: 'column',
          data: counts.map((c) => c.red),
          color: '#B5524A',
        },
      ],
    };
  });

  // Chart 3: Reason Mix (Pie chart on dark cocoa card)
  protected readonly reasonMixChartOptions = computed<Highcharts.Options>(() => {
    const recs = this.filteredRecords();
    const palCount = recs.filter((r) => recordHasCategory(r, 'PAL')).length;
    const pclCount = recs.filter((r) => recordHasCategory(r, 'PCL')).length;
    const sdnCount = recs.filter((r) => recordHasCategory(r, 'SDN')).length;

    return {
      chart: { type: 'pie', height: 320, backgroundColor: 'transparent' },
      title: {
        text: 'Reason Mix Distribution',
        align: 'left',
        style: {
          fontFamily: "'Fraunces', serif",
          fontSize: '18px',
          fontWeight: '400',
          color: '#FFFFFF',
        },
      },
      subtitle: {
        text: 'Proportional share of PAL, PCL, and SDN watchlist triggers',
        align: 'left',
        style: {
          fontFamily: "'Inter', sans-serif",
          fontSize: '13px',
          color: 'rgba(255, 255, 255, 0.70)',
        },
      },
      credits: { enabled: false },
      tooltip: {
        pointFormat: '<b>{point.y}</b> triggers ({point.percentage:.1f}%)',
        shadow: false,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.20)',
        backgroundColor: '#3E2923',
        style: { fontFamily: "'Inter', sans-serif", color: '#FFFFFF', fontSize: '12px' },
      },
      plotOptions: {
        pie: {
          allowPointSelect: true,
          cursor: 'pointer',
          innerSize: '54%',
          borderWidth: 0,
          shadow: false,
          dataLabels: {
            enabled: true,
            format: '<b>{point.name}</b>: {point.percentage:.1f}%',
            style: {
              fontFamily: "'Inter', sans-serif",
              fontSize: '11px',
              color: '#FFFFFF',
              textOutline: 'none',
            },
          },
          showInLegend: true,
        },
      },
      legend: {
        itemStyle: {
          fontFamily: "'Inter', sans-serif",
          fontSize: '11px',
          color: 'rgba(255, 255, 255, 0.85)',
        },
      },
      series: [
        {
          id: 'reason-mix',
          name: 'Screening Reason',
          type: 'pie',
          data: [
            {
              name: 'PCL (Prohibited Country List)',
              y: pclCount,
              color: '#A86A1E',
            },
            {
              name: 'PAL (Prohibited Author List)',
              y: palCount,
              color: '#BBCDC6',
            },
            {
              name: 'SDN (Watchlist / OFAC)',
              y: sdnCount,
              color: '#E6D0B5',
            },
          ],
        },
      ],
    };
  });

  // Chart 4: Daily Decision Events (Spline chart on white card)
  protected readonly dailyTrendChartOptions = computed<Highcharts.Options>(() => {
    const recs = this.filteredRecords();
    const dayMap = new Map<string, { total: number; red: number; green: number }>();

    for (const rec of recs) {
      const entry = dayMap.get(rec.decisionDate) ?? { total: 0, red: 0, green: 0 };
      entry.total += 1;
      if (rec.status === 'Red') entry.red += 1;
      else entry.green += 1;
      dayMap.set(rec.decisionDate, entry);
    }

    const sortedDays = Array.from(dayMap.keys()).sort();
    const labels = sortedDays.map((iso) => iso.slice(5));

    return {
      chart: { type: 'spline', height: 320, backgroundColor: 'transparent' },
      title: {
        text: 'Daily Decision Events Trend',
        align: 'left',
        style: {
          fontFamily: "'Fraunces', serif",
          fontSize: '18px',
          fontWeight: '400',
          color: '#481111',
        },
      },
      subtitle: {
        text: 'Daily screening trajectory across Total, Red Flagged, and Green Cleared decisions',
        align: 'left',
        style: {
          fontFamily: "'Inter', sans-serif",
          fontSize: '13px',
          color: 'rgba(72, 17, 17, 0.62)',
        },
      },
      credits: { enabled: false },
      xAxis: {
        categories: labels,
        tickInterval: Math.max(1, Math.floor(labels.length / 8)),
        lineColor: 'rgba(72, 17, 17, 0.14)',
        labels: {
          style: {
            fontFamily: "'Inter', sans-serif",
            color: 'rgba(72, 17, 17, 0.75)',
            fontSize: '11px',
          },
        },
      },
      yAxis: {
        min: 0,
        allowDecimals: false,
        title: {
          text: 'Decision Events',
          style: {
            fontFamily: "'Inter', sans-serif",
            color: 'rgba(72, 17, 17, 0.62)',
            fontSize: '11px',
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
        shadow: false,
        borderWidth: 1,
        borderColor: 'rgba(72, 17, 17, 0.18)',
        backgroundColor: '#FFFFFF',
        style: { fontFamily: "'Inter', sans-serif", color: '#1D0E0A', fontSize: '12px' },
      },
      plotOptions: {
        spline: {
          lineWidth: 2.5,
          marker: { enabled: sortedDays.length <= 20, radius: 4 },
          shadow: false,
        },
      },
      series: [
        {
          id: 'daily-total',
          name: 'Total Decisions',
          type: 'spline',
          data: sortedDays.map((d) => dayMap.get(d)?.total ?? 0),
          color: '#3C476A',
        },
        {
          id: 'daily-red',
          name: 'Red Flagged',
          type: 'spline',
          data: sortedDays.map((d) => dayMap.get(d)?.red ?? 0),
          color: '#B5524A',
        },
        {
          id: 'daily-green',
          name: 'Green Cleared',
          type: 'spline',
          data: sortedDays.map((d) => dayMap.get(d)?.green ?? 0),
          color: '#3E7D69',
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
    this.selectedSource.set('ALL');
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
