import { TestBed } from '@angular/core/testing';
import { provideHighcharts } from 'highcharts-angular';
import * as XLSX from 'xlsx';
import { DashboardComponent } from './dashboard.component';
import { SanctionsDataService } from '../../services/sanctions-data.service';

describe('DashboardComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideHighcharts({
          instance: () => import('highcharts/esm/highcharts.js').then((m) => m.default),
          modules: () => [import('highcharts/esm/modules/accessibility.js')],
        }),
      ],
    }).compileComponents();
  });

  it('should show the upload-first empty state when no files are uploaded yet', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent ?? '';

    expect(text).toContain('Upload Screening Export Files to Populate the Dashboard');
    expect(text).toContain('Uploaded Files Only (0)');
    expect(text).toContain('Mock JSON (On Hold: 246)');
    expect(text).not.toContain('PCL Breakdown by Country');
  });

  it('should populate all 6 KPIs, 4 charts, and Red records modal after uploading sample data', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const loadSampleBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Load Built-in 23-Row Sample')
    );
    expect(loadSampleBtn).toBeTruthy();

    loadSampleBtn?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const text = el.textContent ?? '';
    expect(text).toContain('PCL Breakdown by Country');
    expect(text).toContain('Flag Events by Source');
    expect(text).toContain('Reason Mix Distribution');
    expect(text).toContain('Daily Decision Events Trend');

    const flagEventsBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Flag Events')
    );
    expect(flagEventsBtn?.textContent).toContain('23');
    expect(flagEventsBtn?.textContent).toContain('21 Red');

    const uniqueDocsBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Unique Documents')
    );
    expect(uniqueDocsBtn?.textContent).toContain('18');
    expect(uniqueDocsBtn?.textContent).toContain('1 Green');
    expect(uniqueDocsBtn?.textContent).toContain('17 Red');

    const flaggedAuthorsBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Flagged Author Iden')
    );
    expect(flaggedAuthorsBtn?.textContent).toContain('22');
    expect(flaggedAuthorsBtn?.textContent).toContain('20 Red');

    const coAuthorsBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Co-author Records')
    );
    expect(coAuthorsBtn?.textContent).toContain('12');
    expect(coAuthorsBtn?.textContent).toContain('11 Red');

    const palBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('PAL Events')
    );
    expect(palBtn?.textContent).toContain('14');
    expect(palBtn?.textContent).toContain('13 Red');

    const pclBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('PCL Events')
    );
    expect(pclBtn?.textContent).toContain('0');

    coAuthorsBtn?.click();
    fixture.detectChanges();
    let dialog = el.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Co-author Linked Only');
    expect(dialog?.textContent).toContain('Showing 8 of 21');

    (dialog?.querySelector('button[aria-label="Close modal"]') as HTMLButtonElement)?.click();
    fixture.detectChanges();
    flaggedAuthorsBtn?.click();
    fixture.detectChanges();
    dialog = el.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain('Showing 21 of 21');
    expect(dialog?.textContent).toContain('Qiang Zhang');
    expect(dialog?.textContent).toContain('Export to CSV');
  });

  it('should update KPI metrics when filtering by source', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const mockBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Preview Mock JSON')
    );
    mockBtn?.click();
    fixture.detectChanges();

    const sourceSelect = el.querySelector('#sourceFilter') as HTMLSelectElement;
    expect(sourceSelect).toBeTruthy();

    const allEventsText = el.textContent ?? '';
    sourceSelect.value = 'PAPERCEPT';
    sourceSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(el.textContent).not.toBe(allEventsText);
  });

  it('should render all new custom report options in the reports dropdown', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const reportsSelect = el.querySelector('#reportsFilter') as HTMLSelectElement;
    expect(reportsSelect).toBeTruthy();

    const optionValues = Array.from(reportsSelect.options).map((o) => o.value);
    const expected = [
      'ScreenedAuthor',
      'SanctionedDocumentsDetails',
      'BlockedArticle',
      'JournalStats',
      'DocumentHistory',
      'AuthorsHistory',
      'Document History',
      'Authors History',
    ];

    expect(optionValues).toEqual(expected);

    // Verify changing selection
    reportsSelect.value = 'SanctionedDocumentsDetails';
    reportsSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.componentInstance['selectedReport']()).toBe('SanctionedDocumentsDetails');
    expect(el.textContent).toContain('SanctionedDocumentsDetails');
  });

  it('should extract and display trends including most submitted article and most REDs by source', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dataService = TestBed.inject(SanctionsDataService);
    fixture.detectChanges();
    await fixture.whenStable();

    // Load sample data into uploaded Excel mode
    dataService.loadBuiltInSampleCsv();
    dataService.datasetMode.set('UPLOADED_ONLY');
    fixture.detectChanges();
    await fixture.whenStable();

    const comp = fixture.componentInstance;
    const trends = comp['trendsSummary']();

    expect(trends.hasData).toBe(true);
    expect(trends.totalRecords).toBe(23);
    expect(trends.uniqueArticlesCount).toBeGreaterThan(0);

    // 1. Most submitted article
    expect(trends.mostSubmittedArticle).toBeTruthy();
    expect(trends.mostSubmittedArticle?.documentTitle).toBeTruthy();
    expect(trends.mostSubmittedArticle?.submissionCount).toBeGreaterThanOrEqual(1);

    // 2. Most REDs in which source
    expect(trends.topRedSource).toBeTruthy();
    expect(trends.topRedSource?.source).toBe('IDAMS');
    expect(trends.topRedSource?.redCount).toBeGreaterThan(0);
    expect(trends.topRedSource?.isTopSource).toBe(true);

    // Verify EMS and IEEE XPLORE are excluded from trends chart & breakdown
    const breakdownSources = trends.sourceRedBreakdown.map((s) => s.source);
    expect(breakdownSources).not.toContain('EMS');
    expect(breakdownSources).not.toContain('IEEE XPLORE');
    const chartCategories = comp['trendsSourceChartOptions']().xAxis as { categories: string[] };
    expect(chartCategories.categories).not.toContain('EMS');
    expect(chartCategories.categories).not.toContain('IEEE XPLORE');

    // 3. UI section rendering
    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent ?? '';
    expect(text).toContain('Screening Trends Analysis');
    expect(text).toContain('Most Submitted Article');
    expect(text).toContain('Highest RED Risk Source');
    expect(text).toContain('Top Repeating Articles in Report');
    expect(text).toContain('RED Escalations by Ingest Source');

    // 4. Reactive to report switching
    comp['selectedReport'].set('BlockedArticle');
    fixture.detectChanges();
    await fixture.whenStable();

    const blockedTrends = comp['trendsSummary']();
    expect(blockedTrends.hasData).toBe(true);
    expect(blockedTrends.mostSubmittedArticle).toBeTruthy();
    // In BlockedArticle report, all records have Red status
    expect(blockedTrends.mostSubmittedArticle?.redCount).toBe(blockedTrends.mostSubmittedArticle?.submissionCount);
  });

  it('should forcefully include Papercept records with empty Document_Id and isolate primary authors from co-authors', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dataService = TestBed.inject(SanctionsDataService);
    fixture.detectChanges();
    await fixture.whenStable();

    // Create an in-memory workbook with PAPERCEPT sheet having empty Document_Id
    const wb = XLSX.utils.book_new();
    const paperceptRows = [
      ['Document_Id', 'Manuscript_Id', 'Status', 'Decision_Date', 'Journal_Name', 'Document_Source', 'Reason', 'Author_Name', 'Email', 'Author_Id', 'Pal_Id', 'Country', 'Affiliations'],
      ['', '25-0194', 'RED', '2025-06-27', 'IEEE Journal on Oceanic Engineering', 'Papercept', 'PCL', 'Delgi Peraza', 'dperaza@example.com', '156724', '', '[Venezuela]', '[Country : Venezuela, Organisation Name : Universidad de Carabobo]'],
      ['', '', '', '', '', '', '', 'Co-Authors', '', '', '', '', ''],
      ['', '', '', '', '', '', '', 'Oliger Mendoza', 'oliger@example.com', '156713', '', '', '[Country : China, Organisation Name : University of Science and Technology Beijing]'],
      ['', '25-0161', 'RED', '2025-06-16', 'IEEE Journal on Oceanic Engineering', 'Papercept', 'PCL', 'Delgi Peraza', 'dperaza@example.com', '156724', '', '[Venezuela]', '[Country : Venezuela, Organisation Name : Universidad de Carabobo]'],
      ['', '', '', '', '', '', '', 'Co-Authors', '', '', '', '', ''],
      ['', '', '', '', '', '', '', 'Oliger Mendoza', 'oliger@example.com', '156713', '', '', '[Country : China, Organisation Name : University of Science and Technology Beijing]']
    ];
    const ws = XLSX.utils.aoa_to_sheet(paperceptRows);
    XLSX.utils.book_append_sheet(wb, ws, 'PAPERCEPT');

    const wbBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    await dataService.importUploadedExcel(wbBuf, 'TestPapercept.xlsx');
    dataService.datasetMode.set('UPLOADED_ONLY');
    fixture.componentInstance['onPresetChange']('ALL_DATES');
    fixture.detectChanges();
    await fixture.whenStable();

    const comp = fixture.componentInstance;
    const records = comp['filteredRecords']();

    // Verify all 4 records (2 primary + 2 co-authors) are forcefully included despite empty Document_Id
    expect(records.length).toBe(4);
    expect(records.every((r) => r.source === 'PAPERCEPT')).toBe(true);

    const primaryRecs = records.filter((r) => !r.isCoAuthor);
    const coAuthorRecs = records.filter((r) => r.isCoAuthor);
    expect(primaryRecs.length).toBe(2);
    expect(coAuthorRecs.length).toBe(2);

    // Primary authors are mapped to adjacent reason PCL and flagged Red
    expect(primaryRecs.every((r) => r.authorName === 'Delgi Peraza' && r.status === 'Red')).toBe(true);
    expect(coAuthorRecs.every((r) => r.authorName === 'Oliger Mendoza' && r.status === 'Green')).toBe(true);

    // Verify KPI calculations isolate primary authors
    const kpi = comp['kpiMetrics']();
    expect(kpi.flaggedAuthorsRed).toBe(1); // 1 unique primary author (Delgi Peraza)
    expect(kpi.coAuthorRecords).toBe(2); // 2 co-author records
    expect(kpi.pclEvents).toBe(2);
    expect(kpi.palEvents).toBe(0); // 0 PAL records in Papercept
    expect(kpi.sdnEvents).toBe(0); // 0 SDN records in Papercept
  });

  it('should compute PAL Top Organization stat, display 0 for null metrics, and react dynamically to source filter', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dataService = TestBed.inject(SanctionsDataService);
    fixture.detectChanges();
    await fixture.whenStable();

    // Create workbook with S1M sheet (PAL with JSON affiliations) and PAPERCEPT sheet (PCL only)
    const wb = XLSX.utils.book_new();
    const s1mRows = [
      ['Document_Id', 'Manuscript_Id', 'Status', 'Decision_Date', 'Journal_Name', 'Document_Source', 'Reason', 'Author_Name', 'Email', 'Author_Id', 'Pal_Id', 'Country', 'Affiliations'],
      ['DOC-S1M-1', 'MS-101', 'RED', '2025-05-10', 'IEEE Access', 'S1M', 'PAL', 'Author Alpha', 'alpha@org.com', 'A1', 'P1', 'Saudi Arabia', '[{"organisationName": "Princess Nourah University"}]'],
      ['DOC-S1M-2', 'MS-102', 'RED', '2025-05-12', 'IEEE Access', 'S1M', 'PAL', 'Author Beta', 'beta@org.com', 'A2', 'P2', 'Saudi Arabia', '[{"organisationName": "Princess Nourah University"}]'],
      ['DOC-S1M-3', 'MS-103', 'RED', '2025-05-14', 'Transactions on Electronics', 'S1M', 'PAL', 'Author Gamma', 'gamma@org.com', 'A3', 'P3', 'India', '[{"organisationName": "Koneru Lakshmaiah Education Foundation"}]'],
    ];
    const paperceptRows = [
      ['Document_Id', 'Manuscript_Id', 'Status', 'Decision_Date', 'Journal_Name', 'Document_Source', 'Reason', 'Author_Name', 'Email', 'Author_Id', 'Pal_Id', 'Country', 'Affiliations'],
      ['', 'MS-201', 'RED', '2025-06-01', 'Oceanic Eng', 'Papercept', 'PCL', 'Author Delta', 'delta@org.com', 'D1', '', 'Venezuela', '[Country : Venezuela, Organisation Name : Carabobo]'],
    ];

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s1mRows), 'S1M');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(paperceptRows), 'PAPERCEPT');

    const wbBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    await dataService.importUploadedExcel(wbBuf, 'MultiSourceTest.xlsx');
    dataService.datasetMode.set('UPLOADED_ONLY');
    fixture.componentInstance['onPresetChange']('ALL_DATES');
    fixture.detectChanges();
    await fixture.whenStable();

    const comp = fixture.componentInstance;

    // In All Sources: Top PAL org is Princess Nourah University with 2 occurrences
    expect(comp['palTopOrganization']().organization).toBe('Princess Nourah University');
    expect(comp['palTopOrganization']().count).toBe(2);

    // Filter to PAPERCEPT: PAL count must fall back to 0 (No organization found)
    comp['selectedSource'].set('PAPERCEPT');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(comp['palTopOrganization']().count).toBe(0);
    const kpi = comp['kpiMetrics']();
    expect(kpi.palEvents).toBe(0);
    expect(kpi.sdnEvents).toBe(0);
    expect(kpi.pclEvents).toBe(1);

    // Verify Watchlist dispositions return explicit 0 for PAL and SDN under PAPERCEPT
    const dispositions = comp['watchlistDispositions']();
    const palDisp = dispositions.find((d) => d.category === 'PAL');
    const sdnDisp = dispositions.find((d) => d.category === 'SDN');
    const pclDisp = dispositions.find((d) => d.category === 'PCL');
    expect(palDisp?.totalDocs).toBe(0);
    expect(palDisp?.redDocs).toBe(0);
    expect(sdnDisp?.totalDocs).toBe(0);
    expect(pclDisp?.totalDocs).toBe(1);

    // Verify dynamic trends reaction to Source filter
    const journals = comp['mostAppearedJournals']();
    expect(journals.length).toBe(1);
    expect(journals[0].journalName).toBe('Oceanic Eng');

    const pclCountries = comp['pclCountryTrends']();
    expect(pclCountries.length).toBe(1);
    expect(pclCountries[0].country).toBe('Venezuela');

    // Switch back to S1M
    comp['selectedSource'].set('S1M');
    fixture.detectChanges();
    await fixture.whenStable();

    const s1mJournals = comp['mostAppearedJournals']();
    expect(s1mJournals.some((j) => j.journalName === 'IEEE Access')).toBe(true);
    expect(comp['palTopOrganization']().count).toBe(2);
  });
});
