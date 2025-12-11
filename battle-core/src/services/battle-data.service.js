/**
 * Battle Data Service
 * 
 * Fetches units from database with weapons for battle simulation.
 * Uses EXACT column names from verified schema.
 */

/**
 * Fetch battle units for a specific system
 * 
 * @param {number} systemId - Solar system ID
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Promise<Array>} Array of units formatted for Rust WASM
 */
async function fetchBattleUnitsData(systemId, pool) {
  try {
    // Query units in this system with their templates
    const unitsQuery = `
      SELECT 
        u."UnitID",
        u."TemplateID",
        u."PlayerID",
        u."CurrentHealth",
        u."CurrentShield",
        u."PosX",
        u."PosY",
        u."PosZ",
        u."IsNPC",
        u."NPCFactionID",
        t."Name",
        t."BaseHealth",
        t."BaseShield",
        t."Speed",
        t."Size"
      FROM "Units" u
      JOIN "UnitTemplates" t ON u."TemplateID" = t."TemplateID"
      WHERE u."LocationType" = 'space'
        AND u."LocationID" = $1
        AND u."CurrentHealth" > 0
    `;

    const unitsResult = await pool.query(unitsQuery, [systemId]);

    if (unitsResult.rows.length === 0) {
      return [];
    }

    // Get all template IDs
    const templateIds = [...new Set(unitsResult.rows.map(u => u.TemplateID))];

    // Query weapons for these templates
    const weaponsQuery = `
      SELECT 
        ums.unit_template_id,
        ums.weapon_tag,
        ums.quantity,
        wm.firepower_ps_min,
        wm.rate_of_fire_hits_min,
        wm.max_range,
        wm.optimal_range,
        wm.target_armor_max
      FROM "UnitModuleSlots" ums
      JOIN weapon_modules wm ON ums.weapon_tag = wm.weapon_tag
      WHERE ums.unit_template_id = ANY($1::int[])
    `;

    const weaponsResult = await pool.query(weaponsQuery, [templateIds]);

    // Group weapons by template ID
    const weaponsByTemplate = {};
    for (const row of weaponsResult.rows) {
      const templateId = row.unit_template_id;
      if (!weaponsByTemplate[templateId]) {
        weaponsByTemplate[templateId] = [];
      }

      // Add weapons based on quantity
      for (let i = 0; i < row.quantity; i++) {
        weaponsByTemplate[templateId].push({
          tag: row.weapon_tag,
          dps: row.firepower_ps_min || 10,
          fire_rate: (row.rate_of_fire_hits_min || 60) / 60, // Convert hits/min to hits/sec
          max_range: row.max_range || 1000,
          optimal_range: row.optimal_range || 500,
          target_armor_max: row.target_armor_max || 0,
          cooldown: 60 / (row.rate_of_fire_hits_min || 60), // Convert to seconds between shots
          last_fired: 0
        });
      }
    }

    // Format units for Rust WASM
    const battleUnits = unitsResult.rows.map(unit => {
      // Determine faction ID
      const factionId = unit.IsNPC && unit.NPCFactionID 
        ? unit.NPCFactionID 
        : unit.PlayerID;

      // Get weapons for this template
      const weapons = weaponsByTemplate[unit.TemplateID] || [];

      // Calculate max weapon range
      const maxWeaponRange = weapons.length > 0
        ? Math.max(...weapons.map(w => w.max_range))
        : 0;

      return {
        id: parseInt(unit.UnitID),
        faction_id: factionId,
        player_id: unit.IsNPC ? null : parseInt(unit.PlayerID),
        
        // Combat stats
        max_hp: unit.BaseHealth || 100,
        hp: unit.CurrentHealth || unit.BaseHealth || 100,
        max_shield: unit.BaseShield || 0,
        shield: unit.CurrentShield || unit.BaseShield || 0,
        armor: unit.Size || 0, // Using Size as armor value
        shield_regen: (unit.BaseShield || 0) * 0.01, // 1% of max shield per second
        
        // Position
        pos_x: parseFloat(unit.PosX) || 0,
        pos_y: parseFloat(unit.PosY) || 0,
        pos_z: parseFloat(unit.PosZ) || 0,
        
        // Velocity (starts at 0)
        vel_x: 0,
        vel_y: 0,
        vel_z: 0,
        max_speed: unit.Speed || 100,
        
        // Weapons
        weapons: weapons,
        max_weapon_range: maxWeaponRange,
        
        // Combat state
        target_id: null,
        alive: true,
        
        // Stats tracking
        damage_dealt: 0,
        damage_taken: 0
      };
    });

    return battleUnits;

  } catch (error) {
    console.error('[BattleDataService] Error fetching units:', error);
    throw error;
  }
}

module.exports = {
  fetchBattleUnitsData
};