// Shared game logic for the Numbers Auction. Runs in the browser (window.Game) and in Node (require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Game = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_ROUNDS = [
    ['+', '1', '-', '2', '×', '3'],
    ['÷', '15', '7', '×', '25', '20'],
    ['16', '14', '12', '10', '8', '6'],
    ['()', '^', '×', '÷', '+', '-'],
    ['500', '+', '×', '10', '2', '+'],
    ['4', '5', '+', '40', '30', '×'],
    ['+'],
  ];

  const OPERATORS = ['+', '-', '×', '÷', '^'];

  // Map any typed variant to the canonical tile label.
  function normalizeLabel(raw) {
    const s = String(raw).trim();
    if (['x', 'X', '*', '×'].includes(s)) return '×';
    if (['/', '÷'].includes(s)) return '÷';
    if (['-', '−', '–'].includes(s)) return '-';
    if (['()', '( )', '(', ')'].includes(s)) return '()';
    if (/^\d+(\.\d+)?$/.test(s)) return String(Number(s));
    return s;
  }

  function isNumberLabel(label) {
    return /^\d+(\.\d+)?$/.test(label);
  }

  function makeRound(index, labels) {
    const id = 'r' + (index + 1);
    return {
      id,
      name: index === 6 ? 'R7' : 'Round ' + (index + 1),
      items: labels.map((l, i) => ({ id: id + 'i' + i, label: normalizeLabel(l) })),
      status: 'pending', // pending | bidding | resolved
      revealed: false,
      bids: {}, // teamId -> { itemId -> amount }
      results: {}, // itemId -> { winner, price, highBid, tie, tiedTeams, overridden }
    };
  }

  function defaultState() {
    const teams = [];
    for (let i = 1; i <= 10; i++) teams.push({ id: 't' + i, name: 'Team ' + i });
    return {
      version: 0,
      settings: { title: 'Numbers Auction', startingCoins: 100, target: 100, showAllBidsOnReveal: true },
      teams,
      rounds: DEFAULT_ROUNDS.map((labels, i) => makeRound(i, labels)),
      currentRoundId: 'r1',
      display: { view: 'title' },
      timer: { duration: 120, endsAt: null, remaining: 120 },
      expressions: {}, // teamId -> string
      finalReveal: { count: 0 }, // how many teams are revealed, worst first
    };
  }

  // ---------- coins & ownership ----------

  // Coins a team has before `beforeRoundId` (or overall when omitted), counting only resolved rounds.
  function coinsRemaining(state, teamId, beforeRoundId) {
    let coins = Number(state.settings.startingCoins) || 0;
    for (const round of state.rounds) {
      if (beforeRoundId && round.id === beforeRoundId) break;
      if (round.status !== 'resolved') continue;
      for (const item of round.items) {
        const r = round.results && round.results[item.id];
        if (r && r.winner === teamId) coins -= Number(r.price) || 0;
      }
    }
    return coins;
  }

  function ownedPieces(state, teamId) {
    const pieces = [];
    for (const round of state.rounds) {
      if (round.status !== 'resolved') continue;
      for (const item of round.items) {
        const r = round.results && round.results[item.id];
        if (r && r.winner === teamId) pieces.push({ label: item.label, itemId: item.id, roundId: round.id, price: r.price });
      }
    }
    return pieces;
  }

  // ---------- bidding ----------

  function bidAmount(round, teamId, itemId) {
    const v = round.bids && round.bids[teamId] && round.bids[teamId][itemId];
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function teamBidTotal(round, teamId) {
    return round.items.reduce((sum, item) => sum + bidAmount(round, teamId, item.id), 0);
  }

  // Returns { ok, problems: [{teamId, message}] }
  function validateBids(state, round) {
    const problems = [];
    for (const team of state.teams) {
      const available = coinsRemaining(state, team.id, round.id);
      const bids = (round.bids && round.bids[team.id]) || {};
      for (const item of round.items) {
        const raw = bids[item.id];
        if (raw === undefined || raw === null || raw === '') continue;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) problems.push({ teamId: team.id, message: `${team.name}: invalid bid "${raw}" on ${item.label}` });
      }
      const total = teamBidTotal(round, team.id);
      if (total > available + 1e-9) problems.push({ teamId: team.id, message: `${team.name}: bids total ${fmt(total)} but only ${fmt(available)} coins available` });
    }
    return { ok: problems.length === 0, problems };
  }

  // Second-price auction per item. Ties at the top: random winner, pays the tied amount.
  function resolveRound(state, round, rng) {
    rng = rng || Math.random;
    const results = {};
    for (const item of round.items) {
      const bids = state.teams
        .map((t) => ({ teamId: t.id, amount: bidAmount(round, t.id, item.id) }))
        .filter((b) => b.amount > 0)
        .sort((a, b) => b.amount - a.amount);
      if (bids.length === 0) {
        results[item.id] = { winner: null, price: 0, highBid: 0, tie: false, tiedTeams: [], overridden: false };
        continue;
      }
      const high = bids[0].amount;
      const tied = bids.filter((b) => b.amount === high).map((b) => b.teamId);
      let winner, price;
      if (tied.length > 1) {
        winner = tied[Math.floor(rng() * tied.length)];
        price = high;
      } else {
        winner = bids[0].teamId;
        price = bids.length > 1 ? bids[1].amount : 0;
      }
      results[item.id] = { winner, price, highBid: high, tie: tied.length > 1, tiedTeams: tied.length > 1 ? tied : [], overridden: false };
    }
    return results;
  }

  // ---------- expressions ----------

  function tokenize(expr) {
    const tokens = [];
    const src = String(expr || '');
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/\d/.test(c)) {
        let j = i;
        while (j < src.length && /[\d.]/.test(src[j])) j++;
        const text = src.slice(i, j);
        if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`Bad number "${text}"`);
        tokens.push({ type: 'num', value: Number(text), label: String(Number(text)) });
        i = j;
        continue;
      }
      if (c === '(' || c === ')') { tokens.push({ type: c }); i++; continue; }
      const op = normalizeLabel(c);
      if (OPERATORS.includes(op)) { tokens.push({ type: 'op', label: op }); i++; continue; }
      throw new Error(`Unknown symbol "${c}"`);
    }
    return tokens;
  }

  // Strict left-to-right evaluation; parentheses evaluate first. No unary operators.
  function evaluateTokens(tokens) {
    let pos = 0;
    function operand() {
      const t = tokens[pos];
      if (!t) throw new Error('Expression ends early');
      if (t.type === 'num') { pos++; return t.value; }
      if (t.type === '(') {
        pos++;
        const v = sequence();
        if (!tokens[pos] || tokens[pos].type !== ')') throw new Error('Missing ")"');
        pos++;
        return v;
      }
      throw new Error(t.type === 'op' ? `Operator "${t.label}" needs a number before it` : 'Unexpected ")"');
    }
    function sequence() {
      let acc = operand();
      while (pos < tokens.length && tokens[pos].type === 'op') {
        const op = tokens[pos++].label;
        const rhs = operand();
        acc = apply(acc, op, rhs);
      }
      return acc;
    }
    if (tokens.length === 0) throw new Error('Empty expression');
    const v = sequence();
    if (pos < tokens.length) {
      const t = tokens[pos];
      if (t.type === 'num' || t.type === '(') throw new Error('Two numbers in a row need an operator between them');
      throw new Error('Unexpected ")"');
    }
    if (!Number.isFinite(v)) throw new Error('Result is not a finite number');
    return v;
  }

  function apply(a, op, b) {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷':
        if (b === 0) throw new Error('Division by zero');
        return a / b;
      case '^': return Math.pow(a, b);
    }
    throw new Error('Unknown operator ' + op);
  }

  // Count how many of each tile the expression uses.
  function tileUsage(tokens) {
    const used = {};
    let parens = 0;
    for (const t of tokens) {
      if (t.type === 'num' || t.type === 'op') used[t.label] = (used[t.label] || 0) + 1;
      if (t.type === '(') parens++;
    }
    if (parens) used['()'] = parens;
    return used;
  }

  // Full check of a team's expression. Returns { ok, error, result, usedTiles, missing }
  function checkExpression(state, teamId, expr) {
    const out = { ok: false, error: null, result: null, missing: [] };
    if (!expr || !String(expr).trim()) { out.error = 'No expression'; return out; }
    let tokens;
    try { tokens = tokenize(expr); } catch (e) { out.error = e.message; return out; }
    try { out.result = evaluateTokens(tokens); } catch (e) { out.error = e.message; return out; }
    const owned = {};
    for (const p of ownedPieces(state, teamId)) owned[p.label] = (owned[p.label] || 0) + 1;
    const used = tileUsage(tokens);
    for (const [label, count] of Object.entries(used)) {
      const have = owned[label] || 0;
      if (count > have) out.missing.push(`${label === '()' ? '( )' : label} ×${count - have}`);
    }
    if (out.missing.length) { out.error = 'Uses tiles the team does not own: ' + out.missing.join(', '); return out; }
    out.ok = true;
    return out;
  }

  // Score = |target - result|^2 - coins remaining. Lower wins.
  function score(state, teamId) {
    const expr = state.expressions && state.expressions[teamId];
    const check = checkExpression(state, teamId, expr);
    const coins = coinsRemaining(state, teamId);
    if (!check.ok) return { ...check, coins, score: null, diff: null };
    const diff = Math.abs(Number(state.settings.target) - check.result);
    return { ...check, coins, diff, score: diff * diff - coins };
  }

  // All teams ranked best-first; invalid/missing expressions rank last.
  function standings(state) {
    const rows = state.teams.map((t) => ({ team: t, expression: (state.expressions || {})[t.id] || '', ...score(state, t.id) }));
    rows.sort((a, b) => {
      if (a.score === null && b.score === null) return b.coins - a.coins;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return a.score - b.score;
    });
    let rank = 0;
    rows.forEach((r, i) => {
      if (i === 0 || r.score !== rows[i - 1].score || r.score === null) rank = i + 1;
      r.rank = r.score === null ? null : rank;
    });
    return rows;
  }

  // What the screen-shared display is allowed to see.
  function publicState(state) {
    const s = JSON.parse(JSON.stringify(state));
    for (const round of s.rounds) {
      round.bidsEntered = state.teams.filter((t) => teamBidTotal(round, t.id) > 0).length;
      round.bids = {}; // bids are never shown to the room
      if (!(round.status === 'resolved' && round.revealed)) {
        round.results = {};
        if (round.status === 'resolved') round.status = 'closed'; // resolved but not yet revealed
      } else {
        // Only the winner and the price they paid are public.
        for (const [itemId, r] of Object.entries(round.results)) round.results[itemId] = { winner: r.winner, price: r.price };
      }
    }
    // Hidden rounds are now 'closed', so coinsRemaining() on this object ignores them.
    const full = standings(state);
    const revealN = Math.max(0, Math.min(full.length, Number(state.finalReveal && state.finalReveal.count) || 0));
    // Reveal worst first: the last `revealN` rows of the ranking.
    s.final = full.map((r, i) => {
      const shown = i >= full.length - revealN;
      return shown
        ? { teamId: r.team.id, shown: true, rank: r.rank, expression: r.expression, result: r.result, diff: r.diff, coins: r.coins, score: r.score, error: r.error }
        : { shown: false };
    });
    s.expressions = {};
    return s;
  }

  function fmt(n) {
    if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
    const v = Number(n);
    if (Number.isInteger(v)) return String(v);
    return String(Math.round(v * 10000) / 10000);
  }

  return {
    DEFAULT_ROUNDS, OPERATORS, normalizeLabel, isNumberLabel, makeRound, defaultState,
    coinsRemaining, ownedPieces, bidAmount, teamBidTotal, validateBids, resolveRound,
    tokenize, evaluateTokens, checkExpression, tileUsage, score, standings, publicState, fmt,
  };
});
