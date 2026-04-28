import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-storage',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './storage.html',
  styleUrl: './storage.css'
})
export class StorageComponent implements OnInit {
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
  loadingExport = signal(false);

  ngOnInit(): void {
    this.cargarStock();
  }

  /**
   * Carga los datos de stock desde la API.
   * @param url URL opcional para paginación (next/prev).
   */
  cargarStock(url?: string): void {
    this.loading.set(true);
    this.stockItems.set([]);

    const search = url || this.searchTerm();

    // Si es una URL de paginación, hacemos una sola llamada
    if (search.startsWith('http') || search.includes('StockInventario')) {
      this.apiService.getStockInventario(search).subscribe({
        next: (data) => this.procesarResultados(data),
        error: (err) => this.manejarError(err)
      });
      return;
    }

    // Si es una búsqueda por texto, realizamos peticiones combinadas
    if (search.trim() !== '') {
      const p1 = this.apiService.getStockInventarioConFiltro('prod_id__codigo__contains', search).pipe(catchError(() => of({ results: [] })));
      const p2 = this.apiService.getStockInventarioConFiltro('prod_id__descripcion__contains', search).pipe(catchError(() => of({ results: [] })));
      const p3 = this.apiService.getStockInventarioConFiltro('prod_id__tipo__contains', search).pipe(catchError(() => of({ results: [] })));

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
      this.apiService.getStockInventario().subscribe({
        next: (data) => this.procesarResultados(data),
        error: (err) => this.manejarError(err)
      });
    }
  }

  private procesarResultados(data: any): void {
    console.log('Procesando resultados StockInventario:', data);
    let results = data.results || (Array.isArray(data) ? data : []);

    // Distinct robusto por ID, URL o combinación única
    const uniqueItems = results.filter((item: any, index: number, self: any[]) => {
      const uniqueKey = item.url || ((item.prod_id?.codigo || '') + '-' + (item.prod_id?.tipo || ''));
      return uniqueKey && index === self.findIndex((t: any) =>
        (t.url || ((t.prod_id?.codigo || '') + '-' + (t.prod_id?.tipo || ''))) === uniqueKey
      );
    });

    this.stockItems.set(uniqueItems);
    this.nextUrl.set(data.next || null);
    this.prevUrl.set(data.previous || null);
    this.totalCount.set(data.count || uniqueItems.length);
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
    if (this.loadingExport()) return;

    this.loadingExport.set(true);
    console.log('Iniciando exportación a Excel (Almacenaje)...');

    try {
      let allData: any[] = [];
      let nextUrl: string | null = null;

      const search = this.searchTerm();
      let response: any;
      if (search.trim() !== '') {
        response = await this.apiService.getStockInventarioConFiltro('prod_id__codigo__contains', search).toPromise();
      } else {
        response = await this.apiService.getStockInventario().toPromise();
      }

      if (response) {
        allData = [...(response.results || response)];
        nextUrl = response.next || null;

        while (nextUrl) {
          const nextResp: any = await this.apiService.getStockInventario(nextUrl).toPromise();
          if (nextResp) {
            allData = [...allData, ...(nextResp.results || nextResp)];
            nextUrl = nextResp.next || null;
          } else {
            nextUrl = null;
          }
        }
      }

      if (allData.length > 0) {
        allData = allData.filter((item: any, index: number, self: any[]) => {
          const uniqueKey = item.url || ((item.prod_id?.codigo || '') + '-' + (item.prod_id?.tipo || ''));
          return uniqueKey && index === self.findIndex((t: any) =>
            (t.url || ((t.prod_id?.codigo || '') + '-' + (t.prod_id?.tipo || ''))) === uniqueKey
          );
        });
      }

      if (allData.length === 0) {
        alert('No hay datos para exportar');
        this.loadingExport.set(false);
        return;
      }

      // Formatear los datos para el Excel
      const dataToExport = allData.map(item => ({
        'CÓDIGO': (item.prod_id?.tipo ? item.prod_id.tipo.trim() + ':' : '') + (item.prod_id?.codigo || ''),
        'DESCRIPCIÓN': item.prod_id?.descripcion || '',
        'TIPO ALMACENAJE': item.tipo_almacenaje || '',
        'ALMACENAJE': item.almacenaje || '',
        'STOCK': item.stock || 0
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
    this.cargarStock();
  }
}
