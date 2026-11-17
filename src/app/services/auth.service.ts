import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly router = inject(Router);

  private static readonly STORAGE_KEY = 'isAuthenticated';
  public static readonly DUMMY_USERNAME = 'molcon';
  public static readonly DUMMY_PASSWORD = 'molcon123';

  // BehaviorSubject for reactive state management
  private readonly authSubject = new BehaviorSubject<boolean>(this.checkInitialSession());
  public readonly isAuthenticated$ = this.authSubject.asObservable();

  // Angular signal for reactive template consumption
  public readonly isAuthenticated = signal<boolean>(this.authSubject.value);

  private checkInitialSession(): boolean {
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(AuthService.STORAGE_KEY) === 'true';
    }
    return false;
  }

  /**
   * Validates credentials against hardcoded dummy values.
   * On success: stores flag in sessionStorage and updates reactive state.
   */
  login(username: string, password: string): boolean {
    const trimmedUser = (username || '').trim();
    if (
      trimmedUser === AuthService.DUMMY_USERNAME &&
      password === AuthService.DUMMY_PASSWORD
    ) {
      if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(AuthService.STORAGE_KEY, 'true');
      }
      this.authSubject.next(true);
      this.isAuthenticated.set(true);
      return true;
    }
    return false;
  }

  /**
   * Clears sessionStorage session flag, updates reactive state, and redirects to /login.
   */
  logout(): void {
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(AuthService.STORAGE_KEY);
    }
    this.authSubject.next(false);
    this.isAuthenticated.set(false);
    this.router.navigate(['/login']);
  }

  /**
   * Synchronous check for route guards and components.
   */
  isLoggedIn(): boolean {
    return this.isAuthenticated();
  }
}
