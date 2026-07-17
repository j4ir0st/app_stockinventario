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

    // Añadir headers para evitar caché del navegador y proxies
    const headers = {
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0, post-check=0, pre-check=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    };

    return this.http.get<T>(url, { params: finalParams, headers });
  }

  /**
   * Obtiene el detalle de stock ERP filtrado por múltiples parámetros.
   * Usado para la vista detalle del StockInventario.
   * @param filtros Objeto con los filtros: tipo_producto, codigo_producto, cod_empresa, tipo_almacenaje, tipo_almacen.
   * @param top Límite de resultados por página (por defecto 1000).
   */
  getStockERP(filtros: { tipo_producto?: string; codigo_producto?: string; cod_empresa?: string; tipo_almacenaje?: string; tipo_almacen?: string }, top: number = 1000): Observable<any> {
    let params = new HttpParams().set('top', top.toString());
    if (filtros.tipo_producto)   params = params.set('tipo_producto',   filtros.tipo_producto);
    if (filtros.codigo_producto) params = params.set('codigo_producto', filtros.codigo_producto);
    if (filtros.cod_empresa)     params = params.set('cod_empresa',     filtros.cod_empresa);
    if (filtros.tipo_almacenaje) params = params.set('tipo_almacenaje', filtros.tipo_almacenaje);
    if (filtros.tipo_almacen)    params = params.set('tipo_almacen',    filtros.tipo_almacen);
    return this.get<any>('Stock_ERP/', params);
  }

  /**
   * Obtiene una página adicional de Stock_ERP usando la URL relativa devuelta por la API.
   * @param urlPagina URL relativa de la siguiente página.
   */
  getStockERPPagina(urlPagina: string): Observable<any> {
    let finalUrl = this.fixUrl(urlPagina);
    if (!finalUrl.startsWith('/') && !finalUrl.startsWith('http')) {
      const base = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
      finalUrl = `${base}/${finalUrl}`;
    }
    if (!finalUrl.includes('format=json')) {
      finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'format=json';
    }
    return this.get<any>(finalUrl);
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
      return this.get<any>(finalUrl);
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
