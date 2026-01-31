/**
 * BattleManager.js
 *
 * Manages battle lifecycle using Rust WASM battle core
 * Handles tick loops, unit updates, and result persistence
 * 
 * ✅ UPDATES:
 * 1. Added updateUnitPositions() - sync external position changes to WASM
 * 2. Added forceRetarget() - trigger target re-evaluation
 * 3. Position updates trigger automatic re-targeting if movement is significant
 * 4. All units now auto-move toward targets (supports offline player combat)
 * 5. ✅ NEW: IDLE MODE - Skips ticks entirely when no movement and weapons on cooldown
 *    - Tracks idle state per battle
 *    - When idle: skips calling simulate_tick() until wake condition met
 *    - Wakes on: position update, weapon ready, or periodic check
 *    - Reduces server load by ~90% during standoffs
 */

const { WasmBattleSimulator } = require('./battle-core/pkg/battle_core.js');

class BattleManager {
  constructor(io) {
    this.io = io;
    this.battles = new Map(); // battleId -> BattleInstance
    this.tickInterval = null;
    this.TICK_RATE_MS = 50; // 20 ticks per second
    
    // ✅ NEW: Idle mode configuration
    this.IDLE_CHECK_INTERVAL_MS = 500; // Check idle battles every 500ms (2/sec)
    
    // Track pending position updates per battle
    this.pendingPositionUpdates = new Map(); // battleId -> Map<unitId, {x,y,z}>
  }

  /**
   * Start a new battle
   *
   * @param {string} battleId - Unique battle identifier
   * @param {number} systemId - Solar system ID
   * @param {Array} units - Battle units from battle-data.service
   */
  startBattle(battleId, systemId, units) {
    try {
      console.log(`[BattleManager] Starting battle ${battleId} in system ${systemId} with ${units.length} units`);

      // DEBUG: Log unit data
      console.log(`[BattleManager] DEBUG: Checking unit data...`);
      for (const unit of units.slice(0, 3)) {
        console.log(`  Unit ${unit.id}: faction=${unit.faction_id}, weapons=${JSON.stringify(unit.weapons)}, pos=(${unit.pos_x?.toFixed(1)}, ${unit.pos_y?.toFixed(1)}, ${unit.pos_z?.toFixed(1)})`);
      }
      const unitsWithWeapons = units.filter(u => u.weapons && u.weapons.length > 0).length;
      const factions = [...new Set(units.map(u => u.faction_id))];
      console.log(`  Total: ${units.length} units, ${unitsWithWeapons} with weapons, factions: ${factions.join(', ')}`);

      // Create WASM simulator with current time for weapon cooldown randomization
      const unitsJson = JSON.stringify(units);
      const currentTimeSec = Date.now() / 1000;
      const simulator = new WasmBattleSimulator(unitsJson, currentTimeSec);

      // Store battle instance
      const battle = {
        battleId,
        systemId,
        simulator,
        tick: 0,
        startTime: Date.now(),
        lastTickTime: Date.now(),
        units: units.map(u => u.id),
        factions: [...new Set(units.map(u => u.faction_id))],
        ended: false,
        results: null,
        // ✅ NEW: Idle tracking
        isIdle: false,
        idleTickCount: 0,
        nextWeaponReadyTime: 0,
        lastIdleCheckTime: 0
      };

      this.battles.set(battleId, battle);
      
      // Initialize pending position updates map for this battle
      this.pendingPositionUpdates.set(battleId, new Map());

      // Emit battle started event
      this.io.to(`system:${systemId}`).emit('battle:started', {
        battleId,
        systemId,
        unitCount: units.length,
        factions: battle.factions
      });

      // Start tick loop if not running
      if (!this.tickInterval) {
        this.startTickLoop();
      }

      console.log(`[BattleManager] Battle ${battleId} started successfully`);
      return { success: true, battleId };

    } catch (error) {
      console.error(`[BattleManager] Error starting battle ${battleId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * ✅ NEW: Update unit positions from external source (player movement)
   * This WAKES the battle from idle mode
   * 
   * @param {string} battleId - Battle identifier
   * @param {Array} positionUpdates - Array of {id, x, y, z, clearTarget?}
   * @returns {Object} Result with updated count
   */
  updateUnitPositions(battleId, positionUpdates) {
    const battle = this.battles.get(battleId);
    if (!battle || battle.ended) {
      return { success: false, error: 'Battle not found or ended' };
    }

    try {
      // ✅ Wake from idle on position update
      if (battle.isIdle) {
        console.log(`[BattleManager] Battle ${battleId} WAKING from idle - position update received`);
        battle.isIdle = false;
      }

      // Convert to JSON and pass to WASM
      const updatesJson = JSON.stringify(positionUpdates);
      const updatedCount = battle.simulator.update_unit_positions(updatesJson);
      
      console.log(`[BattleManager] Updated ${updatedCount} unit positions in battle ${battleId}`);
      
      return { success: true, updated: updatedCount };
    } catch (error) {
      console.error(`[BattleManager] Error updating positions:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * ✅ NEW: Update a single unit's position
   * This WAKES the battle from idle mode
   * 
   * @param {string} battleId - Battle identifier
   * @param {number} unitId - Unit to update
   * @param {number} x - New X position
   * @param {number} y - New Y position
   * @param {number} z - New Z position
   * @param {boolean} clearTarget - If true, clear unit's current target
   */
  updateSingleUnitPosition(battleId, unitId, x, y, z, clearTarget = false) {
    const battle = this.battles.get(battleId);
    if (!battle || battle.ended) {
      return { success: false, error: 'Battle not found or ended' };
    }

    try {
      // ✅ Wake from idle on position update
      if (battle.isIdle) {
        console.log(`[BattleManager] Battle ${battleId} WAKING from idle - single position update`);
        battle.isIdle = false;
      }

      const result = battle.simulator.update_single_unit_position(unitId, x, y, z, clearTarget);
      return { success: result };
    } catch (error) {
      console.error(`[BattleManager] Error updating single position:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * ✅ NEW: Queue a position update for processing in next tick
   * This allows batching multiple position updates
   * 
   * @param {string} battleId - Battle identifier  
   * @param {number} unitId - Unit to update
   * @param {number} x - New X position
   * @param {number} y - New Y position
   * @param {number} z - New Z position
   */
  queuePositionUpdate(battleId, unitId, x, y, z) {
    const pending = this.pendingPositionUpdates.get(battleId);
    if (!pending) return false;
    
    pending.set(unitId, { id: unitId, x, y, z, clear_target: false });
    
    // ✅ Wake from idle if we have queued updates
    const battle = this.battles.get(battleId);
    if (battle?.isIdle) {
      battle.isIdle = false;
    }
    
    return true;
  }

  /**
   * ✅ NEW: Process all pending position updates for a battle
   */
  processPendingPositionUpdates(battleId) {
    const pending = this.pendingPositionUpdates.get(battleId);
    if (!pending || pending.size === 0) return 0;

    const updates = Array.from(pending.values());
    pending.clear();

    const result = this.updateUnitPositions(battleId, updates);
    return result.updated || 0;
  }

  /**
   * ✅ NEW: Force all units in a battle to re-evaluate their targets
   * This WAKES the battle from idle mode
   */
  forceRetarget(battleId) {
    const battle = this.battles.get(battleId);
    if (!battle || battle.ended) {
      return { success: false, error: 'Battle not found or ended' };
    }

    try {
      // ✅ Wake from idle
      if (battle.isIdle) {
        battle.isIdle = false;
      }

      const count = battle.simulator.force_retarget();
      console.log(`[BattleManager] Forced ${count} units to retarget in battle ${battleId}`);
      return { success: true, retargeted: count };
    } catch (error) {
      console.error(`[BattleManager] Error forcing retarget:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * ✅ NEW: Get current unit positions from WASM (for debugging)
   */
  getUnitPositions(battleId) {
    const battle = this.battles.get(battleId);
    if (!battle || battle.ended) {
      return { success: false, error: 'Battle not found or ended' };
    }

    try {
      const positionsJson = battle.simulator.get_unit_positions();
      const positions = JSON.parse(positionsJson);
      return { success: true, positions };
    } catch (error) {
      console.error(`[BattleManager] Error getting positions:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Start the main tick loop
   */
  startTickLoop() {
    if (this.tickInterval) {
      console.warn('[BattleManager] Tick loop already running');
      return;
    }

    console.log(`[BattleManager] Starting tick loop at ${this.TICK_RATE_MS}ms (${1000/this.TICK_RATE_MS} ticks/sec)`);

    this.tickInterval = setInterval(() => {
      this.processTick();
    }, this.TICK_RATE_MS);
  }

  /**
   * Stop the tick loop
   */
  stopTickLoop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
      console.log('[BattleManager] Tick loop stopped');
    }
  }

  /**
   * Process one tick for all active battles
   */
  processTick() {
    const now = Date.now();
    const currentTimeSec = now / 1000;

    for (const [battleId, battle] of this.battles.entries()) {
      if (battle.ended) continue;

      try {
        // ✅ Check for pending position updates (this wakes from idle)
        const pendingCount = this.processPendingPositionUpdates(battleId);

        // ✅ NEW: IDLE MODE OPTIMIZATION
        // Check if battle is idle and should skip this tick
        if (battle.isIdle) {
          // Only do periodic checks while idle (every 500ms instead of every 50ms)
          const timeSinceIdleCheck = now - battle.lastIdleCheckTime;
          if (timeSinceIdleCheck < this.IDLE_CHECK_INTERVAL_MS) {
            continue; // Skip this tick entirely
          }
          
          battle.lastIdleCheckTime = now;

          // Check if weapon is ready (time to wake up)
          if (currentTimeSec >= battle.nextWeaponReadyTime) {
            console.log(`[BattleManager] Battle ${battleId} WAKING - weapon cooldown expired`);
            battle.isIdle = false;
          } else {
            // Still idle - just log periodically
            battle.idleTickCount++;
            if (battle.idleTickCount % 10 === 0) { // Every 5 seconds (10 * 500ms)
              const timeToWeapon = (battle.nextWeaponReadyTime - currentTimeSec).toFixed(1);
              console.log(`[BattleManager] Battle ${battleId} IDLE: ${battle.idleTickCount} checks, weapon ready in ${timeToWeapon}s`);
            }
            continue; // Skip this tick
          }
        }

        // Calculate delta time
        const dt = (now - battle.lastTickTime) / 1000;
        battle.lastTickTime = now;

        // Run simulation tick
        const resultJson = battle.simulator.simulate_tick(dt, currentTimeSec);
        const tickResult = JSON.parse(resultJson);

        battle.tick++;

        // ✅ NEW: Update idle state from tick result
        if (tickResult.isIdle) {
          if (!battle.isIdle) {
            // Just entered idle mode
            battle.isIdle = true;
            battle.idleTickCount = 0;
            battle.lastIdleCheckTime = now;
            
            // Get next weapon ready time from WASM
            battle.nextWeaponReadyTime = battle.simulator.get_next_weapon_ready_time();
            
            const timeToWeapon = (battle.nextWeaponReadyTime - currentTimeSec).toFixed(1);
            console.log(`[BattleManager] Battle ${battleId} entering IDLE mode - next weapon in ${timeToWeapon}s`);
          }
          // Skip emitting for idle ticks (nothing happened)
          continue;
        }

        // DEBUG logging
        if (tickResult.weaponsFired?.length > 0) {
          console.log(`[Battle ${battleId}] Tick ${battle.tick}: ${tickResult.weaponsFired.length} weapons fired`);
          for (const wf of tickResult.weaponsFired.slice(0, 3)) {
            console.log(`  -> Attacker ${wf.attackerId} fired ${wf.weaponType} at Target ${wf.targetId}`);
          }
          
          // ✅ Update next weapon ready time after weapons fire
          battle.nextWeaponReadyTime = battle.simulator.get_next_weapon_ready_time();
        }
        if (tickResult.destroyed?.length > 0) {
          console.log(`[Battle ${battleId}] Tick ${battle.tick}: ${tickResult.destroyed.length} units DESTROYED: ${tickResult.destroyed.join(', ')}`);
        }

        // Summary log every second
        if (battle.tick % 20 === 0) {
          console.log(`[Battle ${battleId}] Tick ${battle.tick} summary: moved=${tickResult.moved?.length || 0}, damaged=${tickResult.damaged?.length || 0}, destroyed=${tickResult.destroyed?.length || 0}, weaponsFired=${tickResult.weaponsFired?.length || 0}`);
        }

        // Always emit tick events
        this.io.to(`system:${battle.systemId}`).emit('battle:tick', {
          battleId,
          systemId: battle.systemId,
          tick: battle.tick,
          moved: tickResult.moved || [],
          damaged: tickResult.damaged || [],
          destroyed: tickResult.destroyed || [],
          weaponsFired: tickResult.weaponsFired || []
        });

        // Check if battle ended
        if (battle.simulator.is_battle_ended()) {
          this.endBattle(battleId);
        }

      } catch (error) {
        console.error(`[BattleManager] Error processing tick for battle ${battleId}:`, error);
        this.endBattle(battleId, error);
      }
    }

    // Stop tick loop if no active battles
    if (this.battles.size === 0 && this.tickInterval) {
      this.stopTickLoop();
    }
  }

  /**
   * End a battle and get final results
   */
  endBattle(battleId, error = null) {
    const battle = this.battles.get(battleId);
    if (!battle) return;

    try {
      console.log(`[BattleManager] Ending battle ${battleId}`);

      const resultsJson = battle.simulator.get_results();
      const finalUnits = JSON.parse(resultsJson);

      const duration = Date.now() - battle.startTime;
      const activeFactions = JSON.parse(battle.simulator.get_active_factions());

      battle.ended = true;
      battle.results = {
        battleId,
        systemId: battle.systemId,
        duration,
        totalTicks: battle.tick,
        activeFactions,
        units: finalUnits,
        error: error ? error.message : null
      };

      const survivors = finalUnits.filter(u => u.alive).map(u => u.id);
      const casualties = finalUnits.filter(u => !u.alive).map(u => u.id);

      // Emit battle ended event
      this.io.to(`system:${battle.systemId}`).emit('battle:concluded', {
        battleId,
        systemId: battle.systemId,
        duration,
        totalTicks: battle.tick,
        survivors,
        casualties,
        victor: activeFactions.length === 1 ? activeFactions[0] : null
      });

      console.log(`[BattleManager] Battle ${battleId} ended. Duration: ${duration}ms, Survivors: ${survivors.length}, Casualties: ${casualties.length}`);

      // Clean up
      this.pendingPositionUpdates.delete(battleId);
      this.battles.delete(battleId);

      return { success: true, results: battle.results };

    } catch (err) {
      console.error(`[BattleManager] Error ending battle ${battleId}:`, err);
      this.battles.delete(battleId);
      this.pendingPositionUpdates.delete(battleId);
      return { success: false, error: err.message };
    }
  }

  /**
   * Add reinforcements to an existing battle
   * This WAKES the battle from idle mode
   */
  addReinforcements(battleId, units) {
    const battle = this.battles.get(battleId);
    if (!battle || battle.ended) {
      return { success: false, error: 'Battle not found or ended' };
    }

    try {
      // ✅ Wake from idle
      if (battle.isIdle) {
        battle.isIdle = false;
      }

      const currentTimeSec = Date.now() / 1000;
      for (const unit of units) {
        const unitJson = JSON.stringify(unit);
        battle.simulator.add_unit(unitJson, currentTimeSec);
        battle.units.push(unit.id);
      }

      console.log(`[BattleManager] Added ${units.length} reinforcements to battle ${battleId}`);
      return { success: true, added: units.length };

    } catch (error) {
      console.error(`[BattleManager] Error adding reinforcements:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop a battle manually
   */
  stopBattle(battleId) {
    return this.endBattle(battleId, new Error('Manually stopped'));
  }

  /**
   * Get battle status
   */
  getBattleStatus(battleId) {
    const battle = this.battles.get(battleId);
    if (!battle) {
      return { success: false, error: 'Battle not found' };
    }

    try {
      const activeFactions = JSON.parse(battle.simulator.get_active_factions());
      const positions = battle.simulator.get_unit_positions();
      
      return {
        success: true,
        battleId,
        systemId: battle.systemId,
        tick: battle.tick,
        duration: Date.now() - battle.startTime,
        activeFactions,
        ended: battle.ended,
        // ✅ NEW: Include idle info
        isIdle: battle.isIdle,
        idleTickCount: battle.idleTickCount,
        units: JSON.parse(positions)
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get list of active battles
   */
  getActiveBattles() {
    return Array.from(this.battles.entries())
      .filter(([_, b]) => !b.ended)
      .map(([id, b]) => ({
        battleId: id,
        systemId: b.systemId,
        tick: b.tick,
        duration: Date.now() - b.startTime,
        unitCount: b.units.length,
        // ✅ NEW: Include idle info
        isIdle: b.isIdle,
        idleTickCount: b.idleTickCount
      }));
  }

  /**
   * ✅ NEW: Find battle by system ID
   */
  getBattleBySystemId(systemId) {
    for (const [battleId, battle] of this.battles.entries()) {
      if (battle.systemId === systemId && !battle.ended) {
        return { battleId, battle };
      }
    }
    return null;
  }

  /**
   * Shutdown manager
   */
  shutdown() {
    this.stopTickLoop();
    
    for (const [battleId] of this.battles.entries()) {
      this.endBattle(battleId, new Error('Server shutdown'));
    }
    
    this.battles.clear();
    this.pendingPositionUpdates.clear();
    console.log('[BattleManager] Shutdown complete');
  }
}

module.exports = BattleManager;