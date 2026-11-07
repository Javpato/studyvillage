# StudyVillage

Una aldea acogedora en pixel art para tener tu propio rincón, visitar a tus amigos y compartir tiempo juntos. Decora tu casa, cuida el jardín, deja una nota en un buzón o reúnete para jugar, dibujar, estudiar y crear a tu ritmo.

**[Jugar en el navegador](https://javpato.github.io/studyvillage/)** · **[Descargar para tu dispositivo](https://github.com/Javpato/studyvillage/releases)**

## Tu lugar en la aldea

Empiezas con una casa sencilla: una pizarra, un escritorio, una planta, un armario y una guía que te ayuda a orientarte. La puerta interior da acceso a las plantas y habitaciones. Fuera te espera un buzón; puedes moverlo o retirarlo desde el jardín. Los demás muebles se añaden cuando tú quieras. Las casas ya guardadas conservan su decoración.

El teléfono reúne los accesos cotidianos:

- **Inicio:** Aldea, Contactos e Identidad.
- **Hogar:** Mi casa, Habitaciones, Decorar y Mi jardín.
- **Ajustes:** Ajustes, Conexión, Voz y Editar controles en dispositivos táctiles.

En **Ajustes → Teléfono** puedes añadir aplicaciones, crear carpetas, cambiar sus nombres y reorganizarlo todo. Cuaderno de tinta, Música, Estudio, Proyectos y Concentración son opcionales. Quitar un acceso conserva sus datos; Ajustes siempre permanece disponible. La distribución se guarda en cada dispositivo y se incluye en las copias de seguridad.

## Compartir el tiempo

Abre una aldea temporal e invita a tus amigos, o únete a un servidor persistente. Visita sus casas respetando sus permisos, conversa por voz y activa la cámara cuando lo decidas. En la plaza puedes jugar a Hombres Lobo o a Gartic Phone.

Si te apetece concentrarte, hay cuadernos de tinta y anotación de PDF, pizarra colaborativa, tarjetas, quizzes, proyectos, música local y un reloj de concentración. Son actividades dentro de la aldea: tú eliges cuáles forman parte de tu día. Las herramientas manuales funcionan sin IA; la integración local con Ollama es opcional.

## Empezar a jugar

Abre el enlace web o descarga un único archivo para tu sistema en Releases: **Windows x64 (.exe), Linux x64 (.AppImage), macOS Intel y Apple Silicon (un mismo .dmg universal), o Android (.apk)**. En Windows, ejecuta el instalador. En Linux, da permiso de ejecución al AppImage y ábrelo. En macOS, abre el DMG y arrastra StudyVillage a Aplicaciones. Las entregas de desarrollo de escritorio no tienen firma comercial ni notarización; Android usa firma de desarrollo.

En iPhone y iPad, abre la web en Safari y usa **Compartir → Añadir a pantalla de inicio**. No se distribuye una aplicación nativa de iOS. Consulta [instalación y compatibilidad](docs/SETUP.md) para requisitos de cada sistema.

- **WASD o flechas:** caminar. **Shift:** correr.
- **E:** interactuar con lo que tengas cerca.
- **Doble clic o doble toque:** acercarte y usar casas, muebles y portales.
- **M:** abrir o cerrar el teléfono. **Escape:** cerrar o volver.
- En pantallas táctiles, usa los controles en pantalla y personalízalos desde Editar controles.

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

Las Releases se construyen desde una etiqueta de versión: los cuatro instaladores comparten el mismo cliente web y solo se publican cuando terminan sus verificaciones. Se adjuntan información de compilación y sumas SHA-256. Los scripts de empaquetado mantienen únicamente la entrega local vigente en `deliverables/`.

Más información: [funciones](docs/FEATURES.md), [arquitectura](docs/ARCHITECTURE.md), [cuadernos y tinta](docs/INK.md), [recursos gráficos](docs/SPRITES.md) y [verificaciones y límites](docs/VERIFICATION.md). Las pruebas automatizadas y una compilación correcta no sustituyen las comprobaciones en dispositivos físicos.

## Proyecto y recursos

StudyVillage es un proyecto independiente en desarrollo. No requiere una suscripción, API de IA de pago ni dominio comprado. Los servicios externos tienen sus propias condiciones y los servidores propios usan los recursos de quien los aloja.

El repositorio sigue siendo **UNLICENSED**: todavía no se ha seleccionado una licencia de código abierto. Consulta [las licencias de recursos](ASSETS_LICENSES.md); los gráficos y demás materiales conservan sus condiciones originales.
