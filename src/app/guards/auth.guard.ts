import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Functional route guard protecting sensitive dashboard routes.
 * If user is authenticated, allows navigation.
 * If unauthenticated, cancels navigation and redirects to /login.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn()) {
    return true;
  }

  // Redirect to /login with returnUrl if needed
  return router.createUrlTree(['/login'], {
    queryParams: state.url !== '/' && state.url !== '/login' ? { returnUrl: state.url } : {},
  });
};

/**
 * Functional route guard for the login page.
 * If already logged in, automatically redirects to /dashboard.
 */
export const loginGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn()) {
    return router.createUrlTree(['/dashboard']);
  }

  return true;
};
