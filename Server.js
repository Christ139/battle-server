/**
 * Server.js - Battle Server with Rust WASM Integration
 * 
 * Handles real-time battle simulation using high-performance Rust WASM core
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const BattleManager = require('./BattleManager');

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

// Initialize Battle Manager
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

// Start battle via HTTP (for testing)
app.post('/battle/start', (req, res) => {
  const { battleId, systemId, units } = req.body;

  if (!battleId || !systemId || !Array.isArray(units)) {
    return res.status(400).json({ 
      ok: false, 
      error: 'Missing battleId, systemId, or units array' 
    });
  }

  const result = battleManager.startBattle(battleId, systemId, units);
  
  if (result.success) {
    res.json({ ok: true, battleId: result.battleId });
  } else {
    res.status(500).json({ ok: false, error: result.error });
  }
});

// Get battle status via HTTP
app.get('/battle/status/:battleId', (req, res) => {
  const { battleId } = req.params;
  const status = battleManager.getBattleStatus(battleId);
  
  if (status.found) {
    res.json({ ok: true, ...status });
  } else {
    res.status(404).json({ ok: false, error: 'Battle not found' });
  }
});

// Get all active battles
app.get('/battles/active', (req, res) => {
  const active = battleManager.getActiveBattles();
  res.json({ ok: true, count: active.length, battles: active });
});

// Stop battle via HTTP
app.post('/battle/stop/:battleId', (req, res) => {
  const { battleId } = req.params;
  const result = battleManager.stopBattle(battleId);
  
  if (result.success) {
    res.json({ ok: true });
  } else {
    res.status(404).json({ ok: false, error: result.error });
  }
});

// Socket.IO - game-server connects as a client
io.on('connection', (socket) => {
  console.log('[Battle] Client connected:', socket.id);

  // Start battle via Socket.IO
  socket.on('battle:start', ({ battleId, systemId, units }, callback) => {
    if (!battleId || !systemId || !Array.isArray(units)) {
      console.warn('[Battle] Invalid battle:start payload');
      if (callback) callback({ success: false, error: 'Invalid payload' });
      return;
    }

    const result = battleManager.startBattle(battleId, systemId, units);
    
    if (callback) callback(result);
    
    // Auto-join client to system room for updates
    socket.join(`system:${systemId}`);
  });

  // Add reinforcements mid-battle
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
    const result = battleManager.stopBattle(battleId);
    if (callback) callback(result);
  });

  // Join system room for battle updates
  socket.on('battle:subscribe', ({ systemId }) => {
    socket.join(`system:${systemId}`);
    console.log(`[Battle] Socket ${socket.id} subscribed to system ${systemId}`);
  });

  // Leave system room
  socket.on('battle:unsubscribe', ({ systemId }) => {
    socket.leave(`system:${systemId}`);
    console.log(`[Battle] Socket ${socket.id} unsubscribed from system ${systemId}`);
  });

  // Test connection
  socket.on('battle:test', (payload, callback) => {
    console.log('[Battle] Test received:', payload);
    if (callback) {
      callback({
        success: true,
        echo: payload,
        message: 'Battle server (WASM) operational',
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
  console.log('[Battle] SIGTERM received, shutting down gracefully...');
  battleManager.shutdown();
  server.close(() => {
    console.log('[Battle] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Battle] SIGINT received, shutting down gracefully...');
  battleManager.shutdown();
  server.close(() => {
    console.log('[Battle] Server closed');
    process.exit(0);
  });
});

// Start server
const PORT = process.env.PORT || 4100;
server.listen(PORT, () => {
  console.log(`╔══════════════════════════════════════════════════════════╗`);
  console.log(`║        🚀 BATTLE SERVER (RUST WASM) STARTED             ║`);
  console.log(`╠══════════════════════════════════════════════════════════╣`);
  console.log(`║  Port:           ${String(PORT).padEnd(38)} ║`);
  console.log(`║  Tick Rate:      50ms (20 ticks/sec)${' '.repeat(19)} ║`);
  console.log(`║  Engine:         Rust + WebAssembly${' '.repeat(20)} ║`);
  console.log(`║  Max Capacity:   10,000+ units per battle${' '.repeat(14)} ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝`);
});