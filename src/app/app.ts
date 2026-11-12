import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen flex flex-col bg-slate-100">
      <app-header />
      <main class="flex-1">
        <router-outlet />
      </main>
      <footer class="border-t border-slate-200 bg-white py-3 px-4 text-center text-xs text-slate-500">
        Sanctions Intelligence Executive Demo &bull; Mock Screening Telemetry (PAL / PCL / SDN)
      </footer>
    </div>
  `,
})
export class App {}
