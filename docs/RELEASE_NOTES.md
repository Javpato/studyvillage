# StudyVillage 1.0.0-dev.10

Actualiza Windows, Linux, macOS y Android al cliente actual de la web, con programas de concentración y un espacio de trabajo completo en el dispositivo compañero.

## Novedades

- El compañero sigue la herramienta que abre el jugador principal: cuaderno, pizarra y editores. Al cerrar la herramienta vuelve a la espera; los borradores pendientes siguen disponibles para exportar.
- La pizarra compartida utiliza los mismos controles de dibujo, selección, borradores, texto, modo Lápiz y gestos que la principal. Se corrige el acceso de escritura a las pizarras propias al reabrir una identidad guardada sin conexión.
- Guarda varios **Programas** de concentración con etapas ordenadas, repetición opcional, pausa y reanudación. El reloj conserva su progreso al recargar y recupera el tiempo tras una suspensión.
- Elige sonidos integrados, silencio o un audio propio de hasta diez segundos y decide si las alertas suenan en el principal, el compañero o ambos. Los sonidos funcionan también con el panel del reloj cerrado; el audio importado se incluye en las copias de seguridad.
- Abrir o configurar el reloj en el compañero no abre ventanas en el principal. Al comenzar, el reloj aparece si no hay otra herramienta activa; el tiempo restante sigue visible mientras trabajas.
- El enlace de dispositivos muestra cuándo está listo el código, dónde aprobar y cómo reintentar. Gestiona los tiempos de espera, rechaza protocolos antiguos y evita aplicar respuestas de herramientas ya cerradas.
- El compañero conserva su propio idioma y volumen. El micrófono y la pantalla compartida continúan al cerrar su vista, con un estado visible y una acción para detenerlos.
- Se conservan las mascotas personalizadas, el taller, la app Dispositivos y las mejoras del teléfono de dev.9.

## Actualizar

La web instala la actualización al cerrar todas las ventanas anteriores de StudyVillage y volver a abrirla. Los cuatro instaladores nuevos incluyen el mismo cliente. Actualiza ambos dispositivos antes de enlazarlos: dev.10 usa el protocolo de compañero 3 y no es compatible con el enlace de dev.9. Para solicitudes de amistad persistentes, actualiza también el servidor desde esta etiqueta y conserva su directorio de datos; actualizar el cliente no despliega el servidor automáticamente. No hay cambio destructivo de esquema ni reinicio de agendas, casas o cuadernos.

Activa el audio en los dispositivos elegidos. Un navegador o dispositivo suspendido no garantiza una alarma audible mientras duerme. La conexión sigue dependiendo de la señalización y de la conectividad directa o de retransmisión disponible.

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
