// battle-core/src/targeting.rs
//
// ✅ UPDATES:
// 1. Ships prioritize attacking other ships first, then stations
// 2. Stations only target ships (defensive)
// 3. Support for siege weapons (nukes) that only target stations
// 4. Unarmed ships/stations are lower priority targets

use crate::battle_unit::BattleUnit;
use crate::spatial_grid::SpatialGrid;
use crate::log;

/// Target priority scores
/// Higher = more priority
const PRIORITY_ARMED_SHIP: i32 = 100;
const PRIORITY_UNARMED_SHIP: i32 = 50;
const PRIORITY_ARMED_STATION: i32 = 30;
const PRIORITY_UNARMED_STATION: i32 = 10;

/// Calculate target priority score
/// 
/// Ships should target:
/// 1. Armed hostile ships (highest threat)
/// 2. Unarmed hostile ships (support/logistics)
/// 3. Armed hostile stations (defensive)
/// 4. Unarmed hostile stations (lowest)
/// 
/// Stations should target:
/// 1. Armed hostile ships only (defensive)
#[inline]
fn calculate_target_priority(attacker: &BattleUnit, target: &BattleUnit) -> i32 {
    // Stations can only target ships
    if attacker.is_station {
        if target.is_ship && target.has_weapons {
            return PRIORITY_ARMED_SHIP;
        } else if target.is_ship {
            return PRIORITY_UNARMED_SHIP;
        }
        return 0; // Stations don't target other stations
    }

    // Ships target priority
    if target.is_ship {
        if target.has_weapons {
            PRIORITY_ARMED_SHIP
        } else {
            PRIORITY_UNARMED_SHIP
        }
    } else if target.is_station {
        if target.has_weapons {
            PRIORITY_ARMED_STATION
        } else {
            PRIORITY_UNARMED_STATION
        }
    } else {
        // Unknown type, low priority
        1
    }
}

/// Find best target for a unit
/// 
/// Uses spatial grid for O(k) lookup instead of O(n)
/// Applies priority scoring for ship-vs-station targeting
pub fn find_best_target(
    unit: &BattleUnit,
    all_units: &[BattleUnit],
    grid: &SpatialGrid,
) -> Option<usize> {
    if !unit.alive || !unit.can_attack() {
        return None;
    }

    // Get nearby units using spatial grid
    let search_range = unit.max_weapon_range.max(unit.view_range);
    let nearby_indices = grid.get_nearby(
        unit.pos_x,
        unit.pos_y,
        unit.pos_z,
        search_range,
    );

    let mut best_target_idx: Option<usize> = None;
    let mut best_priority: i32 = 0;
    let mut best_dist_sq: f32 = f32::MAX;

    for &idx in &nearby_indices {
        if idx >= all_units.len() {
            continue;
        }

        let other = &all_units[idx];
        
        // Skip self, dead units, same faction
        if other.id == unit.id || !other.alive || other.faction_id == unit.faction_id {
            continue;
        }

        // Calculate priority
        let priority = calculate_target_priority(unit, other);
        if priority == 0 {
            continue; // Not a valid target for this attacker type
        }

        let dist_sq = unit.distance_sq(other);

        // Check if this is a better target
        // Prefer: Higher priority, then closer distance
        if priority > best_priority || (priority == best_priority && dist_sq < best_dist_sq) {
            best_priority = priority;
            best_dist_sq = dist_sq;
            best_target_idx = Some(idx);
        }
    }

    // Debug log
    if best_target_idx.is_some() && unit.id % 100 == 0 {
        let target = &all_units[best_target_idx.unwrap()];
        log(&format!(
            "[Targeting] Unit {} (ship={}) -> Unit {} (ship={}, station={}) priority={} dist={:.1}",
            unit.id, unit.is_ship, target.id, target.is_ship, target.is_station, 
            best_priority, best_dist_sq.sqrt()
        ));
    }

    best_target_idx
}

/// Find best station target for siege weapons (nukes)
/// 
/// Only returns stations, ignores ships entirely
pub fn find_siege_target(
    unit: &BattleUnit,
    all_units: &[BattleUnit],
    grid: &SpatialGrid,
    siege_range: f32,
) -> Option<usize> {
    if !unit.alive {
        return None;
    }

    let nearby_indices = grid.get_nearby(
        unit.pos_x,
        unit.pos_y,
        unit.pos_z,
        siege_range,
    );

    let mut nearest_station_idx: Option<usize> = None;
    let mut nearest_dist_sq = f32::MAX;

    for &idx in &nearby_indices {
        if idx >= all_units.len() {
            continue;
        }

        let other = &all_units[idx];
        
        // Skip self, dead, same faction, and non-stations
        if other.id == unit.id || !other.alive || other.faction_id == unit.faction_id {
            continue;
        }

        // ✅ Only target stations
        if !other.is_station {
            continue;
        }

        let dist_sq = unit.distance_sq(other);
        if dist_sq < nearest_dist_sq {
            nearest_dist_sq = dist_sq;
            nearest_station_idx = Some(idx);
        }
    }

    nearest_station_idx
}

/// Find targets in range for all AM (Anti-Missile) weapons
/// Returns list of (defender_idx, target info) for interception
/// 
/// Note: This is called during the missile interception phase
pub fn find_am_targets(
    all_units: &[BattleUnit],
    grid: &SpatialGrid,
) -> Vec<(usize, usize)> {
    let mut am_pairs = Vec::new();

    for (idx, unit) in all_units.iter().enumerate() {
        if !unit.alive {
            continue;
        }

        // Check if unit has AM weapons
        let has_am = unit.weapons.iter().any(|w| {
            w.tag.starts_with("AM") || w.tag.to_lowercase().contains("anti-missile")
        });

        if !has_am {
            continue;
        }

        // Find nearby enemies that might have incoming missiles
        let nearby = grid.get_nearby(unit.pos_x, unit.pos_y, unit.pos_z, unit.max_weapon_range);
        
        for &enemy_idx in &nearby {
            if enemy_idx >= all_units.len() {
                continue;
            }
            let enemy = &all_units[enemy_idx];
            if enemy.faction_id != unit.faction_id && enemy.alive {
                am_pairs.push((idx, enemy_idx));
            }
        }
    }

    am_pairs
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_unit(id: u32, faction: u32, is_ship: bool, is_station: bool, has_weapons: bool) -> BattleUnit {
        BattleUnit {
            id,
            faction_id: faction,
            is_ship,
            is_station,
            has_weapons,
            alive: true,
            pos_x: 0.0,
            pos_y: 0.0,
            pos_z: 0.0,
            max_weapon_range: 100.0,
            view_range: 150.0,
            ..Default::default()
        }
    }

    #[test]
    fn test_target_priority_ship_vs_ship() {
        let attacker = make_unit(1, 1, true, false, true);
        
        let armed_ship = make_unit(2, 2, true, false, true);
        let unarmed_ship = make_unit(3, 2, true, false, false);
        let armed_station = make_unit(4, 2, false, true, true);
        let unarmed_station = make_unit(5, 2, false, true, false);

        assert_eq!(calculate_target_priority(&attacker, &armed_ship), PRIORITY_ARMED_SHIP);
        assert_eq!(calculate_target_priority(&attacker, &unarmed_ship), PRIORITY_UNARMED_SHIP);
        assert_eq!(calculate_target_priority(&attacker, &armed_station), PRIORITY_ARMED_STATION);
        assert_eq!(calculate_target_priority(&attacker, &unarmed_station), PRIORITY_UNARMED_STATION);
    }

    #[test]
    fn test_target_priority_station_defensive() {
        let attacker = make_unit(1, 1, false, true, true);
        
        let armed_ship = make_unit(2, 2, true, false, true);
        let enemy_station = make_unit(3, 2, false, true, true);

        // Stations should target ships
        assert_eq!(calculate_target_priority(&attacker, &armed_ship), PRIORITY_ARMED_SHIP);
        
        // Stations should NOT target other stations
        assert_eq!(calculate_target_priority(&attacker, &enemy_station), 0);
    }
}