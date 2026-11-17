import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected username = '';
  protected password = '';
  protected readonly errorMessage = signal<string | null>(null);

  /**
   * Clears inline error when user types.
   */
  protected clearError(): void {
    if (this.errorMessage()) {
      this.errorMessage.set(null);
    }
  }

  /**
   * Handles form submission (triggered via Enter key or Sign In button).
   */
  protected onLogin(): void {
    const user = this.username.trim();
    const pass = this.password;

    if (!user || !pass) {
      this.errorMessage.set('Please enter both username and password.');
      return;
    }

    const success = this.authService.login(user, pass);
    if (success) {
      this.errorMessage.set(null);
      // Redirect to returnUrl if present, otherwise default to dashboard
      const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';
      this.router.navigateByUrl(returnUrl);
    } else {
      this.errorMessage.set('Invalid username or password.');
    }
  }
}
