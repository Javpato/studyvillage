# StudyVillage 1.0.0-dev.9

Actualiza la web y los cuatro instaladores al mismo código, con mascotas personalizadas, dispositivos asociados y las correcciones posteriores a dev.8.

## Novedades

- Crea animales desde el **mueble Taller de mascotas**: dibuja o importa sus sprites, elige una habilidad existente y su casa. La app Mascotas conserva la gestión y edición de animales existentes; crear o duplicar requiere el taller. Se corrige el error de validación al colocar ese mueble.
- Nueva app **Dispositivos**, en la carpeta Ajustes del teléfono, con tres instrucciones breves. Abre StudyVillage en ambos equipos, introduce el código y el creador elige el jugador principal y las herramientas del compañero. También está en la biblioteca de apps.
- Cuaderno, pizarra, editores de personajes/animales, concentración y medios en el compañero. Para crear un animal desde él, abre primero el taller del jugador principal. El perfil del compañero se conserva.
- Las ayudas de controles reservan su altura real para no tapar el estudio en pantallas pequeñas.
- Edita el teléfono manteniendo un elemento pulsado **1 segundo**, o con clic derecho/F2. Iconos y colores de carpetas personalizables y ayudas según el dispositivo activo.
- Mascotas visibles con recursos reemplazables, casas diferenciadas, comida, caricias, seguimiento y bots. Ojos corregidos, salto del conejo, bola persistente del hámster y diálogo automático más compacto del loro.
- Pizarra y armario más fiables, diálogos NPC ajustables, ciclos automáticos de concentración/descanso, enlaces a repositorios y traducciones ES/EN/FR corregidas.
- El micrófono se conserva al desplazarse entre zonas de proximidad, y se inicializa al abrir una aldea. Salir de una sesión y cambiar de canal explícito siguen revocando la captura.

## Actualizar

La web instala la actualización al cerrar todas las ventanas anteriores de StudyVillage y volver a abrirla. Los instaladores nuevos incluyen el mismo cliente. Para solicitudes de amistad persistentes, actualiza también el servidor desde esta etiqueta y conserva su directorio de datos; actualizar el cliente no despliega el servidor automáticamente. No hay cambio destructivo de esquema ni reinicio de agendas, casas o cuadernos.

El audio compartido depende del navegador, sistema y fuente seleccionada. Bluetooth se empareja desde los ajustes del dispositivo. Las pruebas automatizadas incluyen dispositivos simulados; no certifican cada mando, teclado de iPad o configuración de captura de audio física.

## Descargar e instalar

Un solo archivo por sistema para instalar o abrir StudyVillage.

- **Windows x64:** ejecuta `StudyVillage-Setup-x64.exe`. Incluye toda la aplicación y permite elegir la carpeta de instalación sin pedir permisos de administrador.
- **Linux x64:** da permiso de ejecución a `StudyVillage-linux-x64.AppImage` y ábrelo.
- **macOS Intel y Apple Silicon:** abre `StudyVillage-macos-universal.dmg` y arrastra StudyVillage a Aplicaciones. Ambos equipos usan el mismo archivo.
- **Android:** instala `StudyVillage-development.apk`.

Los perfiles y cuadernos mantienen su ubicación anterior. Desinstalar desde Windows conserva los datos del jugador. El instalador contiene la aplicación completa; no descarga archivos del juego al instalar.

La publicación exige probar el contenido de los archivos entregados: instalación y desinstalación de Windows, AppImage con sandbox, el mismo DMG en Intel y Apple Silicon, e instalación y arranque del APK en emulador Android. Se adjuntan `SHA256SUMS` y `BUILD_INFO.json`.

Los instaladores de escritorio son de desarrollo, sin firma comercial ni notarización de Apple. El APK usa firma de desarrollo; exporta tus datos antes de desinstalar una versión Android anterior. iPhone/iPad siguen usando la [web instalable](https://javpato.github.io/studyvillage/).
