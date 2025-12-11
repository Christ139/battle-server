/**
 * Create 5,000 test units for battle stress test
 * FIXED: Uses correct Units table schema
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

async function createStressTestUnits() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         BATTLE STRESS TEST - UNIT CREATION              ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Step 1: Create test players
    console.log('📋 Step 1: Creating test players...');
    
    await client.query(`
      INSERT INTO players (id, username, player_name, password, email, credits, start_system_choice)
      VALUES 
        ($1, 'stress_test_a', 'Faction_A_Commander', '$2b$10$abcdefghijklmnopqrstuv', 'test_a@test.com', 1000000, 1),
        ($2, 'stress_test_b', 'Faction_B_Commander', '$2b$10$abcdefghijklmnopqrstuv', 'test_b@test.com', 1000000, 1)
      ON CONFLICT (id) DO UPDATE SET player_name = EXCLUDED.player_name
    `, [FACTION_A_PLAYER, FACTION_B_PLAYER]);
    
    console.log(`✅ Created/updated test players: ${FACTION_A_PLAYER}, ${FACTION_B_PLAYER}\n`);

    // Step 2: Set as enemies
    console.log('📋 Step 2: Setting players as enemies...');
    
    const playerIdA = Math.min(FACTION_A_PLAYER, FACTION_B_PLAYER);
    const playerIdB = Math.max(FACTION_A_PLAYER, FACTION_B_PLAYER);
    
    await client.query(`
      INSERT INTO "PlayerRelationships" ("PlayerID_A", "PlayerID_B", "Status_A_to_B", "Status_B_to_A")
      VALUES ($1, $2, 'Enemy', 'Enemy')
      ON CONFLICT ("PlayerID_A", "PlayerID_B") 
      DO UPDATE SET "Status_A_to_B" = 'Enemy', "Status_B_to_A" = 'Enemy'
    `, [playerIdA, playerIdB]);
    
    console.log('✅ Set as enemies\n');

    // Step 3: Find template with weapons
    console.log('📋 Step 3: Finding template with weapons...');
    
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
      console.log(`⚠️  No armed templates found, using template ${templateId}\n`);
    }

    // Step 4: Clean up old test units
    console.log('📋 Step 4: Cleaning up old test units...');
    
    const deleteResult = await client.query(`
      DELETE FROM "Units" 
      WHERE "PlayerID" IN ($1, $2)
        AND "LocationType" = 'SolarSystem'
        AND "LocationID" = $3
    `, [FACTION_A_PLAYER, FACTION_B_PLAYER, SYSTEM_ID]);
    
    console.log(`✅ Deleted ${deleteResult.rowCount} old test units\n`);

    // Step 5: Create Faction A units (batch insert)
    console.log(`📋 Step 5: Creating ${UNITS_PER_FACTION} units for Faction A...`);
    
    const factionAValues = [];
    for (let i = 0; i < UNITS_PER_FACTION; i++) {
      const x = Math.random() * 1000 - 500;
      const y = Math.random() * 100;
      const z = Math.random() * 1000 - 500;
      
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
      
      if (i % 500 === 0 && i > 0) {
        console.log(`  Created ${i} units...`);
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
    
    console.log(`✅ Created ${UNITS_PER_FACTION} units for Faction A\n`);

    // Step 6: Create Faction B units (batch insert)
    console.log(`📋 Step 6: Creating ${UNITS_PER_FACTION} units for Faction B...`);
    
    const factionBValues = [];
    for (let i = 0; i < UNITS_PER_FACTION; i++) {
      const x = Math.random() * 1000 + 1500;
      const y = Math.random() * 100;
      const z = Math.random() * 1000 - 500;
      
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
      
      if (i % 500 === 0 && i > 0) {
        console.log(`  Created ${i} units...`);
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
    
    console.log(`✅ Created ${UNITS_PER_FACTION} units for Faction B\n`);

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

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ STRESS TEST UNITS READY!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Total units: ${UNITS_PER_FACTION * 2}`);
    console.log(`System ID: ${SYSTEM_ID}`);
    console.log(`Faction A: Player ${FACTION_A_PLAYER} (2,500 units)`);
    console.log(`Faction B: Player ${FACTION_B_PLAYER} (2,500 units)`);
    console.log(`Relationship: Enemy vs Enemy ⚔️\n`);
    console.log('Next: Run stress test with run-stress-test.js');
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

createStressTestUnits();