# Projectafspraken

- Nederlandstalige GGZ-praktijkwebsite, behoud logo en bestaande warme huisstijl.
- Gebruik aparte pagina’s met eigen URL’s, geen modals voor inhoud.
- Contact is een gewone menulink, geen opvallende call-to-action. Voeg geen contactformulier of aanmeldknoppen toe.
- Behoud bestaande zorginhoud en verwijzingsinformatie; verzin geen behandelclaims, wachttijden of registratiegegevens.
- Houd de vier grote portretten op de individuele profielpagina’s.
- HTML/CSS/JS met dependencyvrije Node 24-webserver, SQLite op persistent volume en beheeromgeving. Start met npm start; controleer wijzigingen met npm test.
- Behoud origin- en CSRF-controles, rolcontroles, veilige cookies en scrypt-wachtwoordhashes.
- Bewaar nooit accounts, tokens, databasebestanden of .env in git. Beheerdata staat buiten public/.
- Tekstvelden worden afgeleid van de basis-HTML. Wijzigingen aan brontekst veranderen veldsleutels; houd rekening met bestaande CMS-teksten.
- Controleer gewijzigde links en desktop- en mobiele opmaak voor publicatie.
