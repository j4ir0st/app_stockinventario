import { Injectable, signal, effect } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  // Estado del tema: 'light' o 'dark'
  private theme = signal<'light' | 'dark'>(
    (localStorage.getItem('theme') as 'light' | 'dark') || 'light'
  );

  // Colores base personalizables (Rosa Surgicorp y Gris Header por defecto)
  private primaryColor = signal<string>(
    localStorage.getItem('primaryColor') || '#ff65c3'
  );

  private secondaryColor = signal<string>(
    localStorage.getItem('secondaryColor') || '#d9d9d9'
  );

  public currentTheme = this.theme.asReadonly();
  public currentPrimaryColor = this.primaryColor.asReadonly();
  public currentSecondaryColor = this.secondaryColor.asReadonly();

  constructor() {
    // Persistencia automática del tema y aplicación al DOM
    effect(() => {
      const current = this.theme();
      localStorage.setItem('theme', current);
      document.documentElement.setAttribute('data-theme', current);
    });

    // Aplicación y persistencia de colores personalizados
    effect(() => {
      const primary = this.primaryColor();
      const secondary = this.secondaryColor();

      localStorage.setItem('primaryColor', primary);
      localStorage.setItem('secondaryColor', secondary);

      this.applyColors(primary, secondary);
    });
  }

  toggleTheme() {
    this.theme.update(t => t === 'light' ? 'dark' : 'light');
  }

  /**
   * Actualiza los colores base de la aplicación.
   * @param primary Color primario (ej. para el sidebar y acentos)
   * @param secondary Color secundario (ej. para el header y bordes)
   */
  setColors(primary: string, secondary: string) {
    this.primaryColor.set(primary);
    this.secondaryColor.set(secondary);
  }

  /**
   * Aplica los colores seleccionados a las variables CSS globales.
   */
  private applyColors(primary: string, secondary: string) {
    const root = document.documentElement;
    root.style.setProperty('--primary-pink', primary);
    root.style.setProperty('--header-grey', secondary);
  }
}
