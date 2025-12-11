
const io = require('socket.io-client');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost', port: 5432, database: 'game_db',
  user: 'game_user', password: 'GameDBPass123!', ssl: false
});

async function test() {
  console.log('🎮 TESTING WITH INCREASED TIMEOUTS\n');

  const { fetchBattleUnitsData } = require('/srv/game-server/src/services/battle-data.service');
  const units = await fetchBattleUnitsData(9999999, pool);
  
  console.log(`✅ Loaded ${units.length} units\n`);

  const socket = io('http://localhost:4100', {
    transports: ['websocket'],
    reconnection: false,
    timeout: 60000,           // 60 second timeout
    ackTimeout: 60000         // 60 second ack timeout
  });

  socket.on('connect', () => {
    console.log(`✅ Connected: ${socket.id}\n`);
    
    console.log('⚔️  Emitting battle:start (this may take 10-30 seconds for large payload)...');
    const emitStart = Date.now();
    
    socket.emit('battle:start', { 
      battleId: `test_${Date.now()}`, 
      systemId: 9999999, 
      units 
    }, (response) => {
      const elapsed = Date.now() - emitStart;
      console.log(`\n✅ Response received after ${elapsed}ms`);
      console.log(`   Success: ${response.success}`);
      console.log(`   Error: ${response.error || 'none'}\n`);
      
      if (response.success) {
        console.log('🎉 BATTLE STARTED!');
        
        setTimeout(() => {
          socket.close();
          pool.end();
          process.exit(0);
        }, 5000);
      } else {
        console.error('❌ Failed');
        process.exit(1);
      }
    });
  });

  socket.on('disconnect', (reason) => {
    console.log(`🔌 Disconnected: ${reason}`);
  });
}

test();
