// battle-core/src/lib.rs
//
// ✅ UPDATES:
// 1. Added update_unit_positions() - sync external position changes during battle
// 2. Added force_retarget() - force units to re-evaluate targets
// 3. Added update_single_unit_position() - update a single unit's position

mod spatial_grid;
mod battle_unit;
mod simulator;
mod targeting;
mod weapons;
mod movement;

use wasm_bindgen::prelude::*;
use simulator::BattleSimulator;
use battle_unit::BattleUnit;
use serde_json;
use serde::{Deserialize, Serialize};

// JS console binding that works in both browser and Node.js
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    pub fn log(s: &str);
}

/// Position update for syncing external movement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionUpdate {
    pub id: u32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    #[serde(default)]
    pub clear_target: bool,  // If true, clear the unit's current target
}

/// WASM-exported battle simulator
#[wasm_bindgen]
pub struct WasmBattleSimulator {
    simulator: BattleSimulator,
}

#[wasm_bindgen]
impl WasmBattleSimulator {
    /// Create new simulator from JSON units
    #[wasm_bindgen(constructor)]
    pub fn new(units_json: &str) -> Result<WasmBattleSimulator, JsValue> {
        let units: Vec<BattleUnit> = serde_json::from_str(units_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse units: {}", e)))?;
        
        Ok(WasmBattleSimulator {
            simulator: BattleSimulator::new(units),
        })
    }

    /// Simulate one tick - returns JSON
    #[wasm_bindgen]
    pub fn simulate_tick(&mut self, dt: f32, current_time: f64) -> Result<String, JsValue> {
        let result = self.simulator.simulate_tick(dt, current_time);
        
        serde_json::to_string(&result)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {}", e)))
    }

    /// Add unit mid-battle - takes JSON
    #[wasm_bindgen]
    pub fn add_unit(&mut self, unit_json: &str) -> Result<(), JsValue> {
        let unit: BattleUnit = serde_json::from_str(unit_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse unit: {}", e)))?;
        
        self.simulator.add_unit(unit);
        Ok(())
    }

    /// ✅ NEW: Update multiple unit positions from external source (player movement)
    /// Takes JSON array of PositionUpdate objects
    /// Returns number of units updated
    #[wasm_bindgen]
    pub fn update_unit_positions(&mut self, positions_json: &str) -> Result<u32, JsValue> {
        let updates: Vec<PositionUpdate> = serde_json::from_str(positions_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse position updates: {}", e)))?;
        
        let count = self.simulator.update_positions(&updates);
        
        if !updates.is_empty() {
            log(&format!(
                "[WASM] Updated {} unit positions from external source",
                count
            ));
        }
        
        Ok(count)
    }

    /// ✅ NEW: Update a single unit's position
    /// Useful for real-time movement sync
    #[wasm_bindgen]
    pub fn update_single_unit_position(&mut self, unit_id: u32, x: f32, y: f32, z: f32, clear_target: bool) -> bool {
        self.simulator.update_single_position(unit_id, x, y, z, clear_target)
    }

    /// ✅ NEW: Force all units to re-evaluate their targets
    /// Call this after significant position changes
    #[wasm_bindgen]
    pub fn force_retarget(&mut self) -> u32 {
        self.simulator.force_retarget_all()
    }

    /// ✅ NEW: Force a specific unit to re-evaluate its target
    #[wasm_bindgen]
    pub fn force_retarget_unit(&mut self, unit_id: u32) -> bool {
        self.simulator.force_retarget_unit(unit_id)
    }

    /// Check if battle ended
    #[wasm_bindgen]
    pub fn is_battle_ended(&self) -> bool {
        self.simulator.is_battle_ended()
    }

    /// Get active factions - returns JSON array
    #[wasm_bindgen]
    pub fn get_active_factions(&self) -> Result<String, JsValue> {
        let factions = self.simulator.get_active_factions();
        serde_json::to_string(&factions)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize factions: {}", e)))
    }

    /// Get battle results - returns JSON
    #[wasm_bindgen]
    pub fn get_results(&self) -> Result<String, JsValue> {
        let results = self.simulator.get_results();
        serde_json::to_string(&results)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize results: {}", e)))
    }

    /// ✅ NEW: Get current unit positions - useful for debugging
    #[wasm_bindgen]
    pub fn get_unit_positions(&self) -> Result<String, JsValue> {
        let positions: Vec<PositionUpdate> = self.simulator.get_units()
            .iter()
            .filter(|u| u.alive)
            .map(|u| PositionUpdate {
                id: u.id,
                x: u.pos_x,
                y: u.pos_y,
                z: u.pos_z,
                clear_target: false,
            })
            .collect();
        
        serde_json::to_string(&positions)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize positions: {}", e)))
    }
}