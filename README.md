# Van Roosmalen – Zijlstra GGZ

Website voor de groepspraktijk. Overgenomen van de goedgekeurde Sites-versie van 29 oktober 2026, inclusief grote portretfoto’s.

## Lokaal

Node.js 22 of nieuwer. Geen dependencies nodig.

```sh
npm start
```

Open http://localhost:3000. Railway bepaalt de poort via PORT.

## Bestanden

- `public/`: alle pagina’s en afbeeldingen
- `public/assets/friendly.css`: aanvullende vormgeving
- `server.mjs`: statische webserver
- `Dockerfile` en `railway.json`: Railway-deployment met healthcheck

## GitHub, Railway en Codex

Koppel deze repository aan een Railway-service, branch main. Een push naar main wordt automatisch gedeployed. Selecteer de repository vervolgens in Codex als project/omgeving.

De bestaande domeinnaam is nog niet omgezet. Wachttijden staan als tekst op de homepage en wachttijdenpagina; werk beide bij.
