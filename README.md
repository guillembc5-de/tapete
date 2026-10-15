# TAPETE

Juego de cartas para el móvil, sin internet, para cuando te dejas la baraja en casa.
Una sola pantalla en la mesa: cada jugador tiene su zona con su montón y su botón **TAPETE**.

## Reglas (versión actual)
- 52 cartas (sin comodines), repartidas entre 2–4 jugadores. Empieza uno al azar.
- Se tira de uno en uno. Tras **A** el siguiente tira 4 cartas, tras **K** 3, tras **Q** 2, tras **J** 1.
- Si en esas cartas sale otra figura, el reto se corta y pasa al siguiente. Si no sale ninguna, quien lanzó el reto se lleva el montón.
- **TAPETE**: dos cartas seguidas iguales, o sándwich (A-5-A). El más rápido en pulsar se lleva el montón.
- Pulsar TAPETE sin que valga: pierdes 2 cartas (debajo del montón).
- Gana quien se queda con las 52 cartas. Los resultados se guardan en **Ranking** (en el propio móvil).

Los números clave (cartas de penalización, pausas…) están al principio de `js/game.js`.

## Probarlo en el ordenador
```
python3 -m http.server 8000      # y abre http://localhost:8000
node tests/game.test.js          # tests de las reglas
```
(Hace falta servirlo por http; abrir `index.html` con doble clic no activa el modo offline.)

## Publicarlo gratis con GitHub Pages
1. En github.com: **New repository** → nombre `tapete` → *Public* → Create.
2. **Add file ▸ Upload files** y arrastra **el contenido** de esta carpeta (no el zip) → *Commit changes*.
3. **Settings ▸ Pages** → *Source: Deploy from a branch* → rama `main`, carpeta `/ (root)` → Save.
4. En 1–2 minutos estará en `https://TU-USUARIO.github.io/tapete/`.

## Instalarlo en el iPhone (sin internet)
1. Abre esa dirección en **Safari** (con conexión, una sola vez).
2. **Compartir ▸ Añadir a pantalla de inicio**.
3. Ábrelo desde el icono: ya funciona en modo avión.

## Actualizar el juego
Cada vez que cambies un archivo, sube el número de `VERSION` en `sw.js` (`tapete-v3`, `tapete-v4`…)
para que los móviles descarguen la versión nueva.

## Cartas y figuras
Cartas de madera grabada con láser (textura `img/wood.jpg`). Las figuras J, Q y K están en `img/faces/`
(`J.png`, `Q.png`, `K.png`) y el medallón del As en `img/faces/A.png`: son máscaras que se pintan con el
color de cada carta (marrón oscuro en picas y tréboles, rojo teja en corazones y diamantes).
K = Guillem, Q = su novia, J = Guillem haciendo el tonto, A = los dos.
Si cambias un PNG por otro del mismo tamaño, sube también el número de `VERSION` en `sw.js`.
