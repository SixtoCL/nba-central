# NBA Central

Sitio de noticias, estadisticas y cuotas de NBA generado estaticamente. Node.js descarga los datos cada noche, genera HTML y GitHub Actions lo publica.

## Requisitos

- Node.js 18+
- Una cuenta de [balldontlie.io](https://www.balldontlie.io) en plan **GOAT** (39,99$/mes) para estadisticas, promedios de temporada, clasificaciones y lideres.
- Una cuenta de [The Odds API](https://the-odds-api.com) en plan **Professional** (29$/mes) para cuotas de ganador/handicap/total de puntos.
- Un repositorio en GitHub con GitHub Pages activado (Settings → Pages → Source: GitHub Actions).

Hasta que actives esos planes de pago, el sitio funciona igualmente: `teams`, `players`, `games` y las noticias RSS son gratis y se descargan en vivo; el resto de secciones (estadisticas de jugador, clasificaciones, lideres, cuotas) se rellenan con **datos de muestra** claramente marcados (aparece un aviso amarillo "Modo demo" en esas paginas) hasta que añadas las claves reales.

## Uso local

```bash
npm install
cp .env.example .env   # rellena BALLDONTLIE_API_KEY y ODDS_API_KEY si ya las tienes
npm run build           # fetch-data.js + generate-site.js -> dist/
```

Abre `dist/index.html` en el navegador para revisar el resultado.

## Publicacion automatica (GitHub Actions)

1. Sube este proyecto a un repositorio de GitHub.
2. En Settings → Secrets and variables → Actions, añade:
   - `BALLDONTLIE_API_KEY`
   - `ODDS_API_KEY`
3. En Settings → Pages, elige "GitHub Actions" como fuente.
4. El workflow `.github/workflows/update-site.yml` corre cada noche (09:00 UTC) y tambien se puede lanzar a mano desde la pestaña Actions ("Run workflow"). Descarga los datos, regenera el sitio, comitea `data/` actualizado y publica `dist/` en GitHub Pages.

Si prefieres alojar en Hostinger con tu propio dominio, apunta un CNAME de tu dominio a la URL de GitHub Pages, o cambia el ultimo paso del workflow por un `rsync`/FTP hacia tu hosting.

## Google AdSense

En `site.config.json`, rellena `adsense.clientId` (tu `ca-pub-XXXXXXXXXX`) y los `adsense.slots` una vez tengas la cuenta aprobada. Antes de eso, los huecos de anuncio se muestran como placeholders visibles ("Espacio publicitario") para que puedas revisar el maquetado. `generate-site.js` tambien escribe `dist/ads.txt` automaticamente a partir del `clientId`.

## Estructura

- `scripts/fetch-data.js` — descarga equipos/jugadores/partidos (gratis) y, si hay claves validas, estadisticas/clasificaciones/lideres/cuotas (planes de pago). Si una llamada de pago falla, cae a datos de muestra y avisa por consola.
- `scripts/generate-site.js` — renderiza `templates/*.njk` a `dist/` y genera `sitemap.xml`/`robots.txt`.
- `data/` — cache JSON versionado; permite regenerar el sitio sin volver a llamar a las APIs.
- `site.config.json` — nombre del sitio, temporada actual, feeds de noticias, region/mercados de cuotas, AdSense.
