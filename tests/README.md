# Test van de score-app

```bash
node tests/test-sync.js        # Node.js + Playwright nodig
```

Test het versturen van uitslagen, in een echte browser, met een nagemaakte server en een nagemaakte Pi-dienst
(die een herstart overleeft, zoals de SD-kaart). **Elk verzoek naar `kpbc.pythonanywhere.com` wordt afgevangen;
er gaat niets echt naar buiten.** Alle gegevens zijn verzonnen.

Gecontroleerd (5 situaties, 18 controles):
1. De pagina laadt zonder fouten en de goede versies van de sync-functies zijn actief.
2. Server bereikbaar: de uitslag gaat weg en de back-up op de Pi wordt gewist.
3. Wifi weg: de match blijft bewaard, in de browser én op de Pi, en de back-up blijft staan.
4. Herstart (lege browser) met wifi terug: de match uit de Pi-wachtrij wordt **precies één keer** verstuurd en daarna gewist.
5. Wifi komt terug (`online`-gebeurtenis): de match wordt precies één keer verstuurd.

Achtergrond: `js/app.js` bevatte oude kopieën van vier functies uit `js/sync.js` en overschreef die, waardoor back-ups op de
Pi's nooit gewist werden. Zie `docs/OVERDRACHT.md` in `Biljart-Test/Testserver`.
