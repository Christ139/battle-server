use crate::battle_unit::BattleUnit;

/// Update unit movement based on target
pub fn update_movement(
    unit: &mut BattleUnit,
    target: Option<&BattleUnit>,
    dt: f32,
) {
    if !unit.alive {
        return;
    }

    if let Some(target) = target {
        let dist = unit.distance(target);
        let optimal_range = if !unit.weapons.is_empty() {
            unit.weapons[0].optimal_range
        } else {
            0.0
        };

        if dist > optimal_range {
            // Move towards target
            unit.move_towards(target.pos_x, target.pos_y, target.pos_z);
        } else if dist < optimal_range * 0.8 {
            // Back away (reverse direction)
            let dx = unit.pos_x - target.pos_x;
            let dy = unit.pos_y - target.pos_y;
            let dz = unit.pos_z - target.pos_z;
            let dist = (dx * dx + dy * dy + dz * dz).sqrt();
            if dist > 0.0 {
                let factor = unit.max_speed / dist;
                unit.vel_x = dx * factor;
                unit.vel_y = dy * factor;
                unit.vel_z = dz * factor;
            }
        } else {
            // At optimal range, stop
            unit.stop();
        }
    }

    // Update position
    unit.update_position(dt);
}
