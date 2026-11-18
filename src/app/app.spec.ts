import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { AuthService } from './services/auth.service';

describe('App', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the MC Theme topbar wordmark and brand', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.mc-wordmark')?.textContent).toContain('MolecularConnections');
    expect(compiled.querySelector('.mc-eyebrow')?.textContent).toContain('Sanctions Lens');
  });

  it('should render the Logout button in header when authenticated and call logout on click', async () => {
    const authService = TestBed.inject(AuthService);
    authService.login('molcon', 'molcon123');

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const logoutBtn = Array.from(compiled.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Logout')
    );
    expect(logoutBtn).toBeTruthy();

    logoutBtn?.click();
    fixture.detectChanges();
    expect(authService.isLoggedIn()).toBe(false);
  });
});
