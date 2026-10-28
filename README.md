# UrbanInspect • Inspección de Infraestructura Urbana (DMQ)

**Escuela Politécnica Nacional (EPN) — ESFOT**  
**Asignatura:** Desarrollo de Aplicaciones Móviles  
**Tecnologías:** Ionic + Angular Standalone + Capacitor + TypeScript  

---

## 1. Descripción del Proyecto

**UrbanInspect** es una aplicación móvil diseñada para los inspectores municipales del Distrito Metropolitano de Quito (DMQ). Permite consultar, registrar, dar seguimiento local y actualizar el estado de incidencias de infraestructura urbana (*luminarias dañadas, baches, señalización deteriorada, alcantarillas obstruidas y daños en parques*) con evidencia fotográfica, geolocalización GPS/manual y consulta de condiciones meteorológicas en tiempo real antes del registro.

---

## 2. Instrucciones de Ejecución

### Requisitos previos
- **Node.js** (v20 o superior) y **npm**
- **Ionic CLI** / **Angular CLI**
- **Android Studio** (SDK de Android configurado para emulador o dispositivo físico)

### 2.1 Instalación de dependencias
```bash
cd urban-inspect
npm install
```

### 2.2 Ejecución en entorno de desarrollo (Navegador)
```bash
npm start
# o bien:
ionic serve
```

### 2.3 Compilación y despliegue en Android (APK / Emulador)
1. Compilar los activos web de producción:
   ```bash
   npm run build
   ```
2. Sincronizar el compilado web y los plugins nativos con el proyecto Android:
   ```bash
   npx cap sync android
   # o para copiar únicamente el build web:
   npx cap copy android
   ```
3. Abrir el proyecto en **Android Studio** para ejecutar en emulador/dispositivo o generar el APK (`Build > Build Bundle(s) / APK(s) > Build APK(s)`):
   ```bash
   npx cap open android
   ```

---

## 3. Dependencias Utilizadas y Justificación por Requisito

De acuerdo con la **Sección 4 (Restricciones y condiciones)**, cada dependencia adicional incorporada al proyecto responde directamente a un requisito funcional del cliente:

| Dependencia | Requisito que la justifica | Uso dentro de la aplicación |
| :--- | :--- | :--- |
| `@capacitor/preferences` | **R1** (Seguimiento local) y **R8** (Recuperación de registro incompleto) | Almacenamiento clave-valor persistente en el dispositivo para conservar la lista personal de códigos en seguimiento (`urbaninspect_seguimiento_codigos`) y el borrador del formulario (`urbaninspect_borrador_formulario`) al cerrar y reabrir la app. |
| `@capacitor/camera` | **R5** (Regla de prioridad alta) y **R6** (Evidencia fotográfica) | Captura nativa de fotografías desde la cámara o galería de Android, verificación/solicitud de permisos de cámara y control de cancelación de captura sin perder datos del formulario. |
| `@ionic/pwa-elements` | **R6** (Evidencia fotográfica) | Soporte de interfaz de cámara y hojas de acción cuando se prueba en entorno web antes de empaquetar en Android. |
| `@capacitor/geolocation` | **R7** (Ubicación de la incidencia) y **R4** (Clima por coordenadas) | Obtención de coordenadas GPS actuales (`latitud` y `longitud`) en campo y gestión de permisos de ubicación en Android. |
| `leaflet` y `@types/leaflet` | **R7** (Ubicación manual/visual) y **R10** (Interfaz de trabajo en campo) | Mapa interactivo de Quito que permite al inspector ubicar o ajustar visualmente las coordenadas cuando no dispone de señal/permiso GPS y visualizar la ubicación exacta desde el detalle de la incidencia. |

---

## 4. Justificación de las Decisiones Técnicas

### 4.1 Elección del servicio meteorológico externo: **Open-Meteo API** (`R4`)
- **URL:** `https://api.open-meteo.com/v1/forecast`
- **Justificación:**
  1. **Datos meteorológicos reales y precisos por coordenadas:** Permite consultar en una sola petición HTTP la temperatura actual (`current=temperature_2m`), la precipitación acumulada durante la última hora en milímetros (`current=precipitation`, `hourly=precipitation`, `past_hours=1`) y el código meteorológico estándar de la OMM (`weather_code`).
  2. **Sin exposición de credenciales en el repositorio:** Open-Meteo no requiere API Keys privadas para uso académico/no comercial, lo que cumple estrictamente la condición de la **Sección 6** (*"No publicar contraseñas ni credenciales reales"*).
  3. **Tolerancia a fallos y alerta de mantenimiento:** Se configuró un `timeout(8000)` y manejo de errores (`catchError`) que informa al inspector si el servicio no responde sin bloquear el guardado. Si la precipitación supera los `5 mm` en la última hora, activa automáticamente la advertencia de mantenimiento en campo (`alertaMantenimiento: true`).

### 4.2 Simulación del servicio de oficina y paginación remota: **MockAPI** (`R2`, `R3`, `R5`, `R9`)
- Se utiliza el recurso REST de incidencias en MockAPI consumido mediante `HttpClient` en `IncidenciasService`.
- **Paginación remota (`R3`):** El listado (`Tab2Page`) solicita grupos pequeños de **5 registros por página** enviando los parámetros `?page=X&limit=5&sortBy=fecha&order=desc`. Cuando el número de registros recibidos es menor al tamaño de página (`< 5`) o vacío (`0`), se marca `finDeRegistros = true` y se desactiva el componente `ion-infinite-scroll` para no realizar peticiones adicionales.

### 4.3 Persistencia de fotografías accesibles desde el detalle (`R6` y Sección 4)
- Para cumplir la restricción *"La fotografía debe permanecer accesible desde el detalle una vez guardado el registro; no basta con guardar una ruta temporal del dispositivo en la API"*, `LocationMediaService` procesa la imagen capturada mediante un `<canvas>` HTML5, redimensionándola a un ancho máximo de `600px` y comprimiéndola en formato JPEG (`DataURL Base64` al `50%` de calidad). De esta forma, la evidencia viaja y persiste directamente dentro del registro en MockAPI sin depender del sistema de archivos local del teléfono que la tomó.

### 4.4 Arquitectura Angular Standalone y sincronización reactiva (`R1`, `R8`, `R9`, `R10`)
- La aplicación está construida 100 % con **componentes Standalone** de Angular e Ionic.
- `IncidenciasService` expone el flujo `cambios$` (`Subject<void>`) y `StorageService` expone `seguidos$` (`BehaviorSubject<string[]>`), garantizando que cualquier alta de incidencia, transición de estado (`pendiente -> en proceso -> resuelta`) o cambio en el seguimiento local actualice de inmediato los indicadores del inicio (`Tab1Page`), el listado paginado (`Tab2Page`) y la vista de seguimiento (`Tab3Page`).

---

## 5. Resumen de Cumplimiento de Requisitos (R1 – R10)

- **R1 (Seguimiento local):** Marcado/desmarcado desde listado y detalle; vista exclusiva en la pestaña *Seguimiento*; persistencia local con `@capacitor/preferences` sin alterar MockAPI.
- **R2 (Consulta de incidencias):** Visualización de los 8 campos (`codigo`, `tipo`, `descripcion`, `direccion`, `sector`, `fecha`, `estado`, `fotografia`) y manejo de listas vacías y errores de red.
- **R3 (Carga progresiva):** Paginación remota (`page` y `limit=5`) con `ion-infinite-scroll` y bloqueo de peticiones al llegar al final.
- **R4 (Condiciones meteorológicas):** Consulta a Open-Meteo por coordenadas antes de guardar, alerta si la precipitación de la última hora supera los `5 mm` y continuidad ante fallos del servicio.
- **R5 (Registro de incidencias):** Validación de campos obligatorios y exigencia de fotografía cuando `prioridad === 'alta'`.
- **R6 (Evidencia fotográfica):** Previsualización previa al guardado, conservación de datos si se cancela la cámara y bloqueo explicativo si se deniega el permiso en prioridad alta.
- **R7 (Ubicación de la incidencia):** Captura por GPS, mapa interactivo o ingreso manual validado (`-90..90`, `-180..180`); obligatoria para incidencias de tipo `Bache` y opcional para los demás tipos.
- **R8 (Recuperación de registro incompleto):** Autoguardado inmediato en almacenamiento local y diálogo al abrir la app para **Continuar registro** o **Descartar**.
- **R9 (Actualización y reglas de estado):** Transiciones controladas (`pendiente -> en proceso | resuelta`, `en proceso -> resuelta`), bloqueo de cambios en estado `resuelta` y observación obligatoria al resolver.
- **R10 (Navegación y APK instalable):** Interfaz inspirada en la identidad visual de la Alcaldía Metropolitana de Quito, optimizada para trabajo en campo, con indicadores sincronizados y empaquetada para Android.

