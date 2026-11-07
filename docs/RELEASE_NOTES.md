Un solo archivo por sistema para instalar o abrir StudyVillage.

- **Windows x64:** ejecuta `StudyVillage-Setup-x64.exe`. Incluye toda la aplicación y permite elegir la carpeta de instalación sin pedir permisos de administrador.
- **Linux x64:** da permiso de ejecución a `StudyVillage-linux-x64.AppImage` y ábrelo.
- **macOS Intel y Apple Silicon:** abre `StudyVillage-macos-universal.dmg` y arrastra StudyVillage a Aplicaciones. Ambos equipos usan el mismo archivo.
- **Android:** instala `StudyVillage-development.apk`.

Los perfiles y cuadernos mantienen su ubicación anterior. Desinstalar desde Windows conserva los datos del jugador. El instalador contiene la aplicación completa; no descarga archivos del juego al instalar.

La publicación exige probar el contenido de los archivos entregados: instalación y desinstalación de Windows, AppImage con sandbox, el mismo DMG en Intel y Apple Silicon, e instalación y arranque del APK en emulador Android. Se adjuntan `SHA256SUMS` y `BUILD_INFO.json`.

Los instaladores de escritorio son de desarrollo, sin firma comercial ni notarización de Apple. El APK usa firma de desarrollo; exporta tus datos antes de desinstalar una versión Android anterior. iPhone/iPad siguen usando la [web instalable](https://javpato.github.io/studyvillage/).
