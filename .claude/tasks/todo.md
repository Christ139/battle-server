# Battle Server Bug Investigation: Units Stop Firing & No Station Targeting

## Problem Summary
1. **Units stop firing but are targeting and find enemies** - Units acquire targets but weapons don't fire
2. **No targeting or firing at stations** - Stations are not being targeted by ships

## Root Cause Analysis (Phase 1 Complete)

### Confirmed Bugs

**Bug #1: `is_station` defaults to `false`**
- Location: `battle_unit.rs:258`
- Impact: Stations not recognized as stations
- Result: Siege weapons won't fire (check at `weapons.rs:134`), wrong targeting priority

**Bug #2: `has_weapons` defaults to `false`**
- Location: `battle_unit.rs:258`
- Impact: Units skip targeting (`simulator.rs:548`) and combat (`simulator.rs:602`) phases
- Result: Units with weapons never target or fire

**Bug #3: `max_weapon_range` defaults to `0.0`**
- Location: `battle_unit.rs:254`
- Impact: `is_target_valid()` returns false when `max_range <= 0.0` (`simulator.rs:419-421`)
- Result: All targets immediately invalidated

**Bug #4: Spatial grid ignores range parameter**
- Location: `spatial_grid.rs:42` - `_range` unused
- Impact: Only searches ~300 unit radius
- Mitigation: Fallback exists but incomplete

## Fix Plan

### Task 1: Add unit normalization in Rust
- [x] Add `normalize()` method to BattleUnit that:
  - Computes `has_weapons` from `!weapons.is_empty()`
  - Computes `max_weapon_range` from max of all weapon.max_range values
  - Infers `is_ship`/`is_station` from `unit_type` string if not set

### Task 2: Call normalize in BattleSimulator::new()
- [x] After deserializing units, call normalize() on each
- [x] Log normalized values for debugging
- [x] Also normalize units added via add_unit() (reinforcements)

### Task 3: Fix spatial grid range
- [x] Make get_nearby() use range parameter for dynamic cell count

### Task 4: Build and verify
- [x] Compile WASM with `wasm-pack build --target nodejs --release`

### Task 5: Fix synchronized weapon firing (all ships fire at once)
- [x] Root cause: All weapons have `last_fired = 0.0` from deserialization
- [x] Fix: Randomize `last_fired` to a random point in the past (within cooldown period)
- [x] Added `getrandom` crate with `js` feature for WASM-compatible random numbers
- [x] Added debug logging in normalize() to show randomization
- [ ] **PENDING VERIFICATION**: User needs to restart server and confirm staggered firing

---

## Review Section

### Changes Made

**1. battle_unit.rs - Added normalize() method (lines 233-258)**
```rust
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
            self.is_ship = true;
        }
    }
}
```

**2. simulator.rs - Call normalize() on all units**
- In `BattleSimulator::new()`: Normalize all units after deserialization
- In `add_unit()`: Normalize reinforcement units
- Enhanced logging to show max_range

**3. spatial_grid.rs - Fixed get_nearby() to use range parameter**
- Calculate cells_needed dynamically based on range and cell size
- Expands search area for long-range weapons

### Build Result
✅ WASM compiled successfully with `wasm-pack build --target nodejs --release`

---

## Additional Fix: Synchronized Weapon Firing

### Problem
All ships were firing weapons at exactly the same time, creating unrealistic synchronized volleys.

### Root Cause
When units are deserialized from JSON, `weapon.last_fired = 0.0` for all weapons. Since all weapons share this initial value, they all become "ready" at the same game time and fire together.

### Solution
In `normalize()`, randomize `last_fired` for each weapon to a random point in the past:

```rust
// battle_unit.rs normalize() - Randomize weapon cooldowns
for (i, weapon) in self.weapons.iter_mut().enumerate() {
    if weapon.last_fired == 0.0 && weapon.cooldown > 0.0 {
        let mut buf = [0u8; 4];
        if getrandom(&mut buf).is_ok() {
            let random_frac = (u32::from_le_bytes(buf) as f64) / (u32::MAX as f64);
            // Set last_fired to random point in past within cooldown period
            weapon.last_fired = current_time - (random_frac * weapon.cooldown as f64);
        }
    }
}
```

This means each weapon has a different "time until ready", staggering when they fire.

### Dependencies Added
- `getrandom = { version = "0.2", features = ["js"] }` - WASM-compatible random number generation

### Verification
Look for logs like:
```
[Normalize] Unit 12345 weapon 0 (HM D.100): cooldown=15.0s, random=0.43, last_fired=1706565426.55
```
