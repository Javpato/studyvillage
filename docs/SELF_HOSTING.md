# Alojar tu propio servidor de StudyVillage

Esta guía conecta una aldea persistente a la [web de StudyVillage](https://javpato.github.io/studyvillage/) y a sus clientes instalados. Cubre equipos personales, Ubuntu/Linux, Windows, macOS, Docker, VPS, redes privadas y conexiones con puertos de entrada cerrados. Los comandos describen una instalación nueva; para un servidor existente, empieza por [actualizaciones y copias](#mantenimiento).

El sitio web proporciona la interfaz. El proceso `server/dist/server.mjs` conserva el mundo en SQLite y atiende conexiones WebSocket. Puedes cerrar el juego sin apagar la aldea mientras ese proceso y su conexión sigan activos. Las llamadas y partidas en curso son transitorias; reiniciar el servidor las interrumpe.

## Elige tu caso

| Situación | Ruta |
|---|---|
| Ubuntu remoto, CGNAT o puertos de entrada que deben seguir cerrados | [Instalar](#instalar), [servicio Linux](#linux), [túnel saliente](#tunel) |
| Prueba sin dominio propio | [Túnel temporal](#temporal); la dirección cambia al reiniciarlo |
| Servidor permanente con dirección fija y puertos cerrados | [Cloudflare Tunnel con dominio](#fijo) |
| Grupo privado dispuesto a instalar una VPN | [VPN con HTTPS](#vpn) |
| VPS o conexión con IP pública y entrada permitida | [Proxy HTTPS](#proxy) |
| Ya tienes un proxy HTTPS o alojamiento con Node | [Proxy existente](#proxy-existente) o [plataforma gestionada](#plataforma) |
| Servidor con certificado TLS propio | [HTTPS directo](#tls) |
| Windows o macOS | [Instalar](#instalar), [arranque por sistema](#otros-sistemas), después elegir túnel o proxy |
| Docker o NAS con contenedores Linux | [Contenedor con almacenamiento persistente](#docker) |
| Solo una computadora | [Prueba local](#local) |
| Dos equipos en la misma LAN | [LAN](#lan): también necesitan HTTPS entre equipos |
| No se permite ninguna ruta de entrada ni de salida | No hay conexión remota posible; utiliza trabajo local o un alojamiento con conectividad permitida |

Elige una forma de ejecutar el servidor y una forma de hacerlo accesible. No arranques a la vez varios procesos sobre la misma base de datos. Esta arquitectura utiliza una autoridad por mundo; no admite escalar réplicas independientes detrás de un balanceador.

<a id="instalar"></a>
## 1. Instalar y compilar

Requisitos: Git, Node.js **24**, npm, disco persistente y permisos para escribir en el directorio de datos. Usa una plataforma y arquitectura admitidas por Node 24. No se necesita interfaz gráfica, Electron, Ollama ni una cuenta de IA en el servidor.

### Ubuntu/Debian

Con tu usuario habitual, usando `sudo` solamente donde se indica:

```bash
sudo apt update
sudo apt install -y git curl ca-certificates
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.7/install.sh -o /tmp/studyvillage-nvm-install.sh
bash /tmp/studyvillage-nvm-install.sh
source "$HOME/.nvm/nvm.sh"
nvm install 24
node --version
```

En otras distribuciones instala Git/curl con su gestor de paquetes y Node 24 siguiendo la [documentación de Node](https://nodejs.org/en/download). En macOS puedes usar el instalador de Node 24 y Git; en Windows instala Node 24 y Git, y abre una nueva terminal PowerShell. Comprueba `node --version` y `npm --version` antes de continuar.

### Linux/macOS

```bash
mkdir -p "$HOME/apps"
git clone https://github.com/Javpato/studyvillage.git "$HOME/apps/studyvillage"
cd "$HOME/apps/studyvillage"
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
npm run server:build
```

### Windows, PowerShell

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\apps" | Out-Null
git clone https://github.com/Javpato/studyvillage.git "$env:USERPROFILE\apps\studyvillage"
Set-Location "$env:USERPROFILE\apps\studyvillage"
$env:ELECTRON_SKIP_BINARY_DOWNLOAD='1'
npm ci
npm run server:build
```

`main` sigue el desarrollo de la web. Para desplegar una entrega concreta, elige una etiqueta **ya publicada** en [Releases](https://github.com/Javpato/studyvillage/releases) y ejecuta `git switch --detach ETIQUETA_PUBLICADA` antes de `npm ci`. No copies literalmente ese marcador. Conserva el commit desplegado (`git rev-parse HEAD`) para futuras actualizaciones.

La compilación produce un único `server/dist/server.mjs` que solo necesita Node 24 para ejecutarse. Puedes compilar en otra computadora y copiar ese archivo al servidor; no hace falta instalar dependencias de escritorio en la máquina de producción.

<a id="configuracion"></a>
## 2. Configuración común y orígenes permitidos

| Variable | Configuración habitual |
|---|---|
| `HOST` | `127.0.0.1` cuando proxy/túnel y servidor están en la misma máquina |
| `PORT` | `8787`, o el puerto interno asignado por el proveedor |
| `DATA_DIR` | Ruta absoluta, persistente y fuera del código descargado |
| `WORLD_NAME` | Nombre de la aldea, hasta 48 caracteres |
| `ALLOWED_ORIGINS` | Orígenes de los clientes permitidos, separados por comas |
| `TLS_CERT`, `TLS_KEY` | Solo para [HTTPS directo](#tls) |
| `CLAIM_SECRET` | Opcional; al principio el servidor genera uno si no lo defines |

El **origen del cliente** es dónde se abre la interfaz, no la dirección del servidor:

| Cliente | Origen de la configuración actual |
|---|---|
| Web oficial y su PWA, incluidos iPhone/iPad | `https://javpato.github.io` |
| Tu propia copia de la web | Su origen HTTPS, por ejemplo `https://juego.ejemplo.org` |
| Aplicación Electron actual de Windows/Linux/macOS | `studyvillage://app` |
| APK Android actual | `https://localhost` |
| Cliente Vite local | `http://127.0.0.1:3100` |

Para los clientes oficiales web, escritorio y Android juntos:

```text
ALLOWED_ORIGINS=https://javpato.github.io,studyvillage://app,https://localhost
```

No añadas `/studyvillage/` ni una barra final al origen. Incluye el puerto cuando forme parte del origen del cliente. En compilaciones personalizadas confirma su origen real. Los valores de escritorio/Android proceden de [Electron](../app/linux/main.cjs), [Capacitor](../capacitor.config.json) y los [valores predeterminados de Capacitor](https://capacitorjs.com/docs/config).

Los ejemplos siguientes permiten únicamente la web oficial; amplía esa variable si usarás los otros clientes. `ALLOWED_ORIGINS=*` y `npm run server:dev` son conveniencias de desarrollo. La lista de orígenes complementa las identidades e invitaciones; no las sustituye.

<a id="local"></a>
## 3. Primera prueba local

Desde la raíz del repositorio, en Linux/macOS:

```bash
DATA_DIR="$HOME/.local/share/studyvillage-server" \
HOST=127.0.0.1 PORT=8787 \
WORLD_NAME="Aldea de amigos" \
ALLOWED_ORIGINS=https://javpato.github.io \
node server/dist/server.mjs
```

En PowerShell:

```powershell
$env:DATA_DIR="$env:LOCALAPPDATA\StudyVillageServer"
$env:HOST='127.0.0.1'
$env:PORT='8787'
$env:WORLD_NAME='Aldea de amigos'
$env:ALLOWED_ORIGINS='https://javpato.github.io'
node server/dist/server.mjs
```

En otra terminal, `curl http://127.0.0.1:8787/health` debe devolver JSON con `"app":"studyvillage-server"`. En PowerShell utiliza `Invoke-RestMethod http://127.0.0.1:8787/health`.

El cliente acepta HTTP/WS únicamente para `localhost`, `127.0.0.1` y `[::1]`. Esas direcciones señalan al equipo de **cada jugador**: no sirven para que un amigo acceda a tu servidor remoto. El navegador o la aplicación pueden imponer restricciones adicionales sobre acceso local; usa HTTPS si bloquean la conexión. Detén esta prueba con Ctrl+C antes de crear el servicio sobre el mismo puerto y datos.

<a id="linux"></a>
## 4. Ubuntu/Linux: mantener el servidor activo con systemd

Ejecuta este bloque después de compilar, desde el usuario que será dueño de los datos. Las rutas habituales sin espacios funcionan directamente; si personalizas rutas con espacios, adapta el escapado de la unidad según systemd.

```bash
SV_APP_DIR="$HOME/apps/studyvillage"
SV_NODE_BIN="$(command -v node)"
SV_RUN_USER="$(id -un)"
SV_DATA_DIR="$HOME/.local/share/studyvillage-server"
mkdir -p "$SV_DATA_DIR"

sudo tee /etc/systemd/system/studyvillage.service >/dev/null <<EOF
[Unit]
Description=Servidor de StudyVillage
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SV_RUN_USER
WorkingDirectory=$SV_APP_DIR
ExecStart=$SV_NODE_BIN $SV_APP_DIR/server/dist/server.mjs
Environment=HOST=127.0.0.1
Environment=PORT=8787
Environment=DATA_DIR=$SV_DATA_DIR
Environment="WORLD_NAME=Aldea de amigos"
Environment=ALLOWED_ORIGINS=https://javpato.github.io
Restart=on-failure
RestartSec=5
UMask=0077

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now studyvillage
sudo systemctl status studyvillage --no-pager
curl http://127.0.0.1:8787/health
```

La ruta absoluta de Node evita depender de que systemd cargue `nvm`. Si cambias o eliminas esa instalación de Node, actualiza `ExecStart`. `Restart=on-failure` recupera fallos; una parada solicitada con `systemctl stop` se mantiene detenida. [Referencia de systemd](https://www.freedesktop.org/software/systemd/man/systemd.service.html).

Para consultar errores:

```bash
sudo journalctl -u studyvillage -n 80 --no-pager
```

Los primeros registros pueden contener el secreto de instalación: no publiques el registro completo sin retirarlo.

<a id="otros-sistemas"></a>
## 5. Windows y macOS: inicio persistente

### Windows

Tras la prueba en PowerShell, crea un archivo `start-studyvillage.cmd` con rutas absolutas adaptadas a tu usuario y a la ubicación de `node.exe` (`Get-Command node`):

```bat
@echo off
set "DATA_DIR=C:\Users\TU_USUARIO\AppData\Local\StudyVillageServer"
set "HOST=127.0.0.1"
set "PORT=8787"
set "WORLD_NAME=Aldea de amigos"
set "ALLOWED_ORIGINS=https://javpato.github.io"
cd /d "C:\Users\TU_USUARIO\apps\studyvillage"
"C:\Program Files\nodejs\node.exe" "server\dist\server.mjs"
```

En el Programador de tareas crea una tarea llamada StudyVillage: desencadenador **Al iniciar el sistema**, ejecutar con la cuenta dueña del directorio de datos y **Ejecutar tanto si el usuario inició sesión como si no**. Como acción usa `cmd.exe`, con argumentos `/c "C:\RUTA\start-studyvillage.cmd"`. Configura reinicio tras fallo, evita instancias simultáneas y desactiva el límite de duración para este proceso continuo. Introduce las credenciales solamente en el diálogo de Windows. Inicia la tarea y comprueba `/health`. [Referencia de tareas de Microsoft](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtask).

Para el acceso público, utiliza el túnel de la sección siguiente con la [instalación oficial de cloudflared para Windows](https://developers.cloudflare.com/tunnel/downloads/) o un proxy ya administrado. La tarea del juego y el servicio del túnel son procesos separados.

### macOS

La prueba de terminal usa los mismos comandos de Linux. Para arranque durante la sesión de usuario, crea un LaunchAgent en `~/Library/LaunchAgents/local.studyvillage.server.plist`. Sustituye las rutas; `launchd` no expande `~` ni variables de shell en el plist.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>local.studyvillage.server</string>
  <key>ProgramArguments</key><array>
    <string>/RUTA/ABSOLUTA/node</string>
    <string>/Users/TU_USUARIO/apps/studyvillage/server/dist/server.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/TU_USUARIO/apps/studyvillage</string>
  <key>EnvironmentVariables</key><dict>
    <key>HOST</key><string>127.0.0.1</string>
    <key>PORT</key><string>8787</string>
    <key>DATA_DIR</key><string>/Users/TU_USUARIO/Library/Application Support/StudyVillageServer</string>
    <key>ALLOWED_ORIGINS</key><string>https://javpato.github.io</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
</dict></plist>
```

Valida y carga el agente, después de cerrar la prueba de terminal:

```bash
plutil -lint "$HOME/Library/LaunchAgents/local.studyvillage.server.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/local.studyvillage.server.plist"
curl http://127.0.0.1:8787/health
```

Un LaunchAgent termina al cerrar la sesión. Para funcionamiento sin sesión utiliza un LaunchDaemon administrado, con usuario y rutas explícitos, siguiendo la [guía de Apple](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html). La suspensión o apagado del equipo interrumpe el servidor en cualquier sistema.

<a id="tunel"></a>
## 6. Puertos de entrada cerrados: túnel saliente

Esta ruta funciona detrás de NAT/CGNAT sin redirigir puertos hacia el equipo del juego. Cloudflare recibe HTTPS y lo conduce por la conexión que inicia `cloudflared`. Node continúa escuchando en `127.0.0.1:8787`.

Debe existir salida hacia Cloudflare por **7844 UDP para QUIC o 7844 TCP para HTTP/2**, además de la conectividad necesaria para DNS e instalación. Si esa salida también está bloqueada, el administrador de la red debe autorizar una ruta compatible o tendrás que elegir otro alojamiento. Mantener cerrada la entrada no equivale a bloquear toda salida. [Requisitos de red](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/).

### Instalar cloudflared en Ubuntu/Debian

```bash
sudo mkdir -p /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update
sudo apt install -y cloudflared
```

Usa el [repositorio oficial](https://pkg.cloudflare.com/) y las [descargas por plataforma](https://developers.cloudflare.com/tunnel/downloads/) para otras distribuciones, Windows o macOS. El túnel debe ejecutarse en la misma máquina que Node para que `127.0.0.1` señale al servicio correcto; consulta Docker si están en contenedores diferentes.

<a id="temporal"></a>
### Prueba sin dominio ni cuenta

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

Si UDP está bloqueado pero la salida TCP 7844 está permitida:

```bash
cloudflared tunnel --protocol http2 --url http://127.0.0.1:8787
```

Copia la dirección `https://...trycloudflare.com` que aparece y conserva el proceso abierto. La URL cambia al crear otro túnel, no tiene garantía de disponibilidad y está pensada para pruebas. Cambiar la URL no borra SQLite, pero los jugadores tendrán que actualizar la dirección guardada. [Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

<a id="fijo"></a>
### Dirección fija y servicio permanente

1. Usa una cuenta de Cloudflare y un dominio administrado allí.
2. En **Networking → Tunnels → Create Tunnel**, crea `studyvillage`.
3. Selecciona el sistema y arquitectura del servidor. Ejecuta allí el comando de instalación del servicio que muestra el panel. Incluye un token privado: no lo subas a Git ni lo compartas con jugadores.
4. Espera a que el túnel aparezca conectado/Healthy.
5. En **Routes → Add route → Published application**, elige `aldea.tudominio.com` y Service URL **`http://127.0.0.1:8787`**.
6. Abre `https://aldea.tudominio.com/health` desde otro equipo y continúa con [administración e invitaciones](#entrar).

HTTPS termina en Cloudflare; el tramo HTTP del ejemplo permanece dentro de la máquina. La ruta es pública, mientras StudyVillage controla la entrada mediante identidad e invitación. No añadas una página de login interactiva del proxy delante de `/ws`: el cliente no implementa ese inicio de sesión adicional. Para limitar también la red de acceso, considera una VPN. [Configuración de Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/get-started/).

<a id="proxy"></a>
## 7. IP pública y entrada permitida: proxy HTTPS

Esta alternativa sí requiere conectividad entrante al proxy. No la elijas si debes mantener cerrados todos los puertos de entrada de esa máquina.

### Caddy

1. Instala Caddy desde sus [instrucciones oficiales](https://caddyserver.com/docs/install).
2. Apunta el registro DNS A de `aldea.ejemplo.org` a la IPv4 pública del proxy. Añade AAAA solo si la IPv6 funciona de extremo a extremo.
3. Permite el acceso público necesario a Caddy (normalmente 80 y 443 para el flujo automático). En una red doméstica con IP pública también puede ser necesario redirigir esos puertos en el router. El puerto de Node queda local.
4. Añade este bloque a la configuración de Caddy que administres, conservando los sitios existentes:

```caddyfile
aldea.ejemplo.org {
    reverse_proxy 127.0.0.1:8787
}
```

5. Valida y recarga la configuración con el procedimiento de tu instalación. En el servicio habitual de Linux:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy gestiona HTTPS y soporta WebSockets. [Guía de proxy](https://caddyserver.com/docs/quick-starts/reverse-proxy), [WebSockets](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

Con IP dinámica configura actualización DNS en tu proveedor, o utiliza un túnel. CGNAT normalmente impide la redirección IPv4 hacia casa; un registro DNS por sí solo no crea conectividad. Un certificado también debe corresponder al nombre o IP utilizado: cambiar `http` por `https` en una URL no instala TLS.

<a id="proxy-existente"></a>
### Nginx u otro proxy ya existente

Configura un host HTTPS con certificado válido y reenvía `/health`, `/api/info` y `/ws` al mismo servidor. Conserva `Origin`, permite el upgrade WebSocket y evita caché o login intermedio en estas rutas.

Ejemplo del bloque de ubicación dentro de un `server` HTTPS de Nginx **ya configurado con su certificado**:

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Origin $http_origin;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
}
```

Valida con `nginx -t` antes de recargar. Un `/health` correcto demuestra HTTP, pero el botón **Comprobar** de StudyVillage verifica el saludo WebSocket. [Guía de Nginx](https://nginx.org/en/docs/http/websocket.html).

Es más sencillo dedicar un subdominio. Si usas un prefijo como `/aldea`, el proxy debe quitarlo antes de enviar las rutas a Node; el servidor no sirve de forma nativa `/aldea/health`. Introduce en el cliente la URL base con ese prefijo, sin añadir `/health`.

### Túnel SSH hacia otro equipo público que administras

Si ya tienes un segundo servidor con SSH y HTTPS accesibles, puedes iniciar desde el equipo del juego:

```bash
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -R 127.0.0.1:18787:127.0.0.1:8787 usuario@proxy.ejemplo.org
```

En el equipo público, el proxy HTTPS apunta a `127.0.0.1:18787`. El servidor del juego mantiene cerrada su entrada; el equipo público necesita aceptar SSH/HTTPS y permitir ese reenvío. Mantén y supervisa la conexión SSH; no expongas el puerto reenviado en todas sus interfaces. [Reenvío remoto de OpenSSH](https://man.openbsd.org/ssh#R).

<a id="tls"></a>
### HTTPS directo en Node

Si ya administras un certificado válido y su renovación:

```bash
HOST=0.0.0.0 PORT=8787 \
DATA_DIR="$HOME/.local/share/studyvillage-server" \
ALLOWED_ORIGINS=https://javpato.github.io \
TLS_CERT=/ruta/al/fullchain.pem TLS_KEY=/ruta/a/privkey.pem \
node server/dist/server.mjs
```

Conecta a `https://aldea.ejemplo.org:8787`. Aquí sí se necesita entrada al puerto elegido. La cuenta del proceso debe poder leer el certificado y su clave, sin hacer pública la clave. El servidor carga los archivos al arrancar: coordina un reinicio al renovarlos. Para escucha IPv6 configura una interfaz adecuada (`HOST=::`) y comprueba la ruta desde los clientes; no presupongas acceso IPv4 en todos los sistemas.

<a id="vpn"></a>
## 8. Acceso privado mediante VPN

Una VPN compartida puede dar acceso solo al grupo, pero StudyVillage sigue exigiendo HTTPS para direcciones remotas. Una IP privada HTTP, incluida la de una VPN, no pasa esa validación.

Con Tailscale, instala y autentica los equipos autorizados en la misma red privada, aplica sus permisos y publica el servicio con HTTPS mediante Serve:

```bash
tailscale serve --bg http://127.0.0.1:8787
tailscale serve status
```

Sigue la activación de HTTPS que solicite Tailscale. Comparte la URL HTTPS mostrada; los jugadores deben estar conectados a la red privada y tener permiso. Serve con `--bg` mantiene su configuración tras reinicios. No es lo mismo que Funnel, que publica hacia Internet. [Documentación de Serve](https://tailscale.com/docs/reference/tailscale-cli/serve).

Otras VPN son posibles si proporcionan una ruta al servidor y un certificado confiable para su nombre. Permitir acceso a la red local en el navegador puede ser necesario según el cliente; no desactives su seguridad para saltar errores de certificado.

<a id="lan"></a>
### Solo red local

Mantén Node detrás de un proxy HTTPS accesible desde la LAN, con certificado confiable para cada dispositivo. Si usas una autoridad privada, debe instalarse y confiarse en todos los equipos participantes. Un túnel o una VPN con HTTPS también sirven si aceptas sus dependencias. `http://192.168.x.x:8787` no está admitido por el cliente actual. Para funcionamiento sin Internet necesitarás además tener disponible el cliente web/PWA y resolver localmente el nombre del servidor; los servicios externos de señalización o relay no estarán disponibles.

<a id="docker"></a>
## 9. Docker y NAS con contenedores

No se publica aquí una imagen oficial precompilada del servidor. Puedes construir una imagen propia a partir del archivo compilado en el paso 1. Usa un Docker Engine actual: Docker anterior a 28 tenía excepciones de acceso desde la LAN para puertos publicados en loopback. [Publicación de puertos](https://docs.docker.com/engine/network/port-publishing/).

Crea `Dockerfile.server` en la raíz de tu copia del proyecto:

```dockerfile
FROM node:24-bookworm-slim
WORKDIR /opt/studyvillage
RUN mkdir -p /data && chown node:node /data
COPY --chown=node:node server/dist/server.mjs ./server.mjs
USER node
ENV HOST=0.0.0.0 PORT=8787 DATA_DIR=/data
CMD ["node", "server.mjs"]
```

Crea además un archivo `Dockerfile.server.dockerignore` para que el contexto incluya solamente el servidor compilado:

```text
**
!server/
!server/dist/
!server/dist/server.mjs
!Dockerfile.server
!Dockerfile.server.dockerignore
```

Construye y ejecuta:

```bash
docker build -f Dockerfile.server -t studyvillage-server:local .
docker volume create studyvillage-world
docker run -d --name studyvillage-server --restart unless-stopped \
  -p 127.0.0.1:8787:8787 \
  -e ALLOWED_ORIGINS=https://javpato.github.io \
  -e WORLD_NAME="Aldea de amigos" \
  -v studyvillage-world:/data \
  studyvillage-server:local
curl http://127.0.0.1:8787/health
```

El volumen conserva los datos al reemplazar el contenedor. No borres ese volumen para actualizar; exporta copias aparte. Un volumen preexistente o un directorio montado debe permitir escritura al usuario `node`. [Volúmenes de Docker](https://docs.docker.com/engine/storage/volumes/).

Si `cloudflared` se ejecuta en el host, apunta a `http://127.0.0.1:8787`. Si se ejecuta en otro contenedor, une ambos a una red Docker privada y usa `http://studyvillage-server:8787`; allí `127.0.0.1` señalaría al propio contenedor del túnel. En esa variante puedes omitir la publicación `-p`. No uses `-p 8787:8787` si quieres conservar el acceso únicamente local.

<a id="plataforma"></a>
## 10. Plataformas gestionadas y otros alojamientos

Un proveedor es apto si permite **Node 24, procesos continuos, WebSockets y disco persistente escribible**. Los nombres de sus opciones cambian; aplica esta configuración equivalente:

| Ajuste | Valor |
|---|---|
| Build | `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci` y `npm run server:build` |
| Start | `node server/dist/server.mjs` |
| Host | `0.0.0.0` cuando el balanceador del proveedor conecta por la interfaz del contenedor |
| Port | La variable `PORT` que asigne el proveedor |
| Datos | `DATA_DIR` apuntando al volumen persistente montado |
| Orígenes | Los clientes de [configuración común](#configuracion) |
| Health check | `/health` |
| Réplicas | Una por mundo; sin suspensión automática durante uso |

Comprueba que las actualizaciones conserven el volumen y no ejecuten dos autoridades simultáneas sobre él. GitHub Pages y los alojamientos exclusivamente estáticos no ejecutan este servidor. Un hosting solo PHP o funciones cortas sin WebSockets/disco duradero tampoco cubren estos requisitos. Los planes, cuotas y costes dependen de cada proveedor.

<a id="entrar"></a>
## 11. Reclamar la administración e invitar jugadores

1. Desde otro dispositivo abre `https://TU-SERVIDOR/health`. Debe devolver JSON con `app: studyvillage-server`. La raíz `/` puede responder `Not found`: es normal.
2. Abre la [web de StudyVillage](https://javpato.github.io/studyvillage/). En el teléfono entra en **Ajustes → Ajustes → Identidad**, guarda tu identidad cifrada y exporta una copia. Conserva su contraseña por separado.
3. En la pestaña **Servidores**, pega la dirección HTTPS base y pulsa **Comprobar**. No pegues `/health`, una URL de invitación temporal ni el sitio GitHub Pages como dirección del servidor.
4. En una instalación sin administrador, aparecerá **Secreto de instalación**. Obtén el valor del archivo `claim-secret.txt` de tu `DATA_DIR` y úsalo para conectar con tu identidad guardada. En el servicio Linux del ejemplo:

```bash
cat "$HOME/.local/share/studyvillage-server/claim-secret.txt"
```

En el contenedor del ejemplo:

```bash
docker exec studyvillage-server cat /data/claim-secret.txt
```

El secreto solo reclama la primera administración. Antes de reclamarla puede cambiar al reiniciar el servidor si no se fija explícitamente. Una vez reclamada, la autoridad pertenece a la identidad guardada; conocer la URL o un secreto antiguo no recupera esa identidad.

5. En **Administrar servidor → Invitaciones privadas**, configura nombre, usos y horas de validez y pulsa **Crear invitación privada**.
6. Envía a cada invitado la dirección y el código de invitación, nunca el secreto administrativo ni el token del túnel.
7. Los invitados abren **Ajustes → Servidores**, rellenan **Dirección del servidor** e **Invitación del servidor**, y pulsan **Conectar**. Una identidad guardada permite entrar como residente; una temporal entra como visitante.
8. Si quieres llevar tu casa local, utiliza **Importar mi casa y pizarras** y revisa la confirmación. Copia esos datos al mundo; los cuadernos privados no se convierten automáticamente en documentos del servidor.

La capacidad inicial es seis personas. La administración permite hasta 24, organizadas en barrios de seis parcelas. Una misma identidad puede usar hasta tres dispositivos; no cuenta como tres personas distintas. Guarda una copia cifrada de la identidad administradora antes de cambiar de equipo o borrar datos del navegador.

<a id="mantenimiento"></a>
## 12. Copias de seguridad, restauración y actualizaciones

### Copia del mundo

Utiliza el mismo `DATA_DIR` que el servicio. Desde el repositorio, con la cuenta dueña de los datos:

```bash
mkdir -p "$HOME/backups/studyvillage"
DATA_DIR="$HOME/.local/share/studyvillage-server" \
node server/dist/server.mjs backup \
"$HOME/backups/studyvillage/world-$(date +%Y%m%d-%H%M%S).sqlite"
```

El comando crea una copia SQLite consistente y admite el servidor en marcha. Usa un nombre nuevo cada vez y guarda copias también fuera de la máquina. No sustituyas este comando por copiar solo `world.sqlite` mientras SQLite está escribiendo: puede haber cambios en su archivo WAL. Las copias del servidor no incluyen los cuadernos privados almacenados en cada dispositivo.

En PowerShell, desde el repositorio:

```powershell
$env:DATA_DIR="$env:LOCALAPPDATA\StudyVillageServer"
$svBackupDir=Join-Path $env:USERPROFILE 'backups\studyvillage'
New-Item -ItemType Directory -Force $svBackupDir | Out-Null
$svBackupFile=Join-Path $svBackupDir ("world-{0}.sqlite" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
node server/dist/server.mjs backup $svBackupFile
```

En Docker, elige un nombre nuevo, crea la copia en el volumen y extráela fuera del contenedor:

```bash
docker exec studyvillage-server node /opt/studyvillage/server.mjs backup /data/world-backup-ANTES-DE-ACTUALIZAR.sqlite
docker cp studyvillage-server:/data/world-backup-ANTES-DE-ACTUALIZAR.sqlite ./world-backup-ANTES-DE-ACTUALIZAR.sqlite
```

### Restaurar

Detén el servicio antes de restaurar. Comprueba que has elegido el archivo y directorio correctos: la operación reemplaza el mundo activo y conserva la base anterior como `world.sqlite.before-restore`.

```bash
sudo systemctl stop studyvillage
cd "$HOME/apps/studyvillage"
DATA_DIR="$HOME/.local/share/studyvillage-server" \
node server/dist/server.mjs restore /RUTA/ABSOLUTA/copia.sqlite
sudo systemctl start studyvillage
```

En Windows detén primero la tarea; en macOS descarga el agente; en Docker detén el contenedor y utiliza un contenedor de mantenimiento con el mismo volumen. Mantén los datos bajo el mismo usuario y conserva las copias originales hasta verificar la restauración.

### Actualizar

1. Exporta una copia del mundo y guarda el commit anterior con `git rev-parse HEAD`.
2. Detén el servicio antes de reemplazar el ejecutable.
3. En una copia limpia que siga `main`: `git pull --ff-only`. Si despliegas etiquetas: `git fetch --tags` y `git switch --detach ETIQUETA_PUBLICADA`. No fuerces un reset sobre modificaciones propias.
4. Ejecuta `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci` y `npm run server:build`. En PowerShell establece primero la variable como en la instalación.
5. Conserva `DATA_DIR`, orígenes y configuración de HTTPS/túnel. Reinicia solo cuando la compilación termine correctamente.
6. Revisa `/health`, **Comprobar**, acceso con una identidad existente y una operación guardada que siga presente tras reconectar.
7. Si falla antes de publicar cambios de datos, vuelve al código anterior y recompila. Una vuelta de versión con datos modificados exige comprobar compatibilidad o restaurar la copia elegida.

Actualizar la web o instalar un cliente nuevo no actualiza automáticamente el servidor. El protocolo actual es 7; algunas funciones aditivas, como las solicitudes de amistad, necesitan también código reciente aunque el número de protocolo sea el mismo. Las versiones `1.0.0` de los metadatos del servidor, las etiquetas de desarrollo del cliente y el número de protocolo son identificadores distintos.

<a id="multimedia"></a>
## 13. Voz, cámaras, pantalla y TURN

La conexión HTTPS/WSS del mundo transporta el estado y la señalización. El audio/vídeo usa WebRTC entre los participantes. Un túnel web no convierte al servidor en relay TURN ni garantiza que todas las redes permitan medios directos.

Si la aldea funciona pero una llamada entre redes diferentes no conecta, configura un relay TURN autenticado accesible desde los clientes. En **Ajustes → Servidores → Conexión avanzada** introduce **Relay TURN**, **Usuario TURN** y **Contraseña TURN**. Usa el endpoint del proveedor, por ejemplo `turns:relay.ejemplo.org:5349?transport=tcp`; ese dominio es solo un ejemplo. Guarda y vuelve a conectar. **Usar solo relay** sirve para comprobar la ruta y requiere haber configurado TURN.

Un TURN propio necesita puertos de escucha y de relay alcanzables en la máquina que lo aloja. Si tu servidor debe mantener toda entrada cerrada, usa otra máquina accesible o un servicio TURN; no lo resuelve abrir un túnel HTTP hacia coturn. Configura credenciales y recursos según la [documentación de coturn](https://github.com/coturn/coturn).

La señalización PeerJS propia es una opción distinta para aldeas temporales. No pegues su URL en **Servidores**, ni pegues la URL del mundo en **Señalización propia**. Consulta [redes](NETWORKING.md) y [multimedia](MEDIA.md).

<a id="problemas"></a>
## 14. Problemas frecuentes

| Síntoma | Qué comprobar |
|---|---|
| La raíz del servidor dice `Not found` | Es normal; prueba `/health` y abre el juego en su web |
| `/health` local no responde | Proceso activo, versión de Node, puerto, permisos de `DATA_DIR` y registro del servicio |
| `EADDRINUSE` | Ya hay otro proceso en ese puerto; no arranques servicio y prueba manual a la vez |
| `node:sqlite` no existe | Estás ejecutando una versión de Node incorrecta, posiblemente distinta en el servicio |
| Funciona localmente pero el túnel da 502 | Node detenido, puerto equivocado o `127.0.0.1` apunta a otro contenedor |
| Cloudflare no conecta | Salida 7844, DNS, reloj del equipo y protocolo UDP/TCP; HTTP/2 no cambia el puerto 7844 |
| `/health` público funciona pero **Comprobar** falla | Upgrade WebSocket, origen exacto permitido, certificado, timeout o login del proxy |
| Funciona en web pero no en EXE/APK | Añade el origen correspondiente del cliente instalado; revisa también su versión |
| El certificado da error | Nombre de la URL, cadena completa, vencimiento y confianza del dispositivo |
| URL `http://192.168...` o IP de VPN rechazada | El cliente exige HTTPS remoto |
| No aparece el secreto de instalación | Pulsa **Comprobar**; un mundo ya reclamado no permite volver a reclamarlo |
| El secreto ya no sirve | Usa el actual antes de la primera reclamación; después entra con la identidad administradora original |
| Invitación rechazada | Caducidad, usos agotados, revocación y que sea una invitación del mismo servidor |
| Entré como visitante y no tengo parcela | Guarda/desbloquea tu identidad y vuelve a conectar según indique la interfaz |
| Mundo vacío después de reiniciar | Cambió `DATA_DIR`, el usuario, el volumen o el directorio de trabajo; busca los datos anteriores antes de crear contenido nuevo |
| Se apaga al cerrar SSH | Se ejecutaba en primer plano; usa servicio para Node y para el túnel |
| Dirección temporal dejó de funcionar | El proceso terminó o cambió la URL; usa un túnel con nombre para una dirección fija |
| Reconexiones periódicas | Suspensión del equipo/proveedor, timeout del proxy, cambios DNS o reinicios del túnel |
| Capacidad completa | Administración → capacidad, hasta 24 personas; verifica también dispositivos activos |
| La aldea conecta pero no la voz/vídeo | Permisos de dispositivos, contexto de llamada y conectividad WebRTC/TURN |
| IA no disponible | Es opcional y requiere configuración separada; el mundo funciona sin ella |

## Alcance y referencias

Los comandos del servidor y las rutas de interfaz se contrastaron con el código de este repositorio. Las recetas de infraestructura se apoyan en las fuentes oficiales enlazadas; no constituyen una prueba ejecutada en cada proveedor, router, sistema o dispositivo físico. Las políticas de firewall, permisos y nombres de paneles pueden variar. No se promete servicio gratuito ilimitado ni compatibilidad con un alojamiento que incumpla los requisitos.

Referencia del servidor y todas sus variables: [SERVER.md](SERVER.md). Instalación del cliente: [SETUP.md](SETUP.md). Datos personales y del mundo: [STORAGE_BACKUPS.md](STORAGE_BACKUPS.md). Configuración opcional de IA: [AI.md](AI.md). Evidencia automatizada del proyecto: [VERIFICATION.md](VERIFICATION.md).
