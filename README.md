# Van Roosmalen – Zijlstra GGZ

Nederlandstalige praktijkwebsite met een eigen beveiligde beheeromgeving op `/beheer`.

## Ontwikkelen

Node.js 24.14 of nieuwer. Geen externe dependencies.

```sh
npm start
npm test
```

Voor lokaal ontwikkelen: `npm run dev`. Een optionele, niet ingecheckte `.env` wordt alleen in ontwikkelmodus geladen.

## Railway

Deploy branch `main` via de Dockerfile. Vereist: één service-replica en een persistent volume op `/data`.

Variabelen:

- `DATA_DIR=/data`
- `APP_URL=https://<actuele-hostnaam>` (exacte origin, zonder afsluitende slash)
- `BOOTSTRAP_TOKEN`: willekeurige geheime waarde van minimaal 32 bytes, alleen in Railway opslaan.
- `PORT`: door Railway geleverd.

Open `/beheer#setup=<BOOTSTRAP_TOKEN>` om het eerste beheerdersaccount aan te maken. Kies zelf een wachtwoord. Deze route werkt alleen zolang de gebruikersdatabase leeg is; verwijder de bootstrapvariabele daarna desgewenst. Zet nooit wachtwoorden of activatietokens in git.

## Teksten en accounts

- Alle zichtbare tekstfragmenten uit de HTML worden als velden aangeboden per pagina; menu en voettekst hebben gedeelde velden voor de hele website.
- Bewerkingen zijn platte tekst. HTML wordt veilig als tekst weergegeven; nieuwe regels worden regeleinden.
- Opslaan publiceert direct. De geschiedenis kan een wijziging terugdraaien als die velden sindsdien niet opnieuw zijn gewijzigd.
- Beheerders kunnen gebruikers toevoegen, een nieuwe wachtwoordlink maken, rollen wijzigen en accounts uitschakelen. Redacteuren kunnen alleen teksten beheren.
- Activatielinks zijn eenmalig en 48 uur geldig. Deel de link handmatig; het systeem stuurt geen e-mail.
- Sessies verlopen na acht uur. Wachtwoorden worden met scrypt gehasht; sessie- en uitnodigingstokens worden alleen gehasht bewaard. Schrijfacties controleren origin en CSRF-token.

## Opslag en onderhoud

`beheer.sqlite` staat op het persistente volume. Herdeploys behouden teksten, accounts en geschiedenis. De productie-app maakt dagelijks een SQLite-backup in dezelfde map en bewaart 14 dagkopieën. Deze kopieën beschermen tegen herstelbare fouten, maar staan op hetzelfde volume: maak voor noodherstel ook Railway-volumeback-ups. Herstel alleen met gestopte service en behoud een kopie van de oorspronkelijke database.

`public/` bevat de basis-HTML en assets. `lib/content.mjs` kent elk zichtbaar tekstfragment een stabiele sleutel toe op basis van brontekst, context en voorkomen. Als ontwikkelaars de brontekst zelf wijzigen, verandert de sleutel en wordt die nieuwe brontekst gebruikt. Controleer beheerwijzigingen bij structurele HTML-aanpassingen. Verwijder of hernoem geen contentvelden zonder de gevolgen te controleren.

De teksteditor toont per pagina een blokkenoverzicht. De aparte beheeroptie Wachttijden hergebruikt de bestaande tekstvelden en schrijft waarden in één transactie naar de homepage en wachttijdenpagina. Bestaande veldsleutels en wijzigingen blijven behouden. Bij een domeinwijziging moet ook `APP_URL` worden aangepast. Behoud een enkele replica wegens de lokale SQLite-opslag.
