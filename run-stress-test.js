/**
 * Run stress test with 5,000 units
 * Monitors performance and reports metrics
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
const BATTLE_SERVER_URL = 'http://localhost:4100';
const TEST_DURATION_MS = 120000; // 2 minutes

// Performance metrics
const metrics = {
  tickCount: 0,
  tickTimes: [],
  damageEvents: 0,
  movementEvents: 0,
  destroyedUnits: 0,
  startTime: null,
  endTime: null,
  peakMemory: 0
};

async function runStressTest() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           BATTLE STRESS TEST - 5,000 UNITS              ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Step 1: Fetch units
  console.log('📡 Step 1: Fetching 5,000 units from database...');
  
  const { fetchBattleUnitsData } = require('/srv/game-server/src/services/battle-data.service');
  const units = await fetchBattleUnitsData(SYSTEM_ID, pool);
  
  console.log(`✅ Loaded ${units.length} units`);
  
  const factions = [...new Set(units.map(u => u.faction_id))];
  const armedUnits = units.filter(u => u.weapons && u.weapons.length > 0);
  
  console.log(`   Factions: ${factions.join(' vs ')}`);
  console.log(`   Armed units: ${armedUnits.length}`);
  
  if (units.length < 4000) {
    console.log('\n⚠️  Warning: Less than 4,000 units found!');
    console.log('   Run create-stress-test-units.js first');
    await pool.end();
    return;
  }
  
  if (factions.length < 2) {
    console.log('\n⚠️  Warning: Only one faction found!');
    console.log('   Need 2+ enemy factions for battle');
    await pool.end();
    return;
  }
  
  console.log('');

  // Step 2: Connect to battle server
  console.log('📡 Step 2: Connecting to battle server...');
  
  const socket = io(BATTLE_SERVER_URL, {
    transports: ['websocket'],
    reconnection: false
  });

  await new Promise((resolve, reject) => {
    socket.on('connect', () => {
      console.log(`✅ Connected to battle server (${socket.id})\n`);
      resolve();
    });
    
    socket.on('connect_error', (err) => {
      console.error('❌ Failed to connect:', err.message);
      reject(err);
    });
    
    setTimeout(() => reject(new Error('Connection timeout')), 10000);
  });

  // Step 3: Start battle
  console.log('🎮 Step 3: Starting massive battle...');
  console.log(`   System: ${SYSTEM_ID}`);
  console.log(`   Units: ${units.length}`);
  console.log(`   Factions: ${factions.join(' vs ')}`);
  console.log('');

  const battleId = `stress_test_${Date.now()}`;
  
  socket.emit('battle:start', {
    battleId,
    systemId: SYSTEM_ID,
    units
  }, (response) => {
    if (response && response.success) {
      console.log(`✅ Battle started: ${battleId}\n`);
    } else {
      console.error('❌ Failed to start battle:', response?.error);
      process.exit(1);
    }
  });

  // Step 4: Monitor performance
  console.log('📊 Step 4: Monitoring performance...');
  console.log(`   Duration: ${TEST_DURATION_MS / 1000} seconds`);
  console.log(`   Target tick rate: 20 ticks/sec\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  metrics.startTime = Date.now();
  let lastTickTime = Date.now();
  let ticksThisSecond = 0;
  let lastSecondReport = Date.now();

  // Listen for battle events
  socket.on('battle:tick', (data) => {
    const now = Date.now();
    const tickDuration = now - lastTickTime;
    
    metrics.tickCount++;
    metrics.tickTimes.push(tickDuration);
    ticksThisSecond++;
    
    if (data.moved) metrics.movementEvents += data.moved.length;
    if (data.damaged) metrics.damageEvents += data.damaged.length;
    if (data.destroyed) metrics.destroyedUnits += data.destroyed.length;
    
    // Report every second
    if (now - lastSecondReport >= 1000) {
      const elapsed = Math.floor((now - metrics.startTime) / 1000);
      const avgTickTime = metrics.tickTimes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, metrics.tickTimes.length);
      
      process.stdout.write(`\r[${elapsed}s] Ticks: ${metrics.tickCount} | Rate: ${ticksThisSecond}/s | Avg: ${avgTickTime.toFixed(1)}ms | Dmg: ${metrics.damageEvents} | Destroyed: ${metrics.destroyedUnits}`);
      
      ticksThisSecond = 0;
      lastSecondReport = now;
    }
    
    lastTickTime = now;
    
    // Track memory
    const memUsage = process.memoryUsage();
    metrics.peakMemory = Math.max(metrics.peakMemory, memUsage.heapUsed);
  });

  socket.on('battle:ended', (data) => {
    console.log('\n\n🏁 Battle ended naturally!');
    console.log(`   Duration: ${(data.duration / 1000).toFixed(1)}s`);
    console.log(`   Survivors: ${data.survivors}`);
    console.log(`   Casualties: ${data.casualties}`);
    console.log(`   Victor: ${data.victor || 'Draw'}`);
    
    metrics.endTime = Date.now();
    printResults();
    cleanup();
  });

  // Run for specified duration
  setTimeout(() => {
    if (!metrics.endTime) {
      console.log('\n\n⏱️  Test duration reached, stopping battle...');
      socket.emit('battle:stop', { battleId });
      
      setTimeout(() => {
        metrics.endTime = Date.now();
        printResults();
        cleanup();
      }, 2000);
    }
  }, TEST_DURATION_MS);

  function printResults() {
    const duration = (metrics.endTime - metrics.startTime) / 1000;
    const avgTickRate = metrics.tickCount / duration;
    const avgTickTime = metrics.tickTimes.reduce((a, b) => a + b, 0) / metrics.tickTimes.length;
    const maxTickTime = Math.max(...metrics.tickTimes);
    const minTickTime = Math.min(...metrics.tickTimes);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 STRESS TEST RESULTS');
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
    
    console.log('💾 MEMORY:');
    console.log(`   Peak heap: ${(metrics.peakMemory / 1024 / 1024).toFixed(1)} MB\n`);
    
    // Verdict
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (avgTickRate >= 19 && avgTickTime < 60) {
      console.log('✅ STRESS TEST PASSED!');
      console.log('   System handles 5,000 units excellently');
      console.log('   Ready for production Eve Online-scale battles');
    } else if (avgTickRate >= 15 && avgTickTime < 80) {
      console.log('⚠️  STRESS TEST ACCEPTABLE');
      console.log('   System handles 5,000 units adequately');
      console.log('   Consider optimization for better performance');
    } else {
      console.log('❌ STRESS TEST NEEDS OPTIMIZATION');
      console.log('   System struggles with 5,000 units');
      console.log('   Optimization required before production');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  function cleanup() {
    socket.close();
    pool.end();
    process.exit(0);
  }
}

// Run test
runStressTest().catch(err => {
  console.error('\n❌ Stress test failed:', err);
  pool.end();
  process.exit(1);
});