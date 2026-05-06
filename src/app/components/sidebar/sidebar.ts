import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SidebarService } from '../../services/sidebar.service';
import { SearchService } from '../../services/search.service';
import { FilterDataService } from '../../services/filter-data.service';

/**
 * Componente de barra lateral para filtros y acciones de stock.
 * Se ha rediseñado para actuar como panel de control de búsqueda dinámica.
 */
@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css'
})
export class SidebarComponent {
  public sidebarService = inject(SidebarService);
  public searchService = inject(SearchService);
  public filterDataService = inject(FilterDataService);

  logoUrl = '/NewAPI/static/avatars/LogoSurgiC_SinFondo.png';
  public setTimeout = setTimeout;

  // Estados de visibilidad de los dropdowns personalizados
  showProvs = signal(false);
  showGroups = signal(false);
  showLines = signal(false);

  /**
   * Actualiza un filtro en el servicio global y abre el dropdown.
   */
  onFilterChange(key: string, value: string) {
    this.searchService.patchFiltros(key as any, value);

    // Abrir el dropdown correspondiente al escribir
    if (key.includes('prov')) this.showProvs.set(value.length > 0);
    if (key.includes('grupo')) this.showGroups.set(value.length > 0);
    if (key.includes('linea')) this.showLines.set(value.length > 0);
  }

  /**
   * Selecciona un item del dropdown.
   */
  selectOption(key: string, value: string) {
    this.searchService.patchFiltros(key as any, value);
    this.showProvs.set(false);
    this.showGroups.set(false);
    this.showLines.set(false);
  }

  /**
   * Obtiene la lista filtrada para el dropdown basado en el texto ingresado.
   */
  getFilteredList(list: string[], searchText: string): string[] {
    if (!searchText) return [];
    const search = searchText.toLowerCase();
    return list.filter(item => item.toLowerCase().includes(search)).slice(0, 50);
  }

  /**
   * Establece el tipo de producto (MER / IM-CIN) con exclusión mutua.
   */
  setTipo(tipo: string) {
    const current = this.searchService.filtros().tipo_producto;
    let newValue = '';

    if (tipo === 'MER') {
      newValue = current === 'MER' ? '' : 'MER';
    } else if (tipo === 'IM-CIN') {
      // Usamos el nuevo parámetro de backend que soporta OR (CIN,IM)
      newValue = current === 'CIN,IM' ? '' : 'CIN,IM';
    }

    this.searchService.patchFiltros('tipo_producto', newValue);
  }
}