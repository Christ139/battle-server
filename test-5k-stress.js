/**
 * MASSIVE STRESS TEST RUNNER - 5,000 Units
 * Eve Online B-R5RB scale test!
 * Tests system capacity at extreme scale
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

const SYSTEM_ID = 9999993;
const TEST_DURATION_MS = 180000; // 3 minutes for massive battle

const metrics = {
  tickCount: 0,
  tickTimes: [],
  damageEvents: 0,
  movementEvents: 0,
  destroyedUnits: 0,
  weaponsFired: 0,
  startTime: null,
  endTime: null,
  firstDamageTime: null,
  firstDeathTime: null,
  peakMemory: 0
};

async function run5kStressTest() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║      🚀 MASSIVE STRESS TEST - 5,000 UNITS 🚀            ║');
  console.log('║           (Eve Online B-R5RB Scale!)                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log('📡 Step 1: Loading units from database...');
  console.log('   (This may take 15-30 seconds with 5,000 units)\n');
  
  const loadStart = Date.now();
  const { fetchBattleUnitsData } = require('/srv/game-server/src/services/battle-data.service');
  const units = await fetchBattleUnitsData(SYSTEM_ID, pool);
  const loadTime = ((Date.now() - loadStart) / 1000).toFixed(1);
  
  console.log(`✅ Loaded ${units.length} units in ${loadTime}s`);
  
  const factions = [...new Set(units.map(u => u.faction_id))];
  const armedUnits = units.filter(u => u.weapons && u.weapons.length > 0);
  const totalWeapons = units.reduce((sum, u) => sum + (u.weapons?.length || 0), 0);
  
  // Calculate distance between factions
  const factionAUnits = units.filter(u => u.faction_id === factions[0]);
  const factionBUnits = units.filter(u => u.faction_id === factions[1]);
  
  const avgAX = factionAUnits.reduce((sum, u) => sum + u.pos_x, 0) / factionAUnits.length;
  const avgBX = factionBUnits.reduce((sum, u) => sum + u.pos_x, 0) / factionBUnits.length;
  const gap = Math.abs(avgBX - avgAX);
  
  console.log(`   Factions: ${factions.join(' vs ')}`);
  console.log(`   Armed units: ${armedUnits.length}/${units.length}`);
  console.log(`   Total weapons: ${totalWeapons.toLocaleString()}`);
  console.log(`   Gap between fleets: ${Math.round(gap)} units`);
  
  if (gap > 1000) {
    console.log(`   ⚠️  WARNING: Gap > 1000, combat may be delayed!\n`);
  } else {
    console.log(`   ✅ Fleets within weapon range!\n`);
  }

  const payloadJson = JSON.stringify(units);
  const payloadSizeMB = (Buffer.byteLength(payloadJson, 'utf8') / 1024 / 1024).toFixed(2);
  
  console.log('📡 Step 2: Connecting to battle server...');
  const socket = io('http://localhost:4100', {
    transports: ['websocket'],
    reconnection: false,
    timeout: 120000,
    ackTimeout: 120000
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
    
    setTimeout(() => reject(new Error('Connection timeout')), 15000);
  });

  console.log('🎮 Step 3: Starting MASSIVE battle...');
  console.log(`   System: ${SYSTEM_ID}`);
  console.log(`   Units: ${units.length}`);
  console.log(`   Payload size: ${payloadSizeMB} MB`);
  console.log(`   Expected init time: 10-30 seconds\n`);

  const battleId = `massive_test_${Date.now()}`;
  
  console.log('⏳ Initializing 5,000 units in Rust WASM...');
  console.log('   This is the big test - please be patient...\n');
  
  const emitStart = Date.now();
  
  socket.once('battle:start:response', (response) => {
    const emitElapsed = Date.now() - emitStart;
    
    console.log(`📊 Response received after ${(emitElapsed / 1000).toFixed(1)}s\n`);
    
    if (response && response.success) {
      console.log('✅ MASSIVE BATTLE STARTED SUCCESSFULLY!');
      console.log(`   Battle ID: ${response.battleId}`);
      console.log(`   System ID: ${SYSTEM_ID}`);
      console.log(`   WASM initialization: ${(emitElapsed / 1000).toFixed(1)}s\n`);
      console.log('📊 Monitoring for 3 minutes...\n');
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
        if (data.damaged) {
          metrics.damageEvents += data.damaged.length;
          if (!metrics.firstDamageTime && data.damaged.length > 0) {
            metrics.firstDamageTime = now;
            const timeToFirstDamage = ((now - metrics.startTime) / 1000).toFixed(1);
            console.log(`🎯 FIRST DAMAGE at ${timeToFirstDamage}s! Fleets engaged! ⚔️\n`);
          }
        }
        if (data.destroyed) {
          metrics.destroyedUnits += data.destroyed.length;
          if (!metrics.firstDeathTime && data.destroyed.length > 0) {
            metrics.firstDeathTime = now;
            const timeToFirstDeath = ((now - metrics.startTime) / 1000).toFixed(1);
            console.log(`💀 FIRST CASUALTY at ${timeToFirstDeath}s!\n`);
          }
        }
        if (data.weaponsFired) {
          metrics.weaponsFired += data.weaponsFired.length;
        }
        
        const memUsage = process.memoryUsage();
        metrics.peakMemory = Math.max(metrics.peakMemory, memUsage.heapUsed);
        
        if (now - lastSecondReport >= 1000) {
          const elapsed = Math.floor((now - metrics.startTime) / 1000);
          const avgTickTime = metrics.tickTimes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, metrics.tickTimes.length);
          const memMB = (memUsage.heapUsed / 1024 / 1024).toFixed(0);
          
          process.stdout.write(`\r[${elapsed}s] Ticks: ${metrics.tickCount} | Rate: ${ticksThisSecond}/s | Avg: ${avgTickTime.toFixed(1)}ms | Mem: ${memMB}MB | Wpn: ${metrics.weaponsFired} | Dmg: ${metrics.damageEvents} | Dead: ${metrics.destroyedUnits}    `);
          
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
          console.log('\n\n⏱️  Test duration reached (3 minutes)\n');
          metrics.endTime = Date.now();
          printResults();
          cleanup();
        }
      }, TEST_DURATION_MS);

    } else {
      console.error('❌ FAILED TO START MASSIVE BATTLE');
      console.error(`   Error: ${response?.error || 'Unknown'}\n`);
      console.error('   Possible causes:');
      console.error('   - WASM out of memory (5k units too large)');
      console.error('   - Initialization timeout');
      console.error('   - CPU overload\n');
      cleanup();
      process.exit(1);
    }
  });
  
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
    const peakMemoryMB = (metrics.peakMemory / 1024 / 1024).toFixed(1);
    
    const timeToFirstDamage = metrics.firstDamageTime 
      ? ((metrics.firstDamageTime - metrics.startTime) / 1000).toFixed(1)
      : 'N/A';
    const timeToFirstDeath = metrics.firstDeathTime
      ? ((metrics.firstDeathTime - metrics.startTime) / 1000).toFixed(1)
      : 'N/A';
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 MASSIVE STRESS TEST RESULTS (5,000 UNITS)');
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
    
    console.log('⚔️  COMBAT ENGAGEMENT:');
    console.log(`   Time to first damage: ${timeToFirstDamage}s`);
    console.log(`   Time to first casualty: ${timeToFirstDeath}s`);
    console.log(`   Weapons fired: ${metrics.weaponsFired.toLocaleString()}`);
    console.log(`   Movement events: ${metrics.movementEvents.toLocaleString()}`);
    console.log(`   Damage events: ${metrics.damageEvents.toLocaleString()}`);
    console.log(`   Units destroyed: ${metrics.destroyedUnits}/${units.length} (${(metrics.destroyedUnits / units.length * 100).toFixed(1)}%)`);
    console.log(`   Events per second: ${((metrics.movementEvents + metrics.damageEvents) / duration).toFixed(0)}\n`);
    
    console.log('💾 MEMORY:');
    console.log(`   Peak memory: ${peakMemoryMB} MB\n`);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const combatEngaged = metrics.damageEvents > 0;
    
    if (avgTickRate >= 18 && avgTickTime < 70 && combatEngaged) {
      console.log('✅ MASSIVE STRESS TEST PASSED!');
      console.log('   🎉 System handles 5,000 units EXCELLENTLY!');
      console.log('   🚀 Ready for Eve Online-scale battles!');
      console.log('   💪 Can compete with CCP Games!');
    } else if (avgTickRate >= 15 && avgTickTime < 90 && combatEngaged) {
      console.log('✅ STRESS TEST ACCEPTABLE');
      console.log('   System handles 5,000 units adequately');
      console.log('   Consider optimization for peak performance');
    } else if (avgTickRate >= 10) {
      console.log('⚠️  STRESS TEST MARGINAL');
      console.log('   System struggles with 5,000 units');
      console.log('   Optimization required for production');
    } else if (!combatEngaged) {
      console.log('❌ STRESS TEST FAILED - NO COMBAT');
      console.log('   Units loaded but not engaging');
      console.log('   Check positioning and enemy relationships');
    } else {
      console.log('❌ STRESS TEST FAILED');
      console.log('   5,000 units exceeds current capacity');
      console.log('   Stick with 1,000-3,000 unit battles');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📊 EVE ONLINE COMPARISON:');
    console.log('   B-R5RB Battle: 8,825 players (record)');
    console.log(`   Your Test: 5,000 units at ${avgTickRate.toFixed(1)} ticks/sec`);
    console.log(`   Scaling Factor: ${(5000 / 1000 * avgTickRate / 19.9).toFixed(2)}x`);
    console.log('   Time Dilation: ' + (avgTickRate < 15 ? 'WOULD BE NEEDED' : 'NOT NEEDED ✅'));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  function cleanup() {
    socket.close();
    pool.end();
  }
}

run5kStressTest().catch(err => {
  console.error('\n❌ Massive stress test failed:', err);
  pool.end();
  process.exit(1);
});