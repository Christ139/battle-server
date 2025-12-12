/**
 * MEDIUM BATTLE TEST - 1,000 Units (500 vs 500)
 * Battle line formation with optimal engagement
 * Gap: 400 units (perfect for weapon range 500-1000)
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

const SYSTEM_ID = 9999992;
const FACTION_A_PLAYER = 9001;
const FACTION_B_PLAYER = 9002;
const UNITS_PER_FACTION = 500;

async function create1kBattleTest() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║    MEDIUM BATTLE TEST - 1,000 UNITS (500 vs 500)        ║');
  console.log('║         Battle Line Formation - Eve Style! ⚔️             ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    console.log('📋 Step 1: Cleaning up old test units...');
    const deleteResult = await client.query(`
      DELETE FROM "Units" 
      WHERE "PlayerID" IN ($1, $2)
        AND "LocationType" = 'SolarSystem'
        AND "LocationID" = $3
    `, [FACTION_A_PLAYER, FACTION_B_PLAYER, SYSTEM_ID]);
    console.log(`✅ Deleted ${deleteResult.rowCount} old units\n`);

    console.log('📋 Step 2: Finding combat-ready template...');
    const templateQuery = await client.query(`
      SELECT DISTINCT ums.unit_template_id, COUNT(*) as weapon_count
      FROM "UnitModuleSlots" ums
      GROUP BY ums.unit_template_id
      HAVING COUNT(*) >= 1
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
      console.log(`⚠️  Using template ${templateId} (no weapons in DB)\n`);
    }

    // Step 3: Create Faction A (battle line on left)
    console.log(`📋 Step 3: Creating ${UNITS_PER_FACTION} units for Faction A...`);
    console.log(`   Formation: Battle line 800x800 area at X=-400`);
    
    const startTimeA = Date.now();
    const factionAValues = [];
    
    for (let i = 0; i < UNITS_PER_FACTION; i++) {
      // Battle line: 800 wide, 800 deep, centered at X=-400
      const x = -400 + (Math.random() * 300 - 150); // -550 to -250
      const y = 15 + (Math.random() * 20 - 10);      // 5 to 25
      const z = Math.random() * 800 - 400;            // -400 to 400
      
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
      
      if ((i + 1) % 100 === 0) {
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
    console.log(`✅ Faction A battle line ready in ${elapsedA}s\n`);

    // Step 4: Create Faction B (battle line on right, 400 units away)
    console.log(`📋 Step 4: Creating ${UNITS_PER_FACTION} units for Faction B...`);
    console.log(`   Formation: Battle line 800x800 area at X=+400`);
    console.log(`   Gap: 400 units (OPTIMAL ENGAGEMENT RANGE!) ⚔️\n`);
    
    const startTimeB = Date.now();
    const factionBValues = [];
    
    for (let i = 0; i < UNITS_PER_FACTION; i++) {
      // Battle line: 800 wide, 800 deep, centered at X=+400
      const x = 400 + (Math.random() * 300 - 150); // 250 to 550
      const y = 15 + (Math.random() * 20 - 10);     // 5 to 25
      const z = Math.random() * 800 - 400;           // -400 to 400
      
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
      
      if ((i + 1) % 100 === 0) {
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
    console.log(`✅ Faction B battle line ready in ${elapsedB}s\n`);

    // Step 5: Set up enemy relationship
    console.log('📋 Step 5: Setting up enemy relationship...');
    await client.query(`
      INSERT INTO "PlayerRelationships" ("PlayerID_A", "PlayerID_B", "Status_A_to_B", "Status_B_to_A")
      VALUES ($1, $2, 'Enemy', 'Enemy')
      ON CONFLICT ("PlayerID_A", "PlayerID_B") 
      DO UPDATE SET "Status_A_to_B" = 'Enemy', "Status_B_to_A" = 'Enemy'
    `, [FACTION_A_PLAYER, FACTION_B_PLAYER]);
    console.log(`✅ Players ${FACTION_A_PLAYER} and ${FACTION_B_PLAYER} are now enemies\n`);

    await client.query('COMMIT');

    // Verification
    console.log('📊 Verification...');
    const verify = await client.query(`
      SELECT 
        "PlayerID",
        COUNT(*) as unit_count,
        ROUND(AVG("PosX")) as avg_x,
        ROUND(MIN("PosX")) as min_x,
        ROUND(MAX("PosX")) as max_x,
        ROUND(AVG("PosZ")) as avg_z,
        ROUND(MIN("PosZ")) as min_z,
        ROUND(MAX("PosZ")) as max_z
      FROM "Units"
      WHERE "LocationType" = 'SolarSystem'
        AND "LocationID" = $1
      GROUP BY "PlayerID"
    `, [SYSTEM_ID]);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ MEDIUM BATTLE TEST READY!\n');
    
    verify.rows.forEach(row => {
      const faction = row.PlayerID === FACTION_A_PLAYER ? 'Faction A' : 'Faction B';
      console.log(`  ${faction}: ${row.unit_count} units`);
      console.log(`    X: ${row.min_x} to ${row.max_x} (center: ${row.avg_x})`);
      console.log(`    Z: ${row.min_z} to ${row.max_z} (width: ${row.max_z - row.min_z})`);
    });

    const gap = verify.rows[1].avg_x - verify.rows[0].avg_x;
    const frontWidth = verify.rows[0].max_z - verify.rows[0].min_z;
    
    console.log(`\n  📏 Gap between battle lines: ${gap} units`);
    console.log(`  📐 Front width: ${frontWidth} units`);
    console.log(`  ⚔️  Combat status: ${gap < 800 ? 'ENGAGEMENT IMMINENT ✅' : 'Out of range ❌'}`);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎮 READY FOR EPIC BATTLE!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`System ID: ${SYSTEM_ID}`);
    console.log(`Total units: ${UNITS_PER_FACTION * 2}`);
    console.log(`Formation: Battle Lines facing each other`);
    console.log(`Faction A: ${UNITS_PER_FACTION} units at X=-400`);
    console.log(`Faction B: ${UNITS_PER_FACTION} units at X=+400`);
    console.log(`Gap: ${gap} units (optimal for sustained combat)`);
    console.log(`\nNext: Run test with: node test-1k-battle.js`);
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

create1kBattleTest();