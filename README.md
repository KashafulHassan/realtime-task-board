# Real-Time Collaborative Task Board

A live Kanban board where multiple users see changes instantly, know who is
online, survive disconnects with auto-reconnect, and handle duplicate events
and conflicting edits safely.

## Tech
- Node.js + Express (static hosting)
- WebSockets via the `ws` library
- Vanilla HTML/CSS/JS frontend

## Features
- ✅ Instant task create / edit / move (drag & drop) / delete for all users
- ✅ Live presence list with colored name chips
- ✅ Auto-reconnect with exponential backoff + full state re-sync
- ✅ Duplicate-event protection via unique event IDs (client & server)
- ✅ Conflict resolution via per-task version numbers (server-authoritative)
- ✅ Connection status indicator (online / offline / reconnecting)

## Run
    npm install
    npm start

Then open http://localhost:3000 in two browser windows to see real-time sync.

## Test the tricky bits
| Scenario | How to test |
|---|---|
| Live updates | Open two windows, add/move a task in one |
| Presence | Open/close a window, watch the Online chips |
| Disconnect | Stop the server; clients show "reconnecting"; restart and they re-sync |
| Conflict | Edit the same task title in both windows at once; loser gets a toast |

## Project structure
    server.js          WebSocket server, state, presence, dedupe, conflict logic
    public/index.html  Board UI
    public/style.css   Styling
    public/app.js      Client: rendering, reconnect, event handling

See DESIGN.md for the design write-up.