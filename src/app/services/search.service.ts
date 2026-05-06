import { Injectable, signal } from '@angular/core';

export interface FiltrosBusqueda {
  prod_id__prov_id__nombre__contains: string;
  prod_id__grupo_id__nombre__contains: string;
  prod_id__linea_id__nombre__contains: string;
  buscar: string;
  tipo_producto: string; // Para MER e IM-CIN (CIN,IM)
}

@Injectable({
  providedIn: 'root'
})
export class SearchService {
  // Estado global de los filtros con nombres exactos de la API
  public filtros = signal<FiltrosBusqueda>({
    prod_id__prov_id__nombre__contains: '',
    prod_id__grupo_id__nombre__contains: '',
    prod_id__linea_id__nombre__contains: '',
    buscar: '',
    tipo_producto: ''
  });


  // Fecha y hora de la última actualización
  public ultimaActualizacion = signal<string>('');
  public fechaActualizacion = signal<string>('');
  public horaActualizacion = signal<string>('');

  constructor() {
    this.actualizarFecha();
  }

  /**
   * Actualiza un filtro específico.
   * @param key Clave del filtro.
   * @param value Valor del filtro.
   */
  patchFiltros(key: keyof FiltrosBusqueda, value: string) {
    this.filtros.update(f => ({ ...f, [key]: value }));
  }

  /**
   * Actualiza la fecha de actualización al momento actual con formato AM/PM.
   */
  actualizarFecha() {
    const ahora = new Date();

    const fechaStr = ahora.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    const horaStr = ahora.toLocaleTimeString('es-PE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).toUpperCase();

    this.fechaActualizacion.set(fechaStr);
    this.horaActualizacion.set(horaStr);
    this.ultimaActualizacion.set(`${fechaStr} ${horaStr}`);
  }

  /**
   * Limpia todos los filtros.
   */
  limpiarFiltros() {
    this.filtros.set({
      prod_id__prov_id__nombre__contains: '',
      prod_id__grupo_id__nombre__contains: '',
      prod_id__linea_id__nombre__contains: '',
      buscar: '',
      tipo_producto: ''
    });

  }

}
