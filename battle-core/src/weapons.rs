use crate::battle_unit::{BattleUnit, Weapon};

/// Check if weapon can fire and calculate damage
pub fn try_fire_weapon(
    attacker: &BattleUnit,
    target: &BattleUnit,
    weapon: &Weapon,
    current_time: f64,
) -> Option<f32> {
    // Check cooldown
    if current_time - weapon.last_fired < weapon.cooldown as f64 {
        return None;
    }

    // Calculate distance
    let dist = attacker.distance(target);

    // Check range
    if dist > weapon.max_range {
        return None;
    }

    // Calculate base damage
    let mut damage = weapon.dps / weapon.fire_rate;

    // Range falloff
    if dist > weapon.optimal_range {
        let falloff = 1.0 - ((dist - weapon.optimal_range) / (weapon.max_range - weapon.optimal_range));
        damage *= falloff.max(0.1);
    }

    // Armor penalty
    if target.armor > weapon.target_armor_max {
        damage *= 0.5;
    }

    Some(damage)
}
