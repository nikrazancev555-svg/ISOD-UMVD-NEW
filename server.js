const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('.'));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ========== ГЛАВНАЯ ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ========== СОЗДАНИЕ ВСЕХ ТАБЛИЦ ==========
async function initDB() {
    await pool.query(`CREATE TABLE IF NOT EXISTS citizens (
        id SERIAL PRIMARY KEY,
        nickname VARCHAR(100) UNIQUE,
        full_name VARCHAR(255),
        birth_date DATE,
        phone VARCHAR(20),
        address TEXT,
        passport_number VARCHAR(20) UNIQUE,
        is_wanted BOOLEAN DEFAULT FALSE,
        wanted_reason TEXT,
        wanted_since TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
    )`);
    console.log('✅ citizens');

    await pool.query(`CREATE TABLE IF NOT EXISTS wanted_persons (
        id SERIAL PRIMARY KEY,
        citizen_id INTEGER,
        full_name VARCHAR(255),
        crime_article VARCHAR(50),
        reason TEXT,
        category VARCHAR(20),
        status VARCHAR(20) DEFAULT 'активен',
        created_at TIMESTAMP DEFAULT NOW()
    )`);
    console.log('✅ wanted_persons');

    await pool.query(`CREATE TABLE IF NOT EXISTS weapons (
        id SERIAL PRIMARY KEY,
        serial_number VARCHAR(50) UNIQUE,
        weapon_type VARCHAR(50),
        model VARCHAR(100),
        caliber VARCHAR(20),
        owner_id INTEGER,
        license_number VARCHAR(50),
        is_stolen BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
    )`);
    console.log('✅ weapons');

    await pool.query(`CREATE TABLE IF NOT EXISTS vehicles (
        id SERIAL PRIMARY KEY,
        plate_number VARCHAR(20) UNIQUE,
        brand VARCHAR(100),
        model VARCHAR(100),
        color VARCHAR(50),
        year INTEGER,
        owner_id INTEGER,
        is_stolen BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
    )`);
    console.log('✅ vehicles');

    await pool.query(`CREATE TABLE IF NOT EXISTS incidents (
        id SERIAL PRIMARY KEY,
        kusp_number VARCHAR(50) UNIQUE,
        incident_type VARCHAR(100),
        address TEXT,
        description TEXT,
        priority VARCHAR(20),
        status VARCHAR(20) DEFAULT 'Зарегистрировано',
        created_at TIMESTAMP DEFAULT NOW()
    )`);
    console.log('✅ incidents');

    await pool.query(`CREATE TABLE IF NOT EXISTS criminal_records (
        id SERIAL PRIMARY KEY,
        citizen_id INTEGER,
        record_type VARCHAR(50),
        crime_article VARCHAR(50),
        crime_description TEXT,
        sentence_date DATE,
        sentence_type VARCHAR(100),
        sentence_term_years INTEGER,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
    )`);
    console.log('✅ criminal_records');

    await pool.query(`CREATE TABLE IF NOT EXISTS duty_shifts (
        id SERIAL PRIMARY KEY,
        shift_number VARCHAR(50) UNIQUE,
        server_id VARCHAR(100),
        user_id INTEGER,
        started_at TIMESTAMP DEFAULT NOW(),
        ended_at TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE
    )`);
    console.log('✅ duty_shifts');

    await pool.query(`CREATE TABLE IF NOT EXISTS traffic_violations (
        id SERIAL PRIMARY KEY,
        violation_number VARCHAR(50) UNIQUE,
        citizen_id INTEGER,
        violation_type VARCHAR(100),
        fine_amount DECIMAL(10,2),
        is_paid BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
    )`);
    console.log('✅ traffic_violations');

    await pool.query(`CREATE TABLE IF NOT EXISTS action_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        action VARCHAR(100),
        entity_type VARCHAR(50),
        entity_id INTEGER,
        details TEXT,
        created_at TIMESTAMP DEFAULT NOW()
    )`);
    console.log('✅ action_logs');
}

// ========== ГРАЖДАНЕ (ИБД-Ф) ==========
app.get('/api/citizens', async (req, res) => {
    const result = await pool.query('SELECT * FROM citizens ORDER BY id DESC');
    res.json(result.rows);
});

app.post('/api/citizens', async (req, res) => {
    const { nickname, full_name, birth_date, phone, address } = req.body;
    const passport = `${Math.floor(Math.random()*9000+1000)} ${Math.floor(Math.random()*900000+100000)}`;
    const result = await pool.query(
        `INSERT INTO citizens (nickname, full_name, birth_date, phone, address, passport_number)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [nickname, full_name, birth_date, phone, address, passport]
    );
    res.json(result.rows[0]);
});

app.get('/api/citizens/search', async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) {
        const result = await pool.query('SELECT * FROM citizens LIMIT 100');
        return res.json(result.rows);
    }
    const result = await pool.query(
        `SELECT * FROM citizens WHERE full_name ILIKE $1 OR nickname ILIKE $1 OR phone ILIKE $1 OR passport_number ILIKE $1 LIMIT 50`,
        [`%${q}%`]
    );
    res.json(result.rows);
});

// ========== РОЗЫСК (Следопыт-М) ==========
app.get('/api/wanted', async (req, res) => {
    const result = await pool.query('SELECT * FROM citizens WHERE is_wanted = TRUE ORDER BY wanted_since DESC');
    res.json(result.rows);
});

app.post('/api/citizens/:id/wanted', async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const result = await pool.query(
        `UPDATE citizens SET is_wanted = TRUE, wanted_reason = $1, wanted_since = NOW() WHERE id = $2 RETURNING *`,
        [reason || 'Подозревается в совершении преступления', id]
    );
    res.json(result.rows[0]);
});

app.post('/api/citizens/:id/unwanted', async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(
        `UPDATE citizens SET is_wanted = FALSE, wanted_reason = NULL, wanted_since = NULL WHERE id = $1 RETURNING *`,
        [id]
    );
    res.json(result.rows[0]);
});

// ========== ОРУЖИЕ (СЦУО) ==========
app.get('/api/weapons', async (req, res) => {
    const result = await pool.query(`
        SELECT w.*, c.nickname as owner_nickname, c.full_name as owner_name
        FROM weapons w LEFT JOIN citizens c ON w.owner_id = c.id
        ORDER BY w.id DESC
    `);
    res.json(result.rows);
});

app.post('/api/weapons', async (req, res) => {
    const { serial_number, weapon_type, model, caliber, owner_id } = req.body;
    const license = `ЛИЦ-${Math.floor(Math.random()*10000)}-${Date.now() % 10000}`;
    const result = await pool.query(
        `INSERT INTO weapons (serial_number, weapon_type, model, caliber, owner_id, license_number)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [serial_number, weapon_type, model, caliber, owner_id, license]
    );
    res.json(result.rows[0]);
});

app.post('/api/weapons/:id/stolen', async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(`UPDATE weapons SET is_stolen = TRUE WHERE id = $1 RETURNING *`, [id]);
    res.json(result.rows[0]);
});

// ========== ГИБДД-М ==========
app.get('/api/vehicles', async (req, res) => {
    const { plate } = req.query;
    if (plate) {
        const result = await pool.query(`SELECT * FROM vehicles WHERE plate_number ILIKE $1`, [`%${plate}%`]);
        return res.json(result.rows);
    }
    const result = await pool.query(`
        SELECT v.*, c.nickname as owner_nickname, c.full_name as owner_name
        FROM vehicles v LEFT JOIN citizens c ON v.owner_id = c.id
        ORDER BY v.id DESC
    `);
    res.json(result.rows);
});

app.post('/api/vehicles', async (req, res) => {
    const { plate_number, brand, model, color, year, owner_id } = req.body;
    const result = await pool.query(
        `INSERT INTO vehicles (plate_number, brand, model, color, year, owner_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [plate_number, brand, model, color, year, owner_id]
    );
    res.json(result.rows[0]);
});

app.post('/api/vehicles/:id/stolen', async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(`UPDATE vehicles SET is_stolen = TRUE WHERE id = $1 RETURNING *`, [id]);
    res.json(result.rows[0]);
});

// ========== ШТРАФЫ ПДД ==========
app.get('/api/violations', async (req, res) => {
    const result = await pool.query(`
        SELECT v.*, c.nickname as citizen_nickname, c.full_name as citizen_name
        FROM traffic_violations v LEFT JOIN citizens c ON v.citizen_id = c.id
        ORDER BY v.created_at DESC
    `);
    res.json(result.rows);
});

app.post('/api/violations', async (req, res) => {
    const { citizen_id, violation_type, fine_amount } = req.body;
    const violation_number = `НАР-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const result = await pool.query(
        `INSERT INTO traffic_violations (violation_number, citizen_id, violation_type, fine_amount)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [violation_number, citizen_id, violation_type, fine_amount || 0]
    );
    res.json(result.rows[0]);
});

app.put('/api/violations/:id/pay', async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(`UPDATE traffic_violations SET is_paid = TRUE WHERE id = $1 RETURNING *`, [id]);
    res.json(result.rows[0]);
});

// ========== КУСП ==========
app.get('/api/incidents', async (req, res) => {
    const result = await pool.query('SELECT * FROM incidents ORDER BY created_at DESC');
    res.json(result.rows);
});

app.post('/api/incidents', async (req, res) => {
    const { incident_type, address, description, priority } = req.body;
    const kusp_number = `КУСП-${Date.now()}-${Math.floor(Math.random()*10000)}`;
    const result = await pool.query(
        `INSERT INTO incidents (kusp_number, incident_type, address, description, priority)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [kusp_number, incident_type, address, description, priority || 'Средний']
    );
    res.json(result.rows[0]);
});

app.put('/api/incidents/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const result = await pool.query(
        `UPDATE incidents SET status = $1, closed_at = CASE WHEN $1 = 'Закрыто' THEN NOW() ELSE closed_at END WHERE id = $2 RETURNING *`,
        [status, id]
    );
    res.json(result.rows[0]);
});

// ========== КРИМИНАЛЬНЫЙ РЕЕСТР ==========
app.get('/api/criminal', async (req, res) => {
    const result = await pool.query(`
        SELECT cr.*, c.nickname, c.full_name, c.passport_number
        FROM criminal_records cr JOIN citizens c ON cr.citizen_id = c.id
        WHERE cr.is_active = true
        ORDER BY cr.created_at DESC
    `);
    res.json(result.rows);
});

app.post('/api/criminal', async (req, res) => {
    const { citizen_id, record_type, crime_article, crime_description, sentence_date, sentence_type, sentence_term_years } = req.body;
    const result = await pool.query(
        `INSERT INTO criminal_records (citizen_id, record_type, crime_article, crime_description, sentence_date, sentence_type, sentence_term_years)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [citizen_id, record_type, crime_article, crime_description, sentence_date, sentence_type, sentence_term_years || 0]
    );
    res.json(result.rows[0]);
});

app.put('/api/criminal/:id/close', async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(`UPDATE criminal_records SET is_active = false WHERE id = $1 RETURNING *`, [id]);
    res.json(result.rows[0]);
});

// ========== ДЕЖУРНАЯ СМЕНА ==========
app.get('/api/duty/active', async (req, res) => {
    const result = await pool.query('SELECT * FROM duty_shifts WHERE is_active = true ORDER BY started_at DESC LIMIT 1');
    res.json(result.rows[0] || null);
});

app.post('/api/duty/start', async (req, res) => {
    const { server_id } = req.body;
    const shift_number = `СМ-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    await pool.query(`UPDATE duty_shifts SET is_active = false, ended_at = NOW() WHERE is_active = true`);
    const result = await pool.query(
        `INSERT INTO duty_shifts (shift_number, server_id) VALUES ($1, $2) RETURNING *`,
        [shift_number, server_id]
    );
    res.json(result.rows[0]);
});

app.post('/api/duty/end', async (req, res) => {
    const result = await pool.query(`UPDATE duty_shifts SET is_active = false, ended_at = NOW() WHERE is_active = true RETURNING *`);
    res.json(result.rows[0] || { message: 'Нет активной смены' });
});

// ========== СТАТИСТИКА ==========
app.get('/api/stats', async (req, res) => {
    const citizens = await pool.query('SELECT COUNT(*) FROM citizens');
    const weapons = await pool.query('SELECT COUNT(*) FROM weapons');
    const wanted = await pool.query('SELECT COUNT(*) FROM citizens WHERE is_wanted = true');
    const vehicles = await pool.query('SELECT COUNT(*) FROM vehicles');
    const stolenVehicles = await pool.query('SELECT COUNT(*) FROM vehicles WHERE is_stolen = true');
    const violations = await pool.query('SELECT COUNT(*) FROM traffic_violations WHERE is_paid = false');
    const incidents = await pool.query("SELECT COUNT(*) FROM incidents WHERE status != 'Закрыто'");
    const criminal = await pool.query('SELECT COUNT(*) FROM criminal_records WHERE is_active = true');
    
    res.json({
        citizens: parseInt(citizens.rows[0].count),
        weapons: parseInt(weapons.rows[0].count),
        wanted: parseInt(wanted.rows[0].count),
        vehicles: parseInt(vehicles.rows[0].count),
        stolenVehicles: parseInt(stolenVehicles.rows[0].count),
        unpaidFines: parseInt(violations.rows[0].count),
        activeIncidents: parseInt(incidents.rows[0].count),
        criminals: parseInt(criminal.rows[0].count)
    });
});

// ========== ЗАПУСК ==========
const PORT = process.env.PORT || 3000;

initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`╔════════════════════════════════════════════════════╗`);
        console.log(`║     ИСОД МВД РОССИИ - УМВД по г. Провинция        ║`);
        console.log(`║     🚀 Сервер запущен на порту ${PORT}                    ║`);
        console.log(`╚════════════════════════════════════════════════════╝`);
    });
});
