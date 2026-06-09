import { Component, signal, inject, OnInit, OnDestroy, effect, ElementRef, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { firstValueFrom, Subscription } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { ThemeService } from '../../services/theme.service';
import { RefreshService } from '../../services/refresh.service';
import { SearchService } from '../../services/search.service';
import { AuthService } from '../../services/auth.service';
import { FilterDataService } from '../../services/filter-data.service';

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
  public authService = inject(AuthService);
  private filterDataService = inject(FilterDataService);

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

  // Estados de exportación independientes
  loadingExportGeneral = signal(false);
  exportProgressGeneral = signal(0);
  loadingExportHeridas = signal(false);
  exportProgressHeridas = signal(0);

  // Ver registros con stock cero
  verCero = signal(false);

  constructor() {
    // Reaccionar a cambios en los filtros del sidebar
    effect(() => {
      const filtros = this.searchService.filtros();
      console.log('Filtros cambiados, recargando stock...', filtros);
      untracked(() => this.cargarStock());
    });

    // Reaccionar a cambios en el término de búsqueda (As you type)
    effect(() => {
      const term = this.searchTerm();
      if (term.length >= 3 || term.length === 0) {
        untracked(() => this.buscar());
      }
    });

    // Reaccionar al cambio del check de stock cero
    effect(() => {
      this.verCero();
      untracked(() => {
        if (this.stockItems().length > 0) {
          this.procesarResultados({ results: this.stockItems(), count: this.totalCount(), next: this.nextUrl(), previous: this.prevUrl() }, false);
        }
      });
    });
  }


  ngOnInit(): void {
    // Escuchar eventos de refresco desde el header
    this.suscripcionRefresco = this.refreshService.refresco$.subscribe(() => {
      this.searchService.actualizarFecha();
      // Solo cargamos si los filtros ya están vacíos (porque el effect no se disparará)
      const f = this.searchService.filtros();
      const isEmpty = !f.buscar && !f.tipo_producto && !f.prod_id__prov_id__consolidado && !f.prod_id__grupo_id__nombre && !f.prod_id__linea_id__nombre && !f.tipo_almacenaje__contains;

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

  private procesarResultados(data: any, esNuevaCarga = true): void {
    console.log('Procesando resultados StockInventario:', data);
    const rawResults = data.results || (Array.isArray(data) ? data : []);

    if (esNuevaCarga) {
      this.stockItems.set(rawResults);
      this.nextUrl.set(data.next || null);
      this.prevUrl.set(data.previous || null);
      this.totalCount.set(data.count || rawResults.length);
      // Actualizar lista de depósitos para el filtro del sidebar
      this.filterDataService.actualizarDepositos(rawResults);
    }

    // Lógica de filtrado y transformación por "Ver Cero"
    const verCero = this.verCero();

    // Primero agrupamos por código + tipo para aplicar la lógica especial
    const gruposMapa = new Map<string, any[]>();

    rawResults.forEach((item: any) => {
      const key = `${item.prod_id?.codigo || ''}_${item.prod_id?.tipo || ''}`;
      if (!gruposMapa.has(key)) {
        gruposMapa.set(key, []);
      }
      gruposMapa.get(key)?.push(item);
    });

    const resultsProcesados: any[] = [];

    gruposMapa.forEach((items, key) => {
      const totalStockGrupo = items.reduce((sum, i) => sum + (i.stock > 0 ? i.stock : 0), 0);

      if (totalStockGrupo > 0) {
        // Si hay stock, filtramos los items individuales si verCero es false
        items.forEach(item => {
          if (verCero || (item.stock || 0) > 0) {
            resultsProcesados.push(item);
          }
        });
      } else {
        // Si el total es 0 o menor, solo mostramos si verCero es true 
        // O si queremos el registro especial de "STOCK CERO"
        if (verCero) {
          items.forEach(item => resultsProcesados.push(item));
        } else {
          // Caso especial: registro único "STOCK CERO" para que aparezca la suma
          const primerItem = items[0];
          if (primerItem) {
            resultsProcesados.push({
              ...primerItem,
              almacenaje: 'STOCK CERO',
              stock: 0,
              esEspecialCero: true
            });
          }
        }
      }
    });

    // Agrupar y sumar por código + tipo para la visualización final
    const agrupados: any[] = [];
    let currentGroup: any[] = [];
    let lastGroupKey = '';

    resultsProcesados.forEach((item: any, index: number) => {
      const key = `${item.prod_id?.codigo || ''}_${item.prod_id?.tipo || ''}`;

      if (index === 0) {
        lastGroupKey = key;
        currentGroup.push(item);
      } else if (key === lastGroupKey) {
        currentGroup.push(item);
      } else {
        const total = currentGroup.reduce((sum, i) => sum + (i.stock > 0 ? i.stock : 0), 0);
        agrupados.push({
          items: currentGroup,
          key: lastGroupKey,
          codigo: currentGroup[0].prod_id?.codigo,
          tipo: currentGroup[0].prod_id?.tipo,
          total: total
        });

        lastGroupKey = key;
        currentGroup = [item];
      }

      if (index === resultsProcesados.length - 1) {
        const total = currentGroup.reduce((sum, i) => sum + (i.stock > 0 ? i.stock : 0), 0);
        agrupados.push({
          items: currentGroup,
          key: lastGroupKey,
          codigo: currentGroup[0].prod_id?.codigo,
          tipo: currentGroup[0].prod_id?.tipo,
          total: total
        });
      }
    });

    this.itemsAgrupados.set(agrupados);
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
   */
  async descargarExcel() {
    const filtros = this.searchService.filtros();
    await this.ejecutarExportacionExcel(
      filtros,
      'Stock_Almacenaje',
      this.loadingExportGeneral,
      this.exportProgressGeneral,
      true // Incluir subtotales en el reporte general
    );
  }

  /**
   * Descarga el stock total con filtros específicos para el área de Heridas.
   */
  async descargarExcelHeridas() {
    const filtros = {
      ...this.searchService.filtros(),
      tipo_almacenaje__in: 'INKJET,IMPORTACION EN PROCESO DE APROBACION,STOCK DISPONIBLE,DEVOLUCION EN PROCESO,COMPRA LOCAL EN PROCESO DE REVISION'
    };
    await this.ejecutarExportacionExcel(
      filtros,
      'Stock_Heridas_Quemados',
      this.loadingExportHeridas,
      this.exportProgressHeridas,
      false // No incluir subtotales en el reporte de heridas y quemados
    );
  }

  /**
   * Lógica base optimizada para exportación a Excel.
   */
  private async ejecutarExportacionExcel(
    filtros: any,
    baseFileName: string,
    loadingSignal: any,
    progressSignal: any,
    incluirSubtotales: boolean = true
  ) {
    if (loadingSignal()) return;

    loadingSignal.set(true);
    progressSignal.set(0);
    console.log(`Iniciando exportación a Excel paralela (${baseFileName})...`);

    try {
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
        loadingSignal.set(false);
        return;
      }

      const totalPages = Math.ceil(totalRecords / top);
      progressSignal.set(Math.round((1 / totalPages) * 100));

      if (totalPages > 1) {
        const promises: Promise<any>[] = [];
        for (let i = 2; i <= totalPages; i++) {
          const pageParams = { ...filtros, page: i, top: top };
          const p = firstValueFrom(this.apiService.getStockInventario(pageParams)).then((resp: any) => {
            const currentProgress = progressSignal();
            progressSignal.set(Math.min(99, currentProgress + Math.round((1 / totalPages) * 100)));
            return resp.results || [];
          });
          promises.push(p);
        }

        const additionalResults = await Promise.all(promises);
        additionalResults.forEach(results => {
          allData = [...allData, ...results];
        });
      }

      progressSignal.set(100);

      // Filtrar registros con stock <= 0 (siempre se excluyen en el Excel)
      const filteredData = allData.filter(item => (item.stock || 0) > 0);

      // Procesar datos para Excel (con o sin subtotales)
      const excelRows: any[] = [];
      let currentGroupKey = '';
      let currentGroupSum = 0;

      filteredData.forEach((item, index) => {
        const key = `${item.prod_id?.codigo || ''}_${item.prod_id?.tipo || ''}`;

        // Si se requieren subtotales y cambiamos de grupo, insertamos la fila de suma
        if (incluirSubtotales && index > 0 && key !== currentGroupKey) {
          excelRows.push({
            'PROVEEDOR': '-',
            'GRUPO': '-',
            'LINEA': '-',
            'TIPO': '-',
            'CÓDIGO': '-',
            'DESCRIPCIÓN': 'SUMA DEL TOTAL POR CÓDIGO',
            'EMPRESA Y DEPOSITO': '-',
            'CANTIDAD': currentGroupSum
          });
          currentGroupSum = 0;
        }

        currentGroupKey = key;
        if (item.stock > 0) {
          currentGroupSum += item.stock
        } else {
          currentGroupSum += 0
        }

        // Fila del item individual
        excelRows.push({
          'PROVEEDOR': item.prod_id?.prov_id || '',
          'GRUPO': item.prod_id?.grupo_id || '',
          'LINEA': item.prod_id?.linea_id || '',
          'TIPO': item.prod_id?.tipo || '',
          'CÓDIGO': item.prod_id?.codigo || '',
          'DESCRIPCIÓN': item.prod_id?.descripcion || '',
          'EMPRESA Y DEPOSITO': item.almacenaje || '',
          'CANTIDAD': item.stock || 0
        });

        // Al llegar al final, si se requieren subtotales, insertamos la última suma
        if (incluirSubtotales && index === filteredData.length - 1) {
          excelRows.push({
            'PROVEEDOR': '-',
            'GRUPO': '-',
            'LINEA': '-',
            'TIPO': '-',
            'CÓDIGO': '-',
            'DESCRIPCIÓN': 'SUMA DEL TOTAL POR CÓDIGO',
            'EMPRESA Y DEPOSITO': '-',
            'CANTIDAD': currentGroupSum
          });
        }
      });

      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Almacenaje');

      const fileName = `${baseFileName}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error('Error exportando a Excel:', error);
      alert('Error al generar el archivo Excel');
    } finally {
      loadingSignal.set(false);
    }
  }

  buscar(): void {
    if (this.searchService.filtros().buscar === this.searchTerm()) return;
    this.searchService.patchFiltros('buscar', this.searchTerm());
    // this.buscar();
  }

  limpiarBusqueda(): void {
    this.searchTerm.set('');
    this.buscar();
  }

  toggleVerCero(): void {
    this.verCero.update(v => !v);
  }

}
