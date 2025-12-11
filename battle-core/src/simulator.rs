use crate::spatial_grid::SpatialGrid;
use crate::battle_unit::BattleUnit;
use crate::targeting::find_best_target;
use crate::weapons::try_fire_weapon;
use crate::movement::update_movement;
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

        // 3. Movement - O(n)
        for idx in 0..self.units.len() {
            if !self.units[idx].alive {
                continue;
            }

            let target = if let Some(target_id) = self.units[idx].target_id {
                self.units.iter().find(|u| u.id == target_id && u.alive)
            } else {
                None
            };

            update_movement(&mut self.units[idx], target, dt);
        }

        // 4. Combat - O(n) weapons
        self.damage_queue.clear();
        
        for attacker_idx in 0..self.units.len() {
            let attacker = &self.units[attacker_idx];
            if !attacker.alive {
                continue;
            }

            if let Some(target_id) = attacker.target_id {
                if let Some(target_idx) = self.units.iter().position(|u| u.id == target_id && u.alive) {
                    let target = &self.units[target_idx];

                    // Try to fire weapons
                    for weapon in &attacker.weapons {
                        if let Some(damage) = try_fire_weapon(attacker, target, weapon, current_time) {
                            self.damage_queue.push(DamageEntry {
                                target_idx,
                                damage,
                                attacker_idx,
                            });

                            // Update weapon cooldown (mutable access)
                            unsafe {
                                let attacker_mut = &mut *(self.units.as_mut_ptr().add(attacker_idx));
                                if let Some(weapon_mut) = attacker_mut.weapons.iter_mut().find(|w| w.tag == weapon.tag) {
                                    weapon_mut.last_fired = current_time;
                                }
                            }
                        }
                    }
                }
            }
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
