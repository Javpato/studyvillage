# StudyVillage 1.0.0-dev.11

Actualiza Windows, Linux, macOS y Android con la nueva interfaz de controles y las preferencias de mando desactivadas por defecto.

## Novedades

- Mando genérico en SVG, con acciones agrupadas por contexto, indicadores por posición física y resaltado al seleccionar acciones o pulsar botones.
- Ayuda para exploración, navegación y Forest Blocks, con teclado en una sección separada. Gartic y los demás minijuegos conservan sus controles reales.
- Ayuda flotante compacta en móvil, ocultación persistente y acceso permanente desde **Ajustes → Controles**, también sin mando conectado.
- **Activar mando** y **Mostrar ayuda flotante** están desactivados por defecto. Las preferencias explícitas ya guardadas se respetan; puedes cambiarlas desde Ajustes.
- Se reutiliza el mapeo estándar de la Gamepad API por posición física, sin depender de la marca. Los dispositivos sin correspondencia fiable muestran un aviso y mantienen disponible el teclado.
- La ayuda captura la entrada para evitar acciones involuntarias en el juego. La conexión y desconexión actualizan la interfaz sin recargar.

## Actualizar

Cierra todas las ventanas anteriores de la web y vuelve a abrirla para activar la actualización. Los cuatro instaladores contienen el mismo cliente. Se conservan los perfiles, casas, cuadernos y preferencias explícitas. Esta versión mantiene el protocolo de compañero 3 de dev.10; no introduce una migración destructiva. Actualizar el cliente no actualiza automáticamente el servidor.

La compatibilidad de mandos depende del mapeo que exponga el navegador o sistema; algunos requieren una primera pulsación para detectarlos. Las pruebas de entrada incluyen mandos simulados y no certifican todos los dispositivos físicos.

## Descargar e instalar

Un solo archivo por sistema para instalar o abrir StudyVillage.

- **Windows x64:** ejecuta `StudyVillage-Setup-x64.exe`. Incluye toda la aplicación y permite elegir la carpeta de instalación sin pedir permisos de administrador.
- **Linux x64:** da permiso de ejecución a `StudyVillage-linux-x64.AppImage` y ábrelo.
- **macOS Intel y Apple Silicon:** abre `StudyVillage-macos-universal.dmg` y arrastra StudyVillage a Aplicaciones. Ambos equipos usan el mismo archivo.
- **Android:** instala `StudyVillage-development.apk`.

Los perfiles y cuadernos mantienen su ubicación anterior. Desinstalar desde Windows conserva los datos del jugador. El instalador contiene la aplicación completa; no descarga archivos del juego al instalar.

La publicación exige probar el contenido de los archivos entregados: instalación y desinstalación de Windows, AppImage con sandbox, el mismo DMG en Intel y Apple Silicon, e instalación y arranque del APK en emulador Android. Se adjuntan `SHA256SUMS` y `BUILD_INFO.json`.

Los instaladores de escritorio son de desarrollo, sin firma comercial ni notarización de Apple. El APK usa firma de desarrollo; exporta tus datos antes de desinstalar una versión Android anterior. iPhone/iPad siguen usando la [web instalable](https://javpato.github.io/studyvillage/).
