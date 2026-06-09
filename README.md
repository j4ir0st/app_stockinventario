# App Stock - Inventario

Proyecto para el control de inventario y gestión de atenciones de Surgicorp. Este proyecto consiste en un frontend desarrollado en **Angular** que se conecta a una API existente en **Django Rest Framework (DRF)**.

> [!IMPORTANT]
> **Separación de Aplicaciones**: Las aplicaciones de **Stock Inventario** y **App Stock Aprobados** han sido separadas. Este repositorio ahora se enfoca exclusivamente en **Stock Inventario**. La nueva ruta para el **App Stock Aprobados** es: `/app_stockaprobados/`.

## Propósito del Proyecto
El objetivo principal es proporcionar una interfaz moderna, intuitiva y eficiente para la administración de stock en almacenaje, permitiendo búsquedas rápidas por descripción de producto y código de producto, así como la visualización detallada de las existencias.

## Estructura del Proyecto
- **Frontend**: Aplicación Angular (v19+) utilizando Componentes Independientes (Standalone), Señales (Signals) y una arquitectura limpia.
- **Backend**: API externa en Django Rest Framework (acceso restringido).
- **Despliegue**: Contenerizado mediante Docker y orquestado con Docker Compose para facilitar la instalación en el servidor de producción.

## Implementación con Docker
Para desplegar la aplicación en un servidor, se utiliza Docker. El proceso compila la aplicación Angular y la sirve mediante un servidor Nginx optimizado.

### Requisitos
- Docker
- Docker Compose

### Pasos para la instalación
1. Clonar el repositorio.
2. Crear un archivo `.env` basado en la documentación interna (no incluido en el repositorio por seguridad).
3. Ejecutar el comando:
   ```bash
   docker-compose up -d --build
   ```

## Registro de Mejoras y Versiones

| Versión | Fecha | Descripción de Cambios |
| :--- | :--- | :--- |
| **0.6.0** | 2026-05-15 | **Personalización Dinámica de Temas**: Implementación de `ThemeService` con Angular Signals para personalización de colores primarios/secundarios en tiempo real con persistencia. Nuevo `ColorPicker` con glassmorphism. Refactorización global a variables CSS dinámicas (`color-mix`). Modo oscuro dinámico (oscurecimiento proporcional). Delineado de seguridad en títulos. Traslado definitivo de subtotales al Reporte General. |
| **0.5.4** | 2026-05-12 | Diferenciación de Reportes: Se eliminaron los subtotales por código del reporte de Heridas y Quemados, manteniéndolos únicamente en el Reporte General. Optimización de la función de exportación compartida. |
| **0.5.3** | 2026-05-08 | Mejoras de UX y Datos: Cierre automático del menú de perfil al hacer clic fuera, corrección del campo 'Tipo' en tabla y Excel, y optimización de exportación a Excel (exclusión de stock cero e inclusión de subtotales agrupados). Corrección de bucle infinito en búsqueda. |
| **0.5.2** | 2026-05-07 | Interfaz y Filtrado: Nueva columna de tipo, check de stock cero con lógica de registro especial ("STOCK CERO"), búsqueda en tiempo real con botón de limpieza y modernización de colores en login. |
| **0.5.1** | 2026-05-07 | Corrección de Autenticación: Se actualizó el interceptor de Angular para asegurar que el token JWT (Bearer) se envíe en todas las peticiones a las tablas de la API (StockInventario, StockAprobado, etc.), corrigiendo el error de "credenciales no provistas". |
| **0.5.0** | 2026-05-06 | Estabilización y Optimización: Migración a `firstValueFrom` (RxJS), nuevos dropdowns personalizados en sidebar con búsqueda en tiempo real, botones de limpieza individual (X) y lógica de filtrado OR por tipo de producto (`tipo_producto=CIN,IM`). Corrección de bug de paginación en ApiService e implementación de lógica 'Distinct' para listas maestras. Integración de imagen de montacarga en header. |
| **0.4.0** | 2026-05-05 | Rediseño estético: Sidebar rosa (#ff65c3) y Header gris (#d9d9d9). Nuevos filtros tipo combobox en sidebar (Proveedor, Grupo, Línea). Agrupación y suma de stock por código de producto. Renombramiento de columnas para mayor claridad. |

## Observaciones Técnicas (v0.6.0)

- **Personalización con Signals**: El estado de los colores primario y secundario se gestiona mediante `Angular Signals`, lo que permite una reactividad inmediata en toda la interfaz sin necesidad de recargar la página.
- **Glassmorphism & Estética Premium**: Se integró un `ColorPicker` avanzado con efectos de desenfoque de fondo (backdrop-filter), sombras dinámicas y micro-animaciones en el Header.
- **Modo Oscuro Dinámico**: A diferencia de versiones anteriores, el modo oscuro ahora calcula sus tonos de fondo y sidebar mediante `color-mix(in srgb, var(--primary/secondary), black X%)`. Esto garantiza que la interfaz se oscurezca de forma proporcional a los colores elegidos por el usuario, mejorando el confort visual.
- **Delineado de Seguridad (Outline)**: Se aplicó un `text-shadow` táctico a los títulos principales para asegurar que el texto sea legible incluso cuando el usuario elige colores extremadamente claros o muy similares al fondo.

## Observaciones Técnicas (v0.5.0)

- **Optimización de API**: Se han migrado las consultas de filtros al sufijo `__contains` para permitir búsquedas parciales. Se corrigió un bug en la recursión de páginas que duplicaba el prefijo base de la URL.
- **Búsqueda OR (Tipo Producto)**: El sistema envía el parámetro `&tipo_producto=CIN,IM` para realizar búsquedas combinadas, lo cual requiere soporte en el backend mediante un filtro personalizado (Q objects).
- **Gestión de Memoria**: Las listas maestras (Proveedor, Grupo, Línea) se cargan de forma asíncrona y se guardan en caché por 7 días. Se aplica un filtrado `Distinct` en el frontend para evitar mostrar nombres duplicados.
- **Modernización**: Se eliminó el uso de `.toPromise()` en favor de `firstValueFrom` de RxJS, alineando el proyecto con las mejores prácticas de Angular 19.

---
*Este documento se mantendrá actualizado con cada mejora significativa del sistema.*

