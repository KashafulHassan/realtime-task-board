const $ = sel => document.querySelector(sel);
let ws = null;
let me = null;
let tasks = new Map();      // id -> task
let reconnectDelay = 1000; // exponential backoff
let pingTimer = null;

// --- Duplicate-event protection on the client too ---
const handledEventIds = new Set();

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
}

function setStatus(text, cls) {
  const el = $('#status');
  el.textContent = text;
  el.className = 'status ' + cls;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

// ---------- WebSocket connection with auto-reconnect ----------
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);

  ws.onopen = () => {
    setStatus('online', 'online');
    reconnectDelay = 1000; // reset backoff
    ws.send(JSON.stringify({ type: 'join', name: localStorage.getItem('name') || prompt('Your name?') || 'Guest' }));
    localStorage.setItem('name', me?.name || localStorage.getItem('name'));
  };

  ws.onmessage = e => handle(JSON.parse(e.data));

  ws.onclose = () => {
    setStatus('offline — reconnecting…', 'offline');
    clearInterval(pingTimer);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 15000); // exponential backoff, cap 15s
  };

  ws.onerror = () => ws.close();

  // Client-side heartbeat to keep the connection alive through proxies
  pingTimer = setInterval(() => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'sync' }));
  }, 25000);
}

// ---------- Handle server messages ----------
function handle(msg) {
  // Server echoes events we originated; drop ones we already processed by eventId
  if (msg.eventId) {
    if (handledEventIds.has(msg.eventId)) return;
    handledEventIds.add(msg.eventId);
  }

  switch (msg.type) {
    case 'init':
      me = msg.you;
      tasks = new Map(msg.tasks.map(t => [t.id, t]));
      render();
      break;
    case 'presence':
      renderPresence(msg.users);
      break;
    case 'task:created':
      tasks.set(msg.task.id, msg.task);
      render();
      break;
    case 'task:updated': {
      const local = tasks.get(msg.task.id);
      // Ignore stale updates arriving out of order
      if (!local || msg.task.version >= local.version) {
        tasks.set(msg.task.id, msg.task);
        render();
      }
      break;
    }
    case 'task:deleted':
      tasks.delete(msg.id);
      render();
      break;
    case 'conflict':
      // Someone else edited first — server wins, show a notice
      tasks.set(msg.task.id, msg.task);
      render();
      toast(`⚠️ Your edit conflicted with ${msg.task.updatedBy || 'another user'}. Board was refreshed with the latest version.`);
      break;
    case 'error':
      toast('⚠️ ' + msg.message);
      if (msg.id) ws.send(JSON.stringify({ type: 'sync' }));
      break;
  }
}

function send(payload) {
  if (ws && ws.readyState === 1) {
    payload.eventId = uuid(); // unique id → server can drop duplicates
    ws.send(JSON.stringify(payload));
  } else {
    toast('⚠️ Not connected — change not sent.');
  }
}

// ---------- Rendering ----------
function render() {
  document.querySelectorAll('.column').forEach(col => {
    const list = col.querySelector('.cards');
    list.innerHTML = '';
    const colTasks = [...tasks.values()].filter(t => t.column === col.dataset.column);
    colTasks.forEach(task => list.appendChild(cardEl(task)));
  });
}

function cardEl(task) {
  const card = document.createElement('div');
  card.className = 'card';
  card.draggable = true;
  card.dataset.id = task.id;

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = task.title;
  title.contentEditable = true;
  title.onblur = () => { // edit = optimistic version check happens server-side
    if (title.textContent.trim() && title.textContent !== task.title) {
      send({ type: 'task:update', id: task.id, title: title.textContent.trim(), version: task.version });
    }
  };

  const meta = document.createElement('div');
  meta.className = 'meta';
  const updated = task.updatedBy ? `by ${task.updatedBy} · ` : '';
  meta.innerHTML = `<span>v${task.version}</span><span>${updated}#${task.id.slice(0, 4)}</span>`;

  const actions = document.createElement('div');
  actions.className = 'actions';
  const left = document.createElement('button'); left.textContent = '◀';
  const del  = document.createElement('button'); del.textContent  = '✕';
  const right= document.createElement('button'); right.textContent= '▶';
  const move = col => send({ type: 'task:update', id: task.id, column: col, version: task.version });
  left.onclick = () => move(task.column === 'done' ? 'doing' : 'todo');
  right.onclick = () => move(task.column === 'todo' ? 'doing' : 'done');
  del.onclick = () => send({ type: 'task:delete', id: task.id });
  actions.append(left, del, right);

  card.append(title, meta, actions);

  // Drag & drop between columns
  card.ondragstart = e => { e.dataTransfer.setData('text/plain', task.id); card.classList.add('dragging'); };
  card.ondragend = () => card.classList.remove('dragging');
  return card;
}

document.querySelectorAll('.column').forEach(col => {
  const list = col.querySelector('.cards');
  list.ondragover = e => e.preventDefault();
  list.ondrop = e => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const task = tasks.get(id);
    if (task && task.column !== col.dataset.column) {
      send({ type: 'task:update', id, column: col.dataset.column, version: task.version });
    }
  };
});

function renderPresence(users) {
  const el = $('#presenceList');
  el.innerHTML = '';
  users.forEach(u => {
    const chip = document.createElement('span');
    chip.className = 'user-chip';
    chip.style.background = u.color;
    chip.textContent = u.name + (me && u.id === me.id ? ' (you)' : '');
    el.appendChild(chip);
  });
}

$('#addForm').onsubmit = e => {
  e.preventDefault();
  const title = $('#titleInput').value.trim();
  if (title) send({ type: 'task:create', title, column: 'todo' });
  $('#titleInput').value = '';
};

connect();