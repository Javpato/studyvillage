# StudyVillage

Una aldea acogedora en pixel art para tener tu propio rincón, visitar a tus amigos y compartir tiempo juntos. Decora tu casa, cuida el jardín, deja una nota en un buzón o reúnete para jugar, dibujar, estudiar y crear a tu ritmo.

**[Jugar en el navegador](https://javpato.github.io/studyvillage/)** · **[Descargar para tu dispositivo](https://github.com/Javpato/studyvillage/releases)**

## Estado y descargas

**[1.0.0-dev.10 está publicada](https://github.com/Javpato/studyvillage/releases/tag/v1.0.0-dev.10)** con cuatro instaladores verificados, información de compilación y sumas SHA-256. Descarga el archivo de tu sistema en la tabla. La web se actualiza desde `main` cuando pasan las pruebas de GitHub Pages; cada entrega de instaladores queda asociada a su propia etiqueta de versión.

| Dispositivo | Qué abrir o descargar |
|---|---|
| Navegador, iPhone o iPad | [Web de StudyVillage](https://javpato.github.io/studyvillage/); en Safari, Compartir → Añadir a pantalla de inicio |
| Windows x64 | [StudyVillage-Setup-x64.exe](https://github.com/Javpato/studyvillage/releases/download/v1.0.0-dev.10/StudyVillage-Setup-x64.exe) |
| Linux x64 | [StudyVillage-linux-x64.AppImage](https://github.com/Javpato/studyvillage/releases/download/v1.0.0-dev.10/StudyVillage-linux-x64.AppImage) |
| macOS Intel o Apple Silicon | [StudyVillage-macos-universal.dmg](https://github.com/Javpato/studyvillage/releases/download/v1.0.0-dev.10/StudyVillage-macos-universal.dmg) — el mismo archivo para ambos |
| Android | [StudyVillage-development.apk](https://github.com/Javpato/studyvillage/releases/download/v1.0.0-dev.10/StudyVillage-development.apk) |

Son versiones de desarrollo. Los instaladores de escritorio no tienen firma comercial ni notarización; el APK usa firma de desarrollo. Exporta una copia de tus datos antes de desinstalar o cambiar de dispositivo. No hay instalador nativo de iOS.

## Novedades de dev.10

- El compañero sigue la herramienta del jugador principal y vuelve a la espera al cerrarla. Su pizarra ofrece los mismos controles de dibujo, selección, texto y modo Lápiz.
- **Programas** de concentración guardados con etapas ordenadas, repetición opcional, pausa y recuperación tras recargar o suspender el dispositivo.
- Sonidos integrados o audio propio y alertas en el principal, el compañero o ambos, incluso con el reloj cerrado. El compañero conserva su propio idioma y volumen.
- Enlace de dispositivos con estados claros, tiempos de espera y reintentos. Actualiza ambos dispositivos antes de enlazarlos: dev.10 usa el protocolo de compañero 3.
- Escritura reparada en las pizarras propias al reabrir una identidad guardada sin conexión. Micrófono y pantalla compartida permanecen activos al cerrar su vista, con una acción para detenerlos.
- Incluye también las mascotas personalizadas, el taller, la app Dispositivos y las mejoras del teléfono de dev.9.

Las solicitudes de amistad sobreviven a desconexiones en servidores actualizados. **Actualizar la web o un instalador no actualiza el servidor de tu aldea:** su administrador debe actualizarlo desde esta misma versión. Los servidores anteriores conservan las demás funciones. Consulta [las notas completas](docs/RELEASE_NOTES.md).

## Tu lugar en la aldea

Empiezas con una casa sencilla: una pizarra, un escritorio, una planta, un armario y una guía que te ayuda a orientarte. La puerta interior da acceso a las plantas y habitaciones. Fuera te espera un buzón; puedes moverlo o retirarlo desde el jardín. Los demás muebles se añaden cuando tú quieras. Las casas ya guardadas conservan su decoración.

El teléfono reúne los accesos cotidianos:

- **Inicio:** Aldea y Contactos.
- **Hogar:** Mi casa, Habitaciones, Decorar, Mi jardín y Mascotas.
- **Ajustes:** Ajustes, Voz, Editar controles y Dispositivos en computadora y dispositivos táctiles.

Organiza el teléfono con clic derecho sobre un icono o manteniéndolo pulsado durante un segundo. En edición puedes arrastrar accesos, agruparlos en carpetas, cambiar el nombre de una carpeta tocando su título y añadir accesos desde **Biblioteca de apps**. La × quita el acceso y conserva sus datos; Ajustes siempre permanece disponible. En **Personalizar carpeta** puedes elegir un icono existente y cualquier color, previsualizarlo, guardar, cancelar o restablecer la apariencia. La distribución se guarda en cada dispositivo y se incluye en las copias de seguridad. La app **Dispositivos**, en la carpeta Ajustes, permite asociar dos equipos con un código; quien lo crea elige el jugador principal y las herramientas del compañero.

## Compartir el tiempo

Abre una aldea temporal e invita a tus amigos, o únete a un servidor persistente. Visita sus casas respetando sus permisos, conversa por voz y activa la cámara cuando lo decidas. En la plaza puedes jugar a Hombres Lobo, Gartic Phone o **Bloques del Bosque**, con partidas individuales y batallas de bloques para 2–16 personas.

Para mantener una aldea en tu propio equipo o servidor, sigue la [guía de servidores propios](docs/SELF_HOSTING.md): Ubuntu/Linux, Windows, macOS, Docker, túneles sin abrir puertos, HTTPS, redes privadas, invitaciones y copias de seguridad.

Si te apetece concentrarte, hay cuadernos de tinta y anotación de PDF, pizarra colaborativa, tarjetas, quizzes, proyectos, música local y un reloj de concentración. Son actividades dentro de la aldea: tú eliges cuáles forman parte de tu día. Las herramientas manuales funcionan sin IA; la integración local con Ollama es opcional.

La web y los instaladores dev.10 incluyen ciclos automáticos de concentración/descanso, diálogos NPC más grandes y ajustables, mejoras de pizarra y armario, vínculos de repositorios y cinco especies de mascotas con casas, comida, caricias y participación como bots. Puedes colocar hasta cinco casas de mascotas entre el interior y el jardín, sin desbloqueos. Acércate al animal y pulsa **E** para acariciarlo, llamarlo o enviarlo a casa. Consulta la [entrega inicial](docs/AMENDMENT.md) y las [correcciones de mascotas, teléfono, mando e idiomas](docs/PETS-CONTROLS.md). Consulta también [animales personalizados y dispositivos asociados](docs/CUSTOM-PETS-COMPANION.md).

La web y los instaladores dev.10 incorporan **Programas** en el reloj: varias secuencias guardadas de etapas, repetición opcional, sonidos integrados o un archivo propio y alertas en el dispositivo elegido. El enlace ahora muestra cuándo el código está listo, dónde aprobar y cómo reintentar un fallo. Actualiza ambos dispositivos antes de enlazar; los instaladores dev.9 conservan un protocolo anterior incompatible. Activa el audio en los dispositivos elegidos; no se garantiza una alarma audible mientras duermen.

## Empezar a jugar

Abre el enlace web o descarga un único archivo para tu sistema en Releases: **Windows x64 (.exe), Linux x64 (.AppImage), macOS Intel y Apple Silicon (un mismo .dmg universal), o Android (.apk)**. En Windows, ejecuta el instalador. En Linux, da permiso de ejecución al AppImage y ábrelo. En macOS, abre el DMG y arrastra StudyVillage a Aplicaciones. Las entregas de desarrollo de escritorio no tienen firma comercial ni notarización; Android usa firma de desarrollo.

En iPhone y iPad, abre la web en Safari y usa **Compartir → Añadir a pantalla de inicio**. No se distribuye una aplicación nativa de iOS. Consulta [instalación y compatibilidad](docs/SETUP.md) para requisitos de cada sistema.

- **WASD o flechas:** caminar. **Shift:** correr.
- **E:** interactuar con lo que tengas cerca.
- **Doble clic o doble toque:** acercarte y usar casas, muebles y portales.
- **M:** abrir o cerrar el teléfono. **Escape:** cerrar o volver.
- En pantallas táctiles, usa los controles en pantalla y personalízalos desde Editar controles.
- Para usar un mando estándar, abre **Ajustes → Controles** y activa **Activar mando**. Tanto el mando como **Mostrar ayuda flotante** están desactivados por defecto; tus elecciones se guardan en este dispositivo. El emparejamiento Bluetooth se hace en el sistema operativo. Las ayudas cambian al dispositivo que estés usando; **Controles** muestra el mapeo del juego. En Gartic, escribir y dibujar requiere teclado, ratón o táctil; el mando permite navegar y enviar las acciones.

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
