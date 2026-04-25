import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { SidebarService } from '../../services/sidebar.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class HeaderComponent {
  public authService = inject(AuthService);
  public sidebarService = inject(SidebarService);
  public themeService = inject(ThemeService);
  
  constructor() {
    console.log('HeaderComponent initialized. Current user:', this.authService.currentUser());
  }
  
  isProfileOpen = signal(false);

  toggleSidebar() {
    this.sidebarService.toggle();
  }

  toggleProfile() {
    this.isProfileOpen.update((v: boolean) => !v);
  }

  logout() {
    this.authService.logout();
  }
}
