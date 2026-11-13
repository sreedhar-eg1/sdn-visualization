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
import { exportRecordsToExcel } from '../../utils/excel-export.util';

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
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style="background: rgba(29, 14, 10, 0.65); backdrop-filter: blur(4px);"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="ctx.title + ' - Red Tagged Records'"
        (click)="onBackdropClick($event)"
      >
        <div
          class="bg-white w-full sm:max-w-6xl max-h-[92vh] sm:max-h-[88vh] rounded-t-[28px] sm:rounded-[28px] shadow-2xl flex flex-col overflow-hidden"
          style="border: 1px solid var(--mc-line)"
          (click)="$event.stopPropagation()"
        >
          <!-- Modal Header (Dark Cocoa Band) -->
          <div
            class="px-6 py-5 flex items-start sm:items-center justify-between gap-4"
            style="background: linear-gradient(180deg, var(--mc-cocoa) 0%, var(--mc-cocoa-3) 100%); color: #fff;"
          >
            <div>
              <div class="flex items-center gap-2.5 flex-wrap">
                <span class="mc-tag bad">RED FLAGGED RECORDS</span>
                <h2 class="mc-h3" style="color: #fff; margin: 0">
                  {{ ctx.title }}
                </h2>
              </div>
              <p class="mc-lead text-xs sm:text-sm mt-1" style="color: rgba(255,255,255,0.75)">
                {{ ctx.subtitle }}
              </p>
            </div>

            <button
              type="button"
              (click)="closed.emit()"
              class="mc-btn mc-btn-ghost mc-btn-sm"
              style="color: #fff; border-color: rgba(255,255,255,0.3)"
              aria-label="Close modal"
            >
              &times;
            </button>
          </div>

          <!-- Toolbar: Category Chips + Search + Export CSV -->
          <div
            class="px-6 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3"
            style="background: var(--mc-cream); border-bottom: 1px solid var(--mc-line);"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span class="mc-eyebrow">Category:</span>
              <div class="mc-chips">
                @for (tab of categoryTabs; track tab.value) {
                  <button
                    type="button"
                    (click)="activeCategory.set(tab.value)"
                    class="mc-chip"
                    [class.is-on]="activeCategory() === tab.value"
                    [attr.aria-pressed]="activeCategory() === tab.value"
                  >
                    {{ tab.label }}
                    <span class="opacity-60 ml-1">({{ getCategoryCount(tab.value) }})</span>
                  </button>
                }
                @if (coAuthorsOnly()) {
                  <button
                    type="button"
                    (click)="coAuthorsOnly.set(false)"
                    class="mc-tag warn cursor-pointer"
                    title="Click to show all Red records"
                  >
                    Co-author Linked Only &times;
                  </button>
                }
              </div>
            </div>

            <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div class="mc-search flex-1 sm:w-64">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  type="text"
                  [ngModel]="searchTerm()"
                  (ngModelChange)="searchTerm.set($event)"
                  placeholder="Search doc, author, country..."
                  class="mc-input text-xs sm:text-sm py-2"
                />
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  (click)="onExportExcel()"
                  [disabled]="filteredRecords().length === 0"
                  class="mc-btn mc-btn-sm"
                >
                  <span>Export to Excel (.xlsx)</span>
                  <span class="arr">&rarr;</span>
                </button>
                <button
                  type="button"
                  (click)="onExportCsv()"
                  [disabled]="filteredRecords().length === 0"
                  class="mc-btn mc-btn-ghost mc-btn-sm"
                  title="Export to CSV"
                >
                  <span>Export to CSV</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Data Grid -->
          <div class="flex-1 overflow-auto custom-scrollbar mc-table-wrap">
            @if (filteredRecords().length === 0) {
              <div class="py-16 px-6 text-center">
                <p class="mc-body font-semibold">
                  No Red-tagged records match the current filter criteria.
                </p>
                <p class="mc-small mt-1">
                  Try clearing the search box or switching to "All Red".
                </p>
              </div>
            } @else {
              <table class="mc-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Source</th>
                    <th>Flagged Author &amp; Affiliation</th>
                    <th>Jurisdiction</th>
                    <th>Rule &amp; Match</th>
                    <th>Risk</th>
                    <th>Status</th>
                    <th>Decision Date</th>
                  </tr>
                </thead>
                <tbody>
                  @for (record of filteredRecords(); track record.id) {
                    <tr>
                      <td class="align-top max-w-[240px]">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span class="mc-code font-bold">
                            {{ record.documentId }}
                          </span>
                          @if (record.dataOrigin === 'UPLOADED_EXCEL') {
                            <span class="mc-tag neutral text-[10px]">
                              EXCEL
                            </span>
                          }
                        </div>
                        <div class="mc-small line-clamp-2 mt-0.5" [title]="record.documentTitle">
                          {{ record.documentTitle }}
                        </div>
                      </td>

                      <td class="align-top whitespace-nowrap">
                        <span class="mc-tag neutral">
                          {{ record.source }}
                        </span>
                      </td>

                      <td class="align-top max-w-[240px]">
                        <div class="t font-semibold">{{ record.authorName }}</div>
                        <div class="mc-code mc-small">{{ record.authorId }}</div>
                        @if (record.organization) {
                          <div class="mc-small mt-0.5 truncate" [title]="record.organization">
                            {{ record.organization }}
                          </div>
                        }
                        @if (record.coAuthorCount > 0) {
                          <div class="mc-small mt-0.5" style="color: var(--mc-warn-ink)">
                            +{{ record.coAuthorCount }} co-author(s): {{ record.coAuthors.join(', ') }}
                          </div>
                        }
                      </td>

                      <td class="align-top whitespace-nowrap">
                        <div class="font-medium">{{ record.country }}</div>
                        <div class="mc-small">{{ record.city }}</div>
                      </td>

                      <td class="align-top max-w-[230px]">
                        <div class="flex flex-wrap gap-1">
                          @for (term of record.matchedTerms ?? [record.category]; track term) {
                            <span
                              [class]="
                                term === 'PAL'
                                  ? 'mc-tag info'
                                  : term === 'PCL'
                                    ? 'mc-tag warn'
                                    : 'mc-tag neutral'
                              "
                            >
                              {{ term }}
                            </span>
                          }
                        </div>
                        <div class="mc-small mt-1">{{ record.reason }}</div>
                        @if (record.matchedEntitySummary) {
                          <div class="mc-code mc-small mt-0.5 line-clamp-2" [title]="record.matchedEntitySummary">
                            {{ record.matchedEntitySummary }}
                          </div>
                        }
                      </td>

                      <td class="align-top whitespace-nowrap">
                        <div class="font-bold mc-num" style="color: var(--mc-bad-ink)">
                          {{ record.riskScore }}/100
                        </div>
                        <div class="mc-small">{{ record.matchedWatchlist }}</div>
                      </td>

                      <td class="align-top whitespace-nowrap">
                        <span class="mc-tag bad">
                          {{ record.status }}
                        </span>
                      </td>

                      <td class="align-top whitespace-nowrap mc-code mc-small">
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
            class="px-6 py-3 flex flex-wrap items-center justify-between gap-2"
            style="background: var(--mc-cream); border-top: 1px solid var(--mc-line);"
          >
            <div class="mc-small">
              Showing
              <strong>{{ filteredRecords().length }}</strong>
              of
              <strong>{{ allRedRecords().length }}</strong>
              Red-tagged records in this selection
            </div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                (click)="closed.emit()"
                class="mc-btn mc-btn-ghost mc-btn-sm"
              >
                Close
              </button>
              <button
                type="button"
                (click)="onExportCsv()"
                [disabled]="filteredRecords().length === 0"
                class="mc-btn mc-btn-sm"
              >
                <span>Export CSV</span>
                <span class="arr">&rarr;</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class RedRecordsModalComponent {
  readonly context = input<KpiModalContext | null>(null);
  readonly redRecords = input<SanctionsRecord[]>([]);
  readonly closed = output<void>();

  protected readonly activeCategory = signal<ScreeningCategory | 'ALL'>('ALL');
  protected readonly searchTerm = signal<string>('');
  protected readonly coAuthorsOnly = signal<boolean>(false);

  protected readonly categoryTabs: ReadonlyArray<{
    label: string;
    value: ScreeningCategory | 'ALL';
  }> = [
    { label: 'All Red', value: 'ALL' },
    { label: 'PAL (Author)', value: 'PAL' },
    { label: 'PCL (Country)', value: 'PCL' },
    { label: 'SDN (Entity)', value: 'SDN' },
  ];

  constructor() {
    effect(() => {
      const ctx = this.context();
      if (!ctx) return;
      this.activeCategory.set(ctx.categoryFilter);
      this.searchTerm.set('');
      this.coAuthorsOnly.set(ctx.metricKey === 'coAuthorRecords');
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

  protected readonly allRedRecords = computed<SanctionsRecord[]>(() => {
    return this.redRecords();
  });

  protected getCategoryCount(category: ScreeningCategory | 'ALL'): number {
    const list = this.allRedRecords();
    if (category === 'ALL') return list.length;
    return list.filter((r) => recordHasCategory(r, category)).length;
  }

  protected readonly filteredRecords = computed<SanctionsRecord[]>(() => {
    const category = this.activeCategory();
    const query = this.searchTerm().trim().toLowerCase();
    const coAuthorsOnly = this.coAuthorsOnly();

    return this.allRedRecords().filter((rec) => {
      if (category !== 'ALL' && !recordHasCategory(rec, category)) {
        return false;
      }
      if (coAuthorsOnly && rec.coAuthorCount === 0) {
        return false;
      }
      if (!query) return true;

      const searchable = [
        rec.documentId,
        rec.documentTitle,
        rec.authorName,
        rec.authorId,
        rec.authorEmail ?? '',
        rec.organization ?? '',
        rec.country,
        rec.city,
        rec.reason,
        rec.matchedWatchlist,
        rec.source,
        ...rec.coAuthors,
      ]
        .join(' ')
        .toLowerCase();

      return searchable.includes(query);
    });
  });

  protected async onExportExcel(): Promise<void> {
    const records = this.filteredRecords();
    if (records.length === 0) return;
    const cat = this.activeCategory();
    const categoryOrReport = `RedRecords_${cat}`;
    const uploadedFileName = records[0]?.sourceFileName ?? null;
    await exportRecordsToExcel(records, {
      categoryOrReport,
      uploadedFileName,
    });
  }

  protected onExportCsv(): void {
    const records = this.filteredRecords();
    if (records.length === 0) return;
    const ctx = this.context();
    const baseName = ctx?.metricKey ?? 'red-records';
    const timestamp = new Date().toISOString().slice(0, 10);
    exportRecordsToCsv(records, `sanctions-${baseName}-${timestamp}.csv`);
  }
}
