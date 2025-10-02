import pg from 'pg';
const { Pool } = pg;

// Test different hostname variations
const hostnameOptions = [
    "chequemate-service-chequemate-db.g.aivencloud.com", // Current (problematic)
    "chequemate-service.g.aivencloud.com", // Simplified
    "chequemate-db.g.aivencloud.com", // Alternative
    "chequemate.g.aivencloud.com", // Most simplified
];

async function testConnection(hostname) {
    const pool = new Pool({
        database: "chequemate",
        user: "avnadmin",
        password: "AVNS_KY97oCF7I1z8WXQ6_gm",
        host: hostname,
        port: 20381,
        ssl: {
            rejectUnauthorized: false
        },
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 10000,
    });

    try {
        console.log(`\nTesting hostname: ${hostname}`);
        const result = await pool.query('SELECT NOW() as current_time');
        console.log('✅ SUCCESS! Connection works');
        console.log('Current time:', result.rows[0].current_time);
        await pool.end();
        return hostname;
    } catch (error) {
        console.log(`❌ FAILED: ${error.code} - ${error.message}`);
        await pool.end();
        return null;
    }
}

async function findWorkingHostname() {
    console.log('Testing different hostname variations...\n');
    
    for (const hostname of hostnameOptions) {
        const working = await testConnection(hostname);
        if (working) {
            console.log(`\n🎉 Working hostname found: ${working}`);
            console.log('\nUpdate your database.js with this hostname!');
            return;
        }
    }
    
    console.log('\n❌ None of the hostnames worked. Please check your Aiven console for the correct hostname.');
}

findWorkingHostname();
