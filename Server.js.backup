// server.js - Battle Server (separate service from game-server)
//Test
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // world/game-server will connect from another host/port
  },
});

// ---------------------------
// In-memory battle state
// ---------------------------

/**
 * systems Map structure:
 * key: systemId (string/number)
 * value: {
 *   battleId: string,
 *   tick: number,
 *   units: Array<...>,      // raw state sent by game-server
 *   lastUpdate: number,     // Date.now()
 *   commandQueue: Array<...>
 * }
 */
const systems = new Map();

// ---------------------------
// Simple healthcheck
// ---------------------------

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'battle-server' });
});

// Optional HTTP-style start (you can use this for quick tests with curl/postman)
app.post('/battle/start', (req, res) => {
  const { battleId, systemId, units } = req.body;

  if (!battleId || !systemId || !Array.isArray(units)) {
    return res.status(400).json({ ok: false, error: 'Missing battleId/systemId/units' });
  }

  systems.set(String(systemId), {
    battleId: String(battleId),
    tick: 0,
    units,
    lastUpdate: Date.now(),
    commandQueue: [],
  });

  console.log('[Battle] HTTP start', battleId, 'system', systemId, 'units:', units.length);

  res.json({ ok: true });
});

// ---------------------------
// Socket.IO – world-server connects as a client
// ---------------------------

io.on('connection', (socket) => {
  console.log('[Battle] world connected', socket.id);

  // World tells us to start a battle
  socket.on('battle:start', ({ battleId, systemId, units }) => {
    if (!battleId || !systemId || !Array.isArray(units)) {
      console.warn('[Battle] invalid battle:start payload', { battleId, systemId });
      return;
    }

    systems.set(String(systemId), {
      battleId: String(battleId),
      tick: 0,
      units,
      lastUpdate: Date.now(),
      commandQueue: [],
    });

    console.log('[Battle] start via socket', battleId, 'system', systemId, 'units:', units.length);

    // Ack back to world
    socket.emit('battle:started', { battleId, systemId });
  });
    socket.on('battle:test', (payload, ack) => {
    console.log('[BattleServer] battle:test received:', payload);

    if (typeof ack === 'function') {
      ack({
        success: true,
        echo: payload,
        message: 'Battle server received your test payload.',
      });
    }
  });
  // World sends commands for units in a system
  socket.on('battle:commands', ({ systemId, commands }) => {
    const sysId = String(systemId);
    const sys = systems.get(sysId);
    if (!sys) {
      console.warn('[Battle] commands for unknown system', sysId);
      return;
    }

    if (!Array.isArray(commands)) {
      console.warn('[Battle] commands payload not array for system', sysId);
      return;
    }

    sys.commandQueue.push(...commands);
    sys.lastUpdate = Date.now();
  });

  socket.on('disconnect', () => {
    console.log('[Battle] world disconnected', socket.id);
    // NOTE: we do NOT clear systems here – they are independent of socket connection.
    // World-server can reconnect and continue using existing systems map.
  });
});

// ---------------------------
// Basic tick loop (stub)
// ---------------------------

/**
 * This is a very simple global tick loop.
 * Later we’ll replace this with your real combat logic.
 */
const TICK_INTERVAL_MS = 250; // 4 ticks per second (example)

setInterval(() => {
  const now = Date.now();

  for (const [systemId, sys] of systems.entries()) {
    sys.tick += 1;

    // TODO: apply sys.commandQueue to sys.units
    // TODO: movement, DPS, death checks, etc.
    sys.commandQueue.length = 0; // clear for now

    sys.lastUpdate = now;

    // For now, just emit the raw units back as a snapshot
    io.emit('battle:snapshot', {
      battleId: sys.battleId,
      systemId,
      tick: sys.tick,
      units: sys.units,
    });

    // Example: stub event every 20 ticks (just to see traffic)
    if (sys.tick % 20 === 0) {
      io.emit('battle:event', {
        battleId: sys.battleId,
        systemId,
        type: 'tickCheckpoint',
        tick: sys.tick,
        timestamp: new Date().toISOString(),
      });
    }
  }
}, TICK_INTERVAL_MS);

// ---------------------------
// Start server
// ---------------------------

const PORT = process.env.PORT || 4100;
server.listen(PORT, () => {
  console.log(`battle-server listening on port ${PORT}`);
});
