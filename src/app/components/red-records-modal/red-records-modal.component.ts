import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  KpiModalContext,
  SanctionsRecord,
  ScreeningCategory,
} from '../../models/sanctions.models';
import { exportRecordsToCsv } from '../../utils/csv-export.util';

function recordHasCategory(record: SanctionsRecord, category: ScreeningCategory): boolean {
  return (record.matchedTerms ?? [record.category]).includes(category);
}

@Component({
  selector: 'app-red-records-modal',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (context(); as ctx) {
      <div
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="ctx.title + ' - Red Tagged Records'"
        (click)="onBackdropClick($event)"
      >
        <div
          class="bg-white w-full sm:max-w-6xl max-h-[92vh] sm:max-h-[88vh] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          (click)="$event.stopPropagation()"
        >
          <!-- Modal Header -->
          <div
            class="bg-[#0c2752] text-white px-5 py-4 flex items-start sm:items-center justify-between gap-4 border-b border-sky-400/20"
          >
            <div>
              <div class="flex items-center gap-2.5 flex-wrap">
                <span
                  class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-200 border border-rose-400/40"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-rose-400"></span>
                  RED FLAGGED RECORDS
                </span>
                <h2 class="text-base sm:text-lg font-semibold text-white">
                  {{ ctx.title }}
                </h2>
              </div>
              <p class="text-xs sm:text-sm text-sky-200/80 mt-1">
                {{ ctx.subtitle }}
              </p>
            </div>

            <button
              type="button"
              (click)="closed.emit()"
              class="rounded-lg p-1.5 text-sky-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close modal"
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
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          <!-- Toolbar: Category Tabs + Search + Export CSV -->
          <div
            class="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3"
          >
            <div class="flex flex-wrap items-center gap-1.5">
              @for (tab of categoryTabs; track tab.value) {
                <button
                  type="button"
                  (click)="activeCategory.set(tab.value)"
                  [class]="
                    activeCategory() === tab.value
                      ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0c2752] text-white shadow-xs cursor-pointer'
                      : 'px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 cursor-pointer'
                  "
                >
                  {{ tab.label }}
                  <span class="ml-1 opacity-75">({{ getCategoryCount(tab.value) }})</span>
                </button>
              }
              @if (coAuthorsOnly()) {
                <button
                  type="button"
                  (click)="coAuthorsOnly.set(false)"
                  class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 cursor-pointer"
                  title="Click to show all Red records including single-author hits"
                >
                  Co-author Linked Only &times;
                </button>
              }
            </div>

            <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div class="relative flex-1 sm:w-64">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  [ngModel]="searchTerm()"
                  (ngModelChange)="searchTerm.set($event)"
                  placeholder="Search doc ID, author, country..."
                  class="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
              </div>

              <button
                type="button"
                (click)="onExportCsv()"
                [disabled]="filteredRecords().length === 0"
                class="inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white shadow-xs transition-colors cursor-pointer"
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
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" x2="12" y1="15" y2="3" />
                </svg>
                <span>Export to CSV</span>
              </button>
            </div>
          </div>

          <!-- Data Grid -->
          <div class="flex-1 overflow-auto custom-scrollbar">
            @if (filteredRecords().length === 0) {
              <div class="py-16 px-6 text-center">
                <p class="text-sm font-medium text-slate-700">
                  No Red-tagged records match the current filter criteria.
                </p>
                <p class="text-xs text-slate-500 mt-1">
                  Try clearing the search box or switching to "All Red".
                </p>
              </div>
            } @else {
              <table class="min-w-full divide-y divide-slate-200 text-left">
                <thead class="bg-slate-100 sticky top-0 z-10 text-[11px] uppercase tracking-wider text-slate-600 font-semibold">
                  <tr>
                    <th class="px-4 py-3">Document</th>
                    <th class="px-4 py-3">Source</th>
                    <th class="px-4 py-3">Flagged Author &amp; Affiliation</th>
                    <th class="px-4 py-3">Jurisdiction</th>
                    <th class="px-4 py-3">Rule &amp; Match</th>
                    <th class="px-4 py-3">Risk</th>
                    <th class="px-4 py-3">Status</th>
                    <th class="px-4 py-3">Decision Date</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 bg-white text-xs sm:text-sm">
                  @for (record of filteredRecords(); track record.id) {
                    <tr class="hover:bg-rose-50/40 transition-colors">
                      <td class="px-4 py-3 align-top max-w-[240px]">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span class="font-mono text-xs font-semibold text-slate-900">
                            {{ record.documentId }}
                          </span>
                          @if (record.dataOrigin === 'UPLOADED_EXCEL') {
                            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                              EXCEL
                            </span>
                          }
                        </div>
                        <div class="text-xs text-slate-600 line-clamp-2 mt-0.5" [title]="record.documentTitle">
                          {{ record.documentTitle }}
                        </div>
                      </td>
                      <td class="px-4 py-3 align-top whitespace-nowrap">
                        <span
                          class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200"
                        >
                          {{ record.source }}
                        </span>
                      </td>
                      <td class="px-4 py-3 align-top max-w-[240px]">
                        <div class="font-medium text-slate-900">{{ record.authorName }}</div>
                        <div class="text-[11px] text-slate-500 font-mono">{{ record.authorId }}</div>
                        @if (record.organization) {
                          <div class="text-[11px] text-slate-600 mt-0.5 truncate" [title]="record.organization">
                            {{ record.organization }}
                          </div>
                        }
                        @if (record.coAuthorCount > 0) {
                          <div class="text-[11px] text-slate-500 mt-0.5">
                            +{{ record.coAuthorCount }} co-author(s): {{ record.coAuthors.join(', ') }}
                          </div>
                        }
                      </td>
                      <td class="px-4 py-3 align-top whitespace-nowrap">
                        <div class="font-medium text-slate-800">{{ record.country }}</div>
                        <div class="text-xs text-slate-500">{{ record.city }}</div>
                      </td>
                      <td class="px-4 py-3 align-top max-w-[230px]">
                        <div class="flex flex-wrap gap-1">
                          @for (term of record.matchedTerms ?? [record.category]; track term) {
                            <span
                              [class]="
                                term === 'PAL'
                                  ? 'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : term === 'PCL'
                                    ? 'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200'
                              "
                            >
                              {{ term }}
                            </span>
                          }
                        </div>
                        <div class="text-[11px] text-slate-600 mt-1">{{ record.reason }}</div>
                        @if (record.matchedEntitySummary) {
                          <div class="text-[10px] text-slate-500 mt-0.5 line-clamp-2" [title]="record.matchedEntitySummary">
                            {{ record.matchedEntitySummary }}
                          </div>
                        }
                      </td>
                      <td class="px-4 py-3 align-top whitespace-nowrap">
                        <div class="font-semibold text-rose-700">{{ record.riskScore }}/100</div>
                        <div class="text-[11px] text-slate-500">{{ record.matchedWatchlist }}</div>
                      </td>
                      <td class="px-4 py-3 align-top whitespace-nowrap">
                        <span
                          class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200"
                        >
                          <span class="h-1.5 w-1.5 rounded-full bg-rose-600"></span>
                          {{ record.status }}
                        </span>
                      </td>
                      <td class="px-4 py-3 align-top whitespace-nowrap font-mono text-xs text-slate-600">
                        {{ record.decisionDate }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </div>

          <!-- Modal Footer -->
          <div
            class="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600"
          >
            <div>
              Showing
              <span class="font-semibold text-slate-900">{{ filteredRecords().length }}</span>
              of
              <span class="font-semibold text-slate-900">{{ redRecords().length }}</span>
              Red-tagged compliance records in active filter window.
            </div>
            @if (exportMessage()) {
              <span class="text-emerald-700 font-medium">{{ exportMessage() }}</span>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class RedRecordsModalComponent {
  readonly context = input<KpiModalContext | null>(null);
  readonly redRecords = input.required<SanctionsRecord[]>();
  readonly closed = output<void>();

  protected readonly activeCategory = signal<ScreeningCategory | 'ALL'>('ALL');
  protected readonly coAuthorsOnly = signal<boolean>(false);
  protected readonly searchTerm = signal('');
  protected readonly exportMessage = signal('');

  protected readonly categoryTabs: ReadonlyArray<{
    label: string;
    value: ScreeningCategory | 'ALL';
  }> = [
    { label: 'All Red', value: 'ALL' },
    { label: 'PAL', value: 'PAL' },
    { label: 'PCL', value: 'PCL' },
    { label: 'SDN', value: 'SDN' },
  ];

  constructor() {
    effect(() => {
      const ctx = this.context();
      if (ctx) {
        this.activeCategory.set(ctx.categoryFilter);
        this.coAuthorsOnly.set(ctx.metricKey === 'coAuthorRecords');
        this.searchTerm.set('');
        this.exportMessage.set('');
      }
    });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.context()) {
      this.closed.emit();
    }
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }

  protected getCategoryCount(category: ScreeningCategory | 'ALL'): number {
    const base = this.coAuthorsOnly()
      ? this.redRecords().filter((r) => r.coAuthorCount > 0)
      : this.redRecords();
    if (category === 'ALL') return base.length;
    return base.filter((r) => recordHasCategory(r, category)).length;
  }

  protected readonly filteredRecords = computed(() => {
    const category = this.activeCategory();
    const onlyCoAuthors = this.coAuthorsOnly();
    const query = this.searchTerm().trim().toLowerCase();

    return this.redRecords().filter((record) => {
      if (onlyCoAuthors && record.coAuthorCount === 0) {
        return false;
      }
      if (category !== 'ALL' && !recordHasCategory(record, category)) {
        return false;
      }
      if (!query) return true;

      return (
        record.documentId.toLowerCase().includes(query) ||
        record.documentTitle.toLowerCase().includes(query) ||
        record.authorName.toLowerCase().includes(query) ||
        record.country.toLowerCase().includes(query) ||
        record.city.toLowerCase().includes(query) ||
        record.source.toLowerCase().includes(query) ||
        record.reason.toLowerCase().includes(query) ||
        (record.organization ?? '').toLowerCase().includes(query) ||
        (record.matchedEntitySummary ?? '').toLowerCase().includes(query)
      );
    });
  });

  protected onExportCsv(): void {
    const recordsToExport = this.filteredRecords();
    if (!recordsToExport.length) return;
    const categorySuffix =
      this.activeCategory() === 'ALL' ? 'all-red' : this.activeCategory().toLowerCase();
    exportRecordsToCsv(recordsToExport, `sanctions-${categorySuffix}-records`);
    this.exportMessage.set(`Exported ${recordsToExport.length} Red records to CSV.`);
  }
}
