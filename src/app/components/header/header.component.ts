import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SanctionsDataService } from '../../services/sanctions-data.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header
      class="bg-gradient-to-r from-[#071936] via-[#0c2752] to-[#11356c] text-white shadow-lg border-b border-sky-400/20"
    >
      <div class="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
        <div
          class="flex flex-col md:flex-row md:items-center md:justify-between py-3.5 gap-3"
        >
          <!-- Brand & Executive Title -->
          <div class="flex items-center gap-3.5">
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/20 border border-sky-400/30 text-sky-300 shadow-inner"
              aria-hidden="true"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <div>
              <h1
                class="text-sm sm:text-base lg:text-lg font-bold tracking-wider uppercase text-white leading-tight"
              >
                SANCTIONS INTELLIGENCE | EXECUTIVE DASHBOARD
              </h1>
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-xs text-sky-200/80">
                <span class="inline-flex items-center gap-1.5">
                  <span class="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Screening Engine Active
                </span>
                <span class="hidden sm:inline text-sky-400/40">|</span>
                <span>{{ enabledSourceCount() }}/{{ totalSourceCount() }} Sources Enabled</span>
                <span class="hidden sm:inline text-sky-400/40">|</span>
                <span>PAL &bull; PCL &bull; SDN Compliance</span>
              </div>
            </div>
          </div>

          <!-- Primary Route Navigation -->
          <nav
            aria-label="Primary Navigation"
            class="flex items-center gap-1.5 bg-slate-950/35 p-1 rounded-lg border border-white/10 self-start md:self-auto"
          >
            <a
              routerLink="/dashboard"
              routerLinkActive="bg-sky-500 text-white shadow-sm"
              [routerLinkActiveOptions]="{ exact: false }"
              class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-medium text-sky-100 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect width="7" height="9" x="3" y="3" rx="1" />
                <rect width="7" height="5" x="14" y="3" rx="1" />
                <rect width="7" height="9" x="14" y="12" rx="1" />
                <rect width="7" height="5" x="3" y="16" rx="1" />
              </svg>
              <span>Executive Dashboard</span>
            </a>

            <a
              routerLink="/admin"
              routerLinkActive="bg-sky-500 text-white shadow-sm"
              class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-medium text-sky-100 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
                />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>Admin Config</span>
            </a>
          </nav>
        </div>
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
