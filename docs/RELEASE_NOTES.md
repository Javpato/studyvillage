# StudyVillage 1.0.0-dev.8

Esta entrega reúne los cambios de la aldea posteriores a dev.7 y actualiza los cuatro instaladores al mismo código.

## Novedades

- Solicitudes de amistad: enviar, aceptar, rechazar y cancelar; aceptación mutua y recuperación al reconectar a un servidor actualizado.
- Avisos de amistad y voz: uno a la vez, sin sonido ni cola, cierre inmediato y acceso a la solicitud.
- Audio opcional al compartir pantalla. Cada espectador puede mover, redimensionar, minimizar y restaurar sus ventanas sin cambiar la vista de los demás.
- Mando estándar: sección propia en Ajustes con guía USB/Bluetooth, selección, prueba y navegación de menús, aldea y Bloques del Bosque. Para escribir y dibujar se usa teclado, ratón o pantalla táctil.
- Bloques del Bosque: juego a la izquierda y cámaras a la derecha, botón exterior para ocultar vídeo localmente y terminar junto a comenzar. Incluye dificultades, práctica y rivales NPC.
- Correcciones de contención en teléfono, teclado del código de aldea en iPad, distribución del jardín y estabilidad de tamaño con zoom. Controles de llamada predeterminados abajo a la izquierda en ordenador.
- Organización del teléfono por carpetas, mejoras de arrastre y descripciones/previsualización de sprites. Se retira la estación de proyectos de la plaza; sus datos y otros accesos se conservan.
- Reloj flotante: arrastre sin saltos después de editar los controles, tamaño contenido en teléfono y posición/visibilidad conservadas al recargar.
- README y manual técnico reorganizados por funciones y componentes.

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
