// js/app.js

window.onload = function() {
    // 1. Laad opgeslagen data
    loadStateFromStorage();

    // ✅ NIEUW: herstel van server — NA loadStateFromStorage(), zodat we correct
    // zien wat er al lokaal aanwezig is. (Eerder hing dit aan DOMContentLoaded in
    // sync.js, maar die vuurt vóór window.onload, dus vóór het laden van localStorage.)
    (async function() {
        if (state.players.length === 0 && typeof fetchPlayersFromAPI === 'function') {
            console.log("🔄 Geen spelers lokaal — automatisch ophalen van de server...");
            await fetchPlayersFromAPI();
        }
        if (typeof window.fetchTournamentPlayersFromAPI === 'function') {
            await window.fetchTournamentPlayersFromAPI();
        }
        if (typeof window.restoreCompletedMatchesFromAPI === 'function') {
            window.restoreCompletedMatchesFromAPI();
        }
        if (typeof window.restoreTournamentMatchesFromAPI === 'function') {
            window.restoreTournamentMatchesFromAPI();
        }
    })();

    // 2. (De code voor Beheer Matchen komt van de planner, zie verbinding.js.)
    
    // 3. Initialiseer datumvelden
    const dateInput = document.getElementById('dateSelect');
    if (dateInput) {
        dateInput.value = state.selectedDate;
        dateInput.addEventListener('change', function() { state.selectedDate = this.value; });
        dateInput.addEventListener('input', function() { state.selectedDate = this.value; });
    }
    
    // 4. Start swipe-blokkade voor scoring pagina
    initSwipeProtection();
    
    // 5. Luister naar 'Enter' in wachtwoordveld
    const passwordField = document.getElementById('adminPassword');
    if (passwordField) {
        passwordField.addEventListener('keypress', function(event) {
            if (event.key === 'Enter') checkPassword();
        });
    }
    
    // 6. Initialiseer score display
    updateCurrentScoreDisplay();

    // 7. 🎯 PRESENTER: Focus automatisch op eerste knop bij start
    setTimeout(() => {
        const firstBtn = document.querySelector('#page1 .next-btn, #page1 .friendly-btn');
        if (firstBtn) firstBtn.focus();
    }, 100);

    checkVoorOnderbrokenMatch();
    if (typeof window.syncPendingMatches === 'function') window.syncPendingMatches();
};;

async function checkVoorOnderbrokenMatch() {
    try {
        const localStorageBackup = JSON.parse(localStorage.getItem('biljart_match_backup') || 'null');

        let alleBackups = [];
        try {
            const lokaalResponse = await fetch(LOKAAL_URL + '/backups', { method: 'GET' });
            if (lokaalResponse.ok) {
                alleBackups = await lokaalResponse.json();
            }
        } catch (e) {
            // Lokaal programmaatje niet bereikbaar
        }

        if (localStorageBackup && !alleBackups.some(b => b.matchId === localStorageBackup.matchId)) {
            alleBackups.push(localStorageBackup);
        }

        if (alleBackups.length === 0) return;

        for (const backup of alleBackups) {
            await behandelEenBackup(backup);
        }
        return;
    } catch (e) {
        console.error('Fout bij het checken van onderbroken matches:', e);
    }
}

async function behandelEenBackup(backup) {
    try {
        // ✅ NIEUW: GEEN dialoogvenster meer, in geen enkel geval — de scheids
        // bedient dit scherm via de presenter, waar per-ongeluk-annuleren te
        // riskant is. Alles gebeurt nu automatisch, stil, op de achtergrond.
        if (backup.completed) {
            // ✅ FIX: voorheen riep dit enkel syncPendingMatches() aan, wat
            // ENKEL de aparte wachtrij (pendingMatches) checkt — als een
            // match NOOIT in die wachtrij terechtkwam (bv. omdat de Pi
            // herstartte/de pagina herlaadde TERWIJL de eerste verzendpoging
            // nog liep, vóór een falen ooit werd opgevangen), deed dit dus
            // NIETS voor die specifieke match. We proberen nu de backup-data
            // zelf, rechtstreeks, opnieuw te versturen.
            console.log(`ℹ️ Backup voor afgewerkte match ${backup.matchId} gevonden — rechtstreekse hersynchronisatie proberen.`);
            if (typeof window.syncMatchToAPI === 'function') {
                const matchDataVoorSync = {
                    id: backup.matchId,
                    p1: backup.player1, p2: backup.player2,
                    date: backup.date,
                    discipline: backup.discipline, cat: backup.cat,
                    p1_club_id: backup.p1_club_id, p2_club_id: backup.p2_club_id,
                    p1Score: backup.p1Score, p2Score: backup.p2Score,
                    p1Turns: backup.p1Turns, p2Turns: backup.p2Turns,
                    p1Highest: backup.p1Highest, p2Highest: backup.p2Highest
                };
                await window.syncMatchToAPI(matchDataVoorSync);
            }
            // Extra vangnet: ook de gewone wachtrij nog checken, voor het
            // geval deze match daar via een ANDER pad wél terechtkwam.
            if (typeof window.syncPendingMatches === 'function') {
                await window.syncPendingMatches();
            }
        } else {
            // Match was nog bezig — automatisch herstellen en rechtstreeks
            // naar het scoringsscherm, klaar om verder te spelen.
            console.log(`ℹ️ Onderbroken, nog-lopende match ${backup.matchId} gevonden — automatisch herstellen.`);
            herstelOnderbrokenMatch(backup);
        }
    } catch (e) {
        console.error('Fout bij het verwerken van een backup:', e);
    }
}

function herstelOnderbrokenMatch(backup) {
    const match = state.matches.find(m => String(m.id).trim() === String(backup.matchId).trim());
    if (!match) {
        // ✅ FIX: dit is precies het kwetsbare pad dat gisteren tot
        // dataverlies leidde — de match kon (tijdelijk?) niet in state.matches
        // gevonden worden, en toen werd de HELE backup stilzwijgend gewist.
        // We wissen de backup nu NIET meer automatisch hier — enkel
        // localStorage (dat toch al kwetsbaar is), de Pi-eigen, persistente
        // versie blijft bewust bestaan zodat een volgende poging (bv. na een
        // verse data-ophaling van de server) haar nog kan terugvinden.
        toonTijdelijkeMelding('❌ Kon de bijhorende match niet meteen terugvinden. Probeer het later opnieuw.', '#dc2626');
        localStorage.removeItem('biljart_match_backup');
        return;
    }

    state.currentMatch = match;
    state.player1.score = backup.p1Score;
    state.player1.turns = backup.p1Turns || [];
    state.player1.target = backup.p1Target || match.target1;
    state.player1.highestSeries = backup.p1Highest || 0;
    state.player1.beurtNummer = backup.p1BeurtNummer || 1;
    // ✅ FIX: isWhite was nooit meegenomen in de backup/herstel — daardoor
    // toonden beide spelers na herstel altijd het gele bal-icoontje, ongeacht
    // wie oorspronkelijk wit koos. Speler 1 is altijd wit (zie startMatch()).
    state.player1.isWhite = true;
    state.player2.score = backup.p2Score;
    state.player2.turns = backup.p2Turns || [];
    state.player2.target = backup.p2Target || match.target2;
    state.player2.highestSeries = backup.p2Highest || 0;
    state.player2.beurtNummer = backup.p2BeurtNummer || 1;
    state.player2.isWhite = false;
    state.currentPlayer = backup.currentPlayer;
    state.isNabeurt = backup.isNabeurt;
    state.isFirstPlayerInRound = backup.isFirstPlayerInRound;
    state.turnNumber = backup.turnNumber || 1;
    state.firstToTarget = backup.firstToTarget;
    state.matchEnded = false;
    state.currentInput = backup.currentInput || 0;

    if (typeof window.showPage === 'function') window.showPage(5);
    if (typeof updateCurrentScoreDisplay === 'function') updateCurrentScoreDisplay();
    if (typeof updateScoringPage === 'function') updateScoringPage();
    // ✅ Geen alert meer — het herstel gebeurt nu volledig stil/automatisch
}






// ✅ Automatische afsluiting om 24u, 00u30 en 01u00
(function() {
  const SHUTDOWN_TIMES = ['00:00', '00:30', '01:00'];
  let countdownActive = false;
  let countdownValue = 30;
  let countdownInterval = null;
  let overlay = null;
  let triggeredThisMinute = {};

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);color:white;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999999;font-family:system-ui;text-align:center;';
    overlay.innerHTML = `
      <div style="font-size:1.5rem;margin-bottom:20px;">⏻ Scorebord wordt afgesloten</div>
      <div id="shutdown-countdown" style="font-size:4rem;font-weight:bold;margin-bottom:20px;">30</div>
      <div style="font-size:1.1rem;color:#ccc;">Druk op de Tab-knop van de presenter om te annuleren</div>
    `;
    document.body.appendChild(overlay);
  }

  function removeOverlay() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
  }

  function startCountdown() {
    if (countdownActive) return;
    countdownActive = true;
    countdownValue = 30;
    createOverlay();
    document.getElementById('shutdown-countdown').textContent = countdownValue;

    countdownInterval = setInterval(function() {
      countdownValue--;
      const el = document.getElementById('shutdown-countdown');
      if (el) el.textContent = countdownValue;
      if (countdownValue <= 0) {
        clearInterval(countdownInterval);
        fetch(LOKAAL_URL + '/shutdown', { method: 'POST' }).catch(function() {});
      }
    }, 1000);
  }

  function cancelCountdown() {
    if (!countdownActive) return;
    countdownActive = false;
    clearInterval(countdownInterval);
    removeOverlay();
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Tab' && countdownActive) {
      e.preventDefault();
      cancelCountdown();
    }
  });

  setInterval(function() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const current = hh + ':' + mm;

    if (SHUTDOWN_TIMES.includes(current)) {
      if (!triggeredThisMinute[current]) {
        triggeredThisMinute[current] = true;
        startCountdown();
      }
    } else {
      // reset zodra de minuut voorbij is, zodat het morgen weer kan triggeren
      triggeredThisMinute = {};
    }
  }, 1000);
})();

