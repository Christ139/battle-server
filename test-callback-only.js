
const io = require('socket.io-client');

const socket = io('http://localhost:4100', {
  transports: ['websocket'],
  reconnection: false
});

socket.on('connect', () => {
  console.log('✅ Connected\n');
  
  // Test 1: Simple callback
  console.log('Test 1: Simple callback with object');
  socket.emit('battle:test', { hello: 'world' }, (response) => {
    console.log('Response:', response);
    console.log('Type:', typeof response);
    console.log('');
    
    // Test 2: Battle start with 2 units
    setTimeout(() => {
      console.log('Test 2: Battle start with 2 units');
      
      socket.emit('battle:start', {
        battleId: 'callback_test',
        systemId: 999,
        units: [
          { id: 1, faction_id: 1, player_id: 1, hp: 100, max_hp: 100, shield: 0, max_shield: 0, armor: 0, shield_regen: 0, pos_x: 0, pos_y: 0, pos_z: 0, vel_x: 0, vel_y: 0, vel_z: 0, max_speed: 10, weapons: [], max_weapon_range: 0, target_id: null, alive: true, damage_dealt: 0, damage_taken: 0 },
          { id: 2, faction_id: 2, player_id: 2, hp: 100, max_hp: 100, shield: 0, max_shield: 0, armor: 0, shield_regen: 0, pos_x: 100, pos_y: 0, pos_z: 0, vel_x: 0, vel_y: 0, vel_z: 0, max_speed: 10, weapons: [], max_weapon_range: 0, target_id: null, alive: true, damage_dealt: 0, damage_taken: 0 }
        ]
      }, (response) => {
        console.log('Battle start response:', response);
        console.log('Type:', typeof response);
        console.log('Is null?', response === null);
        console.log('Is undefined?', response === undefined);
        console.log('');
        
        setTimeout(() => {
          socket.close();
          process.exit(0);
        }, 1000);
      });
    }, 1000);
  });
});

setTimeout(() => {
  console.error('Timeout!');
  process.exit(1);
}, 10000);
