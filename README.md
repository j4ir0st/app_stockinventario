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
| **0.3.0** | 2026-05-04 | Separación de aplicaciones: El proyecto ahora se centra únicamente en Stock Inventario. Se eliminó Stock Aprobado. |
| **0.2.0** | 2026-04-30 | Implementación de refresco global desde el header con animaciones y actualización de contexto (Stock Aprobado / Inventario). |
| **0.1.0** | 2026-04-24 | Inicialización del proyecto Angular, configuración de Docker y estructura base. |

---
*Este documento se mantendrá actualizado con cada mejora significativa del sistema.*
