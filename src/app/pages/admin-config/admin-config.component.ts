import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SanctionsDataService } from '../../services/sanctions-data.service';
import { WatchlistSourceConfig } from '../../models/sanctions.models';

@Component({
  selector: 'app-admin-config',
  standalone: true,
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-config.component.html',
})
export class AdminConfigComponent {
  protected readonly dataService = inject(SanctionsDataService);

  // Toast notification state
  protected readonly toastMessage = signal<string | null>(null);

  // Source groups for clean checkbox presentation
  protected readonly sourceGroups = computed<
    ReadonlyArray<{
      group: WatchlistSourceConfig['group'];
      items: WatchlistSourceConfig[];
    }>
  >(() => {
    const all = this.dataService.watchlistSources();
    const groups: WatchlistSourceConfig['group'][] = [
      'External Databases',
      'In-House Lists',
      'Ingestion Feeds',
    ];
    return groups.map((group) => ({
      group,
      items: all.filter((s) => s.group === group),
    }));
  });

  // Country / City Management Form signals
  protected readonly newCountry = signal('');
  protected readonly newIsoCode = signal('');
  protected readonly newCity = signal('');
  protected readonly newRiskLevel = signal<'Critical' | 'High' | 'Elevated'>('High');
  protected readonly newListSource = signal<'PCL' | 'OFAC' | 'OFSI' | 'DFAT'>('PCL');

  // PAL Entry Form signals
  protected readonly palFullName = signal('');
  protected readonly palAuthorId = signal('');
  protected readonly palAffiliation = signal('');
  protected readonly palCountry = signal('');
  protected readonly palListSource = signal('In-House PAL');
  protected readonly palSeverity = signal<'Red' | 'Amber'>('Red');
  protected readonly palNotes = signal('');
  protected readonly palSearch = signal('');
  protected readonly uploadedFileName = signal<string | null>(null);

  protected readonly filteredPalEntries = computed(() => {
    const q = this.palSearch().trim().toLowerCase();
    const list = this.dataService.palEntries();
    if (!q) return list;
    return list.filter(
      (entry) =>
        entry.fullName.toLowerCase().includes(q) ||
        entry.authorId.toLowerCase().includes(q) ||
        entry.affiliation.toLowerCase().includes(q) ||
        entry.country.toLowerCase().includes(q)
    );
  });

  protected readonly enabledSourceCount = computed(
    () => this.dataService.watchlistSources().filter((s) => s.enabled).length
  );

  protected readonly activeLocationCount = computed(
    () => this.dataService.restrictedLocations().filter((l) => l.active).length
  );

  private showToast(message: string): void {
    this.toastMessage.set(message);
    setTimeout(() => {
      if (this.toastMessage() === message) {
        this.toastMessage.set(null);
      }
    }, 4500);
  }

  protected onToggleSource(source: WatchlistSourceConfig): void {
    this.dataService.toggleWatchlistSource(source.id);
    const nextState = !source.enabled ? 'enabled' : 'disabled';
    this.showToast(`${source.code} watchlist source ${nextState}.`);
  }

  protected onAddRestrictedLocation(): void {
    const country = this.newCountry().trim();
    const city = this.newCity().trim();
    if (!country || !city) return;

    const iso = (this.newIsoCode().trim() || country.slice(0, 2)).toUpperCase();
    this.dataService.addRestrictedLocation({
      country,
      isoCode: iso,
      city,
      riskLevel: this.newRiskLevel(),
      listSource: this.newListSource(),
    });

    this.newCountry.set('');
    this.newIsoCode.set('');
    this.newCity.set('');
    this.showToast(
      `Added ${city}, ${country} (${this.newListSource()}) and synced screening event to Dashboard.`
    );
  }

  protected onAddPalEntry(): void {
    const fullName = this.palFullName().trim();
    const affiliation = this.palAffiliation().trim();
    const country = this.palCountry().trim();
    if (!fullName || !affiliation || !country) return;

    this.dataService.addPalEntry({
      fullName,
      authorId: this.palAuthorId().trim() || `ORCID-0009-${Math.floor(1000 + Math.random() * 8999)}`,
      affiliation,
      country,
      listSource: this.palListSource().trim() || 'In-House PAL',
      severity: this.palSeverity(),
      notes: this.palNotes().trim() || 'Manual compliance watchlist addition',
      importMethod: 'Manual',
    });

    this.palFullName.set('');
    this.palAuthorId.set('');
    this.palAffiliation.set('');
    this.palCountry.set('');
    this.palNotes.set('');
    this.showToast(
      `PAL entry "${fullName}" onboarded and synced to Executive Dashboard.`
    );
  }

  protected onPalFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadedFileName.set(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? '');
      const parsed = this.parsePalFileContent(content, file.name);
      if (parsed.length > 0) {
        this.dataService.addBulkPalEntries(parsed);
        this.showToast(`Imported ${parsed.length} PAL entries from "${file.name}".`);
      } else {
        // Fallback demo import if file had non-standard format
        this.dataService.addPalEntry({
          fullName: `Dr. Imported Entry (${file.name.replace(/\.[^.]+$/, '')})`,
          authorId: `ORCID-0008-${Math.floor(1000 + Math.random() * 8999)}`,
          affiliation: 'External CSV Watchlist Import',
          country: 'Iran',
          listSource: `File: ${file.name}`,
          severity: 'Red',
          notes: 'Onboarded via client-side PAL file upload demo.',
          importMethod: 'File Upload',
        });
        this.showToast(`Processed "${file.name}" and added 1 PAL record.`);
      }
      input.value = '';
    };
    reader.readAsText(file);
  }

  protected onSimulatePalBatchImport(): void {
    const sampleBatch = [
      {
        fullName: 'Dr. Darius Kazemi',
        authorId: 'ORCID-0007-4120',
        affiliation: 'Tehran Center for Applied Photonics',
        country: 'Iran',
        listSource: 'Batch CSV Import',
        severity: 'Red' as const,
        notes: 'Imported from weekly compliance CSV batch',
        importMethod: 'File Upload' as const,
      },
      {
        fullName: 'Prof. Xiao-Ming Tang',
        authorId: 'ORCID-0004-9318',
        affiliation: 'Nanjing Microelectronics Lab',
        country: 'China',
        listSource: 'Batch CSV Import',
        severity: 'Amber' as const,
        notes: 'Flagged for secondary dual-use review',
        importMethod: 'File Upload' as const,
      },
    ];
    this.dataService.addBulkPalEntries(sampleBatch);
    this.uploadedFileName.set('pal-weekly-batch-demo.csv');
    this.showToast('Simulated CSV import: 2 PAL entries onboarded without API.');
  }

  private parsePalFileContent(
    raw: string,
    fileName: string
  ): Array<{
    fullName: string;
    authorId: string;
    affiliation: string;
    country: string;
    listSource: string;
    severity: 'Red' | 'Amber';
    notes: string;
    importMethod: 'File Upload';
  }> {
    if (fileName.toLowerCase().endsWith('.json')) {
      try {
        const json = JSON.parse(raw);
        if (Array.isArray(json)) {
          return json
            .filter((item) => item && typeof item.fullName === 'string')
            .slice(0, 20)
            .map((item) => ({
              fullName: String(item.fullName),
              authorId: String(item.authorId ?? 'ORCID-IMPORT'),
              affiliation: String(item.affiliation ?? 'Imported Affiliation'),
              country: String(item.country ?? 'Unknown'),
              listSource: `File: ${fileName}`,
              severity: item.severity === 'Amber' ? 'Amber' : 'Red',
              notes: String(item.notes ?? 'Imported via JSON'),
              importMethod: 'File Upload' as const,
            }));
        }
      } catch {
        return [];
      }
    }

    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) return [];

    const startIndex = lines[0].toLowerCase().includes('name') ? 1 : 0;
    const entries: Array<{
      fullName: string;
      authorId: string;
      affiliation: string;
      country: string;
      listSource: string;
      severity: 'Red' | 'Amber';
      notes: string;
      importMethod: 'File Upload';
    }> = [];

    for (const line of lines.slice(startIndex, startIndex + 20)) {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      if (!cols[0]) continue;
      entries.push({
        fullName: cols[0],
        authorId: cols[1] || `ORCID-CSV-${Math.floor(1000 + Math.random() * 8999)}`,
        affiliation: cols[2] || 'Imported Institution',
        country: cols[3] || 'Unspecified',
        listSource: `File: ${fileName}`,
        severity: cols[4]?.toLowerCase() === 'amber' ? 'Amber' : 'Red',
        notes: cols[5] || 'Imported via PAL CSV upload',
        importMethod: 'File Upload',
      });
    }
    return entries;
  }
}
