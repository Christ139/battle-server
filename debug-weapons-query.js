/**
 * Debug weapons query to find the issue
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'game_db',
  user: 'game_user',
  password: 'GameDBPass123!',
  ssl: false
});

async function debug() {
  try {
    const systemId = 9008810;
    
    // Step 1: Get units
    console.log('Step 1: Fetching units...');
    const unitsResult = await pool.query(`
      SELECT 
        u."UnitID",
        u."TemplateID",
        u."PlayerID",
        u."IsNPC"
      FROM "Units" u
      WHERE u."LocationType" = 'SolarSystem'
        AND u."LocationID" = $1
        AND u."CurrentHealth" > 0
      LIMIT 5
    `, [systemId]);
    
    console.log(`Found ${unitsResult.rows.length} units`);
    if (unitsResult.rows.length === 0) {
      console.log('No units found!');
      await pool.end();
      return;
    }
    
    const templateIds = unitsResult.rows.map(u => u.TemplateID);
    console.log(`Template IDs: ${templateIds.join(', ')}`);
    
    // Step 2: Check if UnitModuleSlots has data
    console.log('\nStep 2: Checking UnitModuleSlots...');
    const slotsCheck = await pool.query(`
      SELECT COUNT(*) as count
      FROM "UnitModuleSlots"
      WHERE unit_template_id = ANY($1::int[])
    `, [templateIds]);
    console.log(`UnitModuleSlots rows: ${slotsCheck.rows[0].count}`);
    
    // Step 3: Check weapon_modules table
    console.log('\nStep 3: Checking weapon_modules table...');
    const weaponsCheck = await pool.query(`SELECT COUNT(*) as count FROM weapon_modules`);
    console.log(`weapon_modules total rows: ${weaponsCheck.rows[0].count}`);
    
    // Step 4: Try the JOIN query
    console.log('\nStep 4: Testing JOIN query...');
    const joinResult = await pool.query(`
      SELECT 
        ums.unit_template_id,
        ums.weapon_tag,
        ums.quantity
      FROM "UnitModuleSlots" ums
      JOIN weapon_modules wm ON ums.weapon_tag = wm.weapon_tag
      WHERE ums.unit_template_id = ANY($1::int[])
      LIMIT 10
    `, [templateIds]);
    
    console.log(`JOIN query returned ${joinResult.rows.length} rows`);
    
    if (joinResult.rows.length > 0) {
      console.log('\nSample weapon slots:');
      joinResult.rows.slice(0, 3).forEach(row => {
        console.log(`  Template ${row.unit_template_id}: ${row.weapon_tag} x${row.quantity}`);
      });
    } else {
      console.log('\n❌ JOIN returned 0 rows!');
      
      // Debug: Check if weapons exist without JOIN
      console.log('\nStep 5: Checking UnitModuleSlots without JOIN...');
      const slotsOnly = await pool.query(`
        SELECT unit_template_id, weapon_tag, quantity
        FROM "UnitModuleSlots"
        WHERE unit_template_id = ANY($1::int[])
        LIMIT 5
      `, [templateIds]);
      
      console.log(`UnitModuleSlots (no JOIN): ${slotsOnly.rows.length} rows`);
      if (slotsOnly.rows.length > 0) {
        console.log('Sample slots:');
        slotsOnly.rows.forEach(row => {
          console.log(`  Template ${row.unit_template_id}: weapon_tag="${row.weapon_tag}"`);
        });
        
        // Check if those weapon tags exist in weapon_modules
        const weaponTags = slotsOnly.rows.map(r => r.weapon_tag);
        console.log('\nStep 6: Checking if those weapon_tags exist in weapon_modules...');
        const weaponCheck = await pool.query(`
          SELECT weapon_tag FROM weapon_modules WHERE weapon_tag = ANY($1::text[])
        `, [weaponTags]);
        
        console.log(`Matching weapons: ${weaponCheck.rows.length}/${weaponTags.length}`);
        if (weaponCheck.rows.length < weaponTags.length) {
          console.log('\n❌ MISSING WEAPONS IN weapon_modules!');
          const found = weaponCheck.rows.map(r => r.weapon_tag);
          const missing = weaponTags.filter(tag => !found.includes(tag));
          console.log('Missing weapon tags:');
          missing.forEach(tag => console.log(`  - "${tag}"`));
        }
      }
    }
    
    await pool.end();
    
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
  }
}

debug();