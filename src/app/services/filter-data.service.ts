import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { HttpParams } from '@angular/common/http';
import { firstValueFrom, forkJoin, map } from 'rxjs';

/**
 * Servicio para gestionar la carga y caché de las listas de filtros de stock.
 * Guarda los datos en localStorage por 7 días para minimizar consultas.
 */
@Injectable({
  providedIn: 'root'
})
export class FilterDataService {
  private apiService = inject(ApiService);

  public proveedores = signal<string[]>([]);
  public grupos = signal<string[]>([]);
  public lineas = signal<string[]>([]);
  public loading = signal(false);

  private readonly CACHE_KEY = 'SURGICORP_FILTERS_CACHE';
  private readonly CACHE_DAYS = 7;

  constructor() {
    this.init();
  }

  /**
   * Inicializa las listas cargando desde caché o API.
   */
  public init(forzar = false) {
    if (!forzar && this.cargarDesdeCache()) {
      return;
    }
    this.cargarDesdeApi();
  }

  /**
   * Intenta cargar los datos desde el localStorage.
   */
  private cargarDesdeCache(): boolean {
    const cached = localStorage.getItem(this.CACHE_KEY);
    if (!cached) return false;

    try {
      const { data, timestamp } = JSON.parse(cached);
      const diffDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);

      if (diffDays < this.CACHE_DAYS) {
        this.proveedores.set(data.proveedores);
        this.grupos.set(data.grupos);
        this.lineas.set(data.lineas);
        return true;
      }
    } catch (e) {
      console.error('Error al parsear caché de filtros:', e);
    }
    return false;
  }

  /**
   * Carga los datos desde la API manejando paginación completa.
   */
  private async cargarDesdeApi() {
    this.loading.set(true);
    console.log('Cargando listas de filtros desde API (Paginación completa)...');

    try {
      const [provs, grps, lins] = await Promise.all([
        this.fetchAllRecords('SI_Proveedor/'),
        this.fetchAllRecords('SI_Grupo/'),
        this.fetchAllRecords('SI_Linea/')
      ]);

      // Eliminar duplicados (Distinct) manteniendo el orden del backend
      const uniqueProvs = [...new Set(provs)];
      const uniqueGrps = [...new Set(grps)];
      const uniqueLins = [...new Set(lins)];

      this.proveedores.set(uniqueProvs);
      this.grupos.set(uniqueGrps);
      this.lineas.set(uniqueLins);

      localStorage.setItem(this.CACHE_KEY, JSON.stringify({
        data: { proveedores: uniqueProvs, grupos: uniqueGrps, lineas: uniqueLins },
        timestamp: Date.now()
      }));

      console.log('Listas de filtros cargadas con éxito:', { provs: provs.length, grps: grps.length, lins: lins.length });
    } catch (err) {
      console.error('Error cargando listas de filtros:', err);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Método auxiliar para obtener todos los registros de un endpoint siguiendo la paginación.
   */
  private async fetchAllRecords(endpoint: string): Promise<string[]> {
    let allNames: string[] = [];
    let nextUrl: string | null = `${endpoint}${endpoint.includes('?') ? '&' : '?'}top=1000`;

    while (nextUrl) {
      const res: any = await firstValueFrom(this.apiService.get<any>(nextUrl));
      if (!res) break;

      const names = (res.results || []).map((i: any) => i.nombre);
      allNames = [...allNames, ...names];
      nextUrl = res.next || null;
      // Ajustar URL si es absoluta para que use el proxy (ApiService ya lo hace internamente en get)
    }

    return allNames;
  }

}
