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
    expect(text).not.toContain('Monthly Flagged-Event Trend');
  });

  it('should populate exactly 4 top-level stat cards and 4 minimal charts after uploading sample data', async () => {
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
    // Verify 4 clean stat cards exist
    expect(text).toContain('Total Flagged Events');
    expect(text).toContain('PAL Alerts');
    expect(text).toContain('PCL Alerts');
    expect(text).toContain('Unique Flagged Authors');

    // Verify 4 clean charts exist
    expect(text).toContain('Monthly Flagged-Event Trend');
    expect(text).toContain('Screening Reason Distribution');
    expect(text).toContain('Events by Platform');
    expect(text).toContain('PCL Match by Country');

    const kpi = fixture.componentInstance['kpiStats']();
    expect(kpi.totalFlaggedEvents).toBe(23);
    expect(kpi.palAlerts).toBe(11);
    expect(kpi.pclAlerts).toBe(0);
    expect(kpi.uniqueFlaggedAuthors).toBeGreaterThan(0);

    // Clicking stat card opens modal
    const totalEventsBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Total Flagged Events')
    );
    totalEventsBtn?.click();
    fixture.detectChanges();

    const dialog = el.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain('Total Flagged Events');

    (dialog?.querySelector('button[aria-label="Close modal"]') as HTMLButtonElement)?.click();
    fixture.detectChanges();
  });

  it('should update stat cards and charts dynamically when filtering by platform and reason', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const mockBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Preview Mock JSON')
    );
    mockBtn?.click();
    fixture.detectChanges();

    const platformSelect = el.querySelector('#sourceFilter') as HTMLSelectElement;
    expect(platformSelect).toBeTruthy();

    const initialTotal = fixture.componentInstance['kpiStats']().totalFlaggedEvents;
    expect(initialTotal).toBe(246);

    // Filter by platform PAPERCEPT
    platformSelect.value = 'PAPERCEPT';
    platformSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const paperceptTotal = fixture.componentInstance['kpiStats']().totalFlaggedEvents;
    expect(paperceptTotal).toBeLessThan(initialTotal);
    expect(paperceptTotal).toBeGreaterThan(0);

    // Filter by Reason PCL
    const reasonSelect = el.querySelector('#reasonFilter') as HTMLSelectElement;
    expect(reasonSelect).toBeTruthy();
    reasonSelect.value = 'PCL';
    reasonSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const pclKpi = fixture.componentInstance['kpiStats']();
    expect(pclKpi.palAlerts).toBe(0);
    expect(pclKpi.pclAlerts).toBe(pclKpi.totalFlaggedEvents);

    // Reset filters
    const resetBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Reset'
    );
    resetBtn?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance['kpiStats']().totalFlaggedEvents).toBe(initialTotal);
  });

  it('should render all report options in the reports dropdown', async () => {
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

    reportsSelect.value = 'SanctionedDocumentsDetails';
    reportsSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.componentInstance['selectedReport']()).toBe('SanctionedDocumentsDetails');
  });

  it('should enforce Base Filter by dropping rows with empty Document_Source and calculate exact metrics', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dataService = TestBed.inject(SanctionsDataService);
    fixture.detectChanges();
    await fixture.whenStable();

    // Create an in-memory workbook with empty Document_Source rows (e.g. Co-authors and blank rows)
    const wb = XLSX.utils.book_new();
    const rows = [
      ['Document_Id', 'Manuscript_Id', 'Status', 'Decision_Date', 'Journal_Name', 'Document_Source', 'Reason', 'Author_Name', 'Email', 'Author_Id', 'Pal_Id', 'Country', 'Affiliations'],
      ['DOC-1', 'MS-101', 'RED', '2025-06-27', 'Journal A', 'Papercept', 'PCL', 'Delgi Peraza', 'dperaza@example.com', '156724', '', '[Venezuela]', '[Country : Venezuela]'],
      ['', '', '', '', '', '', '', 'Co-Authors', '', '', '', '', ''],
      ['', '', '', '', '', '', '', 'Oliger Mendoza', 'oliger@example.com', '156713', '', '', '[Country : China]'],
      ['DOC-2', 'MS-102', 'RED', '2025-06-16', 'Journal B', 'Papercept', 'PCL', 'Delgi Peraza', 'dperaza@example.com', '156724', '', '[Venezuela]', '[Country : Venezuela]'],
      ['', '', '', '', '', '', '', 'Co-Authors', '', '', '', '', ''],
      ['', '', '', '', '', '', '', 'Oliger Mendoza', 'oliger@example.com', '156713', '', '', '[Country : China]'],
      ['DOC-3', 'MS-103', 'RED', '2025-05-10', 'Journal C', 'S1M', 'PAL', 'Author Alpha', 'alpha@example.com', 'A1', 'P1', '[Crimea]', '[Country : Crimea]'],
      ['', '', '', '', '', '', '', 'Co-Authors', '', '', '', '', ''],
      ['', '', '', '', '', '', '', 'CoAuthor Beta', 'beta@example.com', 'B1', '', '', '']
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'TestSheet');

    const wbBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    await dataService.importUploadedExcel(wbBuf, 'TestBaseFilter.xlsx');
    dataService.datasetMode.set('UPLOADED_ONLY');
    (fixture.componentInstance as any)['onPresetChange']('ALL_DATES');
    fixture.detectChanges();
    await fixture.whenStable();

    const comp = fixture.componentInstance;
    const records = comp['filteredRecords']();

    // Base Filter: Only 3 rows have non-empty Document_Source! All co-author/blank rows dropped
    expect(records.length).toBe(3);

    const kpi = comp['kpiStats']();
    expect(kpi.totalFlaggedEvents).toBe(3);
    expect(kpi.palAlerts).toBe(1);
    expect(kpi.pclAlerts).toBe(2);
    // Unique emails: 'dperaza@example.com' (appears twice) + 'alpha@example.com' (appears once) = 2 unique emails
    expect(kpi.uniqueFlaggedAuthors).toBe(2);

    // Verify PCL Country stripped brackets: [Venezuela] -> Venezuela
    const pclCountries = comp['pclCountryChartOptions']().xAxis as { categories: string[] };
    expect(pclCountries.categories).toContain('Venezuela');
    expect(pclCountries.categories).not.toContain('[Venezuela]');
  });

  it('should parse multi-sheet Excel workbook and produce exact raw data metrics and dynamic charts', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dataService = TestBed.inject(SanctionsDataService);
    fixture.detectChanges();
    await fixture.whenStable();

    const wb = XLSX.utils.book_new();

    // S1M Sheet: 2 valid PAL rows, 1 valid PCL row, 1 co-author row with empty source
    const s1mRows = [
      ['Document_Id', 'Manuscript_Id', 'Status', 'Decision_Date', 'Journal_Name', 'Document_Source', 'Reason', 'Author_Name', 'Email', 'Author_Id', 'Pal_Id', 'Country', 'Affiliations'],
      ['S1M-1', 'MS-1', 'RED', '2025-01-15', 'IEEE Trans A', 'S1M', 'PAL', 'Author S1', 's1@example.com', 'A1', 'P1', 'China', ''],
      ['S1M-2', 'MS-2', 'RED', '2025-02-20', 'IEEE Trans B', 'S1M', 'PAL', 'Author S2', 's2@example.com', 'A2', 'P2', 'China', ''],
      ['S1M-3', 'MS-3', 'RED', '2025-03-25', 'IEEE Trans C', 'S1M', 'PCL', 'Author S3', 's3@example.com', 'A3', '', '[Venezuela]', ''],
      ['', '', '', '', '', '', '', 'Co-Author Empty', 'skip@example.com', '', '', '', ''],
    ];

    // IDAMS Sheet: 1 valid PAL row, 1 valid PCL row
    const idamsRows = [
      ['Document_Id', 'Manuscript_Id', 'Status', 'Decision_Date', 'Journal_Name', 'Document_Source', 'Reason', 'Author_Name', 'Email', 'Author_Id', 'Pal_Id', 'Country', 'Affiliations'],
      ['ID-1', 'MS-4', 'RED', '2025-04-10', 'Journal D', 'IDAMS', 'PAL', 'Author I1', 'i1@example.com', 'B1', 'P3', 'China', ''],
      ['ID-2', 'MS-5', 'RED', '2025-05-18', 'Journal E', 'IDAMS', 'PCL', 'Author I2', 'i2@example.com', 'B2', '', '[Crimea]', ''],
    ];

    // PAPERCEPT Sheet: 2 valid PCL rows (empty Document_Id bypassed)
    const paperceptRows = [
      ['Document_Id', 'Manuscript_Id', 'Status', 'Decision_Date', 'Journal_Name', 'Document_Source', 'Reason', 'Author_Name', 'Email', 'Author_Id', 'Pal_Id', 'Country', 'Affiliations'],
      ['', 'MS-6', 'RED', '2025-06-05', 'Oceanic Eng', 'Papercept', 'PCL', 'Author P1', 'p1@example.com', 'C1', '', '[Venezuela]', ''],
      ['', 'MS-7', 'RED', '2025-07-22', 'Oceanic Eng', 'Papercept', 'PCL', 'Author P2', 'p2@example.com', 'C2', '', '[North Korea]', ''],
    ];

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s1mRows), 'S1M');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(idamsRows), 'IDAMS');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(paperceptRows), 'PAPERCEPT');

    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    await dataService.importUploadedExcel(buffer, 'MultiSheetSanctionsReport.xlsx');
    dataService.datasetMode.set('UPLOADED_ONLY');
    (fixture.componentInstance as any)['onPresetChange']('ALL_DATES');
    fixture.detectChanges();
    await fixture.whenStable();

    const comp = fixture.componentInstance;
    const kpi = comp['kpiStats']();

    // 1. Exact top-level 4 KPI stats (3 S1M + 2 IDAMS + 2 PAPERCEPT = 7 total valid records)
    expect(kpi.totalFlaggedEvents).toBe(7);
    expect(kpi.palAlerts).toBe(3); // 2 in S1M, 1 in IDAMS
    expect(kpi.pclAlerts).toBe(4); // 1 in S1M, 1 in IDAMS, 2 in PAPERCEPT
    expect(kpi.uniqueFlaggedAuthors).toBe(7);

    // 2. Events by platform
    const platformChart = comp['platformChartOptions']();
    const platformData = (platformChart.series?.[0] as any)?.data as number[];
    expect(platformData).toEqual([3, 2, 2]); // S1M: 3, IDAMS: 2, PAPERCEPT: 2

    // 3. PCL Country distribution (Venezuela: 2, Crimea: 1, North Korea: 1)
    const pclCountryChart = comp['pclCountryChartOptions']();
    const countryCats = (pclCountryChart.xAxis as any)?.categories as string[];
    const countryData = (pclCountryChart.series?.[0] as any)?.data as number[];
    expect(countryCats).toEqual(['Venezuela', 'Crimea', 'North Korea']);
    expect(countryData).toEqual([2, 1, 1]);

    // 4. Monthly flagged-event trend (Jan: 1, Feb: 1, Mar: 1, Apr: 1, May: 1, Jun: 1, Jul: 1, Aug-Dec: 0)
    const monthlyChart = comp['monthlyTrendChartOptions']();
    const monthlyData = (monthlyChart.series?.[0] as any)?.data as number[];
    expect(monthlyData.slice(0, 7)).toEqual([1, 1, 1, 1, 1, 1, 1]);

    // 5. Dynamic Platform Filter: PAPERCEPT
    comp['selectedPlatform'].set('PAPERCEPT');
    fixture.detectChanges();
    await fixture.whenStable();

    const paperceptKpi = comp['kpiStats']();
    expect(paperceptKpi.totalFlaggedEvents).toBe(2);
    expect(paperceptKpi.palAlerts).toBe(0);
    expect(paperceptKpi.pclAlerts).toBe(2);

    // 6. Dynamic Reason Filter: PAL
    comp['selectedPlatform'].set('ALL');
    comp['selectedReason'].set('PAL');
    fixture.detectChanges();
    await fixture.whenStable();

    const palKpi = comp['kpiStats']();
    expect(palKpi.totalFlaggedEvents).toBe(3);
    expect(palKpi.palAlerts).toBe(3);
    expect(palKpi.pclAlerts).toBe(0);
  });
});
