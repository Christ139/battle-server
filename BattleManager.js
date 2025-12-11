/**
 * BattleManager.js
 * 
 * Manages battle lifecycle using Rust WASM battle core
 * Handles tick loops, unit updates, and result persistence
 */

const { WasmBattleSimulator } = require('./battle-core/pkg/battle_core.js');

class BattleManager {
  constructor(io) {
    this.io = io;
    this.battles = new Map(); // battleId -> BattleInstance
    this.tickInterval = null;
    this.TICK_RATE_MS = 50; // 20 ticks per second
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

      // Create WASM simulator
      const unitsJson = JSON.stringify(units);
      const simulator = new WasmBattleSimulator(unitsJson);

      // Store battle instance
      const battle = {
        battleId,
        systemId,
        simulator,
        tick: 0,
        startTime: Date.now(),
        lastTickTime: Date.now(),
        units: units.map(u => u.id), // Track unit IDs
        factions: [...new Set(units.map(u => u.faction_id))],
        ended: false,
        results: null
      };

      this.battles.set(battleId, battle);

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

    for (const [battleId, battle] of this.battles.entries()) {
      if (battle.ended) continue;

      try {
        // Calculate delta time
        const dt = (now - battle.lastTickTime) / 1000; // Convert to seconds
        battle.lastTickTime = now;

        // Run simulation tick (returns JSON string)
        const resultJson = battle.simulator.simulate_tick(dt, now / 1000);
        const tickResult = JSON.parse(resultJson);

        battle.tick++;

        // Emit delta updates to clients
        if (tickResult.moved.length > 0 || tickResult.damaged.length > 0 || tickResult.destroyed.length > 0) {
          this.io.to(`system:${battle.systemId}`).emit('battle:tick', {
            battleId,
            systemId: battle.systemId,
            tick: battle.tick,
            moved: tickResult.moved,
            damaged: tickResult.damaged,
            destroyed: tickResult.destroyed
          });
        }

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
   * 
   * @param {string} battleId 
   * @param {Error} error - Optional error if battle crashed
   */
  endBattle(battleId, error = null) {
    const battle = this.battles.get(battleId);
    if (!battle) return;

    try {
      console.log(`[BattleManager] Ending battle ${battleId}`);

      // Get final results from WASM
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

      // Emit battle ended event
      this.io.to(`system:${battle.systemId}`).emit('battle:ended', {
        battleId,
        systemId: battle.systemId,
        duration,
        totalTicks: battle.tick,
        survivors: finalUnits.filter(u => u.alive).length,
        casualties: finalUnits.filter(u => !u.alive).length,
        victor: activeFactions.length === 1 ? activeFactions[0] : null
      });

      console.log(`[BattleManager] Battle ${battleId} ended. Duration: ${duration}ms, Ticks: ${battle.tick}`);

      // Keep battle in memory for 60 seconds for result queries
      setTimeout(() => {
        this.battles.delete(battleId);
        console.log(`[BattleManager] Battle ${battleId} removed from memory`);
      }, 60000);

    } catch (error) {
      console.error(`[BattleManager] Error ending battle ${battleId}:`, error);
      battle.ended = true;
      battle.results = { error: error.message };
    }
  }

  /**
   * Add reinforcements to an active battle
   * 
   * @param {string} battleId 
   * @param {Array} units - New units to add
   */
  addReinforcements(battleId, units) {
    const battle = this.battles.get(battleId);
    if (!battle || battle.ended) {
      return { success: false, error: 'Battle not found or already ended' };
    }

    try {
      console.log(`[BattleManager] Adding ${units.length} reinforcements to battle ${battleId}`);

      for (const unit of units) {
        const unitJson = JSON.stringify(unit);
        battle.simulator.add_unit(unitJson);
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
   * 
   * @param {string} battleId 
   */
  getBattleStatus(battleId) {
    const battle = this.battles.get(battleId);
    if (!battle) {
      return { found: false };
    }

    return {
      found: true,
      battleId: battle.battleId,
      systemId: battle.systemId,
      tick: battle.tick,
      duration: Date.now() - battle.startTime,
      ended: battle.ended,
      unitCount: battle.units.length,
      factions: battle.factions,
      results: battle.results
    };
  }

  /**
   * Get all active battles
   */
  getActiveBattles() {
    const active = [];
    for (const [battleId, battle] of this.battles.entries()) {
      if (!battle.ended) {
        active.push({
          battleId,
          systemId: battle.systemId,
          tick: battle.tick,
          duration: Date.now() - battle.startTime,
          unitCount: battle.units.length,
          factions: battle.factions
        });
      }
    }
    return active;
  }

  /**
   * Force stop a battle
   * 
   * @param {string} battleId 
   */
  stopBattle(battleId) {
    const battle = this.battles.get(battleId);
    if (!battle) {
      return { success: false, error: 'Battle not found' };
    }

    this.endBattle(battleId);
    return { success: true };
  }

  /**
   * Shutdown - clean up all battles
   */
  shutdown() {
    console.log('[BattleManager] Shutting down...');
    
    this.stopTickLoop();
    
    for (const battleId of this.battles.keys()) {
      this.endBattle(battleId);
    }
    
    this.battles.clear();
    console.log('[BattleManager] Shutdown complete');
  }
}

module.exports = BattleManager;