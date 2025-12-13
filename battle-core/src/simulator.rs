// battle-core/src/simulator.rs
//
// ✅ UPDATES:
// 1. Added update_positions() - sync external position changes
// 2. Added update_single_position() - update one unit's position
// 3. Added force_retarget_all() and force_retarget_unit()
// 4. Added periodic target re-evaluation (every 40 ticks = 2 seconds)
// 5. Added target validity checking (range, alive status)
// 6. Auto-movement for units with no player input (offline users)

use crate::spatial_grid::SpatialGrid;
use crate::battle_unit::BattleUnit;
use crate::targeting::find_best_target;
use crate::weapons::{try_fire_weapon, is_point_defense};
use crate::log;
use crate::PositionUpdate;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

/// How often to re-evaluate targets (in ticks)
/// 40 ticks = 2 seconds at 20 ticks/sec
const RETARGET_INTERVAL: u64 = 40;

/// Distance threshold for considering a position change "significant"
/// If a unit moves more than this, clear its target
const SIGNIFICANT_MOVEMENT_THRESHOLD: f32 = 50.0;

/// Get projectile speed for a weapon type (units per second)
fn get_projectile_speed(weapon_tag: &str) -> f32 {
    let tag_lower = weapon_tag.to_lowercase();
    
    if tag_lower.contains("laser") || tag_lower.contains("ion") || tag_lower.contains("beam") {
        return f32::INFINITY;
    }
    
    if tag_lower.contains("missile") || tag_lower.starts_with("hm") || tag_lower.starts_with("sm") {
        return 50.0;
    }
    
    if tag_lower.contains("rocket") || tag_lower.starts_with("pr") || tag_lower.starts_with("cr") {
        return 80.0;
    }
    
    if tag_lower.contains("nuke") || tag_lower.starts_with("nm") {
        return 30.0;
    }
    
    100.0
}

/// Calculate impact time in milliseconds
fn calculate_impact_time(distance: f32, weapon_tag: &str) -> u32 {
    let speed = get_projectile_speed(weapon_tag);
    if speed.is_infinite() {
        0
    } else {
        ((distance / speed) * 1000.0) as u32
    }
}

/// Main battle simulator
pub struct BattleSimulator {
    pub units: Vec<BattleUnit>,
    grid: SpatialGrid,
    tick: u64,
    damage_queue: Vec<DamageEntry>,
}

#[derive(Debug, Clone)]
struct DamageEntry {
    target_idx: usize,
    damage: f32,
    attacker_idx: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TickResult {
    pub moved: Vec<MovedUnit>,
    pub damaged: Vec<DamagedUnit>,
    pub destroyed: Vec<u32>,
    pub tick: u64,
    #[serde(rename = "weaponsFired")]
    pub weapons_fired: Vec<WeaponFired>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeaponFired {
    #[serde(rename = "attackerId")]
    pub attacker_id: u32,
    #[serde(rename = "targetId")]
    pub target_id: u32,
    #[serde(rename = "weaponType")]
    pub weapon_type: String,
    #[serde(rename = "impactTime")]
    pub impact_time: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MovedUnit {
    pub id: u32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DamagedUnit {
    pub id: u32,
    pub hp: f32,
    pub shield: f32,
}

impl BattleSimulator {
    pub fn new(units: Vec<BattleUnit>) -> Self {
        let ships = units.iter().filter(|u| u.is_ship).count();
        let stations = units.iter().filter(|u| u.is_station).count();
        let armed = units.iter().filter(|u| u.has_weapons).count();
        log(&format!(
            "[Simulator] Created with {} units: {} ships, {} stations, {} armed",
            units.len(), ships, stations, armed
        ));

        Self {
            units,
            grid: SpatialGrid::new(100.0),
            tick: 0,
            damage_queue: Vec::new(),
        }
    }

    // =========================================================================
    // ✅ NEW: External position update methods
    // =========================================================================

    /// Update multiple unit positions from external source (player movement)
    /// Returns the number of units successfully updated
    pub fn update_positions(&mut self, updates: &[PositionUpdate]) -> u32 {
        let mut count = 0;
        
        for update in updates {
            if self.update_single_position(update.id, update.x, update.y, update.z, update.clear_target) {
                count += 1;
            }
        }
        
        // Rebuild spatial grid after position updates
        if count > 0 {
            self.rebuild_spatial_grid();
        }
        
        count
    }

    /// Update a single unit's position
    /// Returns true if unit was found and updated
    pub fn update_single_position(&mut self, unit_id: u32, x: f32, y: f32, z: f32, clear_target: bool) -> bool {
        if let Some(unit) = self.units.iter_mut().find(|u| u.id == unit_id && u.alive) {
            let old_x = unit.pos_x;
            let old_y = unit.pos_y;
            let old_z = unit.pos_z;
            
            // Update position
            unit.pos_x = x;
            unit.pos_y = y;
            unit.pos_z = z;
            
            // Stop any internal velocity since we're setting position externally
            unit.vel_x = 0.0;
            unit.vel_y = 0.0;
            unit.vel_z = 0.0;
            
            // Calculate movement distance
            let dx = x - old_x;
            let dy = y - old_y;
            let dz = z - old_z;
            let move_dist = (dx * dx + dy * dy + dz * dz).sqrt();
            
            // Clear target if requested OR if movement was significant
            if clear_target || move_dist > SIGNIFICANT_MOVEMENT_THRESHOLD {
                unit.target_id = None;
                
                if move_dist > SIGNIFICANT_MOVEMENT_THRESHOLD {
                    log(&format!(
                        "[Position] Unit {} moved significantly ({:.1} units), clearing target",
                        unit_id, move_dist
                    ));
                }
            }
            
            true
        } else {
            false
        }
    }

    /// Rebuild spatial grid from current positions
    fn rebuild_spatial_grid(&mut self) {
        self.grid.clear();
        for (idx, unit) in self.units.iter().enumerate() {
            if unit.alive {
                self.grid.insert(idx, unit.pos_x, unit.pos_y, unit.pos_z);
            }
        }
    }

    /// Force all units to re-evaluate their targets
    /// Returns the number of units that changed targets
    pub fn force_retarget_all(&mut self) -> u32 {
        let mut changed = 0;
        
        // First pass: clear all targets
        for unit in self.units.iter_mut() {
            if unit.alive && unit.target_id.is_some() {
                unit.target_id = None;
                changed += 1;
            }
        }
        
        log(&format!("[Retarget] Cleared {} unit targets, will re-acquire next tick", changed));
        
        changed
    }

    /// Force a specific unit to re-evaluate its target
    pub fn force_retarget_unit(&mut self, unit_id: u32) -> bool {
        if let Some(unit) = self.units.iter_mut().find(|u| u.id == unit_id && u.alive) {
            unit.target_id = None;
            true
        } else {
            false
        }
    }

    /// Check if a target is still valid (alive, in range)
    fn is_target_valid(&self, attacker_idx: usize, target_id: u32) -> bool {
        let attacker = &self.units[attacker_idx];
        
        // Find target
        if let Some(target) = self.units.iter().find(|u| u.id == target_id) {
            // Must be alive
            if !target.alive {
                return false;
            }
            
            // Must be enemy
            if target.faction_id == attacker.faction_id {
                return false;
            }
            
            // Check if still in weapon range (with some buffer)
            let dist_sq = attacker.distance_sq(target);
            let max_range = attacker.max_weapon_range * 1.5; // 50% buffer before invalidating
            
            if dist_sq > max_range * max_range {
                return false;
            }
            
            true
        } else {
            false
        }
    }

    /// Main simulation tick
    pub fn simulate_tick(&mut self, dt: f32, current_time: f64) -> TickResult {
        self.tick += 1;

        // DEBUG: Log tick start (every 20 ticks = ~1 second)
        if self.tick % 20 == 0 {
            let alive_count = self.units.iter().filter(|u| u.alive).count();
            let with_targets = self.units.iter().filter(|u| u.alive && u.target_id.is_some()).count();
            let with_weapons = self.units.iter().filter(|u| u.alive && u.has_weapons).count();
            log(&format!(
                "[Simulator] Tick {}: alive={}, with_targets={}, with_weapons={}, dt={:.3}s",
                self.tick, alive_count, with_targets, with_weapons, dt
            ));
        }

        // 1. Update spatial grid - O(n)
        self.grid.clear();
        for (idx, unit) in self.units.iter().enumerate() {
            if unit.alive {
                self.grid.insert(idx, unit.pos_x, unit.pos_y, unit.pos_z);
            }
        }

        // 2. Target acquisition and validation - O(k) per unit
        // ✅ UPDATED: Now validates existing targets and periodically re-evaluates
        for idx in 0..self.units.len() {
            if !self.units[idx].alive || !self.units[idx].has_weapons {
                continue;
            }

            let current_target = self.units[idx].target_id;
            let should_retarget = 
                // No target
                current_target.is_none() ||
                // Periodic re-evaluation (every RETARGET_INTERVAL ticks)
                (self.tick % RETARGET_INTERVAL == 0) ||
                // Current target is no longer valid
                (current_target.is_some() && !self.is_target_valid(idx, current_target.unwrap()));

            if should_retarget {
                // Clear old target
                self.units[idx].target_id = None;
                
                // Find new target
                if let Some(enemy_idx) = find_best_target(&self.units[idx], &self.units, &self.grid) {
                    let old_target = current_target;
                    let new_target = self.units[enemy_idx].id;
                    self.units[idx].target_id = Some(new_target);
                    
                    // Log target changes
                    if old_target.is_some() && old_target != Some(new_target) && self.units[idx].id % 50 == 0 {
                        log(&format!(
                            "[Target] Unit {} retargeted: {:?} -> {}",
                            self.units[idx].id, old_target, new_target
                        ));
                    }
                }
            }
        }

        // 3. Movement - O(n)
        // ✅ UPDATED: Auto-movement for all units (including those owned by offline players)
        let mut moved: Vec<MovedUnit> = Vec::new();
        
        for idx in 0..self.units.len() {
            if !self.units[idx].alive {
                continue;
            }

            // Stations don't move
            if self.units[idx].is_station {
                continue;
            }

            // Get target position if exists
            let target_pos = if let Some(target_id) = self.units[idx].target_id {
                self.units.iter()
                    .find(|u| u.id == target_id && u.alive)
                    .map(|u| (u.pos_x, u.pos_y, u.pos_z))
            } else {
                None
            };

            // Get optimal range from first weapon
            let optimal_range = if !self.units[idx].weapons.is_empty() {
                self.units[idx].weapons[0].optimal_range
            } else {
                0.0
            };

            let unit = &mut self.units[idx];
            let old_pos = (unit.pos_x, unit.pos_y, unit.pos_z);

            if let Some((tx, ty, tz)) = target_pos {
                let dx = tx - unit.pos_x;
                let dy = ty - unit.pos_y;
                let dz = tz - unit.pos_z;
                let dist = (dx * dx + dy * dy + dz * dz).sqrt();

                if dist > optimal_range {
                    // Move towards target
                    unit.move_towards(tx, ty, tz);
                } else if dist < optimal_range * 0.8 {
                    // Back away (too close)
                    unit.move_away(tx, ty, tz);
                } else {
                    // At optimal range, stop
                    unit.stop();
                }
            } else {
                // No target, stop moving
                unit.stop();
            }

            // Update position
            unit.update_position(dt);

            // Track if moved significantly
            let moved_dist = ((unit.pos_x - old_pos.0).powi(2) + 
                             (unit.pos_y - old_pos.1).powi(2) + 
                             (unit.pos_z - old_pos.2).powi(2)).sqrt();
            
            if moved_dist > 0.01 {
                moved.push(MovedUnit {
                    id: unit.id,
                    x: unit.pos_x,
                    y: unit.pos_y,
                    z: unit.pos_z,
                });
            }
        }

        // 4. Combat - O(n) weapons
        self.damage_queue.clear();

        let mut weapon_fires: Vec<(usize, usize, f32, usize, f32, String)> = Vec::new();
        let mut units_with_target = 0;
        let mut units_checked_weapons = 0;

        for attacker_idx in 0..self.units.len() {
            if !self.units[attacker_idx].alive || !self.units[attacker_idx].has_weapons {
                continue;
            }

            let attacker_target_id = self.units[attacker_idx].target_id;
            if attacker_target_id.is_none() {
                continue;
            }
            units_with_target += 1;

            let target_id = attacker_target_id.unwrap();

            // Find target index
            let target_idx_opt = self.units.iter().position(|u| u.id == target_id && u.alive);
            if target_idx_opt.is_none() {
                // Clear dead target so unit can acquire new one next tick
                self.units[attacker_idx].target_id = None;
                continue;
            }
            let target_idx = target_idx_opt.unwrap();

            // Check each weapon
            for (weapon_idx, weapon) in self.units[attacker_idx].weapons.iter().enumerate() {
                units_checked_weapons += 1;
                
                if is_point_defense(weapon) {
                    continue;
                }

                let attacker = &self.units[attacker_idx];
                let target = &self.units[target_idx];

                if let Some(damage) = try_fire_weapon(attacker, target, weapon, current_time, self.tick) {
                    let distance = attacker.distance(target);
                    weapon_fires.push((
                        attacker_idx,
                        target_idx,
                        damage,
                        weapon_idx,
                        distance,
                        weapon.tag.clone()
                    ));
                }
            }
        }

        // DEBUG: Log combat summary
        if self.tick % 20 == 0 {
            log(&format!(
                "[Combat] Tick {}: units_with_target={}, weapons_checked={}, weapons_fired={}",
                self.tick, units_with_target, units_checked_weapons, weapon_fires.len()
            ));
        }

        // Process weapon fires
        let mut weapons_fired: Vec<WeaponFired> = Vec::new();

        for (attacker_idx, target_idx, damage, weapon_idx, distance, weapon_tag) in weapon_fires {
            if weapon_idx < self.units[attacker_idx].weapons.len() {
                self.units[attacker_idx].weapons[weapon_idx].last_fired = current_time;
            }

            self.damage_queue.push(DamageEntry {
                target_idx,
                damage,
                attacker_idx,
            });

            weapons_fired.push(WeaponFired {
                attacker_id: self.units[attacker_idx].id,
                target_id: self.units[target_idx].id,
                impact_time: calculate_impact_time(distance, &weapon_tag),
                weapon_type: weapon_tag,
            });
        }

        // 5. Process damage queue
        let mut damage_by_target: HashMap<usize, f32> = HashMap::new();
        for entry in &self.damage_queue {
            *damage_by_target.entry(entry.target_idx).or_insert(0.0) += entry.damage;
        }

        let mut destroyed: Vec<u32> = Vec::new();
        let mut damaged: Vec<DamagedUnit> = Vec::new();

        for (&target_idx, &total_damage) in &damage_by_target {
            let unit = &mut self.units[target_idx];
            let was_alive = unit.alive;

            unit.take_damage(total_damage);

            if was_alive && !unit.alive {
                destroyed.push(unit.id);
                log(&format!("[Damage] Unit {} DESTROYED!", unit.id));
                
                // ✅ IMPORTANT: Clear targets pointing to destroyed unit
                for other in self.units.iter_mut() {
                    if other.target_id == Some(unit.id) {
                        other.target_id = None;
                    }
                }
            } else if total_damage > 0.0 {
                damaged.push(DamagedUnit {
                    id: unit.id,
                    hp: unit.hp,
                    shield: unit.shield,
                });
            }

            for entry in &self.damage_queue {
                if entry.target_idx == target_idx {
                    self.units[entry.attacker_idx].damage_dealt += entry.damage;
                }
            }
        }

        // 6. Shield regen
        for unit in self.units.iter_mut() {
            if unit.alive {
                unit.regen_shield(dt);
            }
        }

        // 7. Build result
        TickResult {
            moved,
            damaged,
            destroyed,
            tick: self.tick,
            weapons_fired,
        }
    }

    // =========================================================================
    // Existing methods (required by lib.rs)
    // =========================================================================

    pub fn add_unit(&mut self, unit: BattleUnit) {
        log(&format!(
            "[Simulator] Adding unit {} (faction={}, ship={}, station={})",
            unit.id, unit.faction_id, unit.is_ship, unit.is_station
        ));
        self.units.push(unit);
    }

    pub fn get_active_factions(&self) -> Vec<u32> {
        let mut factions: Vec<u32> = self.units
            .iter()
            .filter(|u| u.alive)
            .map(|u| u.faction_id)
            .collect();

        factions.sort();
        factions.dedup();
        factions
    }

    pub fn is_battle_ended(&self) -> bool {
        self.get_active_factions().len() <= 1
    }

    pub fn get_results(&self) -> Vec<BattleUnit> {
        self.units.clone()
    }

    pub fn get_units(&self) -> &[BattleUnit] {
        &self.units
    }

    pub fn get_faction_counts(&self) -> HashMap<u32, usize> {
        let mut counts: HashMap<u32, usize> = HashMap::new();
        for unit in &self.units {
            if unit.alive {
                *counts.entry(unit.faction_id).or_insert(0) += 1;
            }
        }
        counts
    }

    pub fn is_battle_over(&self) -> bool {
        self.is_battle_ended()
    }

    pub fn get_winner(&self) -> Option<u32> {
        let factions = self.get_active_factions();
        if factions.len() == 1 {
            Some(factions[0])
        } else {
            None
        }
    }
}