use crate::battle_unit::{BattleUnit, Weapon};
use crate::log;

/// Check if weapon can fire and calculate damage
pub fn try_fire_weapon(
    attacker: &BattleUnit,
    target: &BattleUnit,
    weapon: &Weapon,
    current_time: f64,
) -> Option<f32> {
    // Check cooldown
    let time_since_fired = current_time - weapon.last_fired;
    if time_since_fired < weapon.cooldown as f64 {
        // DEBUG: Log cooldown block (only occasionally to avoid spam)
        if attacker.id % 100 == 0 {
            log(&format!(
                "[Weapon] Unit {} weapon {} on cooldown: {:.2}s remaining (last_fired={:.2}, cooldown={:.2}, current={:.2})",
                attacker.id, weapon.tag, weapon.cooldown as f64 - time_since_fired,
                weapon.last_fired, weapon.cooldown, current_time
            ));
        }
        return None;
    }

    // Calculate distance
    let dist = attacker.distance(target);

    // Check range
    if dist > weapon.max_range {
        // DEBUG: Log range block
        if attacker.id % 100 == 0 {
            log(&format!(
                "[Weapon] Unit {} weapon {} out of range: dist={:.1} > max_range={:.1}",
                attacker.id, weapon.tag, dist, weapon.max_range
            ));
        }
        return None;
    }

    // Calculate base damage
    let mut damage = weapon.dps / weapon.fire_rate;

    // DEBUG: Log base damage calculation
    log(&format!(
        "[Weapon] Unit {} -> Unit {}: {} base_dmg={:.1} (dps={:.1} / fire_rate={:.1})",
        attacker.id, target.id, weapon.tag, damage, weapon.dps, weapon.fire_rate
    ));

    // Range falloff
    if dist > weapon.optimal_range {
        let falloff = 1.0 - ((dist - weapon.optimal_range) / (weapon.max_range - weapon.optimal_range));
        let old_damage = damage;
        damage *= falloff.max(0.1);
        log(&format!(
            "[Weapon]   Range falloff: dist={:.1} > optimal={:.1}, falloff={:.2}, dmg {:.1} -> {:.1}",
            dist, weapon.optimal_range, falloff, old_damage, damage
        ));
    }

    // Armor penalty
    if target.armor > weapon.target_armor_max {
        let old_damage = damage;
        damage *= 0.5;
        log(&format!(
            "[Weapon]   Armor penalty: target_armor={:.1} > max={:.1}, dmg {:.1} -> {:.1}",
            target.armor, weapon.target_armor_max, old_damage, damage
        ));
    }

    log(&format!(
        "[Weapon]   FINAL DAMAGE: {:.1}",
        damage
    ));

    Some(damage)
}
