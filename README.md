# Numbers Auction

Admin console + screen-share display for the Numbers (Arithmetic) Auction game. No dependencies — just Node.js.

```
npm start
```

- **Admin** (keep private): http://localhost:3000/admin
- **Display** (screen-share this): http://localhost:3000/display — or click **Open display window** in the admin. Press **F** in the display window for fullscreen.

The display only ever receives revealed information: bids and results stay hidden until you click **Reveal**.
Game state autosaves to `data/state.json`; delete that file (or use Setup → Factory reset) to start over.

## Running a game

1. **Setup** tab: rename teams, adjust coins/target/pieces if needed.
2. **Rounds & Bidding**: *Open bidding* → start the timer → type each team's sealed bids (Tab moves across, Enter moves down). Over-budget rows turn red.
3. *Close bidding & compute winners* → check results (ties are broken randomly; re-roll or override any winner/price) → *Reveal results to room*.
4. *Show game board & go to next round* puts the board on screen with the next round highlighted; click *Open bidding* when ready.
5. After the last round is revealed, set the minutes and click *Show board & start final timer*: the board shows a "Final expressions due in" countdown.
6. **Final Scoring**: enter each team's expression (click their tiles or type). It checks they only use tiles they own and evaluates strictly left-to-right. Use *Reveal next* to unveil the leaderboard from last place to first.

Scoring: `(|100 − result|)² − coins remaining`, lowest wins. Invalid or missing expressions are disqualified (ranked last).
