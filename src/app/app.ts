import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mc-glow" aria-hidden="true"></div>
    <div class="min-h-screen flex flex-col justify-between">
      <div class="mc-wrap mc-layer flex-1 flex flex-col">
        <app-header />
        <main class="flex-1 pb-12">
          <router-outlet />
        </main>
      </div>
      <footer class="mc-footer">
        <div class="mc-wrap">
          <div class="flex items-center gap-3">
            <span class="mc-wordmark" style="font-size: 20px">MolecularConnections</span>
            <span class="mc-eyebrow" style="color: rgba(255,255,255,0.7)">Sanctions Intelligence</span>
          </div>
          <small>Runs on MC-hosted models &bull; PAL / PCL / SDN Compliance &bull; No data leaves the MC environment</small>
        </div>
      </footer>
    </div>
  `,
})
export class App {}
