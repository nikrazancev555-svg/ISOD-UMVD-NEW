const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('.'));

// ПРОВЕРКА ПОДКЛЮЧЕНИЯ К БД
if (!process.env.DATABASE_URL) {
    console.error('❌ ОШИБКА: DATABASE_URL не найдена!');
    console.error('✅ Добавь PostgreSQL: New → Database → PostgreSQL');
} else {
    console.log('✅ DATABASE_URL найдена');
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ========== ОТДАЁМ HTML ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ========== ПРОВЕРКА СТАТУСА ==========
app.get('/api/check', (req, res) => {
    res.json({ 
        status: 'ok', 
        db_url_exists: !!process.env.DATABASE_URL,
        node_env: process.env.NODE_ENV || 'production'
    });
});

// ========== СОЗДАНИЕ ТАБЛИЦ ==========
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS citizens (
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
            )
        `);
        console.log('✅ Таблица citizens готова');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS weapons (
                id SERIAL PRIMARY KEY,
                serial_number VARCHAR(50) UNIQUE,
                weapon_type VARCHAR(50),
                model VARCHAR(100),
                caliber VARCHAR(20),
                owner_id INTEGER,
                license_number VARCHAR(50),
                is_stolen BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Таблица weapons готова');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS vehicles (
                id SERIAL PRIMARY KEY,
                plate_number VARCHAR(20) UNIQUE,
                brand VARCHAR(100),
                model VARCHAR(100),
                color VARCHAR(50),
                year INTEGER,
                owner_id INTEGER,
                is_stolen BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Таблица vehicles готова');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS incidents (
                id SERIAL PRIMARY KEY,
                kusp_number VARCHAR(50) UNIQUE,
                incident_type VARCHAR(100),
                address TEXT,
                description TEXT,
                priority VARCHAR(20),
                status VARCHAR(20) DEFAULT 'Зарегистрировано',
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Таблица incidents готова');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS criminal_records (
                id SERIAL PRIMARY KEY,
                citizen_id INTEGER,
                record_type VARCHAR(50),
                crime_article VARCHAR(50),
                crime_description TEXT,
                sentence_type VARCHAR(100),
                sentence_term_years INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Таблица criminal_records готова');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS duty_shifts (
                id SERIAL PRIMARY KEY,
                shift_number VARCHAR(50) UNIQUE,
                server_id VARCHAR(100),
                user_id INTEGER,
                started_at TIMESTAMP DEFAULT NOW(),
                ended_at TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE
            )
        `);
        console.log('✅ Таблица duty_shifts готова');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS traffic_violations (
                id SERIAL PRIMARY KEY,
                violation_number VARCHAR(50) UNIQUE,
                citizen_id INTEGER,
                vehicle_id INTEGER,
                violation_type VARCHAR(100),
                fine_amount DECIMAL(10,2),
                is_paid BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Таблица traffic_violations готова');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS action_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                action VARCHAR(100),
                entity_type VARCHAR(50),
                entity_id INTEGER,
                details TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Таблица action_logs готова');

        return true;
    } catch(e) {
        console.error('❌ Ошибка создания таблиц:', e.message);
        return false;
    }
}

// ========== ГРАЖДАНЕ ==========
app.get('/api/citizens', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM citizens ORDER BY id DESC');
        res.json(result.rows);
    } catch(e) {
        console.error('Error /api/citizens:', e.message);
        res.json([]);
    }
});

app.post('/api/citizens', async (req, res) => {
    try {
        const { nickname, full_name, birth_date, phone, address } = req.body;
        const passport = `${Math.floor(Math.random()*9000+1000)} ${Math.floor(Math.random()*900000+100000)}`;
        const result = await pool.query(
            `INSERT INTO citizens (nickname, full_name, birth_date, phone, address, passport_number)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [nickname, full_name, birth_date, phone, address, passport]
        );
        res.json(result.rows[0]);
    } catch(e) {
        console.error('Error POST /api/citizens:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/citizens/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) {
            const result = await pool.query('SELECT * FROM citizens LIMIT 100');
            return res.json(result.rows);
        }
        const result = await pool.query(
            `SELECT * FROM citizens WHERE full_name ILIKE $1 OR nickname ILIKE $1 OR phone ILIKE $1 LIMIT 50`,
            [`%${q}%`]
        );
        res.json(result.rows);
    } catch(e) {
        console.error('Error /api/citizens/search:', e.message);
        res.json([]);
    }
});

// ========== РОЗЫСК ==========
app.get('/api/wanted', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM citizens WHERE is_wanted = TRUE ORDER BY wanted_since DESC');
        res.json(result.rows);
    } catch(e) {
        console.error('Error /api/wanted:', e.message);
        res.json([]);
    }
});

app.post('/api/citizens/:id/wanted', async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const result = await pool.query(
            `UPDATE citizens SET is_wanted = TRUE, wanted_reason = $1, wanted_since = NOW() WHERE id = $2 RETURNING *`,
            [reason || 'Подозревается в преступлении', id]
        );
        res.json(result.rows[0]);
    } catch(e) {
        console.error('Error POST /api/citizens/:id/wanted:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/citizens/:id/unwanted', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `UPDATE citizens SET is_wanted = FALSE, wanted_reason = NULL, wanted_since = NULL WHERE id = $1 RETURNING *`,
            [id]
        );
        res.json(result.rows[0]);
    } catch(e) {
        console.error('Error POST /api/citizens/:id/unwanted:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ========== ОРУЖИЕ ==========
app.get('/api/weapons', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM weapons ORDER BY id DESC');
        res.json(result.rows);
    } catch(e) {
        console.error('Error /api/weapons:', e.message);
        res.json([]);
    }
});

app.post('/api/weapons', async (req, res) => {
    try {
        const { serial_number, weapon_type, model, caliber, owner_id } = req.body;
        const license = `ЛИЦ-${Math.floor(Math.random()*10000)}-${Date.now() % 10000}`;
        const result = await pool.query(
            `INSERT INTO weapons (serial_number, weapon_type, model, caliber, owner_id, license_number)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [serial_number, weapon_type, model, caliber, owner_id, license]
        );
        res.json(result.rows[0]);
    } catch(e) {
        console.error('Error POST /api/weapons:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/weapons/:id/stolen', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`UPDATE weapons SET is_stolen = TRUE WHERE id = $1 RETURNING *`, [id]);
        res.json(result.rows[0]);
    } catch(e) {
        console.error('Error POST /api/weapons/:id/stolen:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ========== ГИБДД ==========
app.get('/api/vehicles', async (req, res) => {
    try {
        const { plate } = req.query;
        if (plate) {
            const result = await pool.query(`SELECT * FROM vehicles WHERE plate_number ILIKE $1`, [`%${plate}%`]);
            return res.json(result.rows);
        }
        const result = await pool.query('SELECT * FROM vehicles ORDER BY id DESC');
        res.json(result.rows);
    } catch(e) {
        console.error('Error /api/vehicles:', e.message);
        res.json([]);
    }
});

app.post('/api/vehicles', async (req, res) => {
    try {
        const { plate_number, brand, model, color, year, owner_id } = req.body;
        const result = await pool.query(
            `INSERT INTO vehicles (plate_number, brand, model, color, year, owner_id)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [plate_number, brand, model, color, year, owner_id]
        );
        res.json(result.rows[0]);
    } catch(e) {
        console.error('Error POST /api/vehicles:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/vehicles/:id/stolen', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`UPDATE vehicles SET is_stolen = TRUE WHERE id = $1 RETURNING *`, [id]);
        res.json(result.rows[0]);
    } catch(e) {
        console.error('Error POST /api/vehicles/:id/stolen:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ========== НАРУШЕНИЯ ==========
app.get('/api/violations', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM traffic_violations ORDER BY created_at DESC');
        res.json(result.rows);
    } catch(e) {
        console.error('Error /api/violations:', e.message);
        res.json([]);
    }
});

app.post('/api/violations', async (req, res) => {
    try {
        const { citizen_id, violation_type, fine_amount } = req.body;
        const violation_number = `НАР-${Date.now()}-${Math.floor(Math.random()*1000)}`;
        const result = await pool.query(
            `INSERT INTO traffic_violations (violation_number, citizen_id, violation_type, fine_amount)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [violation_number, citizen_id, violation_type, fine_amount || 0]
        );
        res.json(result.rows[0]);
    } catch(e) {
        console.error('Error POST /api/violations:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/violations/:id/pay', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`UPDATE traffic_violations SET is_paid = TRUE WHERE id = $1 RETURNING *`, [id]);
        res.json(result.rows[0]);
    } catch(e) {
        console.error('Error PUT /api/violations/:id/pay:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ========== КУСП ==========
app.get('/api/incidents', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM incidents ORDER BY created_at DESC');
        res.json(result.rows);
    } catch(e) {
        console.error('Error /api/incidents:', e.message);
        res.json([]);
    }
});

app.post('/api/incidents', async (req, res) => {
    try {
        const { incident_type, address, description, priority } = req.body;
        const kusp_number = `КУСП-${Date.now()}-${Math.floor(Math.random()*10000)}`;
        const result = await pool.query(
            `INSERT INTO incidents (kusp_number, incident_type, address, description, priority)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [kusp_number, incident_type, address, description, priority || 'Средний']
        );
        res.json(result.rows[0]);
    } catch(e) {
        console.error('Error POST /api/incidents:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/incidents/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const result = await pool.query(
            `UPDATE incidents SET status = $1, closed_at = CASE WHEN $1 = 'Закрыто' THEN NOW() ELSE closed_at END WHERE id = $2 RETURNING *`,
            [status, id]
        );
        res.json(result.rows[0]);
    } catch(e) {
        console.error('Error PUT /api/incidents/:id/status:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ========== КРИМИНАЛ ==========
app.get('/api/criminal', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT cr.*, c.nickname, c.full_name 
            FROM criminal_records cr 
            JOIN citizens c ON cr.citizen_id = c.id 
            WHERE cr.is_active = true 
            ORDER BY cr.created_at DESC
        `);
        res.json(result.rows);
    } catch(e) {
        console.error('Error /api/criminal:', e.message);
        res.json([]);
    }
});

app.post('/api/criminal', async (req, res) => {
    try {
        const { citizen_id, record_type, crime_article, crime_description, sentence_type, sentence_term_years } = req.body;
        const result = await pool.query(
            `INSERT INTO criminal_records (citizen_id, record_type, crime_article, crime_description, sentence_type, sentence_term_years)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [citizen_id, record_type, crime_article, crime_description, sentence_type, sentence_term_years || 0]
        );
        res.json(result.rows[0]);
    } catch(e) {
        console.error('Error POST /api/criminal:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/criminal/:id/close', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`UPDATE criminal_records SET is_active = false WHERE id = $1 RETURNING *`, [id]);
        res.json(result.rows[0]);
    } catch(e) {
        console.error('Error PUT /api/criminal/:id/close:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ========== ДЕЖУРНАЯ СМЕНА ==========
app.get('/api/duty/active', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM duty_shifts WHERE is_active = true ORDER BY started_at DESC LIMIT 1');
        res.json(result.rows[0] || null);
    } catch(e) {
        console.error('Error /api/duty/active:', e.message);
        res.json(null);
    }
});

app.post('/api/duty/start', async (req, res) => {
    try {
        const { server_id } = req.body;
        const shift_number = `СМ-${Date.now()}-${Math.floor(Math.random()*1000)}`;
        await pool.query(`UPDATE duty_shifts SET is_active = false, ended_at = NOW() WHERE is_active = true`);
        const result = await pool.query(
            `INSERT INTO duty_shifts (shift_number, server_id) VALUES ($1, $2) RETURNING *`,
            [shift_number, server_id]
        );
        res.json(result.rows[0]);
    } catch(e) {
        console.error('Error POST /api/duty/start:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/duty/end', async (req, res) => {
    try {
        const result = await pool.query(`UPDATE duty_shifts SET is_active = false, ended_at = NOW() WHERE is_active = true RETURNING *`);
        res.json(result.rows[0] || { message: 'Нет активной смены' });
    } catch(e) {
        console.error('Error POST /api/duty/end:', e.message);
        res.json({ message: 'Нет активной смены' });
    }
});

// ========== СТАТИСТИКА ==========
app.get('/api/stats', async (req, res) => {
    try {
        const citizens = await pool.query('SELECT COUNT(*) FROM citizens');
        const weapons = await pool.query('SELECT COUNT(*) FROM weapons');
        const wanted = await pool.query('SELECT COUNT(*) FROM citizens WHERE is_wanted = true');
        const vehicles = await pool.query('SELECT COUNT(*) FROM vehicles');
        const violations = await pool.query('SELECT COUNT(*) FROM traffic_violations WHERE is_paid = false');
        const incidents = await pool.query("SELECT COUNT(*) FROM incidents WHERE status != 'Закрыто'");
        
        res.json({
            citizens: parseInt(citizens.rows[0].count),
            weapons: parseInt(weapons.rows[0].count),
            wanted: parseInt(wanted.rows[0].count),
            vehicles: parseInt(vehicles.rows[0].count),
            unpaidFines: parseInt(violations.rows[0].count),
            activeIncidents: parseInt(incidents.rows[0].count)
        });
    } catch(e) {
        console.error('Error /api/stats:', e.message);
        res.json({ citizens: 0, weapons: 0, wanted: 0, vehicles: 0, unpaidFines: 0, activeIncidents: 0 });
    }
});

// ========== ЖУРНАЛ ==========
app.get('/api/logs', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM action_logs ORDER BY created_at DESC LIMIT 100');
        res.json(result.rows);
    } catch(e) {
        console.error('Error /api/logs:', e.message);
        res.json([]);
    }
});

// ========== ЗАПУСК СЕРВЕРА ==========
const PORT = process.env.PORT || 3000;

initDB().then((dbOk) => {
    app.listen(PORT, () => {
        console.log('');
        console.log('╔════════════════════════════════════════════════════╗');
        console.log('║     ИСОД МВД РОССИИ - УМВД по г. Провинция        ║');
        console.log('╠════════════════════════════════════════════════════╣');
        console.log(`║  🚀 Сервер запущен: http://localhost:${PORT}           ║`);
        console.log(`║  💾 База данных: ${dbOk ? '✅ ПОДКЛЮЧЕНА' : '❌ НЕТ БД'}                ║`);
        console.log('╚════════════════════════════════════════════════════╝');
        console.log('');
    });
});
