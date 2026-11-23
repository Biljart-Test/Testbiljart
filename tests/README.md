# Test van de score-app

```bash
node tests/test-sync.js        # Node.js + Playwright nodig
TESTSERVER=<map Testserver> PYTHON=<python met Flask> node tests/test-koppelen.js .   # echte planner + echt Pi-programma
```

Test het versturen van uitslagen, in een echte browser, met een nagemaakte planner (`https://planner.test`) en een nagemaakt lokaal Pi-programma
(dat een herstart overleeft, zoals de SD-kaart). **Er gaat niets echt naar buiten.** Alle gegevens zijn verzonnen. De test controleert ook dat de sleutel van het toestel meegestuurd wordt en dat er geen KPBC-adres meer in de app staat.

Gecontroleerd (5 situaties, 18 controles):
1. De pagina laadt zonder fouten en de goede versies van de sync-functies zijn actief.
2. Server bereikbaar: de uitslag gaat weg en de back-up op de Pi wordt gewist.
3. Wifi weg: de match blijft bewaard, in de browser én op de Pi, en de back-up blijft staan.
4. Herstart (lege browser) met wifi terug: de match uit de Pi-wachtrij wordt **precies één keer** verstuurd en daarna gewist.
5. Wifi komt terug (`online`-gebeurtenis): de match wordt precies één keer verstuurd.

Achtergrond: `js/app.js` bevatte oude kopieën van vier functies uit `js/sync.js` en overschreef die, waardoor back-ups op de
Pi's nooit gewist werden. Zie `docs/OVERDRACHT.md` in `Biljart-Test/Testserver`.


## test-koppelen.js (de nieuwe werkwijze met toestellen)

Draait het **echte** lokale Pi-programma (`pi/biljart_lokaal.py`) en een **echte** testplanner uit de repo `Testserver`, met de score-app in een browser:
1. Nieuw toestel: blokscherm met koppelcode van 6 cijfers; de app is niet te bedienen (ook niet met de presenter-toetsen); nog geen gegevens.
2. Code typen in de planner (pagina Toestellen): het scherm verdwijnt vanzelf, spelers komen binnen met de sleutel, de koptekst toont de clubnaam van de planner, alle aanroepen gaan naar het adres uit de instellingen, de QR-inlogknop is verborgen.
3. Uitschakelen in de planner: duidelijk bericht en geen gegevens; weer inschakelen: scherm weg.
4. Planner onbereikbaar bij het opstarten: "Geen verbinding, er wordt niet gespeeld", app niet te bedienen.

## Wat er veranderd is (deel 3)
- `js/lock.js` (URL-code `?code=OPENSESAME` en pincode) is vervangen door `js/verbinding.js`: vraagt aan het lokale programma het serveradres, de sleutel en de koppelstatus, en toont het blokscherm.
- Alle aanroepen naar de planner gaan via `serverFetch()`; geen vast serveradres meer in de code. Het lokale programma heeft één adres (`LOKAAL_URL`), ook voor afsluiten (nu `POST /shutdown`).
- De clubnaam in de koptekst en de titel komt van de planner (`/api/club`).
- De knop "QR code voor inlog" is verborgen (functie bewaard); opslagnaam `kpbc_match_backup` is `biljart_match_backup`.
- Midden in een match komt nooit een blokscherm: de uitslag komt in de wachtrij en gaat later alsnog weg.

## test-tornooi32.js: een heel tornooi van 32 in de echte score-app
Echte testplanner + echt Pi-programma + de score-app. Een tornooi met 32 spelers en dubbele uitschakeling (62 matchen) wordt **volledig uitgespeeld via de app**, ronde per ronde, zoals een scheidsrechter dat zou doen (match kiezen, witte bal, spelen, Hoofdmenu). De planner plant telkens wat speelklaar is (hier vereenvoudigd via de database). Gecontroleerd: de app toont in elke ronde precies de matchen die klaar staan, geen "ONBEKEND" als naam bij doorgeschoven spelers, een **herstart (lege browser) midden in een ronde en na een ronde** toont enkel nog te spelen matchen, elke match precies één keer gespeeld en bevestigd, elke match een winnaar en verliezer, niemand verliest meer dan twee keer, het tornooi staat op `completed`. Duurt ongeveer 3,5 minuut.

## test-tornooi-wifi.js: verbinding weg op het einde van een tornooimatch
De uitslag mag niet verloren gaan: de back-up van de afgewerkte match blijft op de Pi, na een herstart met verbinding gaat de uitslag **precies één keer** naar de planner, daarna wordt de back-up gewist en gebeurt er bij volgende starts niets meer.

Beide tests gebruiken `tests/lib/omgeving.js` (start planner, Pi-programma en een eenvoudige webserver voor de app) en hebben `TESTSERVER` en `PYTHON` nodig.

## Fouten die deze tests aan het licht brachten (hersteld)
- **Pi-programma:** de app stuurt bij elke klik een back-up, vaak meerdere tegelijk. Ze schreven naar hetzelfde tijdelijke bestand (tientallen 500-fouten), en de wachtrij voor verbindingen was te klein.
- **Pi-programma:** de laatste twee back-ups van een beurt komen soms in omgekeerde volgorde aan, waardoor er een **oude stand** (36 punten, niet afgelopen) over de eindstand heen werd geschreven. Nu wint de nieuwste (`savedAt`).
- **Score-app:** na een geslaagde verzending van een tornooi-uitslag bleef de back-up op de Pi staan (bij de competitie werd hij wel gewist). Nu wordt hij gewist.

## Codes van het bestuur (in `test-koppelen.js`)
`admin123` (Beheer Matchen) en `8970` (Dames-avond) staan niet meer in de app. De codes staan in de planner (Clubinstellingen) en komen enkel naar een goedgekeurd toestel. Getest: zonder codes zijn de knoppen verborgen en opent `admin123` niets (ook niet als je de knop omzeilt); met codes verschijnen de knoppen, werken de oude codes niet en de nieuwe wel.

## test-tornooi-dubbel.js: tornooi-dubbeltje (4 spelers per match) met wissel van de witte bal
Echte planner + echt Pi-programma + app. Een dubbeltje-tornooi met 4 paren (2 halve finales en een finale) wordt via de app gespeeld, met de echte start (volgorde per team met de presenter-toets, witte bal kiezen). **Het belangrijkste: als paar 2 de witte bal krijgt, staan de teams in de app omgewisseld.** De test leest uit de planner welk paar welke spelers heeft en controleert na elke match dat de score van het paar dat in de app **links** staat bij **dat paar** in de planner staat (en rechts hetzelfde), dat de winnaar klopt, en dat het winnende paar 70 punten haalde. Drie combinaties: wit = paar 1 (paar 1 wint), wit = paar 2 (paar 2 wint) en wit = paar 2 (paar 1 wint). Met de oude fout (punten van paar 2 bij paar 1 en omgekeerd, zoals gemeld op het café) zou de test falen; dat is gecontroleerd door de oude code tijdelijk terug te zetten.

## test-tornooi-dubbel-wifi.js: dubbeltje-uitslag bij verbindingsuitval op het einde
Een dubbeltje-uitslag ging vroeger **verloren** als de verbinding op het einde wegviel (enkel een `console.warn`; geen back-up, geen wachtrij; de match bleef "nog te spelen" in de planner). Nu komt de uitslag in de wachtrij (browser en Pi), wordt na een herstart met verbinding één keer naar het **tornooi-adres** gestuurd (niet als competitiematch), met de punten bij het juiste paar, en de wachtrij is daarna leeg.

## test-klassement.js: het klassement in de app volgt de puntentelling van de planner
De app rekende vroeger zelf klassementspunten uit (vaste 20/20/40 beurten, ondergrens -5, dames 3-2-1) en negeerde dus wat het bestuur in de planner instelde. Nu rekent de planner en toont de app wat zij meestuurt. De test laat de app (Competitie Stand, kruistabel en het rustscherm) het klassement tonen met gegevens uit een echte planner (9 spelers in vrijspel, driebanden en dames, 9 matchen) en vergelijkt MPTN en PTNVS van elke speler met een **onafhankelijke uitrekening**, voor: de standaard (beurtenbonus), 3-2-1, 12/11, en beurtenbonus met eigen referentiebeurten en een eigen ondergrens. Ook: een zeer trage driebandenmatch toont in de kruistabel de -10 van de planner (de app rekende vroeger met -5), en een speler met modus "kleiner" krijgt het juiste voorlopige doel. Sabotages (de app negeert de punten van de planner; vaste referentiebeurten) worden opgemerkt.

## test-matchoverzicht.js: klassementspunten in het overzicht na een match
Een competitiematch spelen in de app (echte planner en Pi-programma) en kijken wat het overzicht toont: bij de standaard (beurtenbonus) +10 (groen) en 0 (grijs), en -5 (rood) voor een speler die niets maakte; bij 3-2-1 en 5-3-0 de juiste plus- en nulwaarden; bij dames +3 en +1; en bij een verbinding die wegvalt staat er "volgen zodra de uitslag verstuurd is" in plaats van een verzonnen getal. Beide spelers hebben evenveel beurten. Een tornooimatch toont geen klassementspunten (`test-tornooi32.js`). Sabotages (de app negeert de punten, plus en min in de verkeerde kleur, de punten bij de verkeerde speler) worden opgemerkt.

## test-spelregels.js: Dubbeltje en Triatlon op één plaats
De drempels, maxima en het doel (70) van Dubbeltje, Triatlon klein en groot, het 3-spelersspel en de gewone spellen zijn vergeleken met de getallen van vóór het centraliseren (`js/spelregels.js`), de regels zijn bevroren, en geen enkel ander bestand bevat nog een eigen kopie (de 70, de drempels of de lijst van fase-spellen).

## test-disciplines.js: andere disciplines en categorieën in de app
De disciplines van de club komen van de planner (`/api/club`, centraal in `js/disciplines.js`). De test zet in een echte testplanner de disciplines Libre (categorie A en B), Kader 47/2 en Pool, en kijkt in de app: de lijst en volgorde van de club, letters als categorie blijven letters (vroeger werd alles "1"), rangschikking en kruistabel per discipline en categorie, de kaartjes voor een vriendschappelijke match (Triatlon en Dubbeltje blijven staan), en dat een match in een andere discipline **nooit stilzwijgend Driebanden wordt** (vroeger gebeurde dat). Zonder instelling van de club geldt de oude indeling (Vrijspel, Bandstoten, Driebanden). Zes sabotages zijn opgemerkt.
