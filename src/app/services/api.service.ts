import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConfigService } from './config.service';

/**
 * Servicio centralizado para las consultas a la API de Django Rest Framework.
 * Sigue las buenas prácticas de reutilización de código.
 */
@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  /**
   * Obtiene la base de la URL de la API desde el servicio de configuración.
   */
  private get baseUrl(): string {
    return this.configService.apiUrl();
  }

  /**
   * Método genérico para peticiones GET.
   * @param endpoint Ruta del recurso.
   * @param params Parámetros de consulta opcionales.
   */
  get<T>(endpoint: string, params?: HttpParams): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}${endpoint}`, { params });
  }

  /**
   * Obtiene el stock aprobado con filtros opcionales o mediante URL de paginación.
   * @param urlOrSearch URL completa de DRF o texto de búsqueda.
   */
  getStockAprobado(urlOrSearch?: string): Observable<any> {
    // Si es una URL completa (para paginación), la limpiamos para usar el proxy
    if (urlOrSearch && urlOrSearch.startsWith('http')) {
      const path = urlOrSearch.split('/StockAprobado/')[1] || '';
      return this.get(`StockAprobado/${path}`);
    }

    let params = new HttpParams();
    if (urlOrSearch) {
      params = params.set('search', urlOrSearch);
    }
    return this.get('StockAprobado/', params);
  }
}
