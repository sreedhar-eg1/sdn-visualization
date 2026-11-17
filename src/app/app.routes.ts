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
    title: 'Sanctions Intelligence | Sign In',
    canActivate: [loginGuard],
    loadComponent: () =>
      import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'dashboard',
    title: 'Sanctions Intelligence | Executive Dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'admin',
    title: 'Sanctions Intelligence | Admin Configuration',
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
