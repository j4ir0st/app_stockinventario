import { Injectable, signal, effect } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  // Estado del tema: 'light' o 'dark'
  private theme = signal<'light' | 'dark'>(
    (localStorage.getItem('theme') as 'light' | 'dark') || 'light'
  );

  public currentTheme = this.theme.asReadonly();

  constructor() {
    // Persistencia automática y aplicación al DOM
    effect(() => {
      const current = this.theme();
      localStorage.setItem('theme', current);
      document.documentElement.setAttribute('data-theme', current);
    });
  }

  toggleTheme() {
    this.theme.update(t => t === 'light' ? 'dark' : 'light');
  }
}
