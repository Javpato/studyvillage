# Mascotas, carpetas, mando e idiomas — entrega

Esta ampliación conserva los cambios anteriores descritos en [AMENDMENT.md](AMENDMENT.md). El estado exacto de publicación y las comprobaciones finales se registran en [VERIFICATION.md](VERIFICATION.md).

## Cambios y componentes

| Área | Cambio implementado | Componentes principales |
|---|---|---|
| Casas y mascotas invisibles | Catálogo e imágenes con revisión de contenido; caché PWA coherente; validación de fotogramas y sustituto visible por especie ante fallos; orden de profundidad junto a muebles y avatares | `assets/sprite-catalog.ts`, `assets/pet-assets.ts`, `pets/art.ts`, `pets/world.ts`, `house/draw.ts`, `ui/app.ts`, `scripts/sprite-revision.mjs`, `scripts/build-pwa.mjs` |
| Interacción | E selecciona una mascota cercana con preferencia por la dirección del jugador, indicador y contorno. La misma acción de mundo sirve para mando y controles táctiles existentes. Panel compacto con acciones reales, separado de la gestión de la casa | `pets/world.ts`, `ui/app.ts`, `ui/garden-ui.ts`, `ui/world-expansion-ui.ts` |
| Carpeta del teléfono | Catálogo existente de iconos, paleta, color libre, hexadecimal, previsualización, guardar/cancelar/restablecer. Ajustes usa el engranaje según su ID, conservando personalizaciones | `ui/folder-appearance.ts`, `ui/phone-layout-editor.ts`, `ui/pixel-icons.ts`, `packages/core/src/phone/layout.ts` |
| Mando | Acciones compartidas, navegación por foco, repetición limitada, zona muerta, entrada discreta y acciones de Bloques. Detección del último dispositivo, símbolos por familia reconocida y alternativa genérica | `input/actions.ts`, `input/gamepad.ts`, `ui/tetris-ui.ts`, `ui/study-ui.ts` |
| Guía | Franja contextual y guía visual derivadas de los mismos mapeos; apertura/cierre con mando. Pausa individual de Bloques; los juegos compartidos mantienen sus reglas de tiempo | `input/gamepad.ts`, `ui/village-polish.css` |
| Ayuda del teléfono | Gesto real de clic derecho sobre un elemento; ayuda para salir de edición. Ayudas equivalentes cuando se usa el gesto táctil o botón de mando implementado | `ui/phone-layout-editor.ts` |
| Idiomas | Ollama: «Unavailable» / «Indisponible». Traducciones de estados, controles, carpetas, respuestas opcionales y número de jugadores; redacción francesa corregida. Detección de claves literales ausentes en el código, además de paridad y parámetros | `ui/ollama-setup-ui.ts`, `ui/study-ui.ts`, `ui/werewolves-ui.ts`, `i18n/{es,en,fr}.json`, `scripts/check-translations.mjs`, `scripts/translation-keys.mjs` |

Las rutas de aplicación de la tabla son relativas a `app/src`, salvo las indicadas explícitamente. Las reglas de sustitución de sprites están en [SPRITES.md](SPRITES.md) y las acciones de los juegos en [MINIGAMES.md](MINIGAMES.md).

## Resultado verificado

Publicado en la web desde `33d934b`. Pasaron 514 pruebas de aplicación, 37 de servidor, cinco del puente nativo y 124 ejecuciones de navegador entre Chromium/WebKit y Linux/macOS. También se verificaron las cinco especies y Ollama EN/FR directamente en GitHub Pages. Los enlaces a las ejecuciones y las diferencias entre las pruebas locales, CI y dispositivos físicos están en el [registro final](VERIFICATION.md).

## Diagnóstico y pruebas

Se reprodujo la invisibilidad combinando el código nuevo con el catálogo de la versión anterior, servido por un service worker ya instalado. Las imágenes publicadas eran correctas. Esta reproducción demuestra un mecanismo concreto de mezcla de versiones; no permite afirmar qué contenía la caché del equipo que comunicó el fallo. Las nuevas URL impiden que el catálogo antiguo sustituya los recursos actuales.

Las pruebas de navegador colocan las cinco especies y observan las llamadas reales de dibujo en el lienzo del mundo. También fuerzan un recurso ausente y fotogramas inválidos, recargan, comprueban el límite, mueven y retiran una casa exterior. El modelo y las pruebas de red existentes cubren asignaciones, habitaciones, eliminación y límite conjunto de cinco casas. Todas las especies siguen disponibles desde el principio.

Los recorridos de mando completan un Quiz, una partida de Loup-Garou y cuatro rondas con álbumes de Gartic. Utilizan paneles reales y acciones validadas por los motores; los participantes adicionales de las pruebas realizan acciones legales mediante el motor. Bloques comprueba inicio, caída con cambio real de puntuación, pausa/reanudación, guía y confirmación mantenida. Esto se añade a las simulaciones de partidas y bots ya documentadas en la entrega anterior.

Gartic usa **entrada mixta elegida por el propietario**: mando para menús, herramientas, envío, álbumes y volver a jugar; teclado/ratón/táctil para escribir y dibujar. No se añadió un teclado en pantalla ni un cursor de dibujo manejado con mando.

La auditoría de idiomas revisa doce pantallas en inglés y francés y recorre expresamente Ollama y la creación de quizzes. Comprueba texto visible, etiquetas accesibles, títulos y marcadores de posición. Los textos escritos por los usuarios se conservan. La paridad automática de los catálogos no constituye por sí sola una certificación lingüística de cada combinación de estados.

El paquete de escritorio actual se prueba con datos temporales separados: sandbox, contexto seguro, puente nativo, importación heredada, exportación real y persistencia tras recarga. Esta comprobación no reconstruye ni publica los instaladores anteriores.

## Límites de la verificación

El mando de las pruebas se inyecta mediante la API Gamepad; no certifica emparejamiento físico USB/Bluetooth. Las pruebas locales con motores y participantes simulados no equivalen a una sesión multijugador por Internet. No se verificaron aquí nuevos instaladores Windows, macOS o Android. El estado de las pruebas automatizadas sobre macOS se detalla en el registro de verificación; no debe confundirse con el Mac físico del informe original.

## Capturas revisadas

- [Cinco casas y mascotas dibujadas en el mundo](images/pets-controls/pets-world.png).
- [Interacción compacta en pantalla móvil](images/pets-controls/pet-panel-mobile.png).
- [Personalización de carpeta](images/pets-controls/folder-appearance.png).
- [Guía de controles en la aplicación real](images/pets-controls/controller-guide-actual.png). La captura muestra las teclas porque el último dispositivo utilizado era teclado/ratón; las pruebas comprueban el cambio a símbolos de mando.
