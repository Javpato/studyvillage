# StudyVillage 1.0.0-dev.12

Inglés por defecto y escritura continua en la pizarra, también desde dispositivos vinculados.

## Novedades

- Las instalaciones nuevas empiezan en inglés. Se conserva el español, francés o inglés que hayas elegido en este dispositivo.
- El trazo permanece visible al levantar el lápiz o el ratón mientras termina el guardado local. Los dispositivos vinculados muestran su propia tinta inmediatamente, sin esperar la respuesta del principal.
- Los guardados consecutivos se procesan en orden; la recuperación de tinta pendiente, deshacer y la persistencia siguen disponibles.
- Los instaladores incorporan los cambios web posteriores a dev.11: anfitrión invitado cuando la identidad guardada está bloqueada, pizarra grande sin límites de operaciones, nuevos personajes y animales en pixel art, y la bola circular del hámster.

## Actualizar

Cierra todas las ventanas anteriores de la web y vuelve a abrirla para activar la actualización. Los cuatro instaladores contienen el mismo cliente. Se conservan los perfiles, casas, cuadernos y preferencias explícitas. Actualiza ambos dispositivos para usar el enlace: protocolo de compañero 5, protocolo de servidor 8 y capacidad de pizarra entre pares 3. Actualizar el cliente no actualiza automáticamente el servidor.

Las pruebas de escritura incluyen lápiz y ratón simulados, guardado lento y WebKit de tableta; no equivalen a una prueba física con Apple Pencil. Esta versión no incluye un cambio en el transporte de voz.

## Descargar e instalar

Un solo archivo por sistema para instalar o abrir StudyVillage.

- **Windows x64:** ejecuta `StudyVillage-Setup-x64.exe`. Incluye toda la aplicación y permite elegir la carpeta de instalación sin pedir permisos de administrador.
- **Linux x64:** da permiso de ejecución a `StudyVillage-linux-x64.AppImage` y ábrelo.
- **macOS Intel y Apple Silicon:** abre `StudyVillage-macos-universal.dmg` y arrastra StudyVillage a Aplicaciones. Ambos equipos usan el mismo archivo.
- **Android:** instala `StudyVillage-development.apk`.

Los perfiles y cuadernos mantienen su ubicación anterior. Desinstalar desde Windows conserva los datos del jugador. El instalador contiene la aplicación completa; no descarga archivos del juego al instalar.

La publicación exige probar el contenido de los archivos entregados: instalación y desinstalación de Windows, AppImage con sandbox, el mismo DMG en Intel y Apple Silicon, e instalación y arranque del APK en emulador Android. Se adjuntan `SHA256SUMS` y `BUILD_INFO.json`.

Los instaladores de escritorio son de desarrollo, sin firma comercial ni notarización de Apple. El APK usa firma de desarrollo; exporta tus datos antes de desinstalar una versión Android anterior. iPhone/iPad siguen usando la [web instalable](https://javpato.github.io/studyvillage/).
