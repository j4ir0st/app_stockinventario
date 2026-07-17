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

  // Ver registros con stock cero
  verCero = signal(false);

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

      // Actualizar tamaño de página extrayendo el parámetro top de la URL de paginación
      const urlRef = data.next || data.previous || '';
      const topMatch = urlRef.match(/[?&]top=(\d+)/);
      this.tamanioPagina.set(topMatch ? parseInt(topMatch[1], 10) : 60);

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
  }

  limpiarBusqueda(): void {
    this.searchTerm.set('');
    this.buscar();
  }

  toggleVerCero(): void {
    this.verCero.update(v => !v);
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
