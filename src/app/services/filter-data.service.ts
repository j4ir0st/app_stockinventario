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
  public depositos = signal<string[]>([]);
  public empresas = signal<{ id: number; empresa: string }[]>([]);
  public loading = signal(false);

  private readonly CACHE_KEY = 'SURGICORP_FILTERS_CACHE_V2';
  private readonly CACHE_DAYS = 7;

  constructor() {
    this.init();
  }

  /**
   * Inicializa las listas cargando desde caché o API.
   * @param forzar Si es true, ignora la caché, la elimina y recarga desde la API.
   */
  public init(forzar = false) {
    if (forzar) {
      console.log('Forzando recarga de listas de filtros: Limpiando caché...');
      localStorage.removeItem(this.CACHE_KEY);
      // Limpiar señales para que la UI sepa que se están recargando
      this.proveedores.set([]);
      this.grupos.set([]);
      this.lineas.set([]);
      this.depositos.set([]);
      this.empresas.set([]);
    }

    if (!forzar && this.cargarDesdeCache()) {
      return;
    }
    this.cargarDesdeApi(forzar);
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
        this.proveedores.set(data.proveedores || []);
        this.grupos.set(data.grupos || []);
        this.lineas.set(data.lineas || []);
        this.empresas.set(data.empresas || []);
        // Los depósitos se actualizan dinámicamente desde los datos de stock
        console.log('Filtros cargados desde caché local.');
        return true;
      }
    } catch (e) {
      console.error('Error al parsear caché de filtros:', e);
      localStorage.removeItem(this.CACHE_KEY);
    }
    return false;
  }

  /**
   * Carga los datos desde la API manejando paginación completa.
   * @param bypassCache Si es true, añade un timestamp a las peticiones para evitar caché del navegador.
   */
  private async cargarDesdeApi(bypassCache = false) {
    this.loading.set(true);
    console.log(`Cargando listas de filtros desde API (BypassCache: ${bypassCache})...`);

    try {
      const [provs, grps, lins, empresasCompletas] = await Promise.all([
        this.fetchAllRecords('SI_Proveedor/', 'consolidado', bypassCache),
        this.fetchAllRecords('SI_Grupo/', 'nombre', bypassCache),
        this.fetchAllRecords('SI_Linea/', 'nombre', bypassCache),
        this.fetchEmpresasCompletas(bypassCache)
      ]);

      // Eliminar duplicados, valores nulos/vacíos y limpiar espacios
      const limpiarLista = (lista: string[]) => {
        return [...new Set(lista.filter(i => i && i.trim() !== '').map(i => i.trim()))].sort();
      };

      const uniqueProvs = limpiarLista(provs);
      const uniqueGrps = limpiarLista(grps);
      const uniqueLins = limpiarLista(lins);

      this.proveedores.set(uniqueProvs);
      this.grupos.set(uniqueGrps);
      this.lineas.set(uniqueLins);
      this.empresas.set(empresasCompletas);

      // Guardar en caché con el timestamp actual
      localStorage.setItem(this.CACHE_KEY, JSON.stringify({
        data: { proveedores: uniqueProvs, grupos: uniqueGrps, lineas: uniqueLins, empresas: empresasCompletas },
        timestamp: Date.now()
      }));

      console.log('Listas de filtros actualizadas y guardadas en caché:', {
        proveedores: { total: uniqueProvs.length, primeros: uniqueProvs.slice(0, 5) },
        grupos: { total: uniqueGrps.length, primeros: uniqueGrps.slice(0, 5) },
        lineas: { total: uniqueLins.length, primeros: uniqueLins.slice(0, 5) }
      });

      // Verificación especial para el usuario: buscar si el registro "CIRUGIA GENERAL" aún viene de la API
      const errorItem = uniqueLins.find(l => l.toUpperCase().includes('CIRUGIA GENERAL') && !l.includes('Í'));
      if (errorItem) {
        console.warn('⚠️ ALERTA: El registro "CIRUGIA GENERAL" (sin tilde) SIGUE VINIENDO DE LA API:', errorItem);
      } else {
        console.log('✅ El registro "CIRUGIA GENERAL" (sin tilde) ya no se encuentra en la respuesta de la API.');
      }
    } catch (err) {
      console.error('Error crítico cargando listas de filtros:', err);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Método auxiliar para obtener todos los registros de un endpoint siguiendo la paginación.
   */
  private async fetchAllRecords(endpoint: string, field: string = 'nombre', bypassCache = false): Promise<string[]> {
    let allNames: string[] = [];
    let pageCount = 1;
    let nextUrl: string | null = `${endpoint}${endpoint.includes('?') ? '&' : '?'}top=1000`;
    
    if (bypassCache) {
      nextUrl += `&_t=${Date.now()}`;
    }

    while (nextUrl) {
      try {
        // Log para que el usuario pueda ver la URL exacta y probarla en su navegador
        console.log(`[API Fetch] Página ${pageCount} de ${endpoint}:`, nextUrl);
        
        const res: any = await firstValueFrom(this.apiService.get<any>(nextUrl));
        if (!res) break;

        const results = res.results || [];
        const names = results.map((i: any) => i[field] || i.nombre);
        
        // Búsqueda inmediata del error para saber en qué página está
        const found = names.find((n: string) => n && n.toUpperCase().includes('CIRUGIA GENERAL') && !n.includes('Í'));
        if (found) {
          console.warn(`🎯 ¡REGISTRO ENCONTRADO! "${found}" está en la PÁGINA ${pageCount} de ${endpoint}`);
          console.warn(`🔗 URL de la página con el error:`, nextUrl);
        }

        allNames = [...allNames, ...names];
        nextUrl = res.next || null;
        pageCount++;
        
        if (nextUrl && bypassCache && !nextUrl.includes('_t=')) {
          nextUrl += (nextUrl.includes('?') ? '&' : '?') + `_t=${Date.now()}`;
        }
      } catch (e) {
        console.error(`Error en fetchAllRecords para ${endpoint}:`, e);
        break;
      }
    }

    return allNames;
  }

  /**
   * Actualiza la lista de depósitos con los valores únicos de almacenaje
   * extraídos desde los items de stock ya cargados (sin consultas adicionales al servidor).
   */
  public actualizarDepositos(items: any[]): void {
    const unicos = [...new Set(
      items
        .map(i => i.almacenaje as string)
        .filter(a => a && a.trim() !== '' && a !== 'STOCK CERO')
    )].sort();

    // Solo actualizar si hay valores nuevos para evitar renders innecesarios
    if (unicos.length > 0) {
      this.depositos.set(unicos);
    }
  }

  /**
   * Carga todos los registros de la tabla Empresa para tener el mapeo nombre → id.
   * Se ejecuta una única vez y se guarda en caché junto al resto de filtros.
   * @param bypassCache Si es true, añade timestamp para evitar caché del navegador.
   */
  private async fetchEmpresasCompletas(bypassCache = false): Promise<{ id: number; empresa: string }[]> {
    const resultados: { id: number; empresa: string }[] = [];
    let nextUrl: string | null = `Empresa/?top=1000`;

    if (bypassCache) {
      nextUrl += `&_t=${Date.now()}`;
    }

    while (nextUrl) {
      try {
        const res: any = await firstValueFrom(this.apiService.get<any>(nextUrl));
        if (!res) break;

        const results = res.results || (Array.isArray(res) ? res : []);
        results.forEach((item: any) => {
          if (item.id && item.empresa) {
            resultados.push({ id: item.id, empresa: item.empresa });
          }
        });

        nextUrl = res.next || null;
        if (nextUrl && bypassCache && !nextUrl.includes('_t=')) {
          nextUrl += (nextUrl.includes('?') ? '&' : '?') + `_t=${Date.now()}`;
        }
      } catch (e) {
        console.error('Error al cargar tabla Empresa:', e);
        break;
      }
    }

    console.log(`Tabla Empresa cargada: ${resultados.length} empresas.`);
    return resultados;
  }

  /**
   * Busca el cod_empresa en la caché local a partir del nombre de empresa
   * extraído del campo almacenaje ([empresa] | [tipo_almacenaje] | [tipo_almacen]).
   * Retorna el id como string (la API Stock_ERP acepta el formato "01", "1", etc.).
   * @param nombre Nombre de la empresa a buscar.
   */
  public buscarCodEmpresa(nombre: string): string {
    if (!nombre) return '';
    const nombreNorm = nombre.trim().toLowerCase();
    const lista = this.empresas();

    // Coincidencia exacta primero (case-insensitive)
    let encontrada = lista.find(e => e.empresa.trim().toLowerCase() === nombreNorm);

    // Si no hay exacta, buscar si el nombre del almacenaje contiene el nombre de empresa
    if (!encontrada) {
      encontrada = lista.find(e => nombreNorm.includes(e.empresa.trim().toLowerCase()));
    }

    // Último intento: si el nombre de empresa contiene el término buscado
    if (!encontrada) {
      encontrada = lista.find(e => e.empresa.trim().toLowerCase().includes(nombreNorm));
    }

    if (!encontrada) {
      console.warn(`No se encontró empresa en caché para: "${nombre}"`);
      return '';
    }

    return String(encontrada.id).padStart(2, '0');
  }

}
