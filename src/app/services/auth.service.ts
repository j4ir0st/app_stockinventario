import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthResponse, User } from '../interfaces/auth.interface';
import { ConfigService } from './config.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private configService = inject(ConfigService);

  // Señales reactivas para el estado del usuario
  currentUser = signal<User | null>(null);
  isAuthenticated = signal<boolean>(false);

  constructor() {
    this.checkSession();
  }

  /**
   * Obtiene el token de acceso desde el almacenamiento local.
   */
  get token(): string | null {
    return localStorage.getItem('token');
  }

  /**
   * Intenta iniciar sesión con las credenciales proporcionadas.
   * Utiliza el endpoint '/api-proxy/api/token/' configurado en el proxy.
   */
  async login(username: string, password: string): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.post<AuthResponse>(`${this.configService.apiUrl()}api/token/`, { username, password })
      );

      if (response && response.access) {
        this.saveSession(response);
      }
    } catch (error) {
      console.error('Error en AuthService.login:', error);
      throw error;
    }
  }

  /**
   * Cierra la sesión y limpia el almacenamiento local.
   */
  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh');
    localStorage.removeItem('user');

    this.currentUser.set(null);
    this.isAuthenticated.set(false);

    this.router.navigate(['/login']);
  }

  /**
   * Guarda la sesión en el almacenamiento local y actualiza las señales.
   */
  private saveSession(data: AuthResponse): void {
    const user = data.user;

    // Corregir ruta del avatar
    if (user.avatar && !user.avatar.startsWith('http')) {
      const avatarPath = user.avatar.startsWith('/') ? user.avatar : `/${user.avatar}`;
      user.avatar = `${avatarPath}`;
    }

    // BLINDAJE: Si el backend envía el área correcta en el campo 'area', 
    // nos aseguramos de que no sea sobrescrita por lógica externa.
    // Además, si el objeto trae 'area_id' como objeto, extraemos el nombre jerárquico 
    // en una propiedad distinta para evitar confusiones.
    const userToSave: any = { ...user };
    
    localStorage.setItem('token', data.access);
    localStorage.setItem('refresh', data.refresh);
    localStorage.setItem('user', JSON.stringify(userToSave));

    this.currentUser.set(userToSave);
    this.isAuthenticated.set(true);
  }

  /**
   * Verifica si existe una sesión activa al iniciar el servicio.
   */
  private checkSession(): void {
    try {
      const userJson = localStorage.getItem('user');
      const token = localStorage.getItem('token');

      if (userJson && userJson !== 'undefined' && token) {
        const user = JSON.parse(userJson);
        if (user) {
          this.currentUser.set(user);
          this.isAuthenticated.set(true);
        }
      }
    } catch (error) {
      console.error('Error recuperando sesión:', error);
      this.logout();
    }
  }
}
