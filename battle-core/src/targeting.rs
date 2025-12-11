use crate::battle_unit::BattleUnit;
use crate::spatial_grid::SpatialGrid;

/// Find nearest enemy for a unit
pub fn find_best_target(
    unit: &BattleUnit,
    all_units: &[BattleUnit],
    grid: &SpatialGrid,
) -> Option<usize> {
    if !unit.alive {
        return None;
    }

    // Get nearby units using spatial grid
    let nearby_indices = grid.get_nearby(
        unit.pos_x,
        unit.pos_y,
        unit.pos_z,
        unit.max_weapon_range,
    );

    let mut nearest_enemy_idx: Option<usize> = None;
    let mut nearest_dist_sq = f32::MAX;

    for &idx in &nearby_indices {
        if idx >= all_units.len() {
            continue;
        }

        let other = &all_units[idx];
        
        // Skip self, dead units, same faction
        if other.id == unit.id || !other.alive || other.faction_id == unit.faction_id {
            continue;
        }

        let dist_sq = unit.distance_sq(other);
        if dist_sq < nearest_dist_sq {
            nearest_dist_sq = dist_sq;
            nearest_enemy_idx = Some(idx);
        }
    }

    nearest_enemy_idx
}
