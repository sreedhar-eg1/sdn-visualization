import { Routes } from '@angular/router';
import { authGuard, loginGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'login',
    title: 'SanctionsLens | Sign In',
    canActivate: [loginGuard],
    loadComponent: () =>
      import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'dashboard',
    title: 'SanctionsLens | Executive Dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'reports',
    title: 'SanctionsLens | Reports & Export Hub',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/reports/reports.component').then((m) => m.ReportsComponent),
  },
  {
    path: 'admin',
    title: 'SanctionsLens | Admin Configuration',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/admin-config/admin-config.component').then(
        (m) => m.AdminConfigComponent
      ),
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
