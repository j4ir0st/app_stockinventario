import { Component, inject, signal, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { SidebarService } from '../../services/sidebar.service';
import { ThemeService } from '../../services/theme.service';
import { RefreshService } from '../../services/refresh.service';
import { SearchService } from '../../services/search.service';
import { FilterDataService } from '../../services/filter-data.service';
import { ConfigService } from '../../services/config.service';


@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class HeaderComponent {
  public authService = inject(AuthService);
  public sidebarService = inject(SidebarService);
  public themeService = inject(ThemeService);
  public configService = inject(ConfigService);
  private refreshService = inject(RefreshService);
  private searchService = inject(SearchService);
  private filterDataService = inject(FilterDataService);
  
  // Señales para el estado de refresco
  public estaRefrescando = signal(false);
  public mostrarMensajeExito = signal(false);
  
  private eRef = inject(ElementRef);
  
  constructor() {
    console.log('HeaderComponent initialized. Current user:', this.authService.currentUser());
  }
  
  isProfileOpen = signal(false);
  isColorPickerOpen = signal(false);

  toggleSidebar() {
    this.sidebarService.toggle();
  }

  toggleProfile() {
    this.isProfileOpen.update((v: boolean) => !v);
    if (this.isProfileOpen()) this.isColorPickerOpen.set(false);
  }

  toggleColorPicker() {
    this.isColorPickerOpen.update((v: boolean) => !v);
    if (this.isColorPickerOpen()) this.isProfileOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  clickout(event: any) {
    if (!this.eRef.nativeElement.contains(event.target)) {
      this.isProfileOpen.set(false);
      this.isColorPickerOpen.set(false);
    }
  }

  onPrimaryColorChange(event: Event) {
    const color = (event.target as HTMLInputElement).value;
    this.themeService.setColors(color, this.themeService.currentSecondaryColor());
  }

  onSecondaryColorChange(event: Event) {
    const color = (event.target as HTMLInputElement).value;
    this.themeService.setColors(this.themeService.currentPrimaryColor(), color);
  }

  resetColors() {
    this.themeService.setColors('#ff65c3', '#d9d9d9');
    this.isColorPickerOpen.set(false);
  }

  logout() {
    this.authService.logout();
  }

  /**
   * Ejecuta la acción de refresco de datos (Hard Reset).
   * Limpia filtros, recarga listas asíncronas y actualiza la tabla.
   */
  refrescar() {
    if (this.estaRefrescando()) return;

    this.estaRefrescando.set(true);
    
    // Hard Reset: Limpiar filtros y recargar listas asíncronas desde API
    this.searchService.limpiarFiltros();
    this.filterDataService.init(true); // true para forzar recarga de API (omite caché)

    // Disparar el refresco en el componente activo (tabla de stock)
    this.refreshService.solicitarRefresco();

    // Simular tiempo de carga y mostrar mensaje de éxito
    setTimeout(() => {
      this.estaRefrescando.set(false);
      this.mostrarMensajeExito.set(true);
      
      // El mensaje de "REGISTRO DE STOCK ACTUALIZADO" dura 3 segundos
      setTimeout(() => {
        this.mostrarMensajeExito.set(false);
      }, 3000);
    }, 1200); // El icono gira un poco más para indicar el proceso completo
  }

}
