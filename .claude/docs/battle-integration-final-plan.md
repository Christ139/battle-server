# Battle Integration - Final Implementation Plan

**Status:** ✅ ALL TEAMS APPROVED
**Date:** 2025-12-11

---

## Executive Summary

Real-time battle visualization from battle-server to Unity client. All teams have signed off on payload structures and implementation approach.

### Key Decisions Made

| Decision | Resolution |
|----------|------------|
| Rotation data | Unity derives client-side (no server changes) |
| weaponsFired | Batched in `battle:tick` payload |
| Projectile speeds | Hardcoded by weapon_tag |
| Room format | `env_system_${systemId}` / `env_planet_${planetId}` |
| Error format | `{ success: false, error: "message" }` |
| Post-battle controls | Immediate (60s cooldown only blocks new battles) |

---

## Implementation Phases

```
Phase 0 (Battle-Server)  →  Phase 1 (Game-Server)  →  Phase 2 (Unity)
   Add weaponsFired           Relay to rooms            Handle events
      2-3 days                   1-2 days                 3-5 days
```

---

## Phase 0: Battle-Server Implementation

**Owner:** Battle-Server Team
**Estimated Effort:** 2-3 days
**Status:** Ready to start

### Task 0.1: Add WeaponFired to TickResult

**File:** `battle-core/src/simulator.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeaponFired {
    pub attacker_id: u32,
    pub target_id: u32,
    pub weapon_type: String,
    pub impact_time: u32, // milliseconds
}
```

Add `weapons_fired: Vec<WeaponFired>` to `TickResult` struct.

### Task 0.2: Populate weapons_fired from existing loop

**File:** `battle-core/src/simulator.rs:142-187`

Existing code already collects weapon fires:
```rust
let mut weapon_fires: Vec<(usize, usize, f32, String)> = Vec::new();
```

Convert to `WeaponFired` structs with impactTime calculation:

```rust
// Hardcoded speeds by weapon_tag
fn get_projectile_speed(weapon_tag: &str) -> f32 {
    match weapon_tag {
        "laser" | "beam" => f32::INFINITY, // instant
        "missile" => 300.0,
        "torpedo" => 150.0,
        _ => 800.0, // default projectile speed
    }
}

fn calculate_impact_time(distance: f32, weapon_tag: &str) -> u32 {
    let speed = get_projectile_speed(weapon_tag);
    if speed == f32::INFINITY {
        0
    } else {
        (distance / speed * 1000.0) as u32
    }
}
```

### Task 0.3: Pass through WASM boundary

**File:** `battle-core/src/lib.rs`

Ensure `weapons_fired` is included in the JSON serialization of `TickResult`.

### Task 0.4: Include in tick emission

**File:** `Server.js` (Node.js layer)

The `battle:tick` event already emits tick results. `weaponsFired` will automatically be included in the payload once Rust provides it.

### Deliverable

`battle:tick` payload now includes:
```json
{
  "battleId": "...",
  "systemId": 123,
  "tick": 1234,
  "moved": [...],
  "damaged": [...],
  "destroyed": [...],
  "weaponsFired": [
    { "attackerId": 1, "targetId": 2, "weaponType": "missile", "impactTime": 1500 }
  ]
}
```

---

## Phase 1: Game-Server Implementation

**Owner:** Game-Server Team
**Estimated Effort:** 1-2 days
**Status:** Blocked on Phase 0

### Task 1.1: Forward battle:tick to Unity rooms

**File:** `src/workers/battle-check.worker.js`

In `initialize()`, after `battleSocket.on('battle:ended', handleBattleEnded)`:

```javascript
// Forward battle tick updates to Unity clients
battleSocket.on('battle:tick', (data) => {
  const roomName = `env_system_${data.systemId}`;
  io.to(roomName).emit('battle:tick', data);
});
```

### Task 1.2: Forward battle:started to Unity rooms

**File:** `src/workers/battle-check.worker.js`

```javascript
// Forward battle started confirmation
battleSocket.on('battle:started', (data) => {
  const roomName = `env_system_${data.systemId}`;
  io.to(roomName).emit('battle:started', data);
});
```

### Task 1.3: Enhance battle:alert with participant data

**File:** `src/workers/battle-check.worker.js`

In `startBattle()` function, update the emit:

```javascript
// Notify players with full participant data
io.to(loc.roomName).emit('battle:alert', {
  battleId: battleIdStr,
  systemId: locationId,
  startTime: Date.now(),
  participants: units.map(u => ({
    unitId: u.id,
    faction: u.player_id ? 'player' : 'npc',
    playerId: u.player_id,
    maxHealth: u.max_hp,
    maxShield: u.max_shield,
    health: u.hp,
    shield: u.shield,
    x: u.pos_x,
    y: u.pos_y,
    z: u.pos_z
  }))
});
```

### Task 1.4: Add battle:getState handler for late-join

**File:** `src/sockets/battle.socket.js`

```javascript
const { getStatus } = require('../workers/battle-check.worker');
const { emitToBattle } = require('../battle/battleClient');

module.exports = function registerBattleSockets({ io, socket, pool, workers }) {
  const playerId = socket.user?.playerId;

  // Existing battle:test handler...

  // Late-join state request
  socket.on('battle:getState', async (data, callback) => {
    if (typeof callback !== 'function') return;

    const { systemId } = data;
    if (!systemId) {
      return callback({ success: false, error: 'systemId required' });
    }

    try {
      // Get active battles from worker
      const status = getStatus();
      const locationKey = `SolarSystem:${systemId}`;

      const activeBattle = status.battles.find(b => b.location === locationKey);

      if (!activeBattle) {
        return callback({ success: false, error: 'No active battle' });
      }

      // Request current state from battle-server
      emitToBattle('battle:status', { battleId: activeBattle.battleId }, (response) => {
        if (response && response.success) {
          callback({
            success: true,
            battleId: activeBattle.battleId,
            systemId: systemId,
            participants: response.units || [],
            tick: response.currentTick || 0
          });
        } else {
          callback({ success: false, error: 'Battle server unavailable' });
        }
      });
    } catch (error) {
      logger.error('[BattleSocket] battle:getState error:', error);
      callback({ success: false, error: 'Server error' });
    }
  });
};
```

### Task 1.5: Export getStatus from battle-check.worker

**File:** `src/workers/battle-check.worker.js`

Already exported. Verify `getStatus()` returns the correct format:

```javascript
function getStatus() {
  return {
    activeBattles: activeBattles.size,
    activeLocations: playerLocations.size,
    cooldowns: battleCooldowns.size,
    battles: Array.from(activeBattles.entries()).map(([key, battle]) => ({
      location: key,
      battleId: battle.battleId,
      duration: Date.now() - battle.startTime,
      players: battle.playerIds,
      unitCount: battle.unitCount
    }))
  };
}
```

### Deliverable

Game-server now:
1. Relays `battle:tick` (with weaponsFired) to Unity clients
2. Relays `battle:started` to Unity clients
3. Emits enhanced `battle:alert` with participant max stats
4. Handles `battle:getState` for late-join players

---

## Phase 2: Unity Implementation

**Owner:** Unity Team
**Estimated Effort:** 3-5 days
**Status:** Can start P0 items now

### Priority 0 (Start Immediately)

| Component | Description |
|-----------|-------------|
| CombatManager | Service to track battle state, subscribe to events |
| BattleDamageHandler | Process `damaged[]` from ticks, update health bars |
| BattleDestructionHandler | Process `destroyed[]`, play explosion effects |

### Priority 1 (After Phase 0 Complete)

| Component | Description |
|-----------|-------------|
| ProjectileManager | Object pool for missiles/projectiles |
| Weapon Prefabs | 4 types: missile, laser, beam, projectile |
| Late-Join Handler | Emit `battle:getState` when entering battle zone |

### Priority 2 (Polish)

| Component | Description |
|-----------|-------------|
| Battle UI Indicator | HUD element showing "BATTLE IN PROGRESS" |
| Battle Results Panel | Modal showing victor, casualties, duration |

---

## Agreed Payload Structures

### battle:alert (game-server → Unity)
```json
{
  "battleId": "battle_123_456",
  "systemId": 123,
  "startTime": 1699900000,
  "participants": [
    {
      "unitId": 1,
      "faction": "player",
      "playerId": 42,
      "maxHealth": 1000,
      "maxShield": 500,
      "health": 1000,
      "shield": 500,
      "x": 100.5,
      "y": 15,
      "z": 200.3
    }
  ]
}
```

### battle:tick (game-server → Unity)
```json
{
  "battleId": "battle_123_456",
  "systemId": 123,
  "tick": 1234,
  "moved": [
    { "id": 1, "x": 105.2, "y": 15, "z": 198.1 }
  ],
  "damaged": [
    { "id": 2, "hp": 750, "shield": 100, "attackerId": 1 }
  ],
  "destroyed": [
    { "id": 3, "destroyedBy": 1 }
  ],
  "weaponsFired": [
    { "attackerId": 1, "targetId": 2, "weaponType": "missile", "impactTime": 1500 },
    { "attackerId": 3, "targetId": 4, "weaponType": "laser", "impactTime": 0 }
  ]
}
```

### battle:concluded (game-server → Unity)
```json
{
  "battleId": "battle_123_456",
  "systemId": 123,
  "duration": 45000,
  "survivors": [1, 4, 5],
  "casualties": [2, 3],
  "victor": 42
}
```

### battle:getState request (Unity → game-server)
```json
{
  "systemId": 123
}
```

### battle:getState response (game-server → Unity)
```json
{
  "success": true,
  "battleId": "battle_123_456",
  "systemId": 123,
  "participants": [...],
  "tick": 1234
}
```

---

## Projectile Speed Reference

| weapon_tag | Speed | impactTime |
|------------|-------|------------|
| `laser` | instant | `0` |
| `beam` | instant | `0` |
| `missile` | 300 units/sec | `distance / 300 * 1000` |
| `projectile` | 800 units/sec | `distance / 800 * 1000` |
| `torpedo` | 150 units/sec | `distance / 150 * 1000` |
| (unknown) | 800 units/sec | `distance / 800 * 1000` |

---

## Testing Checklist

### Phase 0 Complete
- [ ] Battle-server emits `weaponsFired[]` in `battle:tick`
- [ ] impactTime calculated correctly for each weapon type
- [ ] No regression in existing tick data (moved, damaged, destroyed)

### Phase 1 Complete
- [ ] `battle:tick` forwarded to Unity rooms
- [ ] `battle:started` forwarded to Unity rooms
- [ ] `battle:alert` includes participant max stats
- [ ] `battle:getState` returns current battle state
- [ ] `battle:getState` returns error when no active battle

### Phase 2 Complete
- [ ] Unity receives and processes all battle events
- [ ] Health bars update from damage events
- [ ] Explosions play on unit destruction
- [ ] Projectiles spawn and travel to targets
- [ ] Late-join players see current battle state

---

## Deferred to v2

| Feature | Reason |
|---------|--------|
| Player targeting (`combat:attack`) | Requires Rust WASM changes to override AI |
| Retreat mechanic | Requires new battle state in simulation |
| Shield/hull damage split | Nice-to-have, not blocking |
| Miss events | Nice-to-have, not blocking |

---

## File Changes Summary

### Battle-Server
| File | Change |
|------|--------|
| `simulator.rs` | Add `WeaponFired` struct, populate from weapon loop |
| `lib.rs` | Include in WASM serialization |

### Game-Server
| File | Change |
|------|--------|
| `src/workers/battle-check.worker.js` | Forward tick/started events, enhance battle:alert |
| `src/sockets/battle.socket.js` | Add `battle:getState` handler |

### Unity
| File | Change |
|------|--------|
| `CombatManager.cs` | New service - battle state management |
| `BattleDamageHandler.cs` | New handler - process damage events |
| `BattleDestructionHandler.cs` | New handler - destruction effects |
| `ProjectileManager.cs` | New manager - projectile pooling |
| Prefabs | 4 weapon visual prefabs |

---

## Sign-Off

| Team | Status | Date |
|------|--------|------|
| Battle-Server | ✅ APPROVED | 2025-12-11 |
| Game-Server | ✅ APPROVED | 2025-12-11 |
| Unity | ✅ APPROVED | 2025-12-11 |

**Ready to implement.**

