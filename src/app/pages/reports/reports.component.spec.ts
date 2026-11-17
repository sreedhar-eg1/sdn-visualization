import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ReportsComponent } from './reports.component';
import { SanctionsDataService } from '../../services/sanctions-data.service';

describe('ReportsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportsComponent],
    }).compileComponents();
  });

  it('should render the Reports page header and initial 8 report cards', async () => {
    const fixture = TestBed.createComponent(ReportsComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent ?? '';

    expect(text).toContain('Reports & Export Hub');
    expect(text).toContain('Screened Authors Report');
    expect(text).toContain('Sanctioned Documents Details');
    expect(text).toContain('Blocked Articles Report');
    expect(text).toContain('Journal Risk & Statistics Summary');
    expect(text).toContain('Document History Audit Trail');
    expect(text).toContain('Authors History & Recurrence Roster');
    expect(text).toContain('PCL Restricted Countries & Territories Report');
    expect(text).toContain('PAL Prohibited Authors & Organizations Report');
  });

  it('should compute report counts dynamically when sample data is loaded', async () => {
    const fixture = TestBed.createComponent(ReportsComponent);
    const dataService = TestBed.inject(SanctionsDataService);
    dataService.loadBuiltInSampleCsv();
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const cards = fixture.componentInstance['displayedReports']();
    expect(cards.length).toBe(8);

    const screenedAuthorsCard = cards.find((c) => c.id === 'screened-authors')!;
    const count = fixture.componentInstance['getReportRecordCount'](screenedAuthorsCard);
    expect(count).toBe(23);

    const sanctionedDocsCard = cards.find((c) => c.id === 'sanctioned-documents')!;
    const sanctionedCount = fixture.componentInstance['getReportRecordCount'](sanctionedDocsCard);
    expect(sanctionedCount).toBeGreaterThan(0);
  });

  it('should filter displayed report cards when search query is entered', async () => {
    const fixture = TestBed.createComponent(ReportsComponent);
    fixture.detectChanges();

    fixture.componentInstance['searchQuery'].set('blocked');
    fixture.detectChanges();

    const filtered = fixture.componentInstance['displayedReports']();
    expect(filtered.length).toBe(1);
    expect(filtered[0].title).toBe('Blocked Articles Report');
  });

  it('should trigger exportExcel when Export Excel button is clicked', async () => {
    const fixture = TestBed.createComponent(ReportsComponent);
    const dataService = TestBed.inject(SanctionsDataService);
    dataService.loadBuiltInSampleCsv();
    fixture.detectChanges();
    await fixture.whenStable();

    const excelSpy = vi
      .spyOn(fixture.componentInstance as any, 'performExcelExport')
      .mockResolvedValue('test_report.xlsx');

    const cards = fixture.componentInstance['displayedReports']();
    await fixture.componentInstance['exportExcel'](cards[0]);

    expect(excelSpy).toHaveBeenCalled();
    expect(fixture.componentInstance['exportMessage']()).toContain('Exported');
  });

  it('should trigger exportCsv when CSV button is clicked', async () => {
    const fixture = TestBed.createComponent(ReportsComponent);
    const dataService = TestBed.inject(SanctionsDataService);
    dataService.loadBuiltInSampleCsv();
    fixture.detectChanges();
    await fixture.whenStable();

    const csvSpy = vi
      .spyOn(fixture.componentInstance as any, 'performCsvExport')
      .mockImplementation(() => {});

    const cards = fixture.componentInstance['displayedReports']();
    fixture.componentInstance['exportCsv'](cards[0]);

    expect(csvSpy).toHaveBeenCalled();
    expect(fixture.componentInstance['exportMessage']()).toContain('Exported');
  });

  it('should open and close the quick preview modal', async () => {
    const fixture = TestBed.createComponent(ReportsComponent);
    const dataService = TestBed.inject(SanctionsDataService);
    dataService.loadBuiltInSampleCsv();
    fixture.detectChanges();
    await fixture.whenStable();

    const cards = fixture.componentInstance['displayedReports']();
    fixture.componentInstance['openPreview'](cards[0]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const dialog = el.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain('Live Report Preview');

    fixture.componentInstance['closePreview']();
    fixture.detectChanges();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });
});
