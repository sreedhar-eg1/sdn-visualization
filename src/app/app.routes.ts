import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'dashboard',
    title: 'Sanctions Intelligence | Executive Dashboard',
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'admin',
    title: 'Sanctions Intelligence | Admin Configuration',
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
