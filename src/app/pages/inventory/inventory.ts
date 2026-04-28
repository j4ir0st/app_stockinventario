import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ConfigService } from '../../services/config.service';
import { ApiService } from '../../services/api.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inventory.html',
  styleUrl: './inventory.css'
})
export class InventoryComponent implements OnInit {
  private configService = inject(ConfigService);
  private apiService = inject(ApiService);
  public themeService = inject(ThemeService);

  // Estado de la búsqueda
  searchTerm = signal('');

  // Lista de items de stock
  stockItems = signal<any[]>([]);

  // Estado de carga y paginación
  loading = signal(false);
  nextUrl = signal<string | null>(null);
  prevUrl = signal<string | null>(null);
  totalCount = signal(0);

  ngOnInit(): void {
    this.cargarStock();
  }

  /**
   * Carga los datos de stock desde la API.
   * @param url URL opcional para paginación (next/prev).
   */
  cargarStock(url?: string): void {
    console.log('CargarStock - Estado inicial:', {
      loading: this.loading(),
      itemsCount: this.stockItems().length
    });

    this.loading.set(true);
    this.stockItems.set([]);

    const search = url || this.searchTerm();

    // Si es una URL de paginación, hacemos una sola llamada
    if (search.startsWith('http') || search.startsWith('/api-proxy/')) {
      this.apiService.getStockAprobado(search).subscribe({
        next: (data) => this.procesarResultados(data),
        error: (err) => this.manejarError(err)
      });
      return;
    }

    // Si es una búsqueda por texto, realizamos peticiones (probando solo con código por ahora)
    if (search.trim() !== '') {
      const p1 = this.apiService.getStockAprobadoConFiltro('prod_id__codigo__contains', search).pipe(catchError(() => of({ results: [] })));
      const p2 = this.apiService.getStockAprobadoConFiltro('prod_id__descripcion__contains', search).pipe(catchError(() => of({ results: [] })));
      const p3 = this.apiService.getStockAprobadoConFiltro('prod_id__tipo__contains', search).pipe(catchError(() => of({ results: [] })));

      forkJoin([p1, p2, p3]).subscribe({
        next: (responses: any[]) => {
          const allResults = responses.flatMap(resp => resp.results || (Array.isArray(resp) ? resp : []));

          const combinedData = {
            results: allResults,
            count: allResults.length,
            next: responses[0]?.next || null,
            previous: responses[0]?.previous || null
          };

          this.procesarResultados(combinedData);
        },
        error: (err) => this.manejarError(err)
      });
    } else {
      // Carga inicial sin filtros
      this.apiService.getStockAprobado().subscribe({
        next: (data) => this.procesarResultados(data),
        error: (err) => this.manejarError(err)
      });
    }
  }

  private procesarResultados(data: any): void {
    console.log('Procesando resultados:', data);
    let results = data.results || (Array.isArray(data) ? data : []);

    // Distinct por código de producto
    const uniqueItems = results.filter((item: any, index: number, self: any[]) => {
      const codigo = item.prod_id?.codigo || item.prod_id;
      return codigo && index === self.findIndex((t: any) => (t.prod_id?.codigo || t.prod_id) === codigo);
    });

    this.stockItems.set(uniqueItems);
    this.nextUrl.set(data.next || null);
    this.prevUrl.set(data.previous || null);
    this.totalCount.set(data.count || uniqueItems.length);
    this.loading.set(false);
    console.log('Carga finalizada. Items:', uniqueItems.length);
  }

  private manejarError(err: any): void {
    console.error('Error en cargarStock:', err);
    this.loading.set(false);
    this.generarDatosDemo();
  }

  /**
   * Navega a la página siguiente.
   */
  nextPage(): void {
    if (this.nextUrl()) {
      this.cargarStock(this.nextUrl()!);
    }
  }

  /**
   * Navega a la página anterior.
   */
  prevPage(): void {
    if (this.prevUrl()) {
      this.cargarStock(this.prevUrl()!);
    }
  }

  /**
   * Realiza la búsqueda de productos.
   */
  buscar(): void {
    console.log('Botón buscar clickeado. Término:', this.searchTerm());
    this.cargarStock();
  }

  /**
   * Genera datos de prueba para cuando no hay conexión con el servidor o errores.
   */
  private generarDatosDemo(): void {
    this.stockItems.set([
      {
        id: 6792,
        prod_id: {
          codigo: 'ZMW-120A',
          descripcion: 'UNITAPE PRODUCTO A - MOTOR AIR PRESSURE TUBING',
          tipo: 'MER'
        },
        disponible: 3,
        importacion: 0,
        acondicionado: 0,
        reesterilizado: 0,
        observados: 0,
        consignacion: 0,
        venta_sujeta: 0,
        stock_total: 3
      },
      {
        id: 6791,
        prod_id: {
          codigo: 'ZMW-11',
          descripcion: 'UNITAPE PRODUCTO B - ACCESSORY KIT',
          tipo: 'SG-IM'
        },
        disponible: 1,
        importacion: 0,
        acondicionado: 0,
        reesterilizado: 0,
        observados: 0,
        consignacion: 0,
        venta_sujeta: 0,
        stock_total: 1
      }
    ]);
  }
}
