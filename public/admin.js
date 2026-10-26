// Admin console. Owns the game state, saves every change to the server, which pushes the safe subset to the display.
(() => {
  const G = window.Game;
  const $ = (sel, el = document) => el.querySelector(sel);
  const main = $('#main');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tileClass = (label) => (G.isNumberLabel(label) ? 'num' : 'op');
  const shown = (label) => (label === '()' ? '( )' : label);
  const tile = (label, extra = '') => `<span class="tile ${tileClass(label)} ${extra}">${esc(shown(label))}</span>`;

  let state = null;
  let tab = 'rounds';
  let selectedRoundId = null;

  const teamName = (id) => (state.teams.find((t) => t.id === id) || { name: '?' }).name;
  const roundById = (id) => state.rounds.find((r) => r.id === id);

  // ---------- persistence ----------
  let saveTimer = null;
  const saveStatus = $('#save-status');
  function save() {
    saveStatus.textContent = 'Saving…';
    saveStatus.classList.remove('err');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const res = await fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
        if (!res.ok) throw new Error((await res.json()).error || res.statusText);
        const { version } = await res.json();
        state.version = version;
        saveStatus.textContent = 'Saved · display updated';
      } catch (e) {
        saveStatus.textContent = 'Save failed: ' + e.message;
        saveStatus.classList.add('err');
      }
    }, 150);
  }
  // Mutate, save, and re-render.
  function commit(fn) {
    fn();
    save();
    render();
  }

  function toast(msg, isErr) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (isErr ? ' err' : '');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  // ---------- top bar ----------
  const VIEWS = [['title', 'Title'], ['rules', 'Rules'], ['board', 'Board'], ['round', 'Current round'], ['standings', 'Teams'], ['final', 'Final']];
  function renderTopbar() {
    $('#view-switch').innerHTML = VIEWS.map(([k, label]) => `<button data-view="${k}" class="${state.display.view === k ? 'active' : ''}">${label}</button>`).join('');
    const dur = $('#timer-duration');
    if (document.activeElement !== dur) dur.value = state.timer.duration;
    $('#timer-start').textContent = state.timer.endsAt ? 'Pause' : 'Start';
  }
  function setView(v) { commit(() => { state.display.view = v; }); }
  $('#view-switch').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setView(b.dataset.view); });
  $('#open-display').addEventListener('click', () => {
    window.open('/display', 'numbers-auction-display', 'width=1280,height=760');
  });

  // Timer
  const timerRemaining = () => (state.timer.endsAt ? Math.max(0, (state.timer.endsAt - Date.now()) / 1000) : state.timer.remaining);
  const timerText = (sec) => { const s = Math.ceil(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  $('#timer-start').addEventListener('click', () => commit(() => {
    const t = state.timer;
    if (t.endsAt) { t.remaining = timerRemaining(); t.endsAt = null; }
    else { if (t.remaining <= 0) t.remaining = t.duration; t.endsAt = Date.now() + t.remaining * 1000; }
  }));
  $('#timer-reset').addEventListener('click', () => commit(() => { state.timer.endsAt = null; state.timer.remaining = state.timer.duration; }));
  $('#timer-add').addEventListener('click', () => commit(() => {
    if (state.timer.endsAt) state.timer.endsAt += 30000; else state.timer.remaining += 30;
  }));
  $('#timer-duration').addEventListener('change', (e) => commit(() => {
    const v = Math.max(5, Number(e.target.value) || 120);
    state.timer.duration = v;
    if (!state.timer.endsAt) state.timer.remaining = v;
  }));
  setInterval(() => { if (state) $('#timer-readout').textContent = timerText(timerRemaining()); }, 200);

  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    tab = b.dataset.tab;
    document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
    render();
  });

  // ---------- rendering ----------
  function render() {
    renderTopbar();
    if (tab === 'rounds') renderRounds();
    else if (tab === 'final') renderFinal();
    else renderSetup();
  }

  function statusChip(round) {
    if (round.status === 'resolved') return round.revealed ? '<span class="chip revealed">Revealed</span>' : '<span class="chip resolved">Resolved · hidden</span>';
    if (round.status === 'bidding') return '<span class="chip bidding">Bidding</span>';
    return '<span class="chip pending">Not started</span>';
  }

  function teamsMini() {
    return `<table class="teams-mini">${state.teams.map((t) => `<tr><td><b>${esc(t.name)}</b><br/>${G.ownedPieces(state, t.id).map((p) => tile(p.label)).join('')}</td>
      <td class="c">${G.fmt(G.coinsRemaining(state, t.id))} c</td></tr>`).join('')}</table>`;
  }

  // ===== Rounds tab =====
  function renderRounds() {
    if (!selectedRoundId || !roundById(selectedRoundId)) selectedRoundId = state.currentRoundId || state.rounds[0].id;
    const round = roundById(selectedRoundId);
    const list = state.rounds.map((r) => `<button data-round="${r.id}" class="${r.id === selectedRoundId ? 'sel' : ''}">
        <div><b>${esc(r.name)}</b>${r.id === state.currentRoundId ? ' <span class="chip oncast">on screen</span>' : ''}
        <div class="tiles">${r.items.map((i) => tile(i.label)).join('')}</div></div>${statusChip(r)}</button>`).join('');

    main.innerHTML = `<div class="layout">
      <div>
        <div class="panel"><h2>Rounds</h2><div class="round-list" id="round-list">${list}</div></div>
        <div class="panel"><h2>Teams</h2>${teamsMini()}</div>
      </div>
      <div>${roundPanel(round)}</div>
    </div>`;

    $('#round-list').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-round]');
      if (b) { selectedRoundId = b.dataset.round; render(); }
    });
    wireRoundPanel(round);
  }

  function roundPanel(round) {
    const s = round.status;
    const laterResolved = state.rounds.slice(state.rounds.indexOf(round) + 1).some((r) => r.status === 'resolved');
    const actions = [];
    const hints = [];
    if (s === 'pending') {
      actions.push(`<button class="btn dark" data-act="open">Open bidding</button>`);
      hints.push('Opening bidding puts this round on the room screen and resets the timer. Enter each team\'s sealed bids below, then close bidding.');
    } else if (s === 'bidding') {
      actions.push(`<button class="btn dark" data-act="resolve">Close bidding &amp; compute winners</button>`);
      actions.push(`<button class="btn" data-act="unopen">Back to not started</button>`);
      hints.push('Leave a cell blank (or 0) for no bid. Results are computed privately — the room sees nothing until you reveal.');
    } else if (!round.revealed) {
      actions.push(`<button class="btn dark" data-act="reveal">Reveal results to room</button>`);
      actions.push(`<button class="btn" data-act="reopen">Re-open bidding</button>`);
    } else {
      actions.push(`<button class="btn" data-act="hide">Hide results</button>`);
      actions.push(`<button class="btn" data-act="reopen">Re-open bidding</button>`);
      const next = state.rounds[state.rounds.indexOf(round) + 1];
      if (next && next.status === 'pending') {
        actions.push(`<button class="btn primary" data-act="next">Show game board &amp; go to ${esc(next.name)} →</button>`);
        hints.push(`Next step: the room sees the game board with ${esc(next.name)} highlighted. Click <b>Open bidding</b> when you're ready to start it.`);
      } else if (state.rounds.every((r) => r.status === 'resolved' && r.revealed)) {
        const mins = state.settings.finalMinutes ?? 5;
        actions.push(`<span class="row" style="margin:0">Final expressions:
          <input id="final-mins" type="number" min="0.5" step="0.5" value="${mins}" style="width:64px;padding:5px;border:1px solid #ccc;border-radius:5px" /> min</span>`);
        actions.push(`<button class="btn primary" data-act="final-timer">Show board &amp; start final timer</button>`);
        hints.push('All rounds are done. The board shows a "Final expressions due in" countdown. Use the timer controls at the top to pause, add 30s, or reset it. Then enter expressions in the <b>Final Scoring</b> tab.');
      } else if (state.display.view !== 'board') {
        actions.push(`<button class="btn primary" data-act="board">Show game board</button>`);
      }
    }
    if (state.currentRoundId !== round.id) actions.push(`<button class="btn" data-act="cast">Show this round on screen</button>`);
    if (s === 'resolved' && laterResolved) hints.push('Later rounds are already resolved. Changing this round changes coin totals, so re-check later rounds\' budgets.');

    const validation = s === 'bidding' ? G.validateBids(state, round) : { ok: true, problems: [] };

    return `<div class="panel">
      <div class="round-head"><h2>${esc(round.name)}</h2>${round.items.map((i) => tile(i.label)).join('')}${statusChip(round)}</div>
      <div class="actions">${actions.join('')}</div>
      ${hints.map((h) => `<div class="hint">${h}</div>`).join('')}
      <div id="problems">${problemsHtml(validation)}</div>
    </div>
    ${s === 'resolved' ? resultsPanel(round) : ''}
    ${bidsPanel(round)}`;
  }

  function problemsHtml(v) {
    return v.ok ? '' : `<div class="problems"><b>Fix before closing:</b>${v.problems.map((p) => `<div>${esc(p.message)}</div>`).join('')}</div>`;
  }

  function bidsPanel(round) {
    const editable = round.status === 'bidding';
    const resolved = round.status === 'resolved';
    if (round.status === 'pending') return '';
    const rows = state.teams.map((t) => {
      const avail = G.coinsRemaining(state, t.id, round.id);
      const total = G.teamBidTotal(round, t.id);
      const over = total > avail + 1e-9;
      const cells = round.items.map((it) => {
        const raw = (round.bids[t.id] || {})[it.id];
        if (editable) return `<td><input type="number" min="0" step="1" data-team="${t.id}" data-item="${it.id}" value="${raw ?? ''}" /></td>`;
        const win = resolved && round.results[it.id] && round.results[it.id].winner === t.id;
        const amt = G.bidAmount(round, t.id, it.id);
        return `<td class="${win ? 'win' : ''}">${amt ? G.fmt(amt) : '<span class="muted">—</span>'}</td>`;
      }).join('');
      return `<tr class="${over ? 'bad' : ''}" data-row="${t.id}"><td><b>${esc(t.name)}</b></td>${cells}
        <td class="total" data-total="${t.id}">${G.fmt(total)}</td><td>${G.fmt(avail)}</td>
        <td class="${over ? 'no' : 'ok'}" data-ok="${t.id}">${over ? 'Over' : '✓'}</td></tr>`;
    }).join('');
    return `<div class="panel"><h2>Sealed bids ${editable ? '' : '<span class="muted small">(read-only — re-open bidding to edit)</span>'}</h2>
      <table class="grid" id="bid-grid"><tr><th>Team</th>${round.items.map((i) => `<th>${tile(i.label)}</th>`).join('')}<th>Total</th><th>Available</th><th></th></tr>${rows}</table></div>`;
  }

  function resultsPanel(round) {
    const opts = (sel) => `<option value="">— unsold —</option>` + state.teams.map((t) => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    const rows = round.items.map((it) => {
      const r = round.results[it.id] || { winner: null, price: 0, highBid: 0, tie: false, tiedTeams: [] };
      const bids = state.teams.map((t) => G.bidAmount(round, t.id, it.id)).filter((x) => x > 0).sort((a, b) => b - a);
      const tieNote = r.tie ? `<div class="tie-note">Tie between ${r.tiedTeams.map(teamName).map(esc).join(', ')} — picked at random <button class="btn small" data-reroll="${it.id}">Re-roll</button></div>` : '';
      return `<tr><td>${tile(it.label)}</td>
        <td><select data-res-winner="${it.id}">${opts(r.winner)}</select></td>
        <td><input type="number" min="0" step="1" data-res-price="${it.id}" value="${r.price}" /></td>
        <td>${G.fmt(r.highBid)}</td><td>${bids.length > 1 ? G.fmt(bids[1]) : '—'}</td><td>${bids.length}</td>
        <td style="text-align:left">${tieNote}${r.overridden ? '<span class="overridden">EDITED BY ADMIN</span>' : ''}</td></tr>`;
    }).join('');
    return `<div class="panel"><h2>Results</h2>
      <p class="muted small" style="margin-top:-6px">Winner pays the second-highest bid (0 if they were the only bidder). You can override any winner or price.</p>
      <table class="grid"><tr><th>Piece</th><th>Winner</th><th>Price paid</th><th>Highest bid</th><th>2nd bid</th><th># bids</th><th></th></tr>${rows}</table></div>`;
  }

  function wireRoundPanel(round) {
    main.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => roundAction(round, b.dataset.act)));

    const grid = $('#bid-grid');
    if (grid && round.status === 'bidding') {
      grid.addEventListener('input', (e) => {
        const inp = e.target;
        if (!inp.dataset.team) return;
        const bids = (round.bids[inp.dataset.team] = round.bids[inp.dataset.team] || {});
        if (inp.value === '') delete bids[inp.dataset.item]; else bids[inp.dataset.item] = Number(inp.value);
        updateBidRow(round, inp.dataset.team);
        save();
      });
      // Enter moves down to the same piece for the next team.
      grid.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || !e.target.dataset.team) return;
        e.preventDefault();
        const inputs = [...grid.querySelectorAll(`input[data-item="${e.target.dataset.item}"]`)];
        const next = inputs[inputs.indexOf(e.target) + (e.shiftKey ? -1 : 1)];
        if (next) { next.focus(); next.select(); }
      });
    }

    main.querySelectorAll('[data-res-winner]').forEach((sel) => sel.addEventListener('change', () => commit(() => {
      const r = round.results[sel.dataset.resWinner];
      r.winner = sel.value || null;
      if (!r.winner) r.price = 0;
      r.overridden = true;
    })));
    main.querySelectorAll('[data-res-price]').forEach((inp) => inp.addEventListener('change', () => commit(() => {
      const r = round.results[inp.dataset.resPrice];
      r.price = Math.max(0, Number(inp.value) || 0);
      r.overridden = true;
    })));
    main.querySelectorAll('[data-reroll]').forEach((b) => b.addEventListener('click', () => commit(() => {
      const r = round.results[b.dataset.reroll];
      r.winner = r.tiedTeams[Math.floor(Math.random() * r.tiedTeams.length)];
      toast(`${teamName(r.winner)} wins the tie`);
    })));
  }

  function updateBidRow(round, teamId) {
    const avail = G.coinsRemaining(state, teamId, round.id);
    const total = G.teamBidTotal(round, teamId);
    const over = total > avail + 1e-9;
    $(`[data-total="${teamId}"]`).textContent = G.fmt(total);
    const ok = $(`[data-ok="${teamId}"]`);
    ok.textContent = over ? 'Over' : '✓';
    ok.className = over ? 'no' : 'ok';
    $(`[data-row="${teamId}"]`).classList.toggle('bad', over);
    $('#problems').innerHTML = problemsHtml(G.validateBids(state, round));
  }

  function resetTimer() { state.timer.endsAt = null; state.timer.remaining = state.timer.duration; }

  function roundAction(round, act) {
    switch (act) {
      case 'open':
        return commit(() => {
          round.status = 'bidding';
          state.currentRoundId = round.id;
          state.display.view = 'round';
          resetTimer();
        });
      case 'unopen':
        if (Object.keys(round.bids).length && !confirm('Discard the bids entered for this round?')) return;
        return commit(() => { round.status = 'pending'; round.bids = {}; });
      case 'resolve': {
        const v = G.validateBids(state, round);
        if (!v.ok) return toast('Some teams bid more than they have — fix the highlighted rows first.', true);
        return commit(() => {
          round.results = G.resolveRound(state, round);
          round.status = 'resolved';
          round.revealed = false;
          state.timer.endsAt = null;
          state.timer.remaining = 0;
          const ties = Object.values(round.results).filter((r) => r.tie).length;
          toast(ties ? `Resolved — ${ties} tie(s) broken at random. Check before revealing.` : 'Resolved. Check results, then reveal.');
        });
      }
      case 'reveal':
        return commit(() => { round.revealed = true; state.currentRoundId = round.id; state.display.view = 'round'; });
      case 'hide':
        return commit(() => { round.revealed = false; });
      case 'reopen':
        if (!confirm('Re-open bidding? Current results for this round will be discarded (bids are kept).')) return;
        return commit(() => { round.status = 'bidding'; round.revealed = false; round.results = {}; });
      case 'next': {
        const next = state.rounds[state.rounds.indexOf(round) + 1];
        selectedRoundId = next.id;
        return commit(() => { state.currentRoundId = next.id; state.display.view = 'board'; resetTimer(); });
      }
      case 'board':
        return commit(() => { state.display.view = 'board'; });
      case 'final-timer': {
        const mins = Number($('#final-mins').value) || 5;
        const secs = Math.max(30, Math.round(mins * 60));
        return commit(() => {
          state.settings.finalMinutes = mins;
          state.display.view = 'board';
          state.timer.duration = secs;
          state.timer.remaining = secs;
          state.timer.endsAt = Date.now() + secs * 1000;
        });
      }
      case 'cast':
        return commit(() => { state.currentRoundId = round.id; state.display.view = 'round'; });
    }
  }

  // ===== Final tab =====
  function renderFinal() {
    const unfinished = state.rounds.filter((r) => r.status !== 'resolved');
    const rows = state.teams.map((t) => {
      const pieces = G.ownedPieces(state, t.id);
      return `<div class="fs-row" data-team="${t.id}">
        <div><div class="fs-name">${esc(t.name)}</div><div class="muted small">${G.fmt(G.coinsRemaining(state, t.id))} coins left</div></div>
        <div>
          <div class="fs-pieces">${pieces.length ? pieces.map((p) => p.label === '()'
            ? `<button class="tile op" data-ins="(">(</button><button class="tile op" data-ins=")">)</button>`
            : `<button class="tile ${tileClass(p.label)}" data-ins="${esc(p.label)}">${esc(p.label)}</button>`).join('') : '<span class="muted small">No pieces won</span>'}
          </div>
          <div class="fs-expr"><input type="text" spellcheck="false" placeholder="e.g. (500 ÷ 10 + 2) × 2" value="${esc(state.expressions[t.id] || '')}" />
            <button class="btn small" data-back>⌫</button><button class="btn small" data-clear>Clear</button></div>
        </div>
        <div class="fs-result"></div>
      </div>`;
    }).join('');

    const revealed = state.finalReveal.count;
    main.innerHTML = `<div class="layout" style="grid-template-columns: 1fr 380px">
      <div class="panel"><h2>Team expressions</h2>
        ${unfinished.length ? `<div class="hint">${unfinished.length} round(s) not resolved yet: ${unfinished.map((r) => esc(r.name)).join(', ')}.</div>` : ''}
        <p class="muted small" style="margin-top:0">Click a team's tiles to build the expression, or type it (x, *, /, ÷ all work). Each tile can be used once; ( ) needs the parentheses tile. Evaluated strictly left-to-right.</p>
        <div id="fs-list">${rows}</div>
      </div>
      <div>
        <div class="panel"><h2>Reveal to room</h2>
          <p class="small muted" style="margin-top:-4px">Reveals from last place up to the winner.</p>
          <div class="actions">
            <button class="btn dark" data-fin="next" ${revealed >= state.teams.length ? 'disabled' : ''}>Reveal next (${revealed}/${state.teams.length})</button>
            <button class="btn" data-fin="all">Reveal all</button>
            <button class="btn" data-fin="none">Hide all</button>
          </div>
          ${state.display.view !== 'final' ? '<button class="btn primary" data-fin="show">Put Final view on screen</button>' : '<div class="small muted">Final view is on screen.</div>'}
        </div>
        <div class="panel"><h2>Live ranking <span class="muted small">(private)</span></h2><div id="fs-ranking"></div></div>
      </div>
    </div>`;

    state.teams.forEach((t) => updateFinalRow(t.id));
    updateRanking();

    $('#fs-list').addEventListener('input', (e) => {
      const row = e.target.closest('.fs-row');
      if (!row || e.target.tagName !== 'INPUT') return;
      state.expressions[row.dataset.team] = e.target.value;
      updateFinalRow(row.dataset.team);
      updateRanking();
      save();
    });
    $('#fs-list').addEventListener('click', (e) => {
      const row = e.target.closest('.fs-row');
      if (!row) return;
      const input = $('input', row);
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.ins !== undefined) {
        const cur = input.value.trimEnd();
        const ins = b.dataset.ins;
        input.value = cur + (cur && ins !== ')' && !cur.endsWith('(') ? ' ' : '') + ins;
      } else if (b.hasAttribute('data-back')) {
        input.value = input.value.trimEnd().replace(/(\d+(\.\d+)?|\S)$/, '').trimEnd();
      } else if (b.hasAttribute('data-clear')) {
        input.value = '';
      } else return;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    });
    main.querySelectorAll('[data-fin]').forEach((b) => b.addEventListener('click', () => commit(() => {
      const n = state.teams.length;
      if (b.dataset.fin === 'next') state.finalReveal.count = Math.min(n, state.finalReveal.count + 1);
      if (b.dataset.fin === 'all') state.finalReveal.count = n;
      if (b.dataset.fin === 'none') state.finalReveal.count = 0;
      if (b.dataset.fin !== 'none') state.display.view = 'final';
    })));
  }

  function updateFinalRow(teamId) {
    const row = $(`.fs-row[data-team="${teamId}"]`);
    if (!row) return;
    const sc = G.score(state, teamId);
    const input = $('input', row);
    const expr = state.expressions[teamId] || '';
    input.classList.toggle('bad', !!expr && !sc.ok);
    input.classList.toggle('good', sc.ok);
    // Grey out tiles already used.
    let used = {};
    try { used = G.tileUsage(G.tokenize(expr)); } catch {}
    const remaining = { ...used };
    row.querySelectorAll('[data-ins]').forEach((b) => {
      const label = b.dataset.ins === '(' || b.dataset.ins === ')' ? '()' : b.dataset.ins;
      const isUsed = (remaining[label] || 0) > 0;
      b.classList.toggle('used', isUsed);
      if (isUsed && b.dataset.ins !== '(') remaining[label]--;
    });
    $('.fs-result', row).innerHTML = sc.ok
      ? `<div>Result <span class="big">${G.fmt(sc.result)}</span></div><div>|Δ| ${G.fmt(sc.diff)} → ${G.fmt(sc.diff)}² − ${G.fmt(sc.coins)} = <b>${G.fmt(sc.score)}</b></div>`
      : `<div class="err">${esc(expr ? sc.error : 'No expression yet')}</div>`;
  }

  function updateRanking() {
    const rows = G.standings(state);
    $('#fs-ranking').innerHTML = `<table class="grid"><tr><th>#</th><th>Team</th><th>Score</th></tr>${rows.map((r) =>
      `<tr><td>${r.rank ?? '—'}</td><td style="text-align:left">${esc(r.team.name)}</td><td>${r.score === null ? '<span class="muted">DQ</span>' : G.fmt(r.score)}</td></tr>`).join('')}</table>`;
  }

  // ===== Setup tab =====
  function renderSetup() {
    const s = state.settings;
    const started = state.rounds.some((r) => r.status !== 'pending');
    main.innerHTML = `<div class="setup-grid">
      <div>
        <div class="panel"><h2>Game settings</h2>
          <div class="field"><label>Game title</label><input type="text" data-set="title" value="${esc(s.title)}" /></div>
          <div class="field"><label>Starting coins per team</label><input type="number" min="0" data-set="startingCoins" value="${esc(s.startingCoins)}" /></div>
          <div class="field"><label>Target number</label><input type="number" data-set="target" value="${esc(s.target)}" /></div>        </div>
        <div class="panel"><h2>Teams</h2>
          <div id="team-list">${state.teams.map((t, i) => `<div class="row"><span class="muted" style="width:22px">${i + 1}</span>
            <input type="text" data-team-name="${t.id}" value="${esc(t.name)}" />
            <button class="btn small danger" data-team-del="${t.id}">Remove</button></div>`).join('')}</div>
          <button class="btn" id="add-team">+ Add team</button>
        </div>
      </div>
      <div>
        <div class="panel"><h2>Rounds &amp; pieces</h2>
          <p class="muted small" style="margin-top:-4px">Pieces separated by spaces. Use + - x ÷ ^ () or any whole number. Only rounds that haven't started can be edited.</p>
          <div id="round-edit">${state.rounds.map((r) => `<div class="row">
            <input type="text" class="rname" data-rname="${r.id}" value="${esc(r.name)}" ${r.status !== 'pending' ? 'disabled' : ''} />
            <input type="text" class="ritems" data-ritems="${r.id}" value="${esc(r.items.map((i) => i.label).join(' '))}" ${r.status !== 'pending' ? 'disabled' : ''} />
          </div>`).join('')}</div>
          <div class="actions"><button class="btn" id="add-round">+ Add round</button><button class="btn danger" id="del-round">Remove last round</button></div>
        </div>
        <div class="panel"><h2>Reset</h2>
          <p class="muted small" style="margin-top:-4px">Game state is saved automatically to <code>data/state.json</code>, so a refresh or server restart keeps everything.</p>
          <div class="actions">
            <button class="btn danger" id="reset-progress">Clear all bids &amp; results (keep teams/pieces)</button>
            <button class="btn danger" id="reset-all">Factory reset</button>
          </div>
          ${started ? '<div class="hint">The game is in progress.</div>' : ''}
        </div>
      </div>
    </div>`;

    main.querySelectorAll('[data-set]').forEach((inp) => inp.addEventListener('change', () => commit(() => {
      const k = inp.dataset.set;
      if (inp.type === 'checkbox') s[k] = inp.checked;
      else if (inp.type === 'number') s[k] = Number(inp.value) || 0;
      else s[k] = inp.value;
    })));
    main.querySelectorAll('[data-team-name]').forEach((inp) => inp.addEventListener('input', () => {
      state.teams.find((t) => t.id === inp.dataset.teamName).name = inp.value;
      save();
    }));
    main.querySelectorAll('[data-team-del]').forEach((b) => b.addEventListener('click', () => {
      const t = state.teams.find((x) => x.id === b.dataset.teamDel);
      if (!confirm(`Remove ${t.name}? Their bids and won pieces are removed too.`)) return;
      commit(() => {
        state.teams = state.teams.filter((x) => x.id !== t.id);
        for (const r of state.rounds) {
          delete r.bids[t.id];
          for (const res of Object.values(r.results)) if (res.winner === t.id) { res.winner = null; res.price = 0; }
        }
        delete state.expressions[t.id];
      });
    }));
    $('#add-team').addEventListener('click', () => commit(() => {
      let n = state.teams.length + 1;
      let id = 't' + n;
      while (state.teams.some((t) => t.id === id)) id = 't' + ++n;
      state.teams.push({ id, name: 'Team ' + (state.teams.length + 1) });
    }));
    main.querySelectorAll('[data-rname]').forEach((inp) => inp.addEventListener('change', () => commit(() => { roundById(inp.dataset.rname).name = inp.value; })));
    main.querySelectorAll('[data-ritems]').forEach((inp) => inp.addEventListener('change', () => {
      const labels = inp.value.split(/\s+/).filter(Boolean).map(G.normalizeLabel);
      const bad = labels.filter((l) => !G.isNumberLabel(l) && !G.OPERATORS.includes(l) && l !== '()');
      if (bad.length) { toast('Unknown piece(s): ' + bad.join(', '), true); return render(); }
      if (!labels.length) { toast('A round needs at least one piece', true); return render(); }
      commit(() => {
        const r = roundById(inp.dataset.ritems);
        r.items = labels.map((l, i) => ({ id: r.id + 'i' + i, label: l }));
        r.bids = {};
        r.results = {};
      });
    }));
    $('#add-round').addEventListener('click', () => commit(() => {
      let n = state.rounds.length;
      while (state.rounds.some((r) => r.id === 'r' + (n + 1))) n++;
      const r = G.makeRound(n, ['+']);
      r.name = 'Round ' + (state.rounds.length + 1);
      state.rounds.push(r);
    }));
    $('#del-round').addEventListener('click', () => {
      const last = state.rounds[state.rounds.length - 1];
      if (state.rounds.length <= 1) return;
      if (last.status !== 'pending') return toast('That round has already started.', true);
      commit(() => { state.rounds.pop(); if (state.currentRoundId === last.id) state.currentRoundId = state.rounds[0].id; });
    });
    $('#reset-progress').addEventListener('click', () => {
      if (!confirm('Clear ALL bids, results, and expressions? Teams and pieces stay.')) return;
      commit(() => {
        for (const r of state.rounds) { r.status = 'pending'; r.revealed = false; r.bids = {}; r.results = {}; }
        state.expressions = {};
        state.finalReveal = { count: 0 };
        state.currentRoundId = state.rounds[0].id;
        state.display.view = 'title';
        resetTimer();
      });
    });
    $('#reset-all').addEventListener('click', () => {
      if (!confirm('Factory reset? Everything goes back to the default 10 teams and 7 rounds.')) return;
      commit(() => { const v = state.version; state = G.defaultState(); state.version = v; });
    });
  }

  // ---------- boot ----------
  fetch('/api/state').then((r) => r.json()).then((s) => {
    state = s;
    saveStatus.textContent = 'Connected';
    render();
  }).catch(() => { saveStatus.textContent = 'Cannot reach server — is `npm start` running?'; saveStatus.classList.add('err'); });
})();
