import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { authGuard, loginGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('AuthGuards', () => {
  let authService: AuthService;
  let router: Router;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        {
          provide: Router,
          useValue: {
            createUrlTree: vi.fn((commands, extras) => ({ commands, extras } as unknown as UrlTree)),
            navigate: vi.fn(),
          },
        },
      ],
    });

    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  describe('authGuard', () => {
    it('should allow navigation when authenticated', () => {
      authService.login('molcon', 'molcon123');
      const route = {} as ActivatedRouteSnapshot;
      const state = { url: '/dashboard' } as RouterStateSnapshot;

      const result = TestBed.runInInjectionContext(() => authGuard(route, state));
      expect(result).toBe(true);
    });

    it('should redirect unauthenticated users to /login', () => {
      const route = {} as ActivatedRouteSnapshot;
      const state = { url: '/dashboard' } as RouterStateSnapshot;

      const result = TestBed.runInInjectionContext(() => authGuard(route, state)) as UrlTree;
      expect(result).toBeTruthy();
      expect(router.createUrlTree).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: '/dashboard' },
      });
    });
  });

  describe('loginGuard', () => {
    it('should allow navigation to login when unauthenticated', () => {
      const route = {} as ActivatedRouteSnapshot;
      const state = { url: '/login' } as RouterStateSnapshot;

      const result = TestBed.runInInjectionContext(() => loginGuard(route, state));
      expect(result).toBe(true);
    });

    it('should redirect authenticated users to /dashboard when accessing login', () => {
      authService.login('molcon', 'molcon123');
      const route = {} as ActivatedRouteSnapshot;
      const state = { url: '/login' } as RouterStateSnapshot;

      const result = TestBed.runInInjectionContext(() => loginGuard(route, state)) as UrlTree;
      expect(result).toBeTruthy();
      expect(router.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
    });
  });
});
