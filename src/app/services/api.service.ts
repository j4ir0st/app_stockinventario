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
  /**
   * Obtiene el stock aprobado filtrando por un campo específico.
   */
  getStockAprobadoConFiltro(filtro: string, valor: string): Observable<any> {
    const params = new HttpParams().set(filtro, valor);
    return this.get('StockAprobado/', params);
  }

  /**
   * Obtiene el stock aprobado de forma general (con o sin búsqueda genérica).
   */
  getStockAprobado(urlOrSearch?: string): Observable<any> {
    if (urlOrSearch && (urlOrSearch.startsWith('http') || urlOrSearch.includes('/api-proxy/'))) {
      const urlNormalizada = urlOrSearch.startsWith('http') ? this.fixUrl(urlOrSearch) : urlOrSearch;
      return this.http.get<any>(urlNormalizada);
    }

    let params = new HttpParams();
    return this.get('StockAprobado/', params);
  }

  /**
   * Ajusta una URL absoluta (del backend) para que use el proxy local '/api-proxy/'.
   * Esto evita problemas de CORS y "localhost" en desarrollo y producción.
   */
  private fixUrl(url: string): string {
    if (!url) return '';
    // Reemplaza el dominio y puerto por la ruta base del proxy configurada
    return url.replace(/^https?:\/\/[^\/]+/, this.baseUrl.replace(/\/$/, ''));
  }
}
