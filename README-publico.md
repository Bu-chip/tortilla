# Tortillas

Aplicación para valorar tortillas en grupo. Permite repetir visitas, comparar tu media con la de los demás y conservar las valoraciones históricas con su método original.

## Desarrollo local

Requiere Node.js 24 o superior para las herramientas de desarrollo.

```sh
npm ci
npm run demo
```

La demo se abre en http://localhost:3210 y usa personas y visitas ficticias. Su base es independiente de la versión alojada.

## Pruebas

```sh
npm test
npm run test:cloud
```

## Versión alojada

La interfaz se publica con GitHub Pages. El servidor utiliza Cloudflare Workers y D1; las cuentas utilizan Firebase Authentication con Google o correo y contraseña. Para acceder a los datos hace falta una cuenta verificada y pertenecer al grupo.

El repositorio contiene código y configuración de ejemplo. Las bases de datos y la configuración privada se guardan fuera del repositorio.

Para publicar la interfaz:

1. En Settings → Pages, seleccionar GitHub Actions como origen.
2. Crear la variable de repositorio TORTILLAS_API_URL con el origen HTTPS del Worker.
3. Ejecutar el flujo manual «Publicar web de tortillas».

Para preparar el servidor, usar las plantillas de cloud/ y ejecutar `npm run cloud:preparar`. El archivo resultante se genera en dist/worker/pegar-en-cloudflare.js. Las migraciones están en cloud/migraciones/.

La gestión incluye cambio de nombre, administración de miembros, salida del grupo y eliminación de datos con confirmación reciente. Consultar [operación, actualización y copias cifradas](cloud/OPERACIONES.md) antes de activar la versión nueva del servidor.

## Preparar próximas publicaciones

`npm run preparar:github` genera un paquete de código con una lista positiva de carpetas y un inventario en `dist/github-manifest.json`. Excluye los datos, referencias, documentos de trabajo y configuración privada. Revisar ese inventario antes de sincronizar con GitHub. La web se publica ejecutando el flujo de Pages; el servidor se actualiza aparte en Cloudflare.
