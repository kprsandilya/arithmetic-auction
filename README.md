# Numbers Auction

A local web app for running the **Numbers (Arithmetic) Auction** trading game. Teams bid on numbers and operators across several rounds, then use what they won to build an expression as close to 100 as possible.

The app has two windows:

- **Admin**: your private control panel. You type in bids, compute winners, enter final expressions, and decide what the room sees.
- **Display**: the screen you share with participants. It only ever shows information you have chosen to reveal.

No dependencies are needed beyond Node.js, and nothing is sent over the internet. The app runs only on your computer.

---

## Contents

- [Installation](#installation)
- [Starting the app](#starting-the-app)
- [Game rules](#game-rules)
- [Admin guide](#admin-guide)
- [What participants can and cannot see](#what-participants-can-and-cannot-see)
- [Default pieces](#default-pieces)
- [Saving, resetting and recovering](#saving-resetting-and-recovering)
- [Troubleshooting](#troubleshooting)
- [Project structure](#project-structure)

---

## Installation

You need:

- **Node.js 18 or newer.** Check with `node --version`. If it's missing, install the LTS version from https://nodejs.org.
- **Git**, to download the project (or download the ZIP from GitHub instead).
- A modern browser: Chrome, Edge, Firefox or Safari.

Download the project:

```bash
git clone https://github.com/Boiler-Quant/arithmetic-auction.git
cd arithmetic-auction
```

There is nothing to `npm install`. The app uses only Node's built-in modules.

## Starting the app

From the project folder:

```bash
npm start
```

The terminal prints:

```
Numbers Auction running
  Admin:   http://localhost:3000/admin
  Display: http://localhost:3000/display   (screen-share this one)
```

1. Open **http://localhost:3000/admin** in your browser.
2. Click **Open display window ↗** at the top of the admin page. This opens the display in its own window. You can also open http://localhost:3000/display yourself.
3. In Zoom, Teams, Meet or similar, **share only the display window**, not your whole screen. Keep the admin window private.
4. Click inside the display window and press **F** for fullscreen. Press **F** again to exit.

The display scales itself to any window size and keeps a 16:9 layout, so it looks the same on a projector or a screen share.

To stop the app, press **Ctrl+C** in the terminal.

**Port 3000 already in use?** Run on another port:

- macOS / Linux: `PORT=4000 npm start`
- Windows PowerShell: `$env:PORT=4000; npm start`

The server only listens on `127.0.0.1`, so other computers on your network cannot reach it.

---

## Game rules

These are the rules the app enforces. The **Rules** screen on the display shows the participant-facing version.

- **Teams:** 10 teams by default (editable). Each starts with **100 coins**.
- **Rounds:** 7 by default. Each round offers a set of pieces: numbers and the operators `+`, `−`, `×`, `÷`, `^` and `( )`.
- **Sealed second-price bidding:** each team secretly submits a bid on any pieces in the round. For each piece:
  - The highest bid wins.
  - The winner pays the **second-highest** bid. A sole bidder pays **0**.
  - If no one bids, the piece goes **unsold**.
  - If two or more teams tie for the highest bid, the app picks the winner **at random** among them. That team pays the tied amount.
- **Budget:** a team's bids in one round, added together across all pieces, cannot exceed its remaining coins.
- **Expressions:** after the last round, each team builds one expression from the pieces it won.
  - Each piece can be used **once**. A `( )` piece gives one pair of parentheses.
  - Expressions are evaluated strictly **left to right**, ignoring the usual order of operations. `2 + 2 × 2 = 8`, not 6.
  - Parentheses are evaluated first.
  - `−` only works between two numbers, so negative numbers such as `−3` aren't allowed. Two numbers can't sit next to each other to make a bigger number.
  - A single number on its own is a valid expression.
- **Scoring:** `score = (|100 − result|)² − coins remaining`. **Lowest score wins.** Teams with the same score share a rank.
- **Disqualification:** a team with no valid expression is ranked last ("DQ"). That includes using pieces it doesn't own, dividing by zero, or leaving it blank.

---

## Admin guide

### The top bar (always visible)

| Control | What it does |
|---|---|
| **Open display window ↗** | Opens the screen-share window. |
| **Room screen** buttons | Choose what the display shows: **Title**, **Rules**, **Board**, **Current round**, **Teams**, **Final**. The display switches instantly. |
| **Timer** | Shared countdown. Set the duration in seconds, then **Start/Pause**, **+30s**, **Reset**. It appears large on the round screen and as a small badge on other screens while running. It turns red in the last 10 seconds and blinks at 0:00. |
| Save status (right) | Shows "Saved · display updated" after every change. If it shows an error, the server has stopped; see [Troubleshooting](#troubleshooting). |

### Before the game: Setup tab

1. **Game settings:** title, starting coins and target number (default 100).
2. **Teams:** rename teams to match the room. You can add or remove teams.
3. **Rounds & pieces:** each round is one line of pieces separated by spaces, for example `10 / 4 + 20 7`.
   - Numbers and `+ - x / ^ ()` are accepted. `*` and `÷` also work.
   - Only rounds that haven't started can be edited. You can add a round or remove the last one.
4. Put **Title** on screen while teams sit down, then **Rules** while you explain the game.

### Running each round: Rounds & Bidding tab

The left column lists every round with its status. Below it is a private team summary showing each team's coins and pieces. The selected round's controls are on the right.

1. **Open bidding.** This puts the round on the display, marks it "Bidding open", and resets the timer. Click **Start** on the timer when you're ready.
2. **Enter the sealed bids** in the grid: one row per team, one column per piece.
   - Leave a cell blank (or 0) for no bid.
   - **Tab** moves across a row. **Enter** moves down to the next team, and **Shift+Enter** moves up.
   - Each row shows the team's total and available coins. A row turns **red** if the team has bid more than it has, and you can't close bidding until it's fixed.
   - The display shows how many teams have bids entered (e.g. "7/10 received") but not who or how much.
3. **Close bidding & compute winners.** Winners and prices are calculated **privately**; the room sees "Bidding closed — results coming up…". The results table shows each piece's winner, price paid, highest bid, second bid and number of bids.
   - **Ties** are flagged ("Tie between Team 3, Team 4 — picked at random"). Click **Re-roll** to pick again.
   - You can **override** any winner (dropdown) or price (number box). Edited rows are marked "EDITED BY ADMIN".
   - **Re-open bidding** throws away the results but keeps the bids so you can fix a typo.
4. **Reveal results to room.** The display shows each piece with the **winning team and the price it paid**, and nothing else. Use **Hide results** to take them back down.
5. **Show game board & go to Round N →.** The display switches to the game board. It shows every revealed result so far, with the next round outlined and tagged "Up next". Click **Open bidding** when you're ready to start that round.

Repeat steps 1–5 for every round.

**Show this round on screen** puts any round back on the display, for example to revisit earlier results.

### After the last round: final expressions timer

When the final round is revealed, its panel shows **Final expressions: [5] min** and **Show board & start final timer**.

- Set the minutes and click the button. The display shows the game board with a large **"Final expressions due in"** countdown in the centre.
- The top-bar timer controls (Pause, +30s, Reset) still work.
- The minutes you choose are remembered.

### Scoring: Final Scoring tab

1. For each team, enter its expression in one of two ways:
   - **Click the team's tiles**, which only shows pieces that team won. Used tiles grey out. Use **⌫** to remove the last piece and **Clear** to start over.
   - **Type it.** `x`, `*`, `/` and `÷` all work, and spaces don't matter.
2. Each row checks the expression live:
   - **Green border:** valid. It shows the result and the full score calculation, e.g. `|Δ| 2 → 2² − 35 = −31`.
   - **Red border:** invalid, with the reason (uses a piece the team doesn't own, missing `)`, two numbers in a row, and so on).
3. The **Live ranking** panel on the right is private to you.
4. **Reveal to room:**
   - **Put Final view on screen** shows the leaderboard with every row hidden.
   - **Reveal next** uncovers one team at a time, **from last place up to the winner**.
   - **Reveal all** / **Hide all** do what they say.

The final leaderboard shows rank, team, expression, result, distance from 100, coins remaining and score.

---

## What participants can and cannot see

The server sends the display a filtered copy of the game, so hidden information never reaches the screen-share window. This holds even if someone inspects the page.

| Information | Visible to participants? |
|---|---|
| Pieces in every round (the board) | Yes, from the start |
| Whether bidding is open or closed, and how many teams have bids entered | Yes |
| Individual bids (any team, any round) | **Never** |
| Highest or second-highest bids, and whether a piece was tied | **Never** |
| Winner and price paid for each piece | Only after you click **Reveal** |
| Each team's remaining coins | **No**, only on the final leaderboard (teams can work it out from revealed prices) |
| Pieces each team owns | Yes, on the **Teams** screen, for revealed rounds only |
| Final expressions and scores | Only as you reveal them on the **Final** screen |

---

## Default pieces

New games and **Factory reset** use this set of 37 pieces (21 numbers, 16 operators):

| Round | Pieces |
|---|---|
| 1 | `+ 2 − 5 × 9` |
| 2 | `10 ÷ 4 + 20 7` |
| 3 | `25 50 3 11 8 1` |
| 4 | `× + − ÷ ^ ( )` |
| 5 | `500 33 × 12 6 +` |
| 6 | `40 5 × 2 60 −` |
| R7 | `×` |

There are many routes to exactly 100, so teams compete on price rather than luck:

- 25 × 4, 50 × 2, 20 × 5, 10 ^ 2, 40 + 60, 500 ÷ 5
- 33 × 3 + 1, 11 × 9 + 1, 12 × 8 + 4
- 7 + 3 × 10, which is only correct because of left-to-right order.

No single number is close to 100, because a lone number is a valid expression.

To change the defaults permanently, edit `DEFAULT_ROUNDS` in `public/game.js`.

---

## Saving, resetting and recovering

- **Autosave:** every change is saved immediately to `data/state.json`.
  - Refreshing either window, closing the browser, or restarting the server (`Ctrl+C`, then `npm start`) loses nothing.
  - The `data/` folder is in `.gitignore`, so game results are never committed.
- **Clear all bids & results** (Setup tab) keeps your team names and pieces but restarts the game from Round 1.
- **Factory reset** (Setup tab) restores the default 10 teams, 7 rounds and default pieces.
- **Start completely fresh:** stop the server, delete `data/state.json`, and run `npm start`.
- **Back up a game:** copy `data/state.json` somewhere safe. To restore it, stop the server, put the file back, and start the server again.

Only use **one admin window** at a time. Two admin tabs could overwrite each other's changes.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Admin shows "Cannot reach server" or "Save failed" | The server isn't running. Start it with `npm start` and refresh the admin page. |
| Display shows "Reconnecting to game server…" | Same as above. The display reconnects automatically once the server is back. |
| `EADDRINUSE` error on start | Another program (or another copy of this app) is using port 3000. Close it or use a different `PORT`. |
| Display looks out of date after updating the code | Refresh both windows. If `public/game.js` or `server.js` changed, restart the server too. |
| Fonts look plain | The headings use Google Fonts. Offline, the app falls back to system fonts and still works normally. |
| "Open display window" does nothing | Your browser blocked the pop-up. Allow pop-ups for `localhost`, or open `/display` in a new window yourself. |

---

## Project structure

```
server.js            Local HTTP server: serves pages, saves state, pushes live updates (Server-Sent Events)
public/game.js       All game rules: auctions, budgets, expression parsing, scoring, what the display may see
public/admin.*       Admin console
public/display.*     Screen-share display
public/shared.css    Shared colours and tile styles
data/state.json      Saved game (created automatically, not committed)
```

The admin sends the full game state to the server after each change. The server saves it, then sends each open display window a filtered copy containing only revealed information.
