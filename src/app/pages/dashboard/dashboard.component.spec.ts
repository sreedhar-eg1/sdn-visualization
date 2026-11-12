import { TestBed } from '@angular/core/testing';
import { provideHighcharts } from 'highcharts-angular';
import { DashboardComponent } from './dashboard.component';

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
});
