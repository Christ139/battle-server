/**
 * battle-server/Server.js
 * 
 * Standalone battle server using Rust WASM for simulation
 * 
 * ✅ UPDATES:
 * 1. Added 'battle:updatePositions' handler for bulk position updates
 * 2. Added 'battle:updatePosition' handler for single unit updates
 * 3. Added 'battle:forceRetarget' handler to trigger re-targeting
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const BattleManager = require('./BattleManager');
const { notifyDiscordStartup, notifyDiscordShutdown, setupCrashHandlers } = require('./discordWebhook');

// Setup crash handlers early
setupCrashHandlers();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 10e6  // 10MB for large battle payloads
});

const battleManager = new BattleManager(io);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    activeBattles: battleManager.getActiveBattles().length,
    uptime: process.uptime()
  });
});

// Get battle status
app.get('/battle/:battleId', (req, res) => {
  const status = battleManager.getBattleStatus(req.params.battleId);
  if (status.success) {
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

  // Start a new battle
  socket.on('battle:start', ({ battleId, systemId, units }, callback) => {
    console.log(`[Battle] ⚡ Received battle:start - ${units?.length || 0} units`);
    
    if (!battleId || !systemId || !Array.isArray(units)) {
      console.warn('[Battle] ❌ Invalid payload');
      if (callback) callback({ success: false, error: 'Invalid payload' });
      return;
    }

    console.log(`[Battle] 🎮 Starting battle with ${units.length} units...`);
    
    try {
      const startTime = Date.now();
      const result = battleManager.startBattle(battleId, systemId, units);
      const elapsed = Date.now() - startTime;
      
      console.log(`[Battle] ✅ Battle started in ${elapsed}ms - Success: ${result.success}`);
      
      // Emit response as event for large payloads
      socket.emit('battle:start:response', result);
      
      if (callback) {
        setImmediate(() => {
          try {
            callback(result);
          } catch (err) {
            console.error(`[Battle] ⚠️ Callback error:`, err.message);
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

  // ✅ NEW: Update multiple unit positions
  socket.on('battle:updatePositions', ({ battleId, positions }, callback) => {
    if (!battleId || !Array.isArray(positions)) {
      if (callback) callback({ success: false, error: 'Invalid payload' });
      return;
    }

    const result = battleManager.updateUnitPositions(battleId, positions);
    if (callback) callback(result);
  });

  // ✅ NEW: Update a single unit's position
  socket.on('battle:updatePosition', ({ battleId, unitId, x, y, z, clearTarget }, callback) => {
    if (!battleId || unitId === undefined) {
      if (callback) callback({ success: false, error: 'Invalid payload' });
      return;
    }

    const result = battleManager.updateSingleUnitPosition(
      battleId, unitId, x, y, z, clearTarget || false
    );
    if (callback) callback(result);
  });

  // ✅ NEW: Queue position update (batched processing)
  socket.on('battle:queuePositionUpdate', ({ battleId, unitId, x, y, z }) => {
    battleManager.queuePositionUpdate(battleId, unitId, x, y, z);
    // No callback - fire and forget for performance
  });

  // ✅ NEW: Force all units to re-target
  socket.on('battle:forceRetarget', ({ battleId }, callback) => {
    if (!battleId) {
      if (callback) callback({ success: false, error: 'battleId required' });
      return;
    }

    const result = battleManager.forceRetarget(battleId);
    if (callback) callback(result);
  });

  // ✅ NEW: Get current unit positions (debugging)
  socket.on('battle:getPositions', ({ battleId }, callback) => {
    if (!callback) return;
    
    const result = battleManager.getUnitPositions(battleId);
    callback(result);
  });

  // Add reinforcements
  socket.on('battle:reinforcements', ({ battleId, units }, callback) => {
    const result = battleManager.addReinforcements(battleId, units);
    if (callback) callback(result);
  });

  // Get battle status
  socket.on('battle:status', ({ battleId }, callback) => {
    const status = battleManager.getBattleStatus(battleId);
    if (callback) callback(status);
  });

  // Stop battle
  socket.on('battle:stop', ({ battleId }, callback) => {
    console.log(`[Battle] 🛑 Stop: ${battleId}`);
    const result = battleManager.stopBattle(battleId);
    if (callback) callback(result);
  });

  // Subscribe to battle updates
  socket.on('battle:subscribe', ({ systemId }) => {
    socket.join(`system:${systemId}`);
    console.log(`[Battle] Subscribed to system ${systemId}`);
  });

  // Unsubscribe from battle updates
  socket.on('battle:unsubscribe', ({ systemId }) => {
    socket.leave(`system:${systemId}`);
  });

  // Test handler
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
process.on('SIGTERM', async () => {
  console.log('[Battle] Shutting down...');
  const activeBattles = battleManager.getActiveBattles().length;
  await notifyDiscordShutdown({ activeBattles });
  battleManager.shutdown();
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  console.log('[Battle] Shutting down...');
  const activeBattles = battleManager.getActiveBattles().length;
  await notifyDiscordShutdown({ activeBattles });
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
  console.log(`║  Features:       Position Sync, Auto-Retarget${' '.repeat(9)} ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝`);

  // Send Discord notification
  notifyDiscordStartup({ port: PORT, activeBattles: 0 });
});