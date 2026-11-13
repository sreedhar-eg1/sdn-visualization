import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SanctionsDataService } from '../../services/sanctions-data.service';

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
          <span class="mc-eyebrow">Sanctions Intelligence</span>
        </a>
      </div>

      <!-- Navigation -->
      <nav class="mc-nav" aria-label="Main Navigation">
        <a
          routerLink="/dashboard"
          routerLinkActive="is-active"
          [routerLinkActiveOptions]="{ exact: false }"
        >
          Dashboard
        </a>
        <a
          routerLink="/admin"
          routerLinkActive="is-active"
        >
          Admin Configuration
        </a>
      </nav>

      <!-- Engine Status Badge -->
      <div class="flex items-center gap-3">
        <span class="mc-badge">
          <span class="mc-dot"></span>
          <span>{{ enabledSourceCount() }}/{{ totalSourceCount() }} Sources Active</span>
        </span>
      </div>
    </header>
  `,
})
export class HeaderComponent {
  private readonly dataService = inject(SanctionsDataService);

  protected readonly enabledSourceCount = computed(
    () => this.dataService.watchlistSources().filter((s) => s.enabled).length
  );
  protected readonly totalSourceCount = computed(
    () => this.dataService.watchlistSources().length
  );
}
