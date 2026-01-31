// battle-core/src/battle_unit.rs
//
// ✅ UPDATES:
// 1. Added is_ship, is_station, has_weapons flags for targeting
// 2. Added unit_type string for special handling
// 3. Added sequence support to Weapon struct
// 4. Added view_range for detection

use serde::{Deserialize, Serialize};

/// Memory-optimized battle unit
/// 
/// Uses flat primitives for cache efficiency
/// ~250 bytes per unit in Rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BattleUnit {
    // Identity
    pub id: u32,
    pub faction_id: u32,
    pub player_id: Option<u32>,
    
    // Combat stats
    pub max_hp: f32,
    pub hp: f32,
    pub max_shield: f32,
    pub shield: f32,
    pub armor: f32,           // 0=None, 1=Light, 2=Medium, 3=Heavy, 4=Super
    pub shield_regen: f32,
    
    // Position (flat for cache efficiency)
    pub pos_x: f32,
    pub pos_y: f32,
    pub pos_z: f32,
    
    // Velocity (flat)
    pub vel_x: f32,
    pub vel_y: f32,
    pub vel_z: f32,
    pub max_speed: f32,
    
    // Weapons
    pub weapons: Vec<Weapon>,
    pub max_weapon_range: f32,
    
    // ✅ NEW: Unit type info for targeting priority
    #[serde(default)]
    pub unit_type: String,
    #[serde(default)]
    pub is_ship: bool,
    #[serde(default)]
    pub is_station: bool,
    #[serde(default)]
    pub has_weapons: bool,
    #[serde(default)]
    pub view_range: f32,
    
    // Combat state
    pub target_id: Option<u32>,
    pub alive: bool,
    
    // Stats tracking
    pub damage_dealt: f32,
    pub damage_taken: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Weapon {
    pub tag: String,
    
    // Damage
    pub dps: f32,              // Damage per second (already converted from per-minute)
    pub fire_rate: f32,        // Shots per second
    pub cooldown: f32,         // Seconds between shots
    
    // Range
    pub max_range: f32,
    pub optimal_range: f32,
    
    // Targeting
    pub target_armor_max: f32, // Max armor this weapon is effective against
    
    // ✅ NEW: Sequence firing
    #[serde(default)]
    pub sequence: Vec<bool>,   // Fire pattern (true = fire, false = pause)
    #[serde(default)]
    pub sequence_index: usize,
    
    // ✅ NEW: Projectile info
    #[serde(default)]
    pub projectile_speed: f32,
    
    // Timing
    pub last_fired: f64,
}

impl Default for Weapon {
    fn default() -> Self {
        Weapon {
            tag: String::new(),
            dps: 10.0,
            fire_rate: 1.0,
            cooldown: 1.0,
            max_range: 100.0,
            optimal_range: 50.0,
            target_armor_max: 0.0,
            sequence: Vec::new(),
            sequence_index: 0,
            projectile_speed: 100.0,
            last_fired: 0.0,
        }
    }
}

impl BattleUnit {
    /// Update position - SIMD optimized by compiler
    #[inline]
    pub fn update_position(&mut self, dt: f32) {
        self.pos_x += self.vel_x * dt;
        self.pos_y += self.vel_y * dt;
        self.pos_z += self.vel_z * dt;
    }

    /// Move towards target - vectorized math
    #[inline]
    pub fn move_towards(&mut self, target_x: f32, target_y: f32, target_z: f32) {
        let dx = target_x - self.pos_x;
        let dy = target_y - self.pos_y;
        let dz = target_z - self.pos_z;
        let dist = (dx * dx + dy * dy + dz * dz).sqrt();
        
        if dist > 0.0 {
            let factor = self.max_speed / dist;
            self.vel_x = dx * factor;
            self.vel_y = dy * factor;
            self.vel_z = dz * factor;
        }
    }

    /// Move away from target
    #[inline]
    pub fn move_away(&mut self, target_x: f32, target_y: f32, target_z: f32) {
        let dx = self.pos_x - target_x;
        let dy = self.pos_y - target_y;
        let dz = self.pos_z - target_z;
        let dist = (dx * dx + dy * dy + dz * dz).sqrt();
        
        if dist > 0.0 {
            let factor = self.max_speed / dist;
            self.vel_x = dx * factor;
            self.vel_y = dy * factor;
            self.vel_z = dz * factor;
        }
    }

    /// Stop movement
    #[inline]
    pub fn stop(&mut self) {
        self.vel_x = 0.0;
        self.vel_y = 0.0;
        self.vel_z = 0.0;
    }

    /// Regenerate shields
    #[inline]
    pub fn regen_shield(&mut self, dt: f32) {
        if self.shield < self.max_shield && self.shield_regen > 0.0 {
            self.shield = (self.shield + self.shield_regen * dt).min(self.max_shield);
        }
    }

    /// Take damage - optimized for batch processing
    /// 
    /// Damage flows: Shield -> Hull (with armor reduction)
    #[inline]
    pub fn take_damage(&mut self, damage: f32) {
        self.damage_taken += damage;
        
        // Shields absorb damage first
        if self.shield > 0.0 {
            if damage <= self.shield {
                self.shield -= damage;
                return;
            } else {
                let remaining = damage - self.shield;
                self.shield = 0.0;
                
                // Apply remaining to hull with armor reduction
                // Armor reduces hull damage by 0.5 per point
                let armor_reduction = self.armor * 0.5;
                let actual_damage = (remaining - armor_reduction).max(1.0);
                self.hp -= actual_damage;
            }
        } else {
            // Direct hull damage with armor reduction
            let armor_reduction = self.armor * 0.5;
            let actual_damage = (damage - armor_reduction).max(1.0);
            self.hp -= actual_damage;
        }
        
        if self.hp <= 0.0 {
            self.hp = 0.0;
            self.alive = false;
        }
    }

    /// Calculate distance squared (faster - no sqrt)
    #[inline]
    pub fn distance_sq(&self, other: &BattleUnit) -> f32 {
        let dx = self.pos_x - other.pos_x;
        let dy = self.pos_y - other.pos_y;
        let dz = self.pos_z - other.pos_z;
        dx * dx + dy * dy + dz * dz
    }

    /// Calculate distance
    #[inline]
    pub fn distance(&self, other: &BattleUnit) -> f32 {
        self.distance_sq(other).sqrt()
    }

    /// Check if this unit can attack (has weapons)
    #[inline]
    pub fn can_attack(&self) -> bool {
        self.has_weapons && !self.weapons.is_empty()
    }

    /// Check if this unit is a valid combat target
    #[inline]
    pub fn is_valid_target(&self) -> bool {
        self.alive
    }

    /// Normalize unit data after deserialization
    /// Computes derived fields if they weren't sent by the game server
    pub fn normalize(&mut self) {
        // Compute has_weapons from weapons array if not set
        if !self.has_weapons && !self.weapons.is_empty() {
            self.has_weapons = true;
        }

        // Compute max_weapon_range from weapons if not set
        if self.max_weapon_range <= 0.0 && !self.weapons.is_empty() {
            self.max_weapon_range = self.weapons.iter()
                .map(|w| w.max_range)
                .fold(0.0f32, |a, b| a.max(b));
        }

        // Infer is_ship/is_station from unit_type if neither is set
        if !self.is_ship && !self.is_station {
            let unit_type_lower = self.unit_type.to_lowercase();
            if unit_type_lower.contains("station") || unit_type_lower.contains("outpost") || unit_type_lower.contains("platform") {
                self.is_station = true;
            } else {
                // Default to ship for any non-station unit
                self.is_ship = true;
            }
        }
    }
}

impl Default for BattleUnit {
    fn default() -> Self {
        BattleUnit {
            id: 0,
            faction_id: 0,
            player_id: None,
            max_hp: 100.0,
            hp: 100.0,
            max_shield: 0.0,
            shield: 0.0,
            armor: 0.0,
            shield_regen: 0.0,
            pos_x: 0.0,
            pos_y: 0.0,
            pos_z: 0.0,
            vel_x: 0.0,
            vel_y: 0.0,
            vel_z: 0.0,
            max_speed: 10.0,
            weapons: Vec::new(),
            max_weapon_range: 0.0,
            unit_type: String::new(),
            is_ship: false,
            is_station: false,
            has_weapons: false,
            view_range: 100.0,
            target_id: None,
            alive: true,
            damage_dealt: 0.0,
            damage_taken: 0.0,
        }
    }
}