use serde::{Deserialize, Serialize};

/// Memory-optimized battle unit
/// 
/// Uses flat primitives for cache efficiency
/// ~200 bytes per unit in Rust (vs 250 bytes in JS)
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
    pub armor: f32,
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
    pub dps: f32,
    pub fire_rate: f32,
    pub max_range: f32,
    pub optimal_range: f32,
    pub target_armor_max: f32,
    pub cooldown: f32,
    pub last_fired: f64,
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
    #[inline]
    pub fn take_damage(&mut self, damage: f32) {
        self.damage_taken += damage;
        
        // Shields first
        if self.shield > 0.0 {
            if damage <= self.shield {
                self.shield -= damage;
                return;
            } else {
                let remaining = damage - self.shield;
                self.shield = 0.0;
                
                // Apply remaining to hull
                let armor_reduction = self.armor * 0.5;
                let actual_damage = (remaining - armor_reduction).max(1.0);
                self.hp -= actual_damage;
            }
        } else {
            // Direct hull damage
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
}
