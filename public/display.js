// Screen-shared display. Receives only the public (already-revealed) state from the server.
(() => {
  const G = window.Game;
  const view = document.getElementById('view');
  const stage = document.getElementById('stage');
  const badge = document.getElementById('timer-badge');
  const offline = document.getElementById('offline');
  let state = null;
  let lastFinalShown = 0;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tileClass = (label) => (G.isNumberLabel(label) ? 'num' : 'op');
  const shown = (label) => (label === '()' ? '( )' : label);
  const teamName = (id) => (state.teams.find((t) => t.id === id) || { name: '?' }).name;
  const currentRound = () => state.rounds.find((r) => r.id === state.currentRoundId) || state.rounds[0];

  // ---------- scaling ----------
  function fit() {
    const s = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  }
  window.addEventListener('resize', fit);
  fit();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    }
  });

  // ---------- timer ----------
  function timerRemaining() {
    const t = state && state.timer;
    if (!t) return null;
    if (t.endsAt) return Math.max(0, (t.endsAt - Date.now()) / 1000);
    return t.remaining;
  }
  function timerText(sec) {
    const s = Math.ceil(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  function tickTimer() {
    if (!state) return;
    const rem = timerRemaining();
    const running = !!state.timer.endsAt;
    const big = document.querySelector('.big-timer');
    if (big) {
      big.textContent = timerText(rem);
      big.classList.toggle('low', rem <= 10);
      big.classList.toggle('done', running && rem <= 0);
    }
    const showBadge = !big && running;
    badge.classList.toggle('hidden', !showBadge);
    if (showBadge) {
      badge.textContent = timerText(rem);
      badge.classList.toggle('low', rem <= 10);
    }
  }
  setInterval(tickTimer, 200);

  // ---------- views ----------
  function viewTitle() {
    const s = state.settings;
    return `<div class="slide"><div class="rail"></div><div class="content">
      <h1>Game — ${esc(s.title)}</h1>
      <hr />
      <div class="title-meta">
        <div>Target<strong>${esc(s.target)}</strong></div>
        <div>Starting coins<strong>${esc(s.startingCoins)}</strong></div>
        <div>Teams<strong>${state.teams.length}</strong></div>
        <div>Rounds<strong>${state.rounds.length}</strong></div>
      </div>
      <div class="title-teams">${state.teams.map((t) => `<div>${esc(t.name)}</div>`).join('')}</div>
    </div></div>`;
  }

  function viewRules() {
    const s = state.settings;
    return `<div class="slide"><div class="rail"></div><div class="content">
      <h1>Game — Rules</h1>
      <ul>
        <li>All teams bid on numbers and operators (+, −, ×, ÷, ( ), and ^) and use them to build an expression that evaluates as close to <b>${esc(s.target)}</b> as possible</li>
        <li>All teams start with <b>${esc(s.startingCoins)} coins</b></li>
        <li>Bidding happens in rounds with sealed bids — the highest bidder wins, but <b>pays the second-highest bid</b>
          <ul><li>Your bids across ALL pieces in a round cannot total more than your remaining coins</li></ul>
        </li>
        <li><b>IMPORTANT:</b> expressions are evaluated <b>left-to-right</b>, ignoring order of operations: 2+2×2 = 8, not 6. Parentheses are evaluated first.</li>
        <li>Score = (|${esc(s.target)} − result|)² − coins remaining. <b>Lowest score wins.</b></li>
      </ul>
    </div></div>`;
  }

  function cellHtml(round, item) {
    const revealed = round.status === 'resolved' && round.revealed;
    const r = revealed ? round.results[item.id] : null;
    let who = '', price = '';
    if (r) {
      if (r.winner) { who = esc(teamName(r.winner)); price = G.fmt(r.price); }
      else { who = '<span class="unsold">unsold</span>'; }
    }
    return `<div class="cell"><div class="label ${tileClass(item.label)}">${esc(shown(item.label))}</div><div class="who">${who}</div><div class="price">${price}</div></div>`;
  }

  function roundTag(round) {
    if (round.status === 'bidding') return '<span class="tag">Bidding</span>';
    if (round.status === 'closed') return '<span class="tag">Closed</span>';
    if (round.status === 'pending' && round.id === state.currentRoundId) return '<span class="tag">Up next</span>';
    return '';
  }

  function roundBox(round, extraClass = '') {
    const cur = round.id === state.currentRoundId ? ' current' : '';
    return `<div class="rbox${cur} ${extraClass}"><div class="rhead">${esc(round.name)} ${roundTag(round)}</div>
      <div class="rgrid">${round.items.map((it) => cellHtml(round, it)).join('')}</div></div>`;
  }

  function viewBoard() {
    const rounds = state.rounds;
    // Mirror the slide: rounds 1-3 left, 4-6 right, any further rounds in the centre.
    const left = rounds.slice(0, 3), right = rounds.slice(3, 6), extra = rounds.slice(6);
    // Once every round is revealed, the board carries the countdown for final expressions.
    const allDone = rounds.every((r) => r.status === 'resolved' && r.revealed);
    const finalTimer = allDone
      ? `<div class="final-timer"><div class="ft-label">Final expressions due in</div><div class="big-timer">${timerText(timerRemaining())}</div></div>`
      : '';
    return `<div class="board">
      <div class="col">${left.map((r) => roundBox(r)).join('')}</div>
      <div class="center">
        <h1>Game<br/>Board</h1>
        ${extra.map((r) => roundBox(r, r.items.length <= 1 ? 'r7' : '')).join('')}
        ${finalTimer}
        <div class="target">Target<b>${esc(state.settings.target)}</b></div>
      </div>
      <div class="col">${right.map((r) => roundBox(r)).join('')}</div>
    </div>`;
  }

  function viewRound() {
    const round = currentRound();
    const revealed = round.status === 'resolved' && round.revealed;
    let status;
    if (round.status === 'pending') status = 'Up next';
    else if (round.status === 'bidding') status = `Bidding open — submit your sealed bids (${round.bidsEntered}/${state.teams.length} received)`;
    else if (round.status === 'closed') status = 'Bidding closed — results coming up…';
    else status = 'Results';

    const items = round.items.map((item) => {
      const r = revealed ? round.results[item.id] : null;
      let w = '', p = '';
      if (r) {
        if (r.winner) {
          w = esc(teamName(r.winner));
          p = `paid <b>${G.fmt(r.price)}</b>`;
        } else w = '<span style="color:#888;font-style:italic">unsold</span>';
      }
      return `<div class="item"><div class="t ${tileClass(item.label)}">${esc(shown(item.label))}</div>
        ${revealed ? `<div class="w">${w}</div><div class="p">${p}</div>` : ''}</div>`;
    }).join('');

    let lower = '';
    if (round.status === 'bidding' || round.status === 'closed') {
      // Don't reveal which teams have bid; just a count is in the status line.
      lower = `<div class="progress">${state.teams.map((t) => `<div>${esc(t.name)}</div>`).join('')}</div>`;
    }

    return `<div class="round">
      <div class="top"><div><h1>${esc(round.name === 'R7' ? 'Round 7' : round.name)}</h1><div class="status">${status}</div></div>
      ${revealed ? '' : `<div class="big-timer">${timerText(timerRemaining())}</div>`}</div>
      <div class="items">${items}</div>
      ${lower}
    </div>`;
  }

  function viewStandings() {
    const rows = state.teams.map((t) => {
      const pieces = G.ownedPieces(state, t.id);
      return `<tr><td>${esc(t.name)}</td>
        <td>${pieces.length ? pieces.map((p) => `<span class="tile ${tileClass(p.label)}">${esc(shown(p.label))}</span>`).join('') : '<span class="none">no pieces yet</span>'}</td></tr>`;
    }).join('');
    return `<div class="standings"><h1>Teams</h1>
      <table class="stable"><tr><th style="width:260px">Team</th><th>Pieces owned</th></tr>${rows}</table></div>`;
  }

  function viewFinal() {
    const s = state.settings;
    const shownCount = state.final.filter((r) => r.shown).length;
    const rows = state.final.map((r, i) => {
      if (!r.shown) return `<tr class="hidden-row"><td class="rank">?</td><td>.</td><td>.</td><td>.</td><td>.</td><td>.</td><td>.</td></tr>`;
      const isNew = shownCount > lastFinalShown && i === state.final.length - shownCount;
      const cls = [r.rank === 1 ? 'first' : '', isNew ? 'reveal' : ''].join(' ');
      const exprCell = r.error ? `${esc(r.expression || '—')}<div class="err">${esc(r.error)}</div>` : esc(r.expression);
      return `<tr class="${cls}"><td class="rank">${r.rank ?? '—'}</td><td><b>${esc(teamName(r.teamId))}</b></td>
        <td class="expr">${exprCell}</td><td class="num">${r.error ? '—' : G.fmt(r.result)}</td><td class="num">${r.error ? '—' : G.fmt(r.diff)}</td>
        <td class="num">${G.fmt(r.coins)}</td><td class="score">${r.error ? 'DQ' : G.fmt(r.score)}</td></tr>`;
    }).join('');
    lastFinalShown = shownCount;
    return `<div class="final"><h1>Final Results</h1>
      <div class="sub">Score = (|${esc(s.target)} − result|)² − coins remaining · lowest wins · evaluated left-to-right</div>
      <table class="ftable"><tr><th>#</th><th>Team</th><th>Expression</th><th>Result</th><th>|Δ|</th><th>Coins</th><th>Score</th></tr>${rows}</table></div>`;
  }

  const VIEWS = { title: viewTitle, rules: viewRules, board: viewBoard, round: viewRound, standings: viewStandings, final: viewFinal };

  function render() {
    const fn = VIEWS[state.display && state.display.view] || viewBoard;
    view.innerHTML = fn();
    tickTimer();
  }

  // ---------- live updates ----------
  function connect() {
    const es = new EventSource('/events?role=display');
    es.onmessage = (e) => {
      offline.classList.add('hidden');
      state = JSON.parse(e.data);
      render();
    };
    es.onerror = () => offline.classList.remove('hidden');
  }
  connect();
})();
