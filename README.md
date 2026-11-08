# StudyVillage

Una aldea acogedora en pixel art para tener tu propio rincón, visitar a tus amigos y compartir tiempo juntos. Decora tu casa, cuida el jardín, deja una nota en un buzón o reúnete para jugar, dibujar, estudiar y crear a tu ritmo.

**[Jugar en el navegador](https://javpato.github.io/studyvillage/)** · **[Descargar para tu dispositivo](https://github.com/Javpato/studyvillage/releases)**

## Estado y descargas

**[1.0.0-dev.8 está publicada](https://github.com/Javpato/studyvillage/releases/tag/v1.0.0-dev.8)** con cuatro instaladores verificados, información de compilación y sumas SHA-256. Descarga el archivo de tu sistema en la tabla. La web se actualiza desde `main` cuando pasan las pruebas de GitHub Pages; cada entrega de instaladores queda asociada a su propia etiqueta de versión.

| Dispositivo | Qué abrir o descargar |
|---|---|
| Navegador, iPhone o iPad | [Web de StudyVillage](https://javpato.github.io/studyvillage/); en Safari, Compartir → Añadir a pantalla de inicio |
| Windows x64 | [StudyVillage-Setup-x64.exe](https://github.com/Javpato/studyvillage/releases/download/v1.0.0-dev.8/StudyVillage-Setup-x64.exe) |
| Linux x64 | [StudyVillage-linux-x64.AppImage](https://github.com/Javpato/studyvillage/releases/download/v1.0.0-dev.8/StudyVillage-linux-x64.AppImage) |
| macOS Intel o Apple Silicon | [StudyVillage-macos-universal.dmg](https://github.com/Javpato/studyvillage/releases/download/v1.0.0-dev.8/StudyVillage-macos-universal.dmg) — el mismo archivo para ambos |
| Android | [StudyVillage-development.apk](https://github.com/Javpato/studyvillage/releases/download/v1.0.0-dev.8/StudyVillage-development.apk) |

Son versiones de desarrollo. Los instaladores de escritorio no tienen firma comercial ni notarización; el APK usa firma de desarrollo. Exporta una copia de tus datos antes de desinstalar o cambiar de dispositivo. No hay instalador nativo de iOS.

## Novedades de dev.8

- Solicitudes de amistad con aceptación y avisos de amistad/voz silenciosos, fáciles de cerrar y sin acumulación.
- Pantallas compartidas que cada persona puede mover, redimensionar o minimizar para sí misma; audio opcional cuando el navegador y sistema lo permiten.
- **Ajustes → Mando:** guía de conexión USB/Bluetooth, detección, prueba de botones y controles para menús, aldea y Bloques del Bosque. Escribir y dibujar siguen usando teclado, ratón o pantalla táctil.
- Bloques del Bosque con juego a la izquierda, cámaras a la derecha, ocultación local del vídeo y «Terminar partida» junto a «Comenzar».
- Mejoras de teléfono/iPad, campo de invitación sobre el teclado, jardín más visible y tamaño estable con zoom; controles de llamada abajo a la izquierda en ordenador.
- Teléfono organizable por carpetas, mejoras de sprites y partidas de Bloques contra NPC incluidas desde los cambios posteriores a dev.7.
- Reloj flotante que conserva su posición y tamaño al arrastrarlo, ocultarlo y recargar, también con controles personalizados.

Las solicitudes de amistad sobreviven a desconexiones en servidores actualizados. **Actualizar la web o un instalador no actualiza el servidor de tu aldea:** su administrador debe actualizarlo desde esta misma versión. Los servidores anteriores conservan las demás funciones. Consulta [las notas completas](docs/RELEASE_NOTES.md).

## Tu lugar en la aldea

Empiezas con una casa sencilla: una pizarra, un escritorio, una planta, un armario y una guía que te ayuda a orientarte. La puerta interior da acceso a las plantas y habitaciones. Fuera te espera un buzón; puedes moverlo o retirarlo desde el jardín. Los demás muebles se añaden cuando tú quieras. Las casas ya guardadas conservan su decoración.

El teléfono reúne los accesos cotidianos:

- **Inicio:** Aldea y Contactos.
- **Hogar:** Mi casa, Habitaciones, Decorar y Mi jardín.
- **Ajustes:** Ajustes, Voz y Editar controles en computadora y dispositivos táctiles.

Organiza el teléfono con clic derecho sobre un icono o manteniéndolo pulsado durante tres segundos. En edición puedes arrastrar accesos, agruparlos en carpetas, cambiar el nombre de una carpeta tocando su título y añadir accesos desde **Biblioteca de apps**. La × quita el acceso y conserva sus datos; Ajustes siempre permanece disponible. La distribución se guarda en cada dispositivo y se incluye en las copias de seguridad.

## Compartir el tiempo

Abre una aldea temporal e invita a tus amigos, o únete a un servidor persistente. Visita sus casas respetando sus permisos, conversa por voz y activa la cámara cuando lo decidas. En la plaza puedes jugar a Hombres Lobo, Gartic Phone o **Bloques del Bosque**, con partidas individuales y batallas de bloques para 2–16 personas.

Para mantener una aldea en tu propio equipo o servidor, sigue la [guía de servidores propios](docs/SELF_HOSTING.md): Ubuntu/Linux, Windows, macOS, Docker, túneles sin abrir puertos, HTTPS, redes privadas, invitaciones y copias de seguridad.

Si te apetece concentrarte, hay cuadernos de tinta y anotación de PDF, pizarra colaborativa, tarjetas, quizzes, proyectos, música local y un reloj de concentración. Son actividades dentro de la aldea: tú eliges cuáles forman parte de tu día. Las herramientas manuales funcionan sin IA; la integración local con Ollama es opcional.

## Empezar a jugar

Abre el enlace web o descarga un único archivo para tu sistema en Releases: **Windows x64 (.exe), Linux x64 (.AppImage), macOS Intel y Apple Silicon (un mismo .dmg universal), o Android (.apk)**. En Windows, ejecuta el instalador. En Linux, da permiso de ejecución al AppImage y ábrelo. En macOS, abre el DMG y arrastra StudyVillage a Aplicaciones. Las entregas de desarrollo de escritorio no tienen firma comercial ni notarización; Android usa firma de desarrollo.

En iPhone y iPad, abre la web en Safari y usa **Compartir → Añadir a pantalla de inicio**. No se distribuye una aplicación nativa de iOS. Consulta [instalación y compatibilidad](docs/SETUP.md) para requisitos de cada sistema.

- **WASD o flechas:** caminar. **Shift:** correr.
- **E:** interactuar con lo que tengas cerca.
- **Doble clic o doble toque:** acercarte y usar casas, muebles y portales.
- **M:** abrir o cerrar el teléfono. **Escape:** cerrar o volver.
- En pantallas táctiles, usa los controles en pantalla y personalízalos desde Editar controles.
- Para usar un mando estándar, abre **Ajustes → Mando**. El emparejamiento Bluetooth se hace en el sistema operativo.

Puedes explorar y usar tus herramientas personales sin iniciar sesión. Guarda una identidad cifrada para que tus amigos puedan reconocerte entre sesiones. Los datos personales se conservan localmente: exporta una copia completa desde Identidad antes de borrar datos del navegador o cambiar de dispositivo. La escritura guardada puede reabrirse sin conexión después de la primera carga web.

## Desarrollo

Requiere Node.js 24 y npm.

```sh
npm ci
npm run dev
```

Abre http://127.0.0.1:3100.

```sh
npm run check          # Tipos, pruebas, traducciones y builds web/servidor
npm run test:e2e       # Recorridos de navegador
npm run test:pages     # Paquete web, instalación offline y escritura
npm run windows:build # Instalador único .exe de Windows
npm run linux:build   # AppImage único; ejecutar desde Linux
npm run mac:build     # DMG universal; ejecutar desde macOS
npm run android:apk   # APK; requiere JDK 21 y Android SDK 36
```

Las Releases identifican un commit mediante una etiqueta de versión: los cuatro instaladores comparten el mismo cliente web y solo se publican cuando terminan sus verificaciones. Se adjuntan información de compilación y sumas SHA-256. La entrega local vigente está en `deliverables/release-current/`; los scripts de empaquetado también generan sus carpetas de trabajo por plataforma.

Más información: [funciones](docs/FEATURES.md), [arquitectura](docs/ARCHITECTURE.md), [cuadernos y tinta](docs/INK.md), [recursos gráficos](docs/SPRITES.md) y [verificaciones y límites](docs/VERIFICATION.md). Las pruebas automatizadas y una compilación correcta no sustituyen las comprobaciones en dispositivos físicos.

## Cómo se organiza el repositorio

| Carpeta | Contenido |
|---|---|
| `app/` | Interfaz, mundo y clientes web/escritorio |
| `packages/` | Reglas, protocolos, almacenamiento y colaboración |
| `server/` | Servidor persistente con Node.js y SQLite |
| `android/` | Proyecto Android |
| `scripts/` y `.github/workflows/` | Construcción, verificaciones y publicación |
| `docs/` | [Manual técnico](docs/README.md) y evidencia de pruebas |

`main` contiene el desarrollo actual; las etiquetas `v…` identifican releases concretos y no se reutilizan. Un workflow verde de Pages confirma la publicación web; el workflow **Build and publish Releases** verifica los cuatro instaladores antes de publicarlos. `BUILD_INFO.json` identifica el commit de cada entrega y `SHA256SUMS` permite comprobar sus archivos. Los builds y paquetes generados están ignorados por Git.

## Proyecto y recursos

StudyVillage es un proyecto independiente en desarrollo. No requiere una suscripción, API de IA de pago ni dominio comprado. Los servicios externos tienen sus propias condiciones y los servidores propios usan los recursos de quien los aloja.

El repositorio sigue siendo **UNLICENSED**: todavía no se ha seleccionado una licencia de código abierto. Consulta [las licencias de recursos](ASSETS_LICENSES.md); los gráficos y demás materiales conservan sus condiciones originales.

Manual técnico detallado: [documentación](docs/README.md).
