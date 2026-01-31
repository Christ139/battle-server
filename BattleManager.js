/**
 * BattleManager.js
 *
 * Manages battle lifecycle using Rust WASM battle core
 * Handles tick loops, unit updates, and result persistence
 * 
 * ✅ CRITICAL FIXES:
 * 1. Added MAX_BATTLE_DURATION_MS (30 min) - absolute battle timeout
 * 2. Added STALEMATE_REAL_TIME_MS (5 min) - real time stalemate detection
 * 3. Added lastDamageTime tracking - tracks last combat activity by real time
 * 4. Added periodic timeout check in processTick()
 * 5. IDLE mode no longer prevents timeout detection
 * 6. Added updateUnitPositions() - sync external position changes to WASM
 * 7. Added forceRetarget() - trigger target re-evaluation
 * 8. Position updates trigger automatic re-targeting if movement is significant
 * 9. REDUCED LOGGING - Only summary logs every 5 seconds to reduce console spam
 */

const { WasmBattleSimulator } = require('./battle-core/pkg/battle_core.js');

class BattleManager {
  constructor(io) {
    this.io = io;
    this.battles = new Map(); // battleId -> BattleInstance
    this.tickInterval = null;
    this.TICK_RATE_MS = 50; // 20 ticks per second
    
    // ═══════════════════════════════════════════════════════════════════════
    // ✅ CRITICAL TIMEOUT CONFIGURATION
    // ═══════════════════════════════════════════════════════════════════════
    
    // Maximum battle duration (30 minutes) - ABSOLUTE LIMIT regardless of activity
    this.MAX_BATTLE_DURATION_MS = 30 * 60 * 1000;
    
    // Stalemate timeout (5 minutes) - end battle if no damage dealt for this long
    this.STALEMATE_REAL_TIME_MS = 5 * 60 * 1000;
    
    // How often to check timeouts (every 10 seconds)
    this.TIMEOUT_CHECK_INTERVAL_MS = 10 * 1000;
    
    // ═══════════════════════════════════════════════════════════════════════
    
    // Idle mode configuration
    this.IDLE_CHECK_INTERVAL_MS = 500;
    
    // Track pending position updates per battle
    this.pendingPositionUpdates = new Map();
    
    // Logging configuration
    this.LOG_SUMMARY_INTERVAL_TICKS = 100; // Log summary every 100 ticks (5 seconds)
    this.LOG_WEAPON_FIRES = false; // Set to true to see individual weapon fires
    this.LOG_DESTROYED_UNITS = true; // Always log unit destruction
  }

  /**
   * Start a new battle
   */
  startBattle(battleId, systemId, units) {
    try {
      const now = Date.now();
      
      console.log(`[BattleManager] ═══════════════════════════════════════════`);
      console.log(`[BattleManager] Starting battle ${battleId}`);
      console.log(`[BattleManager]   System: ${systemId}`);
      console.log(`[BattleManager]   Units: ${units.length}`);
      console.log(`[BattleManager]   Max Duration: ${this.MAX_BATTLE_DURATION_MS / 60000} minutes`);
      console.log(`[BattleManager]   Stalemate Timeout: ${this.STALEMATE_REAL_TIME_MS / 60000} minutes`);

      // Summary stats
      const factions = [...new Set(units.map(u => u.faction_id))];
      const unitsWithWeapons = units.filter(u => u.weapons && u.weapons.length > 0).length;
      const ships = units.filter(u => u.is_ship).length;
      const stations = units.filter(u => u.is_station).length;
      
      console.log(`[BattleManager]   Factions: ${factions.join(' vs ')}`);
      console.log(`[BattleManager]   Armed: ${unitsWithWeapons}/${units.length}`);
      console.log(`[BattleManager]   Ships: ${ships}, Stations: ${stations}`);
      console.log(`[BattleManager] ═══════════════════════════════════════════`);

      // Create WASM simulator
      const unitsJson = JSON.stringify(units);
      const currentTimeSec = now / 1000;
      const simulator = new WasmBattleSimulator(unitsJson, currentTimeSec);

      // Store battle instance
      const battle = {
        battleId,
        systemId,
        simulator,
        tick: 0,
        startTime: now,
        lastTickTime: now,
        units: units.map(u => u.id),
        factions: factions,
        ended: false,
        results: null,
        
        // Idle tracking
        isIdle: false,
        idleTickCount: 0,
        nextWeaponReadyTime: 0,
        lastIdleCheckTime: 0,
        
        // ✅ NEW: Timeout tracking (using REAL TIME, not ticks!)
        lastDamageTime: now,      // Last time damage was dealt
        lastTimeoutCheck: now,    // Last time we checked for timeout
        
        // Stats tracking for summary logs
        stats: {
          totalWeaponsFired: 0,
          totalDamageEvents: 0,
          totalDestroyed: 0,
          lastSummaryTick: 0
        }
      };

      this.battles.set(battleId, battle);
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
   * Start the main tick loop
   */
  startTickLoop() {
    if (this.tickInterval) {
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
   * ✅ NEW: Check if a battle should be force-ended due to timeout
   * Returns: null if OK, or reason string if should end
   */
  checkBattleTimeout(battle, now) {
    const runningTime = now - battle.startTime;
    const timeSinceLastDamage = now - battle.lastDamageTime;
    
    // Check absolute max duration
    if (runningTime > this.MAX_BATTLE_DURATION_MS) {
      const minutes = Math.round(runningTime / 60000);
      return `max_duration_exceeded_${minutes}m`;
    }
    
    // Check stalemate (no damage for too long)
    if (timeSinceLastDamage > this.STALEMATE_REAL_TIME_MS) {
      const minutes = Math.round(timeSinceLastDamage / 60000);
      return `stalemate_no_damage_${minutes}m`;
    }
    
    return null; // Battle is OK
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
        // ═══════════════════════════════════════════════════════════════════
        // ✅ CRITICAL: Timeout check runs REGARDLESS of idle state
        // ═══════════════════════════════════════════════════════════════════
        if (now - battle.lastTimeoutCheck >= this.TIMEOUT_CHECK_INTERVAL_MS) {
          battle.lastTimeoutCheck = now;
          
          const timeoutReason = this.checkBattleTimeout(battle, now);
          if (timeoutReason) {
            console.warn(`[BattleManager] ⚠️ Battle ${battleId} FORCE ENDING: ${timeoutReason}`);
            this.endBattle(battleId, new Error(timeoutReason));
            continue;
          }
          
          // Log status every minute
          const runningMinutes = Math.floor((now - battle.startTime) / 60000);
          const staleMins = Math.floor((now - battle.lastDamageTime) / 60000);
          if (runningMinutes > 0 && runningMinutes % 1 === 0 && battle.tick % 200 === 0) {
            console.log(`[Battle ${battleId}] Running ${runningMinutes}m, last damage ${staleMins}m ago, tick ${battle.tick}`);
          }
        }
        // ═══════════════════════════════════════════════════════════════════

        // Check idle mode
        if (battle.isIdle) {
          if (!battle.lastIdleCheckTime) {
            battle.lastIdleCheckTime = now;
          }

          // Only check idle battles at reduced rate
          if (now - battle.lastIdleCheckTime < this.IDLE_CHECK_INTERVAL_MS) {
            continue;
          }
          battle.lastIdleCheckTime = now;

          // Check if weapon is ready to fire
          if (currentTimeSec >= battle.nextWeaponReadyTime) {
            battle.isIdle = false;
          } else {
            battle.idleTickCount++;

            // Log idle status every 10 seconds
            if (battle.idleTickCount % 20 === 0) {
              const timeToWeapon = (battle.nextWeaponReadyTime - currentTimeSec).toFixed(1);
              console.log(`[Battle ${battleId}] IDLE: ${battle.idleTickCount} checks, weapon ready in ${timeToWeapon}s`);
            }
            continue;
          }
        }

        // Calculate delta time
        const dt = (now - battle.lastTickTime) / 1000;
        battle.lastTickTime = now;

        // Run simulation tick
        const resultJson = battle.simulator.simulate_tick(dt, currentTimeSec);
        const tickResult = JSON.parse(resultJson);

        battle.tick++;

        // Update stats
        const weaponsFiredCount = tickResult.weaponsFired?.length || 0;
        const damageCount = tickResult.damaged?.length || 0;
        const destroyedCount = tickResult.destroyed?.length || 0;
        
        battle.stats.totalWeaponsFired += weaponsFiredCount;
        battle.stats.totalDamageEvents += damageCount;
        battle.stats.totalDestroyed += destroyedCount;

        // ✅ CRITICAL: Update lastDamageTime when damage occurs
        if (damageCount > 0 || destroyedCount > 0) {
          battle.lastDamageTime = now;
        }

        // Check for idle mode transition
        if (tickResult.isIdle) {
          if (!battle.isIdle) {
            battle.isIdle = true;
            battle.idleTickCount = 0;
            battle.lastIdleCheckTime = now;
            battle.nextWeaponReadyTime = battle.simulator.get_next_weapon_ready_time();
            const timeToWeapon = (battle.nextWeaponReadyTime - currentTimeSec).toFixed(1);
            console.log(`[Battle ${battleId}] Entering IDLE mode - next weapon in ${timeToWeapon}s`);
          }
          continue;
        }

        // Reduced logging: Only log individual weapon fires if enabled
        if (this.LOG_WEAPON_FIRES && weaponsFiredCount > 0) {
          console.log(`[Battle ${battleId}] Tick ${battle.tick}: ${weaponsFiredCount} weapons fired`);
        }

        // Always log destroyed units (important events)
        if (this.LOG_DESTROYED_UNITS && destroyedCount > 0) {
          console.log(`[Battle ${battleId}] 💀 ${destroyedCount} units DESTROYED: ${tickResult.destroyed.join(', ')}`);
        }

        // Update next weapon ready time after weapons fire
        if (weaponsFiredCount > 0) {
          battle.nextWeaponReadyTime = battle.simulator.get_next_weapon_ready_time();
        }

        // Summary log every 5 seconds (100 ticks)
        if (battle.tick % this.LOG_SUMMARY_INTERVAL_TICKS === 0) {
          const elapsed = Math.floor((now - battle.startTime) / 1000);
          const staleSecs = Math.floor((now - battle.lastDamageTime) / 1000);
          
          console.log(`[Battle ${battleId}] ──── ${elapsed}s Summary ────`);
          console.log(`  Tick: ${battle.tick} | Weapons: ${battle.stats.totalWeaponsFired} | Damage: ${battle.stats.totalDamageEvents} | Destroyed: ${battle.stats.totalDestroyed} | Stale: ${staleSecs}s`);
          
          battle.stats.lastSummaryTick = battle.tick;
        }

        // Always emit tick events to clients
        this.io.to(`system:${battle.systemId}`).emit('battle:tick', {
          battleId,
          systemId: battle.systemId,
          tick: battle.tick,
          moved: tickResult.moved || [],
          damaged: tickResult.damaged || [],
          destroyed: tickResult.destroyed || [],
          weaponsFired: tickResult.weaponsFired || []
        });

        // Check if battle ended (via WASM)
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
   * Update unit positions from external source (player movement)
   * This WAKES the battle from idle mode
   */
  updateUnitPositions(battleId, positionUpdates) {
    const battle = this.battles.get(battleId);
    if (!battle || battle.ended) {
      return { success: false, error: 'Battle not found or ended' };
    }

    try {
      // Wake from idle
      if (battle.isIdle) {
        console.log(`[Battle ${battleId}] Woke from idle - position update received`);
        battle.isIdle = false;
      }

      const updatesJson = JSON.stringify(positionUpdates);
      const updatedCount = battle.simulator.update_unit_positions(updatesJson);
      
      return { success: true, updatedCount };
    } catch (error) {
      console.error(`[BattleManager] Position update error:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update a single unit's position
   */
  updateSingleUnitPosition(battleId, unitId, x, y, z, clearTarget = false) {
    const battle = this.battles.get(battleId);
    if (!battle || battle.ended) {
      return { success: false, error: 'Battle not found or ended' };
    }

    try {
      // Wake from idle
      if (battle.isIdle) {
        battle.isIdle = false;
      }

      battle.simulator.update_single_unit_position(unitId, x, y, z, clearTarget);
      return { success: true };
    } catch (error) {
      console.error(`[BattleManager] Single position update error:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Queue position update for batched processing
   */
  queuePositionUpdate(battleId, unitId, x, y, z) {
    const pending = this.pendingPositionUpdates.get(battleId);
    if (!pending) return;
    
    pending.set(unitId, { id: unitId, x, y, z });
  }

  /**
   * Force units to re-evaluate targets
   */
  forceRetarget(battleId) {
    const battle = this.battles.get(battleId);
    if (!battle || battle.ended) {
      return { success: false, error: 'Battle not found or ended' };
    }

    try {
      battle.simulator.force_retarget();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current unit positions (for debugging)
   */
  getUnitPositions(battleId) {
    const battle = this.battles.get(battleId);
    if (!battle || battle.ended) {
      return { success: false, error: 'Battle not found or ended' };
    }

    try {
      const positionsJson = battle.simulator.get_unit_positions();
      return { success: true, positions: JSON.parse(positionsJson) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * End a battle and get final results
   */
  endBattle(battleId, error = null) {
    const battle = this.battles.get(battleId);
    if (!battle) return;

    // Prevent double-ending
    if (battle.ended) {
      console.log(`[BattleManager] Battle ${battleId} already ended, skipping`);
      return;
    }

    try {
      const duration = Date.now() - battle.startTime;
      const durationStr = this.formatDuration(duration);
      
      console.log(`[BattleManager] ═══════════════════════════════════════════`);
      console.log(`[BattleManager] Battle ${battleId} ENDED`);
      console.log(`[BattleManager]   Duration: ${durationStr}`);
      console.log(`[BattleManager]   Ticks: ${battle.tick}`);
      console.log(`[BattleManager]   Weapons Fired: ${battle.stats.totalWeaponsFired}`);
      console.log(`[BattleManager]   Damage Events: ${battle.stats.totalDamageEvents}`);
      console.log(`[BattleManager]   Units Destroyed: ${battle.stats.totalDestroyed}`);
      if (error) {
        console.log(`[BattleManager]   End Reason: ${error.message || error}`);
      }

      const resultsJson = battle.simulator.get_results();
      const finalUnits = JSON.parse(resultsJson);
      const activeFactions = JSON.parse(battle.simulator.get_active_factions());

      const survivors = finalUnits.filter(u => u.alive);
      const casualties = finalUnits.filter(u => !u.alive);

      console.log(`[BattleManager]   Survivors: ${survivors.length}`);
      console.log(`[BattleManager]   Casualties: ${casualties.length}`);
      console.log(`[BattleManager]   Victor: ${activeFactions.length === 1 ? activeFactions[0] : 'None (Draw)'}`);
      console.log(`[BattleManager] ═══════════════════════════════════════════`);

      battle.ended = true;
      battle.results = {
        battleId,
        systemId: battle.systemId,
        duration,
        totalTicks: battle.tick,
        activeFactions,
        units: finalUnits,
        error: error ? (error.message || String(error)) : null
      };

      // Emit battle ended event
      this.io.to(`system:${battle.systemId}`).emit('battle:concluded', {
        battleId,
        systemId: battle.systemId,
        duration,
        totalTicks: battle.tick,
        survivors: survivors.map(u => u.id),
        casualties: casualties.map(u => u.id),
        victor: activeFactions.length === 1 ? activeFactions[0] : null,
        reason: error ? (error.message || String(error)) : 'completed'
      });

      // Keep battle in memory for 60 seconds for result queries
      setTimeout(() => {
        this.battles.delete(battleId);
        this.pendingPositionUpdates.delete(battleId);
        console.log(`[BattleManager] Battle ${battleId} removed from memory`);
      }, 60000);

    } catch (err) {
      console.error(`[BattleManager] Error ending battle ${battleId}:`, err);
      battle.ended = true;
      battle.results = { error: err.message };
    }
  }

  /**
   * Format duration for display
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Add reinforcements to an active battle
   */
  addReinforcements(battleId, units) {
    const battle = this.battles.get(battleId);
    if (!battle || battle.ended) {
      return { success: false, error: 'Battle not found or already ended' };
    }

    try {
      console.log(`[BattleManager] Adding ${units.length} reinforcements to battle ${battleId}`);
      
      const currentTimeSec = Date.now() / 1000;

      for (const unit of units) {
        const unitJson = JSON.stringify(unit);
        battle.simulator.add_unit(unitJson, currentTimeSec);
        battle.units.push(unit.id);
      }

      // Emit reinforcements event
      this.io.to(`system:${battle.systemId}`).emit('battle:reinforcements', {
        battleId,
        systemId: battle.systemId,
        reinforcements: units.map(u => ({
          id: u.id,
          faction_id: u.faction_id,
          player_id: u.player_id
        }))
      });

      return { success: true };

    } catch (error) {
      console.error(`[BattleManager] Error adding reinforcements:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get battle status
   */
  getBattleStatus(battleId) {
    const battle = this.battles.get(battleId);
    if (!battle) {
      return { found: false };
    }

    const now = Date.now();
    return {
      found: true,
      battleId: battle.battleId,
      systemId: battle.systemId,
      tick: battle.tick,
      duration: now - battle.startTime,
      timeSinceLastDamage: now - battle.lastDamageTime,
      ended: battle.ended,
      unitCount: battle.units.length,
      factions: battle.factions,
      stats: battle.stats,
      results: battle.results
    };
  }

  /**
   * Get all active battles
   */
  getActiveBattles() {
    const active = [];
    const now = Date.now();
    
    for (const [battleId, battle] of this.battles.entries()) {
      if (!battle.ended) {
        active.push({
          battleId,
          systemId: battle.systemId,
          tick: battle.tick,
          duration: now - battle.startTime,
          timeSinceLastDamage: now - battle.lastDamageTime,
          unitCount: battle.units.length,
          factions: battle.factions,
          isIdle: battle.isIdle,
          stats: battle.stats
        });
      }
    }
    return active;
  }

  /**
   * Force stop a battle
   */
  stopBattle(battleId, reason = 'force_stopped') {
    const battle = this.battles.get(battleId);
    if (!battle) {
      return { success: false, error: 'Battle not found' };
    }

    this.endBattle(battleId, new Error(reason));
    return { success: true };
  }

  /**
   * Shutdown - clean up all battles
   */
  shutdown() {
    console.log('[BattleManager] Shutting down...');
    
    this.stopTickLoop();
    
    for (const battleId of this.battles.keys()) {
      this.endBattle(battleId, new Error('server_shutdown'));
    }
    
    this.battles.clear();
    this.pendingPositionUpdates.clear();
    console.log('[BattleManager] Shutdown complete');
  }
}

module.exports = BattleManager;