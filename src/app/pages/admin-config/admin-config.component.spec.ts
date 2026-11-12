import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminConfigComponent } from './admin-config.component';

describe('AdminConfigComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminConfigComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should render Source Enablement, Country/City Management, and PAL Onboarding', async () => {
    const fixture = TestBed.createComponent(AdminConfigComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Source Enablement');
    expect(text).toContain('OFAC SDN & Consolidated Sanctions');
    expect(text).toContain('UK Sanctions Database (OFSI)');
    expect(text).toContain('Australia Sanctions Database (DFAT)');
    expect(text).toContain('Country & City Management (PCL)');
    expect(text).toContain('Prohibited Author List (PAL) Onboarding');
  });
});
