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

  it('should display a toast saying data got ingested when adding a new restricted location', async () => {
    const fixture = TestBed.createComponent(AdminConfigComponent);
    const comp = fixture.componentInstance as unknown as {
      newCountry: { set: (v: string) => void };
      newCity: { set: (v: string) => void };
      newIsoCode: { set: (v: string) => void };
      onAddRestrictedLocation: () => void;
      toastMessage: () => string | null;
    };

    comp.newCountry.set('Sudan');
    comp.newCity.set('Khartoum');
    comp.newIsoCode.set('SD');
    comp.onAddRestrictedLocation();

    fixture.detectChanges();
    await fixture.whenStable();

    const toast = comp.toastMessage();
    expect(toast).toBeTruthy();
    expect(toast).toContain('Data got ingested');
    expect(toast).toContain('Khartoum, Sudan');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Data got ingested');
    expect(el.textContent).toContain('Khartoum, Sudan');
  });

  it('should display a toast saying data got ingested when adding a new PAL author entry', async () => {
    const fixture = TestBed.createComponent(AdminConfigComponent);
    const comp = fixture.componentInstance as unknown as {
      palFullName: { set: (v: string) => void };
      palAffiliation: { set: (v: string) => void };
      palCountry: { set: (v: string) => void };
      onAddPalEntry: () => void;
      toastMessage: () => string | null;
    };

    comp.palFullName.set('Dr. Tariq Al-Mansoor');
    comp.palAffiliation.set('Baghdad Technical University');
    comp.palCountry.set('Iraq');
    comp.onAddPalEntry();

    fixture.detectChanges();
    await fixture.whenStable();

    const toast = comp.toastMessage();
    expect(toast).toBeTruthy();
    expect(toast).toContain('Data got ingested');
    expect(toast).toContain('Dr. Tariq Al-Mansoor');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Data got ingested');
    expect(el.textContent).toContain('Dr. Tariq Al-Mansoor');
  });
});
