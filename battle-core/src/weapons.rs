// battle-core/src/weapons.rs
//
// ✅ FIXES APPLIED:
// 1. Proper armor effectiveness matrix (not just binary 50%)
// 2. Added weapon category support for special targeting
// 3. Improved logging for debugging

use crate::battle_unit::{BattleUnit, Weapon};
use crate::log;

/// Calculate armor effectiveness multiplier
/// 
/// Armor Types: None=0, Light=1, Medium=2, Heavy=3, Super=4
/// 
/// Damage reduction based on (target_armor - weapon.target_armor_max):
/// - 0 or less: 100% damage (weapon can penetrate)
/// - 1: 50% damage
/// - 2: 25% damage  
/// - 3+: 10% damage (heavily armored target)
#[inline]
fn calculate_armor_effectiveness(target_armor: f32, weapon_armor_max: f32) -> f32 {
    let armor_diff = (target_armor - weapon_armor_max) as i32;
    
    match armor_diff {
        d if d <= 0 => 1.0,   // Full damage - weapon can handle this armor
        1 => 0.5,             // Half damage - one tier above
        2 => 0.25,            // Quarter damage - two tiers above
        _ => 0.1,             // Minimal damage - heavily outmatched
    }
}

/// Calculate range falloff multiplier
/// 
/// At optimal range: 100% damage
/// At max range: 10% damage (minimum)
/// Linear falloff between optimal and max
#[inline]
fn calculate_range_falloff(distance: f32, optimal_range: f32, max_range: f32) -> f32 {
    if distance <= optimal_range {
        1.0
    } else if distance >= max_range {
        0.1
    } else {
        let falloff_range = max_range - optimal_range;
        let distance_past_optimal = distance - optimal_range;
        let falloff = 1.0 - (distance_past_optimal / falloff_range) * 0.9;
        falloff.max(0.1)
    }
}

/// Check if weapon is a point defense (Anti-Missile) weapon
#[inline]
pub fn is_point_defense(weapon: &Weapon) -> bool {
    weapon.tag.starts_with("AM") || 
    weapon.tag.to_lowercase().contains("anti-missile")
}

/// Check if weapon is a siege weapon (Nukes)
#[inline]
pub fn is_siege_weapon(weapon: &Weapon) -> bool {
    weapon.tag.starts_with("NM") || 
    weapon.tag.to_lowercase().contains("nuke")
}

/// Check if weapon fires projectiles that can be intercepted
#[inline]
pub fn is_interceptable(weapon: &Weapon) -> bool {
    // Missiles and torpedoes can be intercepted
    // Lasers, beams, and kinetics cannot
    let tag_lower = weapon.tag.to_lowercase();
    tag_lower.contains("missile") || 
    tag_lower.contains("rocket") || 
    tag_lower.contains("torpedo") ||
    tag_lower.starts_with("nm") ||  // Nukes
    tag_lower.starts_with("hm") ||  // Heavy Missiles
    tag_lower.starts_with("sm") ||  // Small Missiles
    tag_lower.starts_with("cr") ||  // Concussion Rockets
    tag_lower.starts_with("pr")     // Proton Rockets
}

/// Check if weapon can fire this tick based on sequence
#[inline]
pub fn can_fire_sequence(weapon: &Weapon, tick: u64) -> bool {
    if weapon.sequence.is_empty() {
        return true;  // No sequence = always fire (use cooldown only)
    }
    let idx = (tick as usize) % weapon.sequence.len();
    weapon.sequence[idx]
}

/// Check if weapon can fire and calculate damage
/// 
/// Returns Some(damage) if weapon fires, None if on cooldown or out of range
pub fn try_fire_weapon(
    attacker: &BattleUnit,
    target: &BattleUnit,
    weapon: &Weapon,
    current_time: f64,
    current_tick: u64,
) -> Option<f32> {
    // Check sequence first (cheap check)
    if !can_fire_sequence(weapon, current_tick) {
        return None;
    }

    // Check cooldown
    let time_since_fired = current_time - weapon.last_fired;
    if time_since_fired < weapon.cooldown as f64 {
        // DEBUG: Log cooldown block (only occasionally to avoid spam)
        if attacker.id % 100 == 0 && current_tick % 20 == 0 {
            log(&format!(
                "[Weapon] Unit {} {} on cooldown: {:.2}s remaining",
                attacker.id, weapon.tag, weapon.cooldown as f64 - time_since_fired
            ));
        }
        return None;
    }

    // Calculate distance
    let dist = attacker.distance(target);

    // Check range
    if dist > weapon.max_range {
        if attacker.id % 100 == 0 && current_tick % 20 == 0 {
            log(&format!(
                "[Weapon] Unit {} {} out of range: dist={:.1} > max={:.1}",
                attacker.id, weapon.tag, dist, weapon.max_range
            ));
        }
        return None;
    }

    // ✅ Special: Siege weapons (Nukes) should only target stations
    if is_siege_weapon(weapon) && !target.is_station {
        if attacker.id % 100 == 0 && current_tick % 20 == 0 {
            log(&format!(
                "[Weapon] Unit {} {} is siege weapon, skipping non-station target {}",
                attacker.id, weapon.tag, target.id
            ));
        }
        return None;  // Don't fire nukes at ships
    }

    // ✅ Special: Point defense weapons should only target incoming missiles (handled elsewhere)
    if is_point_defense(weapon) {
        return None;  // AM weapons handled in missile interception phase
    }

    // Calculate base damage per shot
    // DPS is already per-second from battle-data.service.js
    // Damage per shot = DPS / fire_rate (shots per second)
    let damage_per_shot = if weapon.fire_rate > 0.0 {
        weapon.dps / weapon.fire_rate
    } else {
        weapon.dps  // Fallback
    };

    let mut damage = damage_per_shot;

    // ✅ Apply range falloff
    let range_mult = calculate_range_falloff(dist, weapon.optimal_range, weapon.max_range);
    if range_mult < 1.0 {
        let old_damage = damage;
        damage *= range_mult;
        log(&format!(
            "[Weapon] Unit {} {} range falloff: dist={:.1} optimal={:.1} max={:.1} mult={:.2} dmg {:.1}->{:.1}",
            attacker.id, weapon.tag, dist, weapon.optimal_range, weapon.max_range, range_mult, old_damage, damage
        ));
    }

    // ✅ Apply armor effectiveness
    let armor_mult = calculate_armor_effectiveness(target.armor, weapon.target_armor_max);
    if armor_mult < 1.0 {
        let old_damage = damage;
        damage *= armor_mult;
        log(&format!(
            "[Weapon] Unit {} {} armor penalty: target_armor={} weapon_max={} mult={:.2} dmg {:.1}->{:.1}",
            attacker.id, weapon.tag, target.armor as i32, weapon.target_armor_max as i32, armor_mult, old_damage, damage
        ));
    }

    // Ensure minimum damage of 1
    damage = damage.max(1.0);

    log(&format!(
        "[Weapon] Unit {} -> {} : {} dmg={:.1} (base={:.1} range_mult={:.2} armor_mult={:.2})",
        attacker.id, target.id, weapon.tag, damage, damage_per_shot, range_mult, armor_mult
    ));

    Some(damage)
}

/// Try to intercept an incoming missile with point defense
/// Returns true if missile was intercepted
pub fn try_intercept_missile(
    defender: &BattleUnit,
    weapon: &Weapon,
    missile_pos_x: f32,
    missile_pos_y: f32,
    missile_pos_z: f32,
    current_time: f64,
) -> bool {
    if !is_point_defense(weapon) {
        return false;
    }

    // Check cooldown
    let time_since_fired = current_time - weapon.last_fired;
    if time_since_fired < weapon.cooldown as f64 {
        return false;
    }

    // Check range to missile
    let dx = missile_pos_x - defender.pos_x;
    let dy = missile_pos_y - defender.pos_y;
    let dz = missile_pos_z - defender.pos_z;
    let dist = (dx * dx + dy * dy + dz * dz).sqrt();

    if dist > weapon.max_range {
        return false;
    }

    // Successfully intercepted!
    log(&format!(
        "[AM] Unit {} intercepted missile at dist={:.1}",
        defender.id, dist
    ));

    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_armor_effectiveness() {
        // Weapon can handle armor
        assert_eq!(calculate_armor_effectiveness(1.0, 2.0), 1.0);
        assert_eq!(calculate_armor_effectiveness(2.0, 2.0), 1.0);
        
        // One tier above
        assert_eq!(calculate_armor_effectiveness(3.0, 2.0), 0.5);
        
        // Two tiers above
        assert_eq!(calculate_armor_effectiveness(4.0, 2.0), 0.25);
        
        // Three+ tiers above
        assert_eq!(calculate_armor_effectiveness(5.0, 2.0), 0.1);
    }

    #[test]
    fn test_range_falloff() {
        // At optimal range
        assert_eq!(calculate_range_falloff(50.0, 50.0, 100.0), 1.0);
        
        // Halfway between optimal and max
        assert!((calculate_range_falloff(75.0, 50.0, 100.0) - 0.55).abs() < 0.01);
        
        // At max range
        assert_eq!(calculate_range_falloff(100.0, 50.0, 100.0), 0.1);
        
        // Beyond max range
        assert_eq!(calculate_range_falloff(150.0, 50.0, 100.0), 0.1);
    }
}