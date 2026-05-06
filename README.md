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
| **0.5.0** | 2026-05-06 | Estabilización y Optimización: Migración a `firstValueFrom` (RxJS), nuevos dropdowns personalizados en sidebar con búsqueda en tiempo real, botones de limpieza individual (X) y lógica de filtrado OR por tipo de producto (`tipo_producto=CIN,IM`). Corrección de bug de paginación en ApiService e implementación de lógica 'Distinct' para listas maestras. Integración de imagen de montacarga en header. |
| **0.4.0** | 2026-05-05 | Rediseño estético: Sidebar rosa (#ff65c3) y Header gris (#d9d9d9). Nuevos filtros tipo combobox en sidebar (Proveedor, Grupo, Línea). Agrupación y suma de stock por código de producto. Renombramiento de columnas para mayor claridad. |

## Observaciones Técnicas (v0.5.0)

- **Optimización de API**: Se han migrado las consultas de filtros al sufijo `__contains` para permitir búsquedas parciales. Se corrigió un bug en la recursión de páginas que duplicaba el prefijo base de la URL.
- **Búsqueda OR (Tipo Producto)**: El sistema envía el parámetro `&tipo_producto=CIN,IM` para realizar búsquedas combinadas, lo cual requiere soporte en el backend mediante un filtro personalizado (Q objects).
- **Gestión de Memoria**: Las listas maestras (Proveedor, Grupo, Línea) se cargan de forma asíncrona y se guardan en caché por 7 días. Se aplica un filtrado `Distinct` en el frontend para evitar mostrar nombres duplicados.
- **Modernización**: Se eliminó el uso de `.toPromise()` en favor de `firstValueFrom` de RxJS, alineando el proyecto con las mejores prácticas de Angular 19.

---
*Este documento se mantendrá actualizado con cada mejora significativa del sistema.*

