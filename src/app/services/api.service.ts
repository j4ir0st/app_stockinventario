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
    return this.fixUrl(this.configService.apiUrl());
  }

  /**
   * Método genérico para peticiones GET.
   * @param endpoint Ruta del recurso.
   * @param params Parámetros de consulta opcionales.
   */
  get<T>(endpoint: string, params?: HttpParams): Observable<T> {
    let finalParams = params || new HttpParams();
    if (!finalParams.has('format')) {
      finalParams = finalParams.set('format', 'json');
    }

    let url = endpoint;
    const base = this.baseUrl;

    // Si el endpoint no comienza con la base, se la concatenamos
    if (!url.startsWith(base) && !url.startsWith('http')) {
      // Evitar dobles slashes si la base termina en / y el endpoint empieza con /
      const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
      const cleanEndpoint = url.startsWith('/') ? url : '/' + url;
      url = `${cleanBase}${cleanEndpoint}`;
    } else if (url.startsWith('http')) {
      // Si es una URL absoluta, la pasamos por fixUrl para usar el proxy
      url = this.fixUrl(url);
    }

    return this.http.get<T>(url, { params: finalParams });
  }

  /**
   * Obtiene el stock aprobado con soporte para búsqueda unificada y límite de resultados.
   * @param urlOrSearch URL de paginación o término de búsqueda.
   * @param top Límite de resultados opcional (ej: 1000).
   */
  getStockAprobado(urlOrSearch?: string, top?: number): Observable<any> {
    if (urlOrSearch && (urlOrSearch.includes('StockAprobado') || urlOrSearch.includes('/api/'))) {
      let finalUrl = this.fixUrl(urlOrSearch);

      // Si la URL es relativa (ej: "StockAprobado/?page=2"), le ponemos la base
      if (!finalUrl.startsWith('/') && !finalUrl.startsWith('http')) {
        finalUrl = this.baseUrl + finalUrl;
      }

      // Asegurar parámetros necesarios en URL de paginación
      if (top && !finalUrl.includes('top=')) {
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + `top=${top}`;
      }
      if (!finalUrl.includes('format=json')) {
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + `format=json`;
      }

      return this.http.get<any>(finalUrl);
    }

    let params = new HttpParams();
    if (urlOrSearch) {
      params = params.set('buscar', urlOrSearch);
    }
    if (top) {
      params = params.set('top', top.toString());
    }
    return this.get('StockAprobado/', params);
  }

  /**
   * Obtiene el inventario de almacenaje con soporte para múltiples filtros.
   * @param paramsOrUrl Objeto con filtros o URL de paginación.
   * @param top Límite de resultados opcional.
   */
  getStockInventario(paramsOrUrl?: any, top?: number): Observable<any> {
    if (typeof paramsOrUrl === 'string' && (paramsOrUrl.includes('StockInventario') || paramsOrUrl.includes('/api/'))) {
      let finalUrl = this.fixUrl(paramsOrUrl);
      if (!finalUrl.startsWith('/') && !finalUrl.startsWith('http')) {
        finalUrl = this.baseUrl + finalUrl;
      }
      if (top && !finalUrl.includes('top=')) {
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + `top=${top}`;
      }
      if (!finalUrl.includes('format=json')) {
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + `format=json`;
      }
      return this.http.get<any>(finalUrl);
    }

    let httpParams = new HttpParams();
    
    if (typeof paramsOrUrl === 'object' && paramsOrUrl !== null) {
      Object.keys(paramsOrUrl).forEach(key => {
        if (paramsOrUrl[key]) {
          httpParams = httpParams.set(key, paramsOrUrl[key]);
        }
      });
    } else if (typeof paramsOrUrl === 'string' && paramsOrUrl) {
      // Soporte para query string manual o término de búsqueda simple
      if (paramsOrUrl.includes('=')) {
        const parts = paramsOrUrl.split('&');
        parts.forEach(p => {
          const [k, v] = p.split('=');
          httpParams = httpParams.set(k, decodeURIComponent(v));
        });
      } else {
        httpParams = httpParams.set('buscar', paramsOrUrl);
      }
    }

    if (top) {
      httpParams = httpParams.set('top', top.toString());
    }

    return this.get('StockInventario/', httpParams);
  }

  /**
   * Ajusta una URL absoluta (del backend) para que use el proxy local '/api-proxy/'.
   * Esto evita problemas de CORS y "localhost" en desarrollo y producción.
   */
  private fixUrl(url: string): string {
    if (!url) return '';

    return url.replace(/^https?:\/\/[^\/]+/, '');
  }
}
