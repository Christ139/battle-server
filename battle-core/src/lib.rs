mod spatial_grid;
mod battle_unit;
mod simulator;
mod targeting;
mod weapons;
mod movement;

use wasm_bindgen::prelude::*;
use simulator::{BattleSimulator, TickResult};
use battle_unit::BattleUnit;
use serde_json;

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
}
