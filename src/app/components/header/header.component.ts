import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SanctionsDataService } from '../../services/sanctions-data.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mc-topbar">
      <!-- MC Brand -->
      <div class="mc-brand">
        <a routerLink="/dashboard" class="flex items-baseline gap-3 text-inherit no-underline">
          <span class="mc-wordmark">MolecularConnections</span>
          <span class="mc-eyebrow">SanctionsLens</span>
        </a>
      </div>

      <!-- Navigation (Visible when logged in) -->
      @if (authService.isAuthenticated()) {
        <nav class="mc-nav" aria-label="Main Navigation">
          <a
            routerLink="/dashboard"
            routerLinkActive="is-active"
            [routerLinkActiveOptions]="{ exact: false }"
          >
            Dashboard
          </a>
          <a
            routerLink="/reports"
            routerLinkActive="is-active"
          >
            Reports
          </a>
          <a
            routerLink="/admin"
            routerLinkActive="is-active"
          >
            Admin Configuration
          </a>
        </nav>
      }

      <!-- Right Controls: Engine Status Badge & Logout Button -->
      <div class="flex items-center gap-3">
        @if (authService.isAuthenticated()) {
          <span class="mc-badge">
            <span class="mc-dot"></span>
            <span>{{ enabledSourceCount() }}/{{ totalSourceCount() }} Sources Active</span>
          </span>

          <!-- Logout Button -->
          <button
            type="button"
            (click)="logout()"
            class="mc-btn mc-btn-ghost mc-btn-sm cursor-pointer"
            title="Sign out of SanctionsLens"
          >
            <span>Logout</span>
            <span class="arr">&rarr;</span>
          </button>
        }
      </div>
    </header>
  `,
})
export class HeaderComponent {
  protected readonly authService = inject(AuthService);
  private readonly dataService = inject(SanctionsDataService);

  protected readonly enabledSourceCount = computed(
    () => this.dataService.watchlistSources().filter((s) => s.enabled).length
  );
  protected readonly totalSourceCount = computed(
    () => this.dataService.watchlistSources().length
  );

  logout(): void {
    this.authService.logout();
  }
}
