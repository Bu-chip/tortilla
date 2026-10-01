# Operación y recuperación de Tortillas

## Actualizar un piloto existente

1. Conservar una exportación completa de D1 o el punto de recuperación actual antes de actualizar.
2. Ejecutar `cloud/actualizar-gestion.sql` en la base existente. Es aditivo y repetible; el resultado esperado es **10 tablas y 3 migraciones**. `crear-tablas.sql` se reserva para instalaciones vacías.
3. Ejecutar `npm run cloud:preparar`. Sustituir todo el código del Worker por `dist/worker/pegar-en-cloudflare.js` y publicar desde el panel. Mantener el binding `DB` y las variables ya configuradas.
4. Comprobar `/api/config`: debe incluir `funciones.gestionCuenta: 1`. La web es compatible con el Worker anterior, pero oculta la gestión nueva hasta recibir esta marca.
5. Probar entrada, guardado y edición con una cuenta invitada; otra persona no debe poder modificar esa visita. La API debe seguir rechazando las peticiones sin sesión.

El programador del Worker limpia contadores caducados. **No hace copias**. Las siguientes copias usan un flujo independiente de GitHub.

## Activar copias cifradas

En GitHub → Settings → Secrets and variables → Actions:

| Tipo | Nombre | Contenido |
| --- | --- | --- |
| Secret | `CLOUDFLARE_BACKUP_TOKEN` | Token de Cloudflare con D1 Read, limitado a la cuenta del proyecto. No usar la clave global. |
| Secret | `BACKUP_PASSWORD` | Clave aleatoria de al menos 32 caracteres. Conservar otra copia en un gestor de contraseñas. |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Identificador de la cuenta de Cloudflare. |
| Variable | `CLOUDFLARE_DATABASE_ID` | Identificador de la base D1 de Tortillas. |
| Variable | `BACKUPS_ENABLED` | `true`, después de completar los pasos anteriores. |

El token se introduce personalmente en GitHub; no se pega en conversaciones, código ni archivos del repositorio. D1 Read puede abarcar otras bases de la cuenta: revisar el alcance que muestra Cloudflare antes de crearlo.

Ejecutar manualmente «Copia cifrada de Tortillas» y comprobar que termina en verde y ofrece un archivo `copia-d1-…`. Cada ejecución exporta toda la base, cifra con AES-256-GCM y una clave derivada mediante scrypt, abre de nuevo la copia cifrada y restaura en una base temporal. Comprueba integridad, referencias y tablas. Solo se adjunta el archivo cifrado.

La programación es diaria a las 03:45 UTC; los archivos caducan a los 30 días. Descargar periódicamente una copia cifrada a otro lugar y conservar su clave. Las copias completas incluyen comentarios privados: solo el responsable debe disponer de la clave. Los archivos de GitHub pueden ser visibles en un repositorio público, pero su contenido está cifrado.

GitHub puede retrasar la ejecución y desactiva la programación de repositorios públicos tras 60 días sin actividad. Revisar las ejecuciones, habilitar las notificaciones de fallos y reactivar el flujo si se deshabilita. No se considera operativo hasta que la primera exportación real y su recuperación hayan terminado bien. La exportación D1 puede bloquear consultas mientras dura; por eso se programa de madrugada.

## Abrir una copia sin sobrescribir nada

Con Node 24 y las dependencias del proyecto instaladas, cargar `BACKUP_PASSWORD` desde el gestor de secretos del terminal (no escribirla literalmente en el historial):

```sh
node cloud/herramientas/copias.js verificar /ruta/copia-d1.enc
node cloud/herramientas/copias.js restaurar-local /ruta/copia-d1.enc /ruta/nueva.sqlite
```

El destino debe ser nuevo. La herramienta rechaza rutas existentes, claves incorrectas y archivos alterados. La copia local contiene datos privados.

Para ensayar una recuperación **remota**, crear primero otra base D1 vacía, por ejemplo `tortillas-ensayo-recuperacion`. Extraer el SQL a un archivo privado:

```sh
node cloud/herramientas/copias.js extraer-sql /ruta/copia-d1.enc /ruta/recuperacion.sql
```

Crear un archivo de configuración separado apuntando únicamente a esa base nueva y ejecutar personalmente:

```sh
npx wrangler d1 execute DB --remote --config /ruta/config-ensayo.jsonc --file /ruta/recuperacion.sql
```

Comprobar tablas, recuentos y varias visitas en esa base antes de cambiar cualquier binding. No apuntar este comando a la base en uso. No subir el SQL a GitHub. Tras el ensayo, eliminar las copias descifradas que ya no hagan falta.

## Bajas y recuperación

La baja elimina nombre, visitas, comentarios, preferencias y pertenencias en D1; conserva el catálogo compartido sin autoría. Después elimina el acceso de Firebase mediante confirmación reciente. Si esa segunda parte se interrumpe, el siguiente acceso permite completarla; un hash del identificador bloquea la reactivación del perfil anterior.

Las copias antiguas pueden contener datos anteriores a la baja hasta su caducidad. Antes de reabrir una restauración antigua, reconciliar **las bajas posteriores**: conservar los marcadores actuales de `bajas_cuenta` y contrastar los identificadores con los usuarios actuales de Firebase. Eliminar en la base restaurada los datos personales que ya se habían borrado. No reabrir a los miembros hasta terminarlo. No recrear automáticamente cuentas de Firebase desde una copia antigua.

## Qué no contiene la copia D1

Firebase conserva los accesos y contraseñas. D1 conserva el identificador de la cuenta, las visitas y los permisos del grupo; no las contraseñas de Firebase. Conservar aparte el proyecto Firebase, proveedores habilitados, dominios autorizados, política de contraseñas, plantillas de correo y acceso del propietario. Para una estrategia de recuperación de Firebase, su propietario puede exportar usuarios con Firebase CLI y custodiar el resultado y parámetros de hashes de forma privada. Eso requiere permisos adicionales y no forma parte del token D1 ni de este flujo.

Conservar también el binding D1, las variables del Worker y el secreto del propietario en un gestor privado. La configuración pública de Firebase no sustituye una copia de usuarios.

## Comprobación real antes de ampliar el grupo

- Propietario: entrar con Google, guardar una visita, recargar y editarla.
- Segunda cuenta: aceptar una invitación, entrar con correo verificado, guardar y editar su propia visita. No debe ver comentarios privados ajenos ni poder editarlos.
- Recuperar contraseña desde el correo real. Probar «Recordarme» al cerrar y abrir el navegador en un dispositivo personal.
- Anular una invitación y comprobar que un usuario nuevo no puede usarla; retirar y readmitir a un miembro de prueba.
- Probar salida y baja solo con una cuenta de prueba cuyos datos se puedan borrar.
- Hacer una copia real, descargarla, recuperarla en otra base y comparar recuentos.
- Comprobar en un teléfono real el teclado, el lector de pantalla y los recorridos principales.

Las pruebas automatizadas usan cuentas y bases ficticias. No certifican entrega de correo, popups de Google, una exportación remota real ni el estado de facturación o registros del panel.

Referencias oficiales: [exportar/importar D1](https://developers.cloudflare.com/d1/best-practices/import-export-data/), [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/), [límites de programación de GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [gestionar cuentas Firebase](https://firebase.google.com/docs/auth/web/manage-users), [exportar usuarios Firebase](https://firebase.google.com/docs/cli/auth).
