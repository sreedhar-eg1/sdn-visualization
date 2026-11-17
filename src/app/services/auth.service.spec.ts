import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let mockRouter: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    sessionStorage.clear();
    mockRouter = {
      navigate: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: Router, useValue: mockRouter },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should initialize unauthenticated when sessionStorage is empty', () => {
    expect(service.isLoggedIn()).toBe(false);
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should authenticate successfully with valid credentials molcon / molcon123', () => {
    const success = service.login('molcon', 'molcon123');
    expect(success).toBe(true);
    expect(service.isLoggedIn()).toBe(true);
    expect(service.isAuthenticated()).toBe(true);
    expect(sessionStorage.getItem('isAuthenticated')).toBe('true');
  });

  it('should reject invalid credentials and leave session unauthenticated', () => {
    const failureUser = service.login('wrongUser', 'molcon123');
    expect(failureUser).toBe(false);
    expect(service.isLoggedIn()).toBe(false);

    const failurePass = service.login('molcon', 'wrongPass');
    expect(failurePass).toBe(false);
    expect(service.isLoggedIn()).toBe(false);
    expect(sessionStorage.getItem('isAuthenticated')).toBeNull();
  });

  it('should clear session, reset state, and navigate to /login upon logout()', () => {
    service.login('molcon', 'molcon123');
    expect(service.isLoggedIn()).toBe(true);

    service.logout();
    expect(service.isLoggedIn()).toBe(false);
    expect(service.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem('isAuthenticated')).toBeNull();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
  });
});
