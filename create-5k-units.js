/**
 * Create 5,000 test units for massive stress test
 * 2,500 vs 2,500 (Eve Online scale!)
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

const SYSTEM_ID = 9999999;
const FACTION_A_PLAYER = 9001;
const FACTION_B_PLAYER = 9002;
const UNITS_PER_FACTION = 2500;

async function create5kUnits() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         CREATING 5,000 UNITS FOR STRESS TEST            ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Step 1: Clean up old units
    console.log('📋 Step 1: Cleaning up old test units...');
    
    const deleteResult = await client.query(`
      DELETE FROM "Units" 
      WHERE "PlayerID" IN ($1, $2)
        AND "LocationType" = 'SolarSystem'
        AND "LocationID" = $3
    `, [FACTION_A_PLAYER, FACTION_B_PLAYER, SYSTEM_ID]);
    
    console.log(`✅ Deleted ${deleteResult.rowCount} old units\n`);

    // Step 2: Get template with weapons
    console.log('📋 Step 2: Finding template with weapons...');
    
    const templateQuery = await client.query(`
      SELECT DISTINCT ums.unit_template_id, COUNT(*) as weapon_count
      FROM "UnitModuleSlots" ums
      GROUP BY ums.unit_template_id
      HAVING COUNT(*) >= 3
      ORDER BY weapon_count DESC
      LIMIT 1
    `);

    let templateId;
    if (templateQuery.rows.length > 0) {
      templateId = templateQuery.rows[0].unit_template_id;
      console.log(`✅ Using template ${templateId} with ${templateQuery.rows[0].weapon_count} weapons\n`);
    } else {
      const anyTemplate = await client.query(`SELECT "TemplateID" FROM "UnitTemplates" LIMIT 1`);
      templateId = anyTemplate.rows[0].TemplateID;
      console.log(`⚠️  Using template ${templateId}\n`);
    }

    // Step 3: Create Faction A units (2,500)
    console.log(`📋 Step 3: Creating ${UNITS_PER_FACTION} units for Faction A...`);
    
    const startTimeA = Date.now();
    const factionAValues = [];
    
    for (let i = 0; i < UNITS_PER_FACTION; i++) {
      // Spread units in 1500x1500 area
      const x = Math.random() * 1500 - 750;
      const y = Math.random() * 100;
      const z = Math.random() * 1500 - 750;
      
      factionAValues.push(`(
        ${templateId}, 
        ${FACTION_A_PLAYER}, 
        FALSE, 
        NULL,
        'SolarSystem', 
        ${SYSTEM_ID}, 
        100,
        ${x}, 
        ${y}, 
        ${z},
        'Waiting For Orders',
        FALSE
      )`);
      
      if ((i + 1) % 500 === 0) {
        console.log(`  Created ${i + 1} units...`);
      }
    }

    await client.query(`
      INSERT INTO "Units" (
        "TemplateID", "PlayerID", "IsNPC", "NPCFactionID",
        "LocationType", "LocationID", 
        "CurrentHealth",
        "PosX", "PosY", "PosZ",
        "CurrentStatus",
        "UnderConstruction"
      ) VALUES ${factionAValues.join(', ')}
    `);
    
    const elapsedA = ((Date.now() - startTimeA) / 1000).toFixed(1);
    console.log(`✅ Created ${UNITS_PER_FACTION} units for Faction A in ${elapsedA}s\n`);

    // Step 4: Create Faction B units (2,500)
    console.log(`📋 Step 4: Creating ${UNITS_PER_FACTION} units for Faction B...`);
    
    const startTimeB = Date.now();
    const factionBValues = [];
    
    for (let i = 0; i < UNITS_PER_FACTION; i++) {
      // Spread units in different 1500x1500 area (offset by 2000)
      const x = Math.random() * 1500 + 2000;
      const y = Math.random() * 100;
      const z = Math.random() * 1500 - 750;
      
      factionBValues.push(`(
        ${templateId}, 
        ${FACTION_B_PLAYER}, 
        FALSE, 
        NULL,
        'SolarSystem', 
        ${SYSTEM_ID}, 
        100,
        ${x}, 
        ${y}, 
        ${z},
        'Waiting For Orders',
        FALSE
      )`);
      
      if ((i + 1) % 500 === 0) {
        console.log(`  Created ${i + 1} units...`);
      }
    }

    await client.query(`
      INSERT INTO "Units" (
        "TemplateID", "PlayerID", "IsNPC", "NPCFactionID",
        "LocationType", "LocationID", 
        "CurrentHealth",
        "PosX", "PosY", "PosZ",
        "CurrentStatus",
        "UnderConstruction"
      ) VALUES ${factionBValues.join(', ')}
    `);
    
    const elapsedB = ((Date.now() - startTimeB) / 1000).toFixed(1);
    console.log(`✅ Created ${UNITS_PER_FACTION} units for Faction B in ${elapsedB}s\n`);

    await client.query('COMMIT');

    // Verification
    console.log('📊 Verification...');
    const verify = await client.query(`
      SELECT 
        "PlayerID",
        COUNT(*) as unit_count,
        AVG("PosX") as avg_x,
        AVG("PosZ") as avg_z
      FROM "Units"
      WHERE "LocationType" = 'SolarSystem'
        AND "LocationID" = $1
      GROUP BY "PlayerID"
    `, [SYSTEM_ID]);

    console.log('\n✅ UNITS CREATED SUCCESSFULLY!\n');
    verify.rows.forEach(row => {
      const faction = row.PlayerID === FACTION_A_PLAYER ? 'Faction A' : 'Faction B';
      console.log(`  ${faction}: ${row.unit_count} units at (${Math.round(row.avg_x)}, ${Math.round(row.avg_z)})`);
    });

    const totalUnits = verify.rows.reduce((sum, row) => sum + parseInt(row.unit_count), 0);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 5,000 UNITS READY FOR STRESS TEST!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Total units: ${totalUnits}`);
    console.log(`System ID: ${SYSTEM_ID}`);
    console.log(`Faction A: ${UNITS_PER_FACTION} units`);
    console.log(`Faction B: ${UNITS_PER_FACTION} units`);
    console.log(`Relationship: Enemy vs Enemy ⚔️\n`);
    console.log('Next: Run stress test with test-5k-stress.js');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating units:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

create5kUnits();