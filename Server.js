/**
 * Server.js - Battle Server with Rust WASM Integration
 * FIX: Use events instead of callbacks for large payloads
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const BattleManager = require('./BattleManager');

const app = express();
app.use(express.json());

const server = http.createServer(app);

// INCREASED BUFFER SIZES FOR LARGE BATTLES
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 10e6,    // 10MB
  pingTimeout: 60000,
  pingInterval: 25000
});

const battleManager = new BattleManager(io);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    ok: true, 
    service: 'battle-server',
    activeBattles: battleManager.getActiveBattles().length,
    uptime: process.uptime()
  });
});

// Start battle via HTTP
app.post('/battle/start', (req, res) => {
  const { battleId, systemId, units } = req.body;
  if (!battleId || !systemId || !Array.isArray(units)) {
    return res.status(400).json({ ok: false, error: 'Invalid payload' });
  }
  const result = battleManager.startBattle(battleId, systemId, units);
  if (result.success) {
    res.json({ ok: true, battleId: result.battleId });
  } else {
    res.status(500).json({ ok: false, error: result.error });
  }
});

// Get battle status
app.get('/battle/status/:battleId', (req, res) => {
  const status = battleManager.getBattleStatus(req.params.battleId);
  if (status.found) {
    res.json({ ok: true, ...status });
  } else {
    res.status(404).json({ ok: false, error: 'Battle not found' });
  }
});

// Get active battles
app.get('/battles/active', (req, res) => {
  const active = battleManager.getActiveBattles();
  res.json({ ok: true, count: active.length, battles: active });
});

// Stop battle
app.post('/battle/stop/:battleId', (req, res) => {
  const result = battleManager.stopBattle(req.params.battleId);
  if (result.success) {
    res.json({ ok: true });
  } else {
    res.status(404).json({ ok: false, error: result.error });
  }
});

// Socket.IO handlers
io.on('connection', (socket) => {
  console.log('[Battle] Client connected:', socket.id);

  // FIX: Use event-based response for large payloads
  socket.on('battle:start', ({ battleId, systemId, units }, callback) => {
    console.log(`[Battle] ⚡ Received battle:start - ${units?.length || 0} units`);
    
    if (!battleId || !systemId || !Array.isArray(units)) {
      console.warn('[Battle] ❌ Invalid payload');
      // Still use callback for errors (small payload)
      if (callback) callback({ success: false, error: 'Invalid payload' });
      return;
    }

    console.log(`[Battle] 🎮 Starting battle with ${units.length} units...`);
    
    try {
      const startTime = Date.now();
      const result = battleManager.startBattle(battleId, systemId, units);
      const elapsed = Date.now() - startTime;
      
      console.log(`[Battle] ✅ Battle started in ${elapsed}ms - Success: ${result.success}`);
      
      // FIX: For large payloads, emit response as separate event
      // This avoids Socket.IO callback limitations with large initial payloads
      socket.emit('battle:start:response', result);
      console.log(`[Battle] 📡 Emitted battle:start:response event`);
      
      // Also call callback for backwards compatibility (but it may be null)
      if (callback) {
        setImmediate(() => {
          try {
            callback(result);
            console.log(`[Battle] 📞 Also called callback`);
          } catch (err) {
            console.error(`[Battle] ⚠️  Callback error (expected with large payloads):`, err.message);
          }
        });
      }
      
      socket.join(`system:${systemId}`);
      
    } catch (error) {
      console.error('[Battle] ❌ Error:', error.message);
      socket.emit('battle:start:response', { success: false, error: error.message });
      if (callback) callback({ success: false, error: error.message });
    }
  });

  socket.on('battle:reinforcements', ({ battleId, units }, callback) => {
    const result = battleManager.addReinforcements(battleId, units);
    if (callback) callback(result);
  });

  socket.on('battle:status', ({ battleId }, callback) => {
    const status = battleManager.getBattleStatus(battleId);
    if (callback) callback(status);
  });

  socket.on('battle:stop', ({ battleId }, callback) => {
    console.log(`[Battle] 🛑 Stop: ${battleId}`);
    const result = battleManager.stopBattle(battleId);
    if (callback) callback(result);
  });

  socket.on('battle:subscribe', ({ systemId }) => {
    socket.join(`system:${systemId}`);
    console.log(`[Battle] Subscribed to system ${systemId}`);
  });

  socket.on('battle:unsubscribe', ({ systemId }) => {
    socket.leave(`system:${systemId}`);
  });

  socket.on('battle:test', (payload, callback) => {
    if (callback) {
      callback({
        success: true,
        echo: payload,
        message: 'Battle server operational',
        activeBattles: battleManager.getActiveBattles().length
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('[Battle] Client disconnected:', socket.id);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Battle] Shutting down...');
  battleManager.shutdown();
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[Battle] Shutting down...');
  battleManager.shutdown();
  server.close(() => process.exit(0));
});

// Start server
const PORT = process.env.PORT || 4100;
server.listen(PORT, () => {
  console.log(`╔══════════════════════════════════════════════════════════╗`);
  console.log(`║        🚀 BATTLE SERVER (RUST WASM) STARTED             ║`);
  console.log(`╠══════════════════════════════════════════════════════════╣`);
  console.log(`║  Port:           ${String(PORT).padEnd(38)} ║`);
  console.log(`║  Buffer Size:    10 MB (for large battles)${' '.repeat(13)} ║`);
  console.log(`║  Tick Rate:      50ms (20 ticks/sec)${' '.repeat(19)} ║`);
  console.log(`║  Engine:         Rust + WebAssembly${' '.repeat(20)} ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝`);
});