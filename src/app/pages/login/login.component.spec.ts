import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoginComponent } from './login.component';
import { AuthService } from '../../services/auth.service';

describe('LoginComponent', () => {
  let mockAuthService: { login: ReturnType<typeof vi.fn> };
  let mockRouter: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockAuthService = {
      login: vi.fn(),
    };
    mockRouter = {
      navigateByUrl: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [LoginComponent, FormsModule],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParams: {} },
          },
        },
      ],
    }).compileComponents();
  });

  it('should render username, masked password input, and Sign In button', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const userInput = el.querySelector('#username') as HTMLInputElement;
    const passInput = el.querySelector('#password') as HTMLInputElement;
    const submitBtn = el.querySelector('button[type="submit"]') as HTMLButtonElement;

    expect(userInput).toBeTruthy();
    expect(passInput).toBeTruthy();
    expect(passInput.getAttribute('type')).toBe('password');
    expect(submitBtn).toBeTruthy();
    expect(submitBtn.textContent).toContain('Sign In');
  });

  it('should display inline error when fields are empty', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Please enter both username and password.');
    expect(mockAuthService.login).not.toHaveBeenCalled();
  });

  it('should display inline error "Invalid username or password" on wrong credentials without page reload', () => {
    mockAuthService.login.mockReturnValue(false);
    const fixture = TestBed.createComponent(LoginComponent);
    const comp = fixture.componentInstance;
    comp['username'] = 'wrong';
    comp['password'] = 'badpass';
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Invalid username or password.');
    expect(mockAuthService.login).toHaveBeenCalledWith('wrong', 'badpass');
    expect(mockRouter.navigateByUrl).not.toHaveBeenCalled();
  });

  it('should log in successfully and redirect to /dashboard on valid credentials', () => {
    mockAuthService.login.mockReturnValue(true);
    const fixture = TestBed.createComponent(LoginComponent);
    const comp = fixture.componentInstance;
    comp['username'] = 'molcon';
    comp['password'] = 'molcon123';
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(mockAuthService.login).toHaveBeenCalledWith('molcon', 'molcon123');
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });
});
