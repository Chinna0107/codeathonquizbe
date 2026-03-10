require('dotenv').config();
const pool = require('./database');

async function migrate() {
  try {
    console.log('Adding missing columns to users table...');
    
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20)');
    console.log('✓ phone_number column added');
    
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS year VARCHAR(10)');
    console.log('✓ year column added');
    
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS branch VARCHAR(50)');
    console.log('✓ branch column added');
    
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS roll_no VARCHAR(50)');
    console.log('✓ roll_no column added');
    
    console.log('\nMigration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
