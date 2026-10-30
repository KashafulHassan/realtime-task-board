# Design Write-Up: Real-Time Task Board

## Approach
A single Node.js server holds the authoritative board state in memory and pushes
every change to all connected clients over WebSockets (`ws`). Clients render
tasks in three Kanban columns and send fine-grained actions (`task:create`,
`task:update`, `task:delete`) instead of whole-board updates, keeping messages
small and making conflict detection possible at the task level.

WebSockets were chosen over Server-Sent Events because the board is
bidirectional: clients send edits and presence, not just receive updates.

## Real-time updates
Every mutation is applied to the server state first, then broadcast to all
clients (including the originator, which acts as an acknowledgement). New
clients or reconnecting clients receive a full `init` snapshot, so the UI can
never drift permanently from the server state.

## Who is online (presence)
On `join`, the server assigns each connection a UUID, a sanitized display name,
and a color, and broadcasts a presence list to everyone. On `close` the user is
removed and presence is re-broadcast. Colored chips in the header render this.

## Disconnects
- Server: a 30s heartbeat ping/pong terminates dead sockets so ghost users
  disappear from the presence list.
- Client: on close, the client retries with exponential backoff (1s → 15s cap)
  and requests a fresh `init` snapshot on reconnect. The status pill shows
  online/offline/reconnecting.

## Duplicate events
Every client message carries a unique `eventId` (UUID). The server keeps a
bounded LRU set of recent IDs and silently drops any message whose ID it has
already seen. This makes retries after flaky reconnects safe — a resent
`task:create` can never create the same task twice.

## Conflicting edits
Each task carries a monotonically increasing `version`. Updates must include
the version the client last saw. If it matches, the server applies the edit and
increments the version. If it doesn't (someone else edited first), the server
rejects the stale write and returns the authoritative task (`conflict`
message); the client shows a toast and re-renders the winning state. Out-of-order
`task:updated` broadcasts are also ignored client-side by version comparison.