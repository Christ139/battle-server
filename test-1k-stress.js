/**
 * Stress Test - 1,000 Units (EVENT-BASED)
 * Uses event listener instead of callback for large payloads
 */

const io = require('socket.io-client');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'game_db',
  user: 'game_user',
  password: 'GameDBPass123!',
  ssl: false
});

const SYSTEM_ID = 9999999;
const TEST_DURATION_MS = 60000;

const metrics = {
  tickCount: 0,
  tickTimes: [],
  damageEvents: 0,
  movementEvents: 0,
  destroyedUnits: 0,
  startTime: null,
  endTime: null
};

async function runStressTest() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║      BATTLE STRESS TEST - 1,000 UNITS (EVENT-BASED)    ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log('📡 Step 1: Loading units from database...');
  const { fetchBattleUnitsData } = require('/srv/game-server/src/services/battle-data.service');
  const units = await fetchBattleUnitsData(SYSTEM_ID, pool);
  
  console.log(`✅ Loaded ${units.length} units`);
  
  const factions = [...new Set(units.map(u => u.faction_id))];
  const armedUnits = units.filter(u => u.weapons && u.weapons.length > 0);
  
  console.log(`   Factions: ${factions.join(' vs ')}`);
  console.log(`   Armed units: ${armedUnits.length}\n`);

  console.log('📡 Step 2: Connecting to battle server...');
  const socket = io('http://localhost:4100', {
    transports: ['websocket'],
    reconnection: false,
    timeout: 60000,
    ackTimeout: 60000
  });

  await new Promise((resolve, reject) => {
    socket.on('connect', () => {
      console.log(`✅ Connected: ${socket.id}\n`);
      resolve();
    });
    
    socket.on('connect_error', (err) => {
      console.error('❌ Connection error:', err.message);
      reject(err);
    });
    
    setTimeout(() => reject(new Error('Connection timeout')), 10000);
  });

  console.log('🎮 Step 3: Starting battle...');
  console.log(`   System: ${SYSTEM_ID}`);
  console.log(`   Units: ${units.length}`);
  console.log(`   Payload size: ~2.4 MB`);
  console.log('');

  const battleId = `stress_test_${Date.now()}`;
  
  console.log('⏳ Sending large payload...\n');
  
  const emitStart = Date.now();
  
  // Listen for event-based response
  socket.once('battle:start:response', (response) => {
    const emitElapsed = Date.now() - emitStart;
    
    console.log(`📊 Response received via EVENT after ${emitElapsed}ms\n`);
    console.log(`   Success: ${response.success}`);
    console.log(`   Battle ID: ${response.battleId}`);
    console.log(`   Error: ${response.error || 'none'}\n`);
    
    if (response && response.success) {
      console.log('✅ Battle started successfully!\n');
      console.log('📊 Monitoring performance...\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      metrics.startTime = Date.now();
      let lastTickTime = Date.now();
      let ticksThisSecond = 0;
      let lastSecondReport = Date.now();

      socket.on('battle:tick', (data) => {
        const now = Date.now();
        const tickDuration = now - lastTickTime;
        
        metrics.tickCount++;
        metrics.tickTimes.push(tickDuration);
        ticksThisSecond++;
        
        if (data.moved) metrics.movementEvents += data.moved.length;
        if (data.damaged) metrics.damageEvents += data.damaged.length;
        if (data.destroyed) metrics.destroyedUnits += data.destroyed.length;
        
        if (now - lastSecondReport >= 1000) {
          const elapsed = Math.floor((now - metrics.startTime) / 1000);
          const avgTickTime = metrics.tickTimes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, metrics.tickTimes.length);
          
          process.stdout.write(`\r[${elapsed}s] Ticks: ${metrics.tickCount} | Rate: ${ticksThisSecond}/s | Avg: ${avgTickTime.toFixed(1)}ms | Dmg: ${metrics.damageEvents} | Destroyed: ${metrics.destroyedUnits}    `);
          
          ticksThisSecond = 0;
          lastSecondReport = now;
        }
        
        lastTickTime = now;
      });

      socket.on('battle:ended', (data) => {
        console.log('\n\n🏁 Battle ended naturally!');
        metrics.endTime = Date.now();
        printResults();
        cleanup();
      });

      setTimeout(() => {
        if (!metrics.endTime) {
          console.log('\n\n⏱️  Test duration reached\n');
          metrics.endTime = Date.now();
          printResults();
          cleanup();
        }
      }, TEST_DURATION_MS);

    } else {
      console.error('❌ FAILED TO START BATTLE');
      console.error(`   Error: ${response?.error || 'Unknown'}\n`);
      cleanup();
      process.exit(1);
    }
  });
  
  // Emit the battle:start event (callback will be null/ignored)
  socket.emit('battle:start', {
    battleId,
    systemId: SYSTEM_ID,
    units
  });

  function printResults() {
    const duration = (metrics.endTime - metrics.startTime) / 1000;
    const avgTickRate = metrics.tickCount / duration;
    const avgTickTime = metrics.tickTimes.reduce((a, b) => a + b, 0) / metrics.tickTimes.length;
    const maxTickTime = Math.max(...metrics.tickTimes);
    const minTickTime = Math.min(...metrics.tickTimes);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 STRESS TEST RESULTS (1,000 UNITS)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('⏱️  PERFORMANCE:');
    console.log(`   Duration: ${duration.toFixed(1)}s`);
    console.log(`   Total ticks: ${metrics.tickCount}`);
    console.log(`   Tick rate: ${avgTickRate.toFixed(1)}/sec (target: 20/sec)`);
    console.log(`   Performance: ${(avgTickRate / 20 * 100).toFixed(1)}% of target\n`);
    
    console.log('⚡ TICK TIMES:');
    console.log(`   Average: ${avgTickTime.toFixed(1)}ms (target: <50ms)`);
    console.log(`   Min: ${minTickTime.toFixed(1)}ms`);
    console.log(`   Max: ${maxTickTime.toFixed(1)}ms\n`);
    
    console.log('🎯 BATTLE EVENTS:');
    console.log(`   Movement events: ${metrics.movementEvents.toLocaleString()}`);
    console.log(`   Damage events: ${metrics.damageEvents.toLocaleString()}`);
    console.log(`   Units destroyed: ${metrics.destroyedUnits}`);
    console.log(`   Events per second: ${((metrics.movementEvents + metrics.damageEvents) / duration).toFixed(0)}\n`);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (avgTickRate >= 18 && avgTickTime < 60) {
      console.log('✅ STRESS TEST PASSED!');
      console.log('   System handles 1,000 units excellently');
      console.log('   Ready for production battles');
    } else if (avgTickRate >= 15) {
      console.log('⚠️  STRESS TEST ACCEPTABLE');
      console.log('   System handles 1,000 units adequately');
    } else {
      console.log('❌ STRESS TEST NEEDS OPTIMIZATION');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  function cleanup() {
    socket.close();
    pool.end();
  }
}

runStressTest().catch(err => {
  console.error('\n❌ Stress test failed:', err);
  pool.end();
  process.exit(1);
});