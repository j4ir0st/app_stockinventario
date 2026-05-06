import { Component, signal, inject, OnInit, OnDestroy, effect, ElementRef, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { firstValueFrom, Subscription } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { ThemeService } from '../../services/theme.service';
import { RefreshService } from '../../services/refresh.service';
import { SearchService } from '../../services/search.service';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inventory.html',
  styleUrl: './inventory.css'
})
export class InventoryComponent implements OnInit, OnDestroy {
  private apiService = inject(ApiService);
  public themeService = inject(ThemeService);
  private refreshService = inject(RefreshService);
  public searchService = inject(SearchService);

  private suscripcionRefresco?: Subscription;
  private eRef = inject(ElementRef);

  // Lista de items de stock procesados
  stockItems = signal<any[]>([]);

  // Items agrupados con sumas
  itemsAgrupados = signal<any[]>([]);

  // Término de búsqueda local para el código
  searchTerm = signal('');

  // Estado de carga y paginación
  loading = signal(false);
  nextUrl = signal<string | null>(null);
  prevUrl = signal<string | null>(null);
  totalCount = signal(0);
  paginaActual = signal(1);
  loadingExport = signal(false);
  exportProgress = signal(0);

  constructor() {
    // Reaccionar a cambios en los filtros del sidebar
    effect(() => {
      const filtros = this.searchService.filtros();
      console.log('Filtros cambiados, recargando stock...', filtros);
      untracked(() => this.cargarStock());
    });
  }


  ngOnInit(): void {
    // Escuchar eventos de refresco desde el header
    this.suscripcionRefresco = this.refreshService.refresco$.subscribe(() => {
      this.searchService.actualizarFecha();
      // Solo cargamos si los filtros ya están vacíos (porque el effect no se disparará)
      const f = this.searchService.filtros();
      const isEmpty = !f.buscar && !f.tipo_producto && !f.prod_id__prov_id__nombre__contains && !f.prod_id__grupo_id__nombre__contains && !f.prod_id__linea_id__nombre__contains;

      if (isEmpty) {
        this.cargarStock();
      }
    });
  }

  ngOnDestroy(): void {
    this.suscripcionRefresco?.unsubscribe();
  }

  /**
   * Carga los datos de stock desde la API usando los filtros globales.
   */
  cargarStock(urlOrSearch?: string): void {
    // Evitar múltiples cargas simultáneas
    if (this.loading() && !urlOrSearch) return;

    this.loading.set(true);

    const filtros = this.searchService.filtros();
    let queryParams: any = filtros;

    if (urlOrSearch && urlOrSearch.includes('StockInventario')) {
      queryParams = urlOrSearch;

      // Extraer página si es una URL de paginación
      const match = urlOrSearch.match(/page=(\d+)/);
      if (match) this.paginaActual.set(parseInt(match[1]));
    } else {
      this.paginaActual.set(1);
    }

    this.apiService.getStockInventario(queryParams).subscribe({
      next: (data: any) => this.procesarResultados(data),
      error: (err: any) => this.manejarError(err)
    });
  }

  private procesarResultados(data: any): void {
    console.log('Procesando resultados StockInventario:', data);
    const results = data.results || (Array.isArray(data) ? data : []);

    this.stockItems.set(results);

    // Agrupar y sumar por código (asumiendo que vienen ordenados del backend)
    const agrupados: any[] = [];
    let currentGroup: any[] = [];
    let lastCode = '';

    results.forEach((item: any, index: number) => {
      const code = item.prod_id?.codigo || '';

      if (index === 0) {
        lastCode = code;
        currentGroup.push(item);
      } else if (code === lastCode) {
        currentGroup.push(item);
      } else {
        // Cerrar grupo anterior
        const total = currentGroup.reduce((sum, i) => sum + (i.stock || 0), 0);
        agrupados.push({
          items: currentGroup,
          codigo: lastCode,
          total: total
        });

        // Empezar nuevo grupo
        lastCode = code;
        currentGroup = [item];
      }

      // Si es el último item, cerrar el grupo actual
      if (index === results.length - 1) {
        const total = currentGroup.reduce((sum, i) => sum + (i.stock || 0), 0);
        agrupados.push({
          items: currentGroup,
          codigo: lastCode,
          total: total
        });
      }
    });


    this.itemsAgrupados.set(agrupados);
    this.nextUrl.set(data.next || null);
    this.prevUrl.set(data.previous || null);
    this.totalCount.set(data.count || results.length);
    this.loading.set(false);

    // Resetear scroll al inicio de la tabla
    setTimeout(() => {
      const tableContainer = this.eRef.nativeElement.querySelector('.table-container');
      if (tableContainer) tableContainer.scrollTop = 0;
    }, 0);
  }


  private manejarError(err: any): void {
    console.error('Error en cargarStockInventario:', err);
    this.loading.set(false);
  }

  nextPage(): void {
    if (this.nextUrl()) {
      this.cargarStock(this.nextUrl()!);
    }
  }

  prevPage(): void {
    if (this.prevUrl()) {
      this.cargarStock(this.prevUrl()!);
    }
  }

  /**
   * Descarga todos los registros de la búsqueda actual en un archivo Excel.
   * Optimizado: Carga páginas en paralelo y muestra progreso.
   */
  async descargarExcel() {
    if (this.loadingExport()) return;

    this.loadingExport.set(true);
    this.exportProgress.set(0);
    console.log('Iniciando exportación a Excel paralela (Almacenaje)...');

    try {
      const filtros = this.searchService.filtros();
      const top = 1000;

      // Primera llamada para obtener el conteo total y la primera página
      const firstResponse: any = await firstValueFrom(this.apiService.getStockInventario(filtros, top));

      if (!firstResponse) {
        throw new Error('No se recibió respuesta del servidor');
      }

      const totalRecords = firstResponse.count || 0;
      let allData = [...(firstResponse.results || [])];

      if (totalRecords === 0) {
        alert('No hay datos para exportar');
        this.loadingExport.set(false);
        return;
      }

      const totalPages = Math.ceil(totalRecords / top);
      this.exportProgress.set(Math.round((1 / totalPages) * 100));

      if (totalPages > 1) {
        const promises: Promise<any>[] = [];
        for (let i = 2; i <= totalPages; i++) {
          // Clonar filtros y añadir página
          const pageParams = { ...filtros, page: i, top: top };
          const p = firstValueFrom(this.apiService.getStockInventario(pageParams)).then((resp: any) => {
            const currentProgress = this.exportProgress();
            this.exportProgress.set(Math.min(99, currentProgress + Math.round((1 / totalPages) * 100)));
            return resp.results || [];
          });
          promises.push(p);
        }

        const additionalResults = await Promise.all(promises);
        additionalResults.forEach(results => {
          allData = [...allData, ...results];
        });
      }

      this.exportProgress.set(100);

      // Formatear los datos para el Excel según el nuevo orden
      const dataToExport = allData.map(item => ({
        'PROVEEDOR': item.prod_id?.prov_id || '',
        'GRUPO': item.prod_id?.grupo_id || '',
        'LINEA': item.prod_id?.linea_id || '',
        'CÓDIGO': item.prod_id?.codigo || '',
        'DESCRIPCIÓN': item.prod_id?.descripcion || '',
        'EMPRESA Y DEPOSITO': item.almacenaje || '',
        'CANTIDAD': item.stock || 0
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Almacenaje');

      const fileName = `Stock_Almacenaje_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error('Error exportando a Excel:', error);
      alert('Error al generar el archivo Excel');
    } finally {
      this.loadingExport.set(false);
    }
  }

  buscar(): void {
    this.searchService.patchFiltros('buscar', this.searchTerm());
    this.cargarStock();
  }

}
