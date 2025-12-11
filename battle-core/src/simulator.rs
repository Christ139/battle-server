use crate::spatial_grid::SpatialGrid;
use crate::battle_unit::BattleUnit;
use crate::targeting::find_best_target;
use crate::weapons::try_fire_weapon;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

/// Main battle simulator
/// 
/// Handles all combat logic in high-performance Rust
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
        Self {
            units,
            grid: SpatialGrid::new(1000.0),
            tick: 0,
            damage_queue: Vec::new(),
        }
    }

    /// Main simulation tick - HIGHLY OPTIMIZED
    /// 
    /// Target: <5ms for 10,000 units
    pub fn simulate_tick(&mut self, dt: f32, current_time: f64) -> TickResult {
        self.tick += 1;
        
        // 1. Update spatial grid - O(n)
        self.grid.clear();
        for (idx, unit) in self.units.iter().enumerate() {
            if unit.alive {
                self.grid.insert(idx, unit.pos_x, unit.pos_y, unit.pos_z);
            }
        }

        // 2. Target acquisition - O(k) per unit
        for idx in 0..self.units.len() {
            if !self.units[idx].alive {
                continue;
            }

            // Find target if don't have one
            if self.units[idx].target_id.is_none() {
                if let Some(enemy_idx) = find_best_target(&self.units[idx], &self.units, &self.grid) {
                    self.units[idx].target_id = Some(self.units[enemy_idx].id);
                }
            }
        }

        // 3. Movement - O(n) - FIXED borrowing
        for idx in 0..self.units.len() {
            if !self.units[idx].alive {
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

            // Get optimal range
            let optimal_range = if !self.units[idx].weapons.is_empty() {
                self.units[idx].weapons[0].optimal_range
            } else {
                0.0
            };

            // Now mutably update the unit
            let unit = &mut self.units[idx];
            
            if let Some((tx, ty, tz)) = target_pos {
                let dx = tx - unit.pos_x;
                let dy = ty - unit.pos_y;
                let dz = tz - unit.pos_z;
                let dist = (dx * dx + dy * dy + dz * dz).sqrt();

                if dist > optimal_range {
                    // Move towards target
                    unit.move_towards(tx, ty, tz);
                } else if dist < optimal_range * 0.8 {
                    // Back away
                    if dist > 0.0 {
                        let factor = unit.max_speed / dist;
                        unit.vel_x = dx * factor * -1.0;
                        unit.vel_y = dy * factor * -1.0;
                        unit.vel_z = dz * factor * -1.0;
                    }
                } else {
                    // At optimal range, stop
                    unit.stop();
                }
            }

            // Update position
            unit.update_position(dt);
        }

        // 4. Combat - O(n) weapons - FIXED borrowing
        self.damage_queue.clear();
        
        // Collect weapon fire data without holding borrows
        let mut weapon_fires: Vec<(usize, usize, f32, String)> = Vec::new(); // (attacker_idx, target_idx, damage, weapon_tag)
        
        for attacker_idx in 0..self.units.len() {
            if !self.units[attacker_idx].alive {
                continue;
            }

            let attacker_target_id = self.units[attacker_idx].target_id;
            if attacker_target_id.is_none() {
                continue;
            }

            let target_id = attacker_target_id.unwrap();
            
            // Find target index
            let target_idx_opt = self.units.iter().position(|u| u.id == target_id && u.alive);
            if target_idx_opt.is_none() {
                continue;
            }
            let target_idx = target_idx_opt.unwrap();

            // Check each weapon
            for weapon in &self.units[attacker_idx].weapons {
                let attacker = &self.units[attacker_idx];
                let target = &self.units[target_idx];
                
                if let Some(damage) = try_fire_weapon(attacker, target, weapon, current_time) {
                    weapon_fires.push((attacker_idx, target_idx, damage, weapon.tag.clone()));
                }
            }
        }

        // Now update weapon cooldowns and queue damage
        for (attacker_idx, target_idx, damage, weapon_tag) in weapon_fires {
            // Update weapon cooldown
            if let Some(weapon) = self.units[attacker_idx].weapons.iter_mut().find(|w| w.tag == weapon_tag) {
                weapon.last_fired = current_time;
            }
            
            // Queue damage
            self.damage_queue.push(DamageEntry {
                target_idx,
                damage,
                attacker_idx,
            });
        }

        // 5. Process damage queue - O(n) targets
        let mut damage_by_target: HashMap<usize, f32> = HashMap::new();
        for entry in &self.damage_queue {
            *damage_by_target.entry(entry.target_idx).or_insert(0.0) += entry.damage;
        }

        let mut destroyed = Vec::new();
        let mut damaged = Vec::new();

        for (&target_idx, &total_damage) in &damage_by_target {
            let unit = &mut self.units[target_idx];
            let was_alive = unit.alive;
            
            unit.take_damage(total_damage);

            if was_alive && !unit.alive {
                destroyed.push(unit.id);
            } else if total_damage > 0.0 {
                damaged.push(DamagedUnit {
                    id: unit.id,
                    hp: unit.hp,
                    shield: unit.shield,
                });
            }

            // Track attacker damage dealt
            for entry in &self.damage_queue {
                if entry.target_idx == target_idx {
                    self.units[entry.attacker_idx].damage_dealt += entry.damage;
                }
            }
        }

        // 6. Shield regen - O(n)
        for unit in self.units.iter_mut() {
            if unit.alive {
                unit.regen_shield(dt);
            }
        }

        // 7. Collect moved units
        let moved: Vec<MovedUnit> = self.units
            .iter()
            .filter(|u| u.alive && (u.vel_x.abs() > 0.1 || u.vel_y.abs() > 0.1 || u.vel_z.abs() > 0.1))
            .map(|u| MovedUnit {
                id: u.id,
                x: u.pos_x,
                y: u.pos_y,
                z: u.pos_z,
            })
            .collect();

        TickResult {
            moved,
            damaged,
            destroyed,
            tick: self.tick,
        }
    }

    /// Add unit mid-battle
    pub fn add_unit(&mut self, unit: BattleUnit) {
        self.units.push(unit);
    }

    /// Get active factions
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

    /// Check if battle ended
    pub fn is_battle_ended(&self) -> bool {
        self.get_active_factions().len() <= 1
    }

    /// Get battle results
    pub fn get_results(&self) -> Vec<BattleUnit> {
        self.units.clone()
    }
}
