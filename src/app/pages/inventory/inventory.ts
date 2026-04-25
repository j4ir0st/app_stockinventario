import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
    this.loading.set(true);
    
    this.apiService.getStockAprobado(url || this.searchTerm()).subscribe({
      next: (data) => {
        this.stockItems.set(data.results || []);
        this.nextUrl.set(data.next);
        this.prevUrl.set(data.previous);
        this.totalCount.set(data.count || 0);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error al cargar stock:', err);
        this.loading.set(false);
        this.generarDatosDemo();
      }
    });
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
    this.cargarStock();
  }

  /**
   * Genera datos de prueba para cuando no hay conexión con el servidor.
   */
  private generarDatosDemo(): void {
    this.stockItems.set([
      {
        id: 6792,
        prod_id: 'MER : ZMW-120A',
        descripcion: 'UNITAPE PRODUCTO A',
        disponible: 0,
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
        prod_id: 'SG-IM : ZMW-11',
        descripcion: 'UNITAPE PRODUCTO B',
        disponible: 0,
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
