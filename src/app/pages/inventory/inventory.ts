import { Component, signal, computed, inject, OnInit, OnDestroy, effect, ElementRef, untracked } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
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
  templateUrl: './inventory.html',
  styleUrl: './inventory.css',
  imports: [CommonModule, FormsModule, DatePipe]
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
  // Tamaño de página: 60 por defecto (DRF default); se actualiza si la URL contiene top=N
  tamanioPagina = signal(60);
  // Total de páginas calculado en memoria a partir del count y el tamaño de página
  totalPaginas = computed(() => Math.max(1, Math.ceil(this.totalCount() / this.tamanioPagina())));

  // Estados de exportación independientes
  loadingExportGeneral = signal(false);
  exportProgressGeneral = signal(0);
  loadingExportHeridas = signal(false);
  exportProgressHeridas = signal(0);

  // Ver registros con stock cero y tránsito
  verCero = signal(false);
  verTransito = signal(false);
  itemsTransito = signal<any[]>([]);

  // --- Estado de la vista detalle ---
  vistaDetalle = signal(false);
  productoSeleccionado = signal<any>(null);
  itemsDetalle = signal<any[]>([]);       // Registros agregados con cantidad > 0
  itemsDetalleCeros = signal<any[]>([]);  // Registros agregados que quedaron en cero
  itemsDetalleRaw = signal<any[]>([]);    // Registros originales del kardex sin procesar
  loadingDetalle = signal(false);
  errorDetalle = signal<string | null>(null);

  // Modos de visualización del detalle
  mostrarKardexOriginal = signal(false);  // Muestra el kardex sin agregar
  mostrarCeros = signal(false);           // Muestra también los registros que quedaron en cero
  ordenFechaAscendente = signal(false);   // Orden de fecha: false = descendente (por defecto)
  filtroSerie = signal('');               // Filtro de texto por número de serie
  filtroDeposito = signal('');            // Filtro de texto por nombre de depósito

  // Items visibles según modo activo, con filtrado y ordenamiento en memoria
  itemsVisibles = computed(() => {
    let items: any[];
    if (this.mostrarKardexOriginal()) items = this.itemsDetalleRaw();
    else if (this.mostrarCeros()) items = [...this.itemsDetalle(), ...this.itemsDetalleCeros()];
    else items = this.itemsDetalle();

    // Filtrar por número de serie (búsqueda parcial sin distinción de mayúsculas)
    const filtroPorSerie = this.filtroSerie().trim().toLowerCase();
    if (filtroPorSerie) {
      items = items.filter(reg => (reg.numero_serie || '').toLowerCase().includes(filtroPorSerie));
    }

    // Filtrar por nombre de depósito (búsqueda parcial sin distinción de mayúsculas)
    const filtroPorDeposito = this.filtroDeposito().trim().toLowerCase();
    if (filtroPorDeposito) {
      items = items.filter(reg => (reg.nombre_deposito || '').toLowerCase().includes(filtroPorDeposito));
    }

    // Ordenar en memoria sin hacer consultas adicionales al servidor
    return [...items].sort((a, b) => {
      const fechaA = new Date(a.fecha_movimiento || 0).getTime();
      const fechaB = new Date(b.fecha_movimiento || 0).getTime();
      return this.ordenFechaAscendente() ? fechaA - fechaB : fechaB - fechaA;
    });
  });

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
   * Carga los datos de stock o tránsito desde la API usando los filtros globales.
   */
  async cargarStock(urlOrSearch?: string): Promise<void> {
    if (this.loading() && !urlOrSearch) return;

    this.loading.set(true);

    const filtros = this.searchService.filtros();
    let queryParams: any = filtros;

    if (urlOrSearch && (urlOrSearch.includes('StockInventario') || urlOrSearch.includes('SI_Transito'))) {
      queryParams = urlOrSearch;

      const match = urlOrSearch.match(/page=(\d+)/);
      if (match) this.paginaActual.set(parseInt(match[1]));
    } else {
      this.paginaActual.set(1);
    }

    if (this.verTransito()) {
      try {
        const data = await firstValueFrom(this.apiService.getSITransito(queryParams));
        this.procesarResultadosTransito(data);
      } catch (err) {
        this.manejarError(err);
      }
    } else {
      try {
        const promesaStock = firstValueFrom(this.apiService.getStockInventario(queryParams));
        const promesaTransito = firstValueFrom(this.apiService.getSITransito({}, 1000)).catch(err => {
          console.error('Error al obtener SI_Transito:', err);
          return { results: [] };
        });

        const [dataStock, dataTransito] = await Promise.all([promesaStock, promesaTransito]);
        this.procesarResultados(dataStock, dataTransito);
      } catch (err) {
        this.manejarError(err);
      }
    }
  }

  private procesarResultadosTransito(data: any): void {
    console.log('Procesando resultados SI_Transito:', data);
    const rawResults = data.results || (Array.isArray(data) ? data : []);

    this.itemsTransito.set(rawResults);
    this.nextUrl.set(data.next || null);
    this.prevUrl.set(data.previous || null);
    this.totalCount.set(data.count || rawResults.length);

    const urlRef = data.next || data.previous || '';
    const topMatch = urlRef.match(/[?&]top=(\d+)/);
    this.tamanioPagina.set(topMatch ? parseInt(topMatch[1], 10) : 60);

    this.loading.set(false);

    setTimeout(() => {
      const tableContainer = this.eRef.nativeElement.querySelector('.table-container');
      if (tableContainer) tableContainer.scrollTop = 0;
    }, 0);
  }

  private procesarResultados(dataStock: any, dataTransito?: any, esNuevaCarga = true): void {
    console.log('Procesando resultados StockInventario con Transito:', dataStock);
    const rawResults = dataStock.results || (Array.isArray(dataStock) ? dataStock : []);

    if (esNuevaCarga) {
      this.stockItems.set(rawResults);
      this.nextUrl.set(dataStock.next || null);
      this.prevUrl.set(dataStock.previous || null);
      this.totalCount.set(dataStock.count || rawResults.length);

      const urlRef = dataStock.next || dataStock.previous || '';
      const topMatch = urlRef.match(/[?&]top=(\d+)/);
      this.tamanioPagina.set(topMatch ? parseInt(topMatch[1], 10) : 60);

      this.filterDataService.actualizarDepositos(rawResults);
    }

    const verCero = this.verCero();

    // Indexar registros de tránsito por código y tipo
    const rawTransito = dataTransito?.results || (Array.isArray(dataTransito) ? dataTransito : []);
    const mapaTransito = new Map<string, any[]>();
    rawTransito.forEach((tReg: any) => {
      const cod = (tReg.prod || '').trim().toUpperCase();
      const tip = (tReg.tipo_producto || '').trim().toUpperCase();
      if (cod && tip) {
        const clave = `${cod}_${tip}`;
        if (!mapaTransito.has(clave)) mapaTransito.set(clave, []);
        mapaTransito.get(clave)?.push(tReg);
      }
    });

    // Agrupar los resultados de StockInventario por código + tipo
    const gruposMapa = new Map<string, any[]>();
    rawResults.forEach((item: any) => {
      const key = `${item.prod_id?.codigo || ''}_${item.prod_id?.tipo || ''}`;
      if (!gruposMapa.has(key)) {
        gruposMapa.set(key, []);
      }
      gruposMapa.get(key)?.push(item);
    });

    const agrupados: any[] = [];

    gruposMapa.forEach((items, key) => {
      const codigoClean = (items[0]?.prod_id?.codigo || '').trim().toUpperCase();
      const tipoClean = (items[0]?.prod_id?.tipo || '').trim().toUpperCase();
      const claveTransito = `${codigoClean}_${tipoClean}`;

      const totalStockFisico = items.reduce((sum, i) => sum + (i.stock > 0 ? i.stock : 0), 0);
      const itemsProcesados: any[] = [];

      if (totalStockFisico > 0) {
        items.forEach(item => {
          if (verCero || (item.stock || 0) > 0) {
            itemsProcesados.push(item);
          }
        });
      } else {
        if (verCero) {
          items.forEach(item => itemsProcesados.push(item));
        } else {
          const primerItem = items[0];
          if (primerItem) {
            itemsProcesados.push({
              ...primerItem,
              almacenaje: 'STOCK CERO',
              stock: 0,
              esEspecialCero: true
            });
          }
        }
      }

      // Buscar si existen coincidencias en la tabla SI_Transito para este código y tipo
      const coincidenciasTransito = mapaTransito.get(claveTransito) || [];
      if (coincidenciasTransito.length > 0) {
        // Agrupar tránsito por empresa y sumar cant_pend
        const transitoPorEmpresa = new Map<string, { registro: any; totalCantPend: number }>();
        coincidenciasTransito.forEach((tReg: any) => {
          const nombreEmpresa = this.filterDataService.obtenerNombreEmpresa(tReg.empresa) || tReg.empresa || 'EMPRESA';
          const cantPend = parseFloat(tReg.cant_pend || '0') || 0;

          if (transitoPorEmpresa.has(nombreEmpresa)) {
            transitoPorEmpresa.get(nombreEmpresa)!.totalCantPend += cantPend;
          } else {
            transitoPorEmpresa.set(nombreEmpresa, { registro: tReg, totalCantPend: cantPend });
          }
        });

        // Generar las filas de tránsito consolidado
        transitoPorEmpresa.forEach(({ registro, totalCantPend }, nombreEmpresa) => {
          if (totalCantPend > 0) {
            const primerStock = items[0];
            itemsProcesados.push({
              prod_id: {
                prov_id: registro.prov || primerStock?.prod_id?.prov_id || '',
                grupo_id: registro.grupo || primerStock?.prod_id?.grupo_id || '',
                linea_id: registro.linea || primerStock?.prod_id?.linea_id || '',
                tipo: registro.tipo_producto || primerStock?.prod_id?.tipo || '',
                codigo: registro.prod || primerStock?.prod_id?.codigo || '',
                descripcion: registro.descripcion || primerStock?.prod_id?.descripcion || ''
              },
              almacenaje: `${nombreEmpresa} | STOCK EN TRANSITO`,
              stock: totalCantPend,
              esTransito: true
            });
          }
        });
      }

      // Calcular el subtotal por código incluyendo el stock físico y el stock en tránsito
      const totalGrupo = itemsProcesados.reduce((sum, i) => sum + (i.stock > 0 ? i.stock : 0), 0);

      agrupados.push({
        items: itemsProcesados,
        key: key,
        codigo: items[0]?.prod_id?.codigo,
        tipo: items[0]?.prod_id?.tipo,
        total: totalGrupo
      });
    });

    this.itemsAgrupados.set(agrupados);
    this.loading.set(false);
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
    if (this.verTransito()) {
      await this.ejecutarExportacionExcelTransito();
      return;
    }

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
   * Exporta la tabla SI_Transito completa a Excel usando el parámetro top=1000.
   */
  private async ejecutarExportacionExcelTransito() {
    if (this.loadingExportGeneral()) return;

    this.loadingExportGeneral.set(true);
    this.exportProgressGeneral.set(0);
    console.log('Iniciando exportación a Excel de SI_Transito (top=1000)...');

    try {
      const filtros = this.searchService.filtros();
      const response: any = await firstValueFrom(this.apiService.getSITransito(filtros, 1000));

      if (!response) {
        throw new Error('No se recibió respuesta del servidor');
      }

      const allData = response.results || (Array.isArray(response) ? response : []);

      if (allData.length === 0) {
        alert('No hay datos de tránsito para exportar');
        this.loadingExportGeneral.set(false);
        return;
      }

      this.exportProgressGeneral.set(100);

      const excelRows = allData.map((item: any) => ({
        'PROVEEDOR': item.prov || '',
        'GRUPO': item.grupo || '',
        'LINEA': item.linea || '',
        'TIPO': item.tipo_producto || '',
        'CÓDIGO': item.prod || '',
        'DESCRIPCIÓN': item.descripcion || '',
        'EMPRESA': item.empresa || '',
        'FECHA MOV.': item.fecha_mov || '',
        'ESTADO': item.estado || '',
        'CANTIDAD': parseFloat(item.cantidad || '0'),
        'CANT. ATENDIDA': parseFloat(item.cant_aten || '0'),
        'CANT. PENDIENTE': parseFloat(item.cant_pend || '0')
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Tránsito');

      const fileName = `Stock_Transito_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error('Error exportando a Excel de Tránsito:', error);
      alert('Error al generar el archivo Excel de Tránsito');
    } finally {
      this.loadingExportGeneral.set(false);
    }
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

      // Consultar la tabla de tránsito para integrar en la exportación Excel
      const transitoResp: any = await firstValueFrom(this.apiService.getSITransito(filtros, 1000)).catch(err => {
        console.error('Error al obtener SI_Transito para Excel:', err);
        return { results: [] };
      });
      const rawTransitoExcel = transitoResp?.results || (Array.isArray(transitoResp) ? transitoResp : []);
      const mapaTransitoExcel = new Map<string, any[]>();
      rawTransitoExcel.forEach((tReg: any) => {
        const cod = (tReg.prod || '').trim().toUpperCase();
        const tip = (tReg.tipo_producto || '').trim().toUpperCase();
        if (cod && tip) {
          const clave = `${cod}_${tip}`;
          if (!mapaTransitoExcel.has(clave)) mapaTransitoExcel.set(clave, []);
          mapaTransitoExcel.get(clave)?.push(tReg);
        }
      });

      // Agrupar por código + tipo
      const gruposExcel = new Map<string, any[]>();
      allData.forEach((item: any) => {
        const key = `${item.prod_id?.codigo || ''}_${item.prod_id?.tipo || ''}`;
        if (!gruposExcel.has(key)) gruposExcel.set(key, []);
        gruposExcel.get(key)!.push(item);
      });

      const excelRows: any[] = [];

      gruposExcel.forEach((items) => {
        const codigoClean = (items[0]?.prod_id?.codigo || '').trim().toUpperCase();
        const tipoClean = (items[0]?.prod_id?.tipo || '').trim().toUpperCase();
        const claveTransito = `${codigoClean}_${tipoClean}`;

        const totalStock = items.reduce((sum: number, i: any) => sum + (i.stock > 0 ? i.stock : 0), 0);
        const itemsGrupoExcel: any[] = [];

        if (totalStock > 0) {
          items.forEach((item: any) => { if ((item.stock || 0) > 0) itemsGrupoExcel.push(item); });
        } else {
          if ((items[0]?.prod_id?.tipo || '').trim().toUpperCase() === 'MER') {
            itemsGrupoExcel.push({ ...items[0], almacenaje: 'STOCK CERO', stock: 0, esEspecialCero: true });
          }
        }

        let sumaGrupo = 0;

        // 1. Agregar filas individuales de stock físico
        itemsGrupoExcel.forEach((item: any) => {
          if (item.stock > 0) {
            sumaGrupo += item.stock;
          }
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
        });

        // 2. Agregar filas de stock en tránsito si existen para este producto
        const coincidenciasTransito = mapaTransitoExcel.get(claveTransito) || [];
        if (coincidenciasTransito.length > 0) {
          const transitoPorEmpresa = new Map<string, { registro: any; totalCantPend: number }>();
          coincidenciasTransito.forEach((tReg: any) => {
            const nombreEmpresa = this.filterDataService.obtenerNombreEmpresa(tReg.empresa) || tReg.empresa || 'EMPRESA';
            const cantPend = parseFloat(tReg.cant_pend || '0') || 0;

            if (transitoPorEmpresa.has(nombreEmpresa)) {
              transitoPorEmpresa.get(nombreEmpresa)!.totalCantPend += cantPend;
            } else {
              transitoPorEmpresa.set(nombreEmpresa, { registro: tReg, totalCantPend: cantPend });
            }
          });

          transitoPorEmpresa.forEach(({ registro, totalCantPend }, nombreEmpresa) => {
            if (totalCantPend > 0) {
              sumaGrupo += totalCantPend;
              const primerStock = items[0];
              excelRows.push({
                'PROVEEDOR': registro.prov || primerStock?.prod_id?.prov_id || '',
                'GRUPO': registro.grupo || primerStock?.prod_id?.grupo_id || '',
                'LINEA': registro.linea || primerStock?.prod_id?.linea_id || '',
                'TIPO': registro.tipo_producto || primerStock?.prod_id?.tipo || '',
                'CÓDIGO': registro.prod || primerStock?.prod_id?.codigo || '',
                'DESCRIPCIÓN': registro.descripcion || primerStock?.prod_id?.descripcion || '',
                'EMPRESA Y DEPOSITO': `${nombreEmpresa} | STOCK EN TRANSITO`,
                'CANTIDAD': totalCantPend
              });
            }
          });
        }

        // 3. Fila de subtotal por código si incluirSubtotales es verdadero
        if (incluirSubtotales) {
          excelRows.push({
            'PROVEEDOR': '-',
            'GRUPO': '-',
            'LINEA': '-',
            'TIPO': '-',
            'CÓDIGO': '-',
            'DESCRIPCIÓN': 'SUMA DEL TOTAL POR CÓDIGO',
            'EMPRESA Y DEPOSITO': '-',
            'CANTIDAD': sumaGrupo
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
  }

  limpiarBusqueda(): void {
    this.searchTerm.set('');
    this.buscar();
  }

  toggleVerCero(): void {
    this.verCero.update(v => !v);
  }

  toggleVerTransito(): void {
    this.verTransito.update(v => !v);
    this.cargarStock();
  }

  /**
   * Determina la clase CSS para la insignia del campo estado en la tabla de Tránsito.
   * @param estado Descripción del estado del producto en tránsito.
   */
  claseEstadoTransito(estado: string): string {
    const estadoClean = (estado || '').trim().toUpperCase();
    if (estadoClean === 'ORDEN COLOCADA O EN BACKORDER PENDIENTE DE CONFIRMAR') {
      return 'badge-estado-orange';
    }
    if (estadoClean === 'CARGA EN ADUANAS O NUMERADA PENDIENTE DE RETIRO') {
      return 'badge-estado-teal';
    }
    return 'badge-estado-blue';
  }

  /**
   * Abre la vista detalle para un item, consultando Stock_ERP con todos los filtros del almacenaje.
   * Parsea el campo almacenaje (formato: "empresa | tipo_almacenaje | tipo_almacen"),
   * busca el cod_empresa en SI_Empresa y carga el kardex completo en paralelo.
   * @param item Registro de StockInventario seleccionado.
   */
  async verDetalle(item: any): Promise<void> {
    if (item.esEspecialCero) return;

    const codigo = item.prod_id?.codigo;
    const tipo = item.prod_id?.tipo;

    // Parsear el campo almacenaje: [empresa] | [tipo_almacenaje] | [tipo_almacen]
    const partes = (item.almacenaje || '').split(' | ');
    const nombreEmpresa   = partes[0]?.trim() || '';
    const tipoAlmacenaje  = partes[1]?.trim() || '';
    const tipoAlmacen     = partes[2]?.trim() || '';

    if (!codigo) return;

    // Inicializar estado del detalle
    this.productoSeleccionado.set(item);
    this.itemsDetalle.set([]);
    this.itemsDetalleCeros.set([]);
    this.itemsDetalleRaw.set([]);
    this.mostrarKardexOriginal.set(false);
    this.mostrarCeros.set(false);
    this.ordenFechaAscendente.set(false);
    this.filtroSerie.set('');
    this.filtroDeposito.set('');
    this.errorDetalle.set(null);
    this.loadingDetalle.set(true);
    this.vistaDetalle.set(true);

    try {
      const top = 1000;

      // Obtener cod_empresa desde la caché (sin consultas adicionales al servidor)
      const codEmpresa = this.filterDataService.buscarCodEmpresa(nombreEmpresa);
      if (!codEmpresa && nombreEmpresa) {
        console.warn('cod_empresa no encontrado en caché para empresa:', nombreEmpresa, '— consultando sin filtro de empresa.');
      }

      // Primera consulta a Stock_ERP con todos los filtros
      const filtros = {
        tipo_producto:   tipo           || undefined,
        codigo_producto: codigo         || undefined,
        cod_empresa:     codEmpresa     || undefined,
        tipo_almacenaje: tipoAlmacenaje || undefined,
        tipo_almacen:    tipoAlmacen    || undefined
      };
      console.log('Consultando Stock_ERP con filtros:', filtros);

      const primeraRespuesta: any = await firstValueFrom(this.apiService.getStockERP(filtros, top));
      if (!primeraRespuesta) throw new Error('Sin respuesta del servidor');

      let todosLosResultados = [...(primeraRespuesta.results || [])];

      // Cargar páginas adicionales en paralelo si las hay
      if (primeraRespuesta.next) {
        const totalRegistros = primeraRespuesta.count || 0;
        const totalPaginas = Math.ceil(totalRegistros / top);
        console.log(`Stock_ERP: ${totalRegistros} registros en ${totalPaginas} páginas. Cargando en paralelo...`);

        const promesas: Promise<any>[] = [];
        for (let pagina = 2; pagina <= totalPaginas; pagina++) {
          let urlPagina = `Stock_ERP/?page=${pagina}&top=${top}&codigo_producto=${encodeURIComponent(codigo)}`;
          if (tipo)            urlPagina += `&tipo_producto=${encodeURIComponent(tipo)}`;
          if (tipoAlmacenaje)  urlPagina += `&tipo_almacenaje=${encodeURIComponent(tipoAlmacenaje)}`;
          if (tipoAlmacen)     urlPagina += `&tipo_almacen=${encodeURIComponent(tipoAlmacen)}`;
          if (codEmpresa)      urlPagina += `&cod_empresa=${encodeURIComponent(codEmpresa)}`;
          promesas.push(firstValueFrom(this.apiService.getStockERPPagina(urlPagina)));
        }

        const respuestasPaginadas = await Promise.all(promesas);
        respuestasPaginadas.forEach((resp: any) => {
          todosLosResultados = [...todosLosResultados, ...(resp?.results || [])];
        });
      }

      console.log(`Stock_ERP: ${todosLosResultados.length} registros totales cargados.`);

      // Guardar el kardex original con cantidades redondeadas
      this.itemsDetalleRaw.set(
        todosLosResultados.map((reg: any) => ({ ...reg, cantidad: Math.round(reg.cantidad || 0) }))
      );

      // Agregar registros por numero_serie + deposito: igual que en app_stockaprobados
      const agregado = new Map<string, any>();

      todosLosResultados.forEach((reg: any) => {
        const clave = reg.numero_serie
          ? `${reg.numero_serie}|${reg.nombre_deposito || ''}`
          : `__sin_serie_${Math.random()}`;
        const cantidadActual = Math.round(reg.cantidad || 0);

        if (agregado.has(clave)) {
          const existente = agregado.get(clave);
          existente.cantidad += cantidadActual;
          // Conservar los datos del registro con la fecha más reciente
          const fechaExistente = new Date(existente.fecha_movimiento || 0);
          const fechaNueva = new Date(reg.fecha_movimiento || 0);
          if (fechaNueva > fechaExistente) {
            agregado.set(clave, { ...reg, cantidad: existente.cantidad });
          }
        } else {
          agregado.set(clave, { ...reg, cantidad: cantidadActual });
        }
      });

      // Separar registros con cantidad positiva de los que quedaron en cero o negativo
      const todosAgregados = Array.from(agregado.values());
      this.itemsDetalle.set(todosAgregados.filter(reg => reg.cantidad > 0));
      this.itemsDetalleCeros.set(todosAgregados.filter(reg => reg.cantidad <= 0));

      this.loadingDetalle.set(false);

    } catch (err) {
      console.error('Error al cargar detalle de stock:', err);
      this.errorDetalle.set('No se pudo cargar el detalle. Intente nuevamente.');
      this.loadingDetalle.set(false);
    }
  }

  /**
   * Regresa a la vista principal de la tabla de inventario.
   */
  regresarATabla(): void {
    this.vistaDetalle.set(false);
    this.productoSeleccionado.set(null);
    this.itemsDetalle.set([]);
    this.itemsDetalleCeros.set([]);
    this.itemsDetalleRaw.set([]);
    this.mostrarKardexOriginal.set(false);
    this.mostrarCeros.set(false);
    this.ordenFechaAscendente.set(false);
    this.filtroSerie.set('');
    this.filtroDeposito.set('');
    this.errorDetalle.set(null);
  }

  /**
   * Retorna la clase CSS del badge según el tipo de almacenaje.
   * Permite colorear semánticamente cada estado en la vista detalle.
   */
  claseAlmacenaje(tipo: string): string {
    const mapa: Record<string, string> = {
      'STOCK DISPONIBLE':                        'alm-disponible',
      'MUESTRA':                                 'alm-muestra',
      'PRODUCTOS EN ACONDICIONADO':              'alm-acondicionado',
      'BAJA':                                    'alm-baja',
      'DEVOLUCION EN PROCESO':                   'alm-devolucion',
      'INKJET':                                  'alm-inkjet',
      'IMPORTACION EN PROCESO DE APROBACION':    'alm-importacion',
      'PRESTAMO':                                'alm-prestamo',
      'COMPRA LOCAL EN PROCESO DE REVISION':     'alm-compra-local',
      'PROVISIONAL':                             'alm-provisional',
      'PRODUCTO REESTERILIZADO':                 'alm-reesterilizado',
      'CONSUMO INTERNO':                         'alm-consumo',
      'FUERA DEL STOCK':                         'alm-fuera-stock',
      'PRODUCTOS OBSERVADOS POR CALIDAD':        'alm-observados',
      'PRODUCTOS POR REGULARIZAR ATENCIONES':    'alm-regularizar-atenciones',
      'VTA. SUJET. A CONF(MER)/BIENES DE USO':   'alm-vta-sujeta',
      'RESERVADO PARA OC':                       'alm-reservado',
      'CONSIGNACION':                            'alm-consignacion',
      'PRODUCTOS POR REGULARIZAR FACTURACION':   'alm-regularizar-facturacion',
    };
    return mapa[(tipo || '').toUpperCase().trim()] || 'alm-default';
  }

  /**
   * Alterna el orden de fecha entre ascendente y descendente en memoria.
   */
  toggleOrdenFecha(): void {
    this.ordenFechaAscendente.set(!this.ordenFechaAscendente());
  }

}
