import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DateRangePreset,
  ReportType,
  SanctionsRecord,
  ScreeningSource,
} from '../../models/sanctions.models';
import { SanctionsDataService } from '../../services/sanctions-data.service';
import { exportRecordsToCsv } from '../../utils/csv-export.util';
import { exportRecordsToExcel } from '../../utils/excel-export.util';

export interface ReportCardItem {
  id: string;
  reportType: ReportType;
  title: string;
  badgeLabel: string;
  badgeClass: 'info' | 'bad' | 'warn' | 'neutral' | 'sage';
  description: string;
  formatNotice: string;
  filterFn: (records: SanctionsRecord[]) => SanctionsRecord[];
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reports.component.html',
})
export class ReportsComponent {
  protected readonly dataService = inject(SanctionsDataService);

  private readonly initialRange = this.dataService.getDateRangeForPreset('ALL_DATES');

  // Filter signals
  protected readonly selectedPlatform = signal<ScreeningSource | 'ALL'>('ALL');
  protected readonly selectedReason = signal<'ALL' | 'PAL' | 'PCL' | 'OFAC' | 'SDN'>('ALL');
  protected readonly selectedPreset = signal<DateRangePreset>('ALL_DATES');
  protected readonly startDate = signal<string>(this.initialRange.start);
  protected readonly endDate = signal<string>(this.initialRange.end);
  protected readonly searchQuery = signal<string>('');

  // Status message for export toasts
  protected readonly exportMessage = signal<string | null>(null);

  // Quick preview modal state
  protected readonly previewReport = signal<ReportCardItem | null>(null);

  protected readonly platformOptions: ReadonlyArray<{
    label: string;
    value: ScreeningSource | 'ALL';
  }> = [
    { label: 'All Platforms', value: 'ALL' },
    { label: 'S1M', value: 'S1M' },
    { label: 'IDAMS', value: 'IDAMS' },
    { label: 'PAPERCEPT', value: 'PAPERCEPT' },
  ];

  protected readonly reasonOptions: ReadonlyArray<{
    label: string;
    value: 'ALL' | 'PAL' | 'PCL' | 'OFAC' | 'SDN';
  }> = [
    { label: 'All alerts', value: 'ALL' },
    { label: 'PAL', value: 'PAL' },
    { label: 'PCL', value: 'PCL' },
    { label: 'OFAC', value: 'OFAC' },
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

  // Definition of all 8 decoupled and curated compliance reports
  protected readonly availableReports: ReportCardItem[] = [
    {
      id: 'screened-authors',
      reportType: 'ScreenedAuthor',
      title: 'Screened Authors Report',
      badgeLabel: 'Primary Surveillance',
      badgeClass: 'info',
      description:
        'Complete surveillance log of screened primary authors, clearance states, affiliations, and screening outcomes.',
      formatNotice: 'Includes author identities, emails, IDs, and match terms.',
      filterFn: (records) => records,
    },
    {
      id: 'sanctioned-documents',
      reportType: 'SanctionedDocumentsDetails',
      title: 'Sanctioned Documents Details',
      badgeLabel: 'RED Alerts &bull; Flagged',
      badgeClass: 'bad',
      description:
        'Detailed audit trail of all document submissions triggering RED watchlist hits or matched sanctions criteria.',
      formatNotice: 'Filtered to RED compliance alerts and matched terms.',
      filterFn: (records) =>
        records.filter(
          (r) => r.status === 'Red' || (r.matchedTerms && r.matchedTerms.length > 0)
        ),
    },
    {
      id: 'blocked-articles',
      reportType: 'BlockedArticle',
      title: 'Blocked Articles Report',
      badgeLabel: 'Editorial Hold',
      badgeClass: 'warn',
      description:
        'Articles subjected to mandatory editorial blockage or peer-review publication restriction.',
      formatNotice: 'Identifies articles with active editorial blockage.',
      filterFn: (records) => records.filter((r) => r.status === 'Red'),
    },
    {
      id: 'journal-stats',
      reportType: 'JournalStats',
      title: 'Journal Risk & Statistics Summary',
      badgeLabel: 'Publication Metrics',
      badgeClass: 'neutral',
      description:
        'Cross-journal breakdown showing submission counts, RED incident concentration, and platform pipelines.',
      formatNotice: 'Aggregates editorial volume and risk concentration.',
      filterFn: (records) => records,
    },
    {
      id: 'document-history',
      reportType: 'DocumentHistory',
      title: 'Document History Audit Trail',
      badgeLabel: 'Chronological Log',
      badgeClass: 'neutral',
      description:
        'Chronological historical timeline of all manuscript evaluations, sorted latest-to-oldest by decision date.',
      formatNotice: 'Sorted in reverse chronological order (newest first).',
      filterFn: (records) =>
        [...records].sort((a, b) => b.decisionDate.localeCompare(a.decisionDate)),
    },
    {
      id: 'authors-history',
      reportType: 'AuthorsHistory',
      title: 'Authors History & Recurrence Roster',
      badgeLabel: 'Identity Registry',
      badgeClass: 'info',
      description:
        'Alphabetical index of screened authors, recurrence occurrences, institutional affiliations, and country codes.',
      formatNotice: 'Alphabetically ordered by author name.',
      filterFn: (records) =>
        [...records].sort((a, b) => a.authorName.localeCompare(b.authorName)),
    },
    {
      id: 'pcl-country',
      reportType: 'ScreenedAuthor',
      title: 'PCL Restricted Countries & Territories Report',
      badgeLabel: 'Jurisdiction Risk',
      badgeClass: 'warn',
      description:
        'Screening alerts originating from sanctioned jurisdictions (Venezuela, Russia, North Korea, Iran, Crimea).',
      formatNotice: 'Filtered specifically to Prohibited Country List (PCL) alerts.',
      filterFn: (records) =>
        records.filter((r) => {
          const reason = (r.reason || '').trim().toUpperCase();
          return reason === 'PCL' || r.category === 'PCL';
        }),
    },
    {
      id: 'pal-watchlist',
      reportType: 'ScreenedAuthor',
      title: 'PAL Prohibited Authors & Organizations Report',
      badgeLabel: 'Watchlist Match',
      badgeClass: 'bad',
      description:
        'Named individual author matches and restricted institutional affiliations under the Prohibited Author List (PAL).',
      formatNotice: 'Filtered specifically to Prohibited Author List (PAL) alerts.',
      filterFn: (records) =>
        records.filter((r) => {
          const reason = (r.reason || '').trim().toUpperCase();
          return reason === 'PAL' || r.category === 'PAL';
        }),
    },
  ];

  // Base filtered records responding to Platform, Reason, and Date Range filters
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
      // Reason filter
      if (reason !== 'ALL') {
        const recReason = (record.reason || '').trim().toUpperCase();
        if (reason === 'PAL' && recReason !== 'PAL' && record.category !== 'PAL') {
          return false;
        }
        if (reason === 'PCL' && recReason !== 'PCL' && record.category !== 'PCL') {
          return false;
        }
        if (
          (reason === 'OFAC' || (reason as string) === 'SDN') &&
          recReason !== 'OFAC' &&
          recReason !== 'SDN' &&
          record.category !== 'OFAC' &&
          (record.category as string) !== 'SDN'
        ) {
          return false;
        }
      }
      // Date range filter
      if (preset !== 'ALL_DATES') {
        const recDate = (record.decisionDate || '').slice(0, 10);
        if (!recDate) {
          return false;
        }
        let effectiveStart = start;
        let effectiveEnd = end;
        if (effectiveStart && effectiveEnd && effectiveStart > effectiveEnd) {
          effectiveStart = end;
          effectiveEnd = start;
        }
        if (effectiveStart && recDate < effectiveStart) {
          return false;
        }
        if (effectiveEnd && recDate > effectiveEnd) {
          return false;
        }
      }
      return true;
    });
  });

  // Filtered reports matching any search term
  protected readonly displayedReports = computed<ReportCardItem[]>(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) {
      return this.availableReports;
    }
    return this.availableReports.filter(
      (rep) =>
        rep.title.toLowerCase().includes(query) ||
        rep.description.toLowerCase().includes(query) ||
        rep.badgeLabel.toLowerCase().includes(query)
    );
  });

  // Calculate live records ready for export for a specific report definition
  protected getReportRecords(report: ReportCardItem): SanctionsRecord[] {
    return report.filterFn(this.filteredRecords());
  }

  protected getReportRecordCount(report: ReportCardItem): number {
    return this.getReportRecords(report).length;
  }

  // Filter change handlers
  protected onPlatformChange(platform: ScreeningSource | 'ALL'): void {
    this.selectedPlatform.set(platform);
  }

  protected onReasonChange(reason: 'ALL' | 'PAL' | 'PCL' | 'OFAC' | 'SDN'): void {
    this.selectedReason.set(reason);
  }

  protected onPresetChange(preset: DateRangePreset): void {
    this.selectedPreset.set(preset);
    if (preset !== 'CUSTOM') {
      const range = this.dataService.getDateRangeForPreset(preset);
      this.startDate.set(range.start);
      this.endDate.set(range.end);
    }
  }

  protected onCustomStartDate(eventOrValue: string | Event): void {
    let date = '';
    if (typeof eventOrValue === 'string') {
      date = eventOrValue;
    } else if (eventOrValue && (eventOrValue.target as HTMLInputElement)?.value !== undefined) {
      date = (eventOrValue.target as HTMLInputElement).value;
    }
    date = (date || '').trim();
    this.selectedPreset.set('CUSTOM');
    this.startDate.set(date);
  }

  protected onCustomEndDate(eventOrValue: string | Event): void {
    let date = '';
    if (typeof eventOrValue === 'string') {
      date = eventOrValue;
    } else if (eventOrValue && (eventOrValue.target as HTMLInputElement)?.value !== undefined) {
      date = (eventOrValue.target as HTMLInputElement).value;
    }
    date = (date || '').trim();
    this.selectedPreset.set('CUSTOM');
    this.endDate.set(date);
  }

  protected resetFilters(): void {
    this.selectedPlatform.set('ALL');
    this.selectedReason.set('ALL');
    this.selectedPreset.set('ALL_DATES');
    const range = this.dataService.getDateRangeForPreset('ALL_DATES');
    this.startDate.set(range.start);
    this.endDate.set(range.end);
    this.searchQuery.set('');
  }

  // Quick record preview modal
  protected openPreview(report: ReportCardItem): void {
    this.previewReport.set(report);
  }

  protected closePreview(): void {
    this.previewReport.set(null);
  }

  // Export functions
  protected performExcelExport(
    records: SanctionsRecord[],
    options: { categoryOrReport: string; uploadedFileName: string | null }
  ): Promise<string> {
    return exportRecordsToExcel(records, options);
  }

  protected performCsvExport(records: SanctionsRecord[], fileName: string): void {
    exportRecordsToCsv(records, fileName);
  }

  protected async exportExcel(report: ReportCardItem): Promise<void> {
    const records = this.getReportRecords(report);
    const uploadedFileName = this.dataService.uploadedFiles()[0]?.fileName ?? null;
    const generatedName = await this.performExcelExport(records, {
      categoryOrReport: report.reportType,
      uploadedFileName,
    });
    this.showExportNotification(`Exported ${records.length} records to ${generatedName}`);
  }

  protected exportCsv(report: ReportCardItem): void {
    const records = this.getReportRecords(report);
    const safeName = report.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const timestamp = new Date().toISOString().slice(0, 10);
    const fileName = `${safeName}-${timestamp}.csv`;
    this.performCsvExport(records, fileName);
    this.showExportNotification(`Exported ${records.length} records to ${fileName}`);
  }

  protected async exportAllConsolidated(): Promise<void> {
    const records = this.filteredRecords();
    const uploadedFileName = this.dataService.uploadedFiles()[0]?.fileName ?? null;
    const generatedName = await this.performExcelExport(records, {
      categoryOrReport: 'ConsolidatedScreeningReport',
      uploadedFileName,
    });
    this.showExportNotification(
      `Exported all ${records.length} active records to ${generatedName}`
    );
  }

  private showExportNotification(msg: string): void {
    this.exportMessage.set(msg);
    setTimeout(() => {
      if (this.exportMessage() === msg) {
        this.exportMessage.set(null);
      }
    }, 4000);
  }
}
