const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const crypto = require("crypto");

const app = express();
app.use(express.static("public"));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ---------- In-memory state ----------
let tasks = [
  { id: "t1", title: "Design login page", column: "todo", version: 1, updatedBy: null },
  { id: "t2", title: "Write API docs", column: "doing", version: 1, updatedBy: null },
  { id: "t3", title: "Setup CI", column: "done", version: 1, updatedBy: null },
];

const users = new Map();      // ws -> { id, name, color, lastSeen }
const seenEventIds = new Set(); // duplicate-event protection
const EVENT_ID_TTL = 1000;
const recentIds = [];        // for pruning the dedupe set

function broadcast(data, excludeWs = null) {
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client !== excludeWs && client.readyState === 1) client.send(msg);
  }
}

function presenceList() {
  return [...users.values()].map(u => ({ id: u.id, name: u.name, color: u.color }));
}

function broadcastPresence() {
  broadcast({ type: "presence", users: presenceList() });
}

// Heartbeat: detect dead connections every 30s
function heartbeat() {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}
setInterval(heartbeat, 30000);

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const { type } = msg;

    // ---- Duplicate-event guard: each client action carries a unique eventId ----
    if (msg.eventId) {
      if (seenEventIds.has(msg.eventId)) return; // duplicate, ignore silently
      seenEventIds.add(msg.eventId);
      recentIds.push(msg.eventId);
      if (recentIds.length > EVENT_ID_TTL) seenEventIds.delete(recentIds.shift());
    }

    switch (type) {
      case "join": {
        const user = {
          id: crypto.randomUUID(),
          name: (msg.name || "Guest").slice(0, 20),
          color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 45%)`,
        };
        users.set(ws, user);
        ws.send(JSON.stringify({ type: "init", you: user, tasks })); // full state sync
        broadcastPresence();
        break;
      }

      case "task:create": {
        const task = {
          id: crypto.randomUUID(),
          title: (msg.title || "").slice(0, 120),
          column: ["todo", "doing", "done"].includes(msg.column) ? msg.column : "todo",
          version: 1,
          updatedBy: users.get(ws)?.name || null,
        };
        tasks.push(task);
        broadcast({ type: "task:created", task });
        break;
      }

      case "task:update": {
        // ---- Conflict resolution: optimistic concurrency via version numbers ----
        const task = tasks.find(t => t.id === msg.id);
        if (!task) { ws.send(JSON.stringify({ type: "error", message: "Task no longer exists", id: msg.id })); break; }
        if (msg.version !== task.version) {
          // Stale write: reject and send authoritative state back to that client
          ws.send(JSON.stringify({ type: "conflict", task, yourVersion: msg.version }));
          break;
        }
        if (msg.title !== undefined) task.title = String(msg.title).slice(0, 120);
        if (msg.column !== undefined && ["todo", "doing", "done"].includes(msg.column)) task.column = msg.column;
        task.version += 1;
        task.updatedBy = users.get(ws)?.name || null;
        broadcast({ type: "task:updated", task });
        break;
      }

      case "task:delete": {
        const before = tasks.length;
        tasks = tasks.filter(t => t.id !== msg.id);
        if (tasks.length !== before) broadcast({ type: "task:deleted", id: msg.id });
        break;
      }

      case "sync": { // client reconnected and wants a full state refresh
        ws.send(JSON.stringify({ type: "init", you: users.get(ws) || null, tasks }));
        broadcastPresence();
        break;
      }
    }
  });

  ws.on("close", () => {
    users.delete(ws);
    broadcastPresence();
  });
  ws.on("error", () => {});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`▶ Task board running at http://localhost:${PORT}`));