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

// ========== ПРИНУДИТЕЛЬНОЕ ДОБАВЛЕНИЕ ВСЕХ НУЖНЫХ КОЛОНОК ==========
async function addMissingColumns() {
    // Проверяем и добавляем колонки в таблицу citizens
    const columns = [
        { name: 'birth_date', type: 'DATE' },
        { name: 'phone', type: 'VARCHAR(20)' },
        { name: 'address', type: 'TEXT' },
        { name: 'passport_number', type: 'VARCHAR(20)' },
        { name: 'is_wanted', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'wanted_reason', type: 'TEXT' },
        { name: 'wanted_category', type: 'VARCHAR(50)' },
        { name: 'wanted_priority', type: 'VARCHAR(50)' },
        { name: 'wanted_since', type: 'TIMESTAMP' }
    ];
    
    for (const col of columns) {
        try {
            await pool.query(`ALTER TABLE citizens ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
            console.log(`✅ Колонка ${col.name} добавлена или уже есть`);
        } catch(e) {
            console.log(`⚠️ Ошибка с колонкой ${col.name}:`, e.message);
        }
    }
}

// ========== СОЗДАНИЕ ВСЕХ ТАБЛИЦ ==========
async function initDatabase() {
    try {
        // 1. Граждане (базовая таблица)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS citizens (
                id SERIAL PRIMARY KEY,
                nickname VARCHAR(100) UNIQUE,
                full_name VARCHAR(255),
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Таблица citizens создана');
        
        // Добавляем недостающие колонки
        await addMissingColumns();
        
        // 2. Оружие
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
        console.log('✅ Таблица weapons');
        
        // 3. Автомобили
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
        console.log('✅ Таблица vehicles');
        
        // 4. Происшествия КУСП
        await pool.query(`
            CREATE TABLE IF NOT EXISTS incidents (
                id SERIAL PRIMARY KEY,
                kusp_number VARCHAR(50) UNIQUE,
                incident_type VARCHAR(100),
                address TEXT,
                description TEXT,
                priority VARCHAR(20),
                status VARCHAR(20) DEFAULT 'Зарегистрировано',
                closed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Таблица incidents');
        
        // 5. Штрафы ПДД
        await pool.query(`
            CREATE TABLE IF NOT EXISTS traffic_violations (
                id SERIAL PRIMARY KEY,
                violation_number VARCHAR(50) UNIQUE,
                citizen_id INTEGER,
                violation_type VARCHAR(100),
                fine_amount DECIMAL(10,2),
                is_paid BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Таблица traffic_violations');
        
        // 6. Криминальный реестр
        await pool.query(`
            CREATE TABLE IF NOT EXISTS criminal_records (
                id SERIAL PRIMARY KEY,
                citizen_id INTEGER,
                crime_article VARCHAR(50),
                crime_description TEXT,
                sentence_type VARCHAR(100),
                sentence_term_years INTEGER,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Таблица criminal_records');
        
        // 7. Дежурные смены
        await pool.query(`
            CREATE TABLE IF NOT EXISTS duty_shifts (
                id SERIAL PRIMARY KEY,
                server_id VARCHAR(100),
                started_at TIMESTAMP DEFAULT NOW(),
                ended_at TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE
            )
        `);
        console.log('✅ Таблица duty_shifts');
        
        console.log('🎉 ВСЕ ТАБЛИЦЫ ГОТОВЫ!');
    } catch(e) {
        console.log('⚠️ Ошибка при создании таблиц:', e.message);
    }
}

// ========== ГЛАВНАЯ СТРАНИЦА ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ========== ГРАЖДАНЕ (ИБД-Ф) ==========
app.get('/api/citizens', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM citizens ORDER BY id DESC');
        res.json(result.rows);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/citizens', async (req, res) => {
    try {
        const { nickname, full_name, birth_date, phone, address } = req.body;
        const passport = `${Math.floor(Math.random()*9000+1000)} ${Math.floor(Math.random()*900000+100000)}`;
        const result = await pool.query(
            `INSERT INTO citizens (nickname, full_name, birth_date, phone, address, passport_number)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [nickname, full_name, birth_date, phone, address, passport]
        );
        res.json(result.rows[0]);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/citizens/:id', async (req, res) => {
    try {
        const { nickname, full_name, phone } = req.body;
        const result = await pool.query(
            `UPDATE citizens SET nickname = $1, full_name = $2, phone = $3 WHERE id = $4 RETURNING *`,
            [nickname, full_name, phone, req.params.id]
        );
        res.json(result.rows[0]);
    } catch(e) {
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
            `SELECT * FROM citizens 
             WHERE full_name ILIKE $1 OR nickname ILIKE $1 OR phone ILIKE $1 OR passport_number ILIKE $1
             LIMIT 50`,
            [`%${q}%`]
        );
        res.json(result.rows);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== РОЗЫСК (Следопыт-М) ==========
app.get('/api/wanted', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM citizens WHERE is_wanted = TRUE ORDER BY wanted_since DESC');
        res.json(result.rows);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/citizens/:id/wanted', async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, category, priority } = req.body;
        const result = await pool.query(
            `UPDATE citizens 
             SET is_wanted = TRUE, 
                 wanted_reason = $1, 
                 wanted_category = $2, 
                 wanted_priority = $3, 
                 wanted_since = NOW() 
             WHERE id = $4 
             RETURNING *`,
            [reason, category, priority, id]
        );
        res.json(result.rows[0]);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/citizens/:id/unwanted', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `UPDATE citizens 
             SET is_wanted = FALSE, 
                 wanted_reason = NULL, 
                 wanted_category = NULL, 
                 wanted_priority = NULL, 
                 wanted_since = NULL 
             WHERE id = $1 
             RETURNING *`,
            [id]
        );
        res.json(result.rows[0]);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== ОРУЖИЕ (СЦУО) ==========
app.get('/api/weapons', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT w.*, c.nickname as owner_nickname, c.full_name as owner_name
            FROM weapons w
            LEFT JOIN citizens c ON w.owner_id = c.id
            ORDER BY w.id DESC
        `);
        res.json(result.rows);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/weapons', async (req, res) => {
    try {
        const { serial_number, weapon_type, model, caliber, owner_id } = req.body;
        const license = `ЛИЦ-${Math.floor(Math.random()*10000)}-${Date.now() % 10000}`;
        const result = await pool.query(
            `INSERT INTO weapons (serial_number, weapon_type, model, caliber, owner_id, license_number)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [serial_number, weapon_type, model, caliber, owner_id, license]
        );
        res.json(result.rows[0]);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/weapons/:id/stolen', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `UPDATE weapons SET is_stolen = TRUE WHERE id = $1 RETURNING *`,
            [id]
        );
        res.json(result.rows[0]);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== ГИБДД-М (АВТОМОБИЛИ) ==========
app.get('/api/vehicles', async (req, res) => {
    try {
        const { plate } = req.query;
        if (plate) {
            const result = await pool.query(`
                SELECT v.*, c.nickname as owner_nickname
                FROM vehicles v
                LEFT JOIN citizens c ON v.owner_id = c.id
                WHERE v.plate_number ILIKE $1
            `, [`%${plate}%`]);
            return res.json(result.rows);
        }
        const result = await pool.query(`
            SELECT v.*, c.nickname as owner_nickname
            FROM vehicles v
            LEFT JOIN citizens c ON v.owner_id = c.id
            ORDER BY v.id DESC
        `);
        res.json(result.rows);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/vehicles', async (req, res) => {
    try {
        const { plate_number, brand, model, color, year, owner_id } = req.body;
        const result = await pool.query(
            `INSERT INTO vehicles (plate_number, brand, model, color, year, owner_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [plate_number, brand, model, color, year, owner_id]
        );
        res.json(result.rows[0]);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/vehicles/:id/stolen', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `UPDATE vehicles SET is_stolen = TRUE WHERE id = $1 RETURNING *`,
            [id]
        );
        res.json(result.rows[0]);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== ШТРАФЫ ПДД ==========
app.get('/api/violations', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT v.*, c.nickname as citizen_nickname
            FROM traffic_violations v
            LEFT JOIN citizens c ON v.citizen_id = c.id
            ORDER BY v.created_at DESC
        `);
        res.json(result.rows);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/violations', async (req, res) => {
    try {
        const { citizen_id, violation_type, fine_amount } = req.body;
        const violation_number = `НАР-${Date.now()}-${Math.floor(Math.random()*1000)}`;
        const result = await pool.query(
            `INSERT INTO traffic_violations (violation_number, citizen_id, violation_type, fine_amount)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [violation_number, citizen_id, violation_type, fine_amount || 0]
        );
        res.json(result.rows[0]);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/violations/:id/pay', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `UPDATE traffic_violations SET is_paid = TRUE WHERE id = $1 RETURNING *`,
            [id]
        );
        res.json(result.rows[0]);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== КУСП (ПРОИСШЕСТВИЯ) ==========
app.get('/api/incidents', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM incidents 
            ORDER BY 
                CASE priority WHEN 'Высший' THEN 1 WHEN 'Средний' THEN 2 ELSE 3 END,
                created_at DESC
            LIMIT 100
        `);
        res.json(result.rows);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/incidents', async (req, res) => {
    try {
        const { incident_type, address, description, priority } = req.body;
        const kusp_number = `КУСП-${Date.now()}-${Math.floor(Math.random()*10000)}`;
        const result = await pool.query(
            `INSERT INTO incidents (kusp_number, incident_type, address, description, priority)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [kusp_number, incident_type, address, description, priority || 'Средний']
        );
        res.json(result.rows[0]);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/incidents/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const result = await pool.query(
            `UPDATE incidents 
             SET status = $1, 
                 closed_at = CASE WHEN $1 = 'Закрыто' THEN NOW() ELSE closed_at END 
             WHERE id = $2 
             RETURNING *`,
            [status, id]
        );
        res.json(result.rows[0]);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== КРИМИНАЛЬНЫЙ РЕЕСТР ==========
app.get('/api/criminal', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT cr.*, c.nickname, c.full_name, c.passport_number
            FROM criminal_records cr
            JOIN citizens c ON cr.citizen_id = c.id
            WHERE cr.is_active = true
            ORDER BY cr.created_at DESC
        `);
        res.json(result.rows);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/criminal', async (req, res) => {
    try {
        const { citizen_id, crime_article, crime_description, sentence_type, sentence_term_years } = req.body;
        const result = await pool.query(
            `INSERT INTO criminal_records (citizen_id, crime_article, crime_description, sentence_type, sentence_term_years)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [citizen_id, crime_article, crime_description, sentence_type, sentence_term_years || 0]
        );
        res.json(result.rows[0]);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/criminal/:id/close', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `UPDATE criminal_records SET is_active = false WHERE id = $1 RETURNING *`,
            [id]
        );
        res.json(result.rows[0]);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== ДЕЖУРНАЯ СМЕНА ==========
app.get('/api/duty/active', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM duty_shifts 
            WHERE is_active = true 
            ORDER BY started_at DESC 
            LIMIT 1
        `);
        res.json(result.rows[0] || null);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/duty/start', async (req, res) => {
    try {
        const { server_id } = req.body;
        await pool.query(`UPDATE duty_shifts SET is_active = false, ended_at = NOW() WHERE is_active = true`);
        const result = await pool.query(
            `INSERT INTO duty_shifts (server_id) VALUES ($1) RETURNING *`,
            [server_id]
        );
        res.json(result.rows[0]);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/duty/end', async (req, res) => {
    try {
        const result = await pool.query(`
            UPDATE duty_shifts SET is_active = false, ended_at = NOW() 
            WHERE is_active = true 
            RETURNING *
        `);
        res.json(result.rows[0] || { message: 'Нет активной смены' });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== СТАТИСТИКА ==========
app.get('/api/stats', async (req, res) => {
    try {
        const citizens = await pool.query('SELECT COUNT(*) FROM citizens');
        const weapons = await pool.query('SELECT COUNT(*) FROM weapons');
        const wanted = await pool.query('SELECT COUNT(*) FROM citizens WHERE is_wanted = true');
        const vehicles = await pool.query('SELECT COUNT(*) FROM vehicles');
        const stolenVehicles = await pool.query('SELECT COUNT(*) FROM vehicles WHERE is_stolen = true');
        const violations = await pool.query('SELECT COUNT(*) FROM traffic_violations WHERE is_paid = false');
        const incidents = await pool.query("SELECT COUNT(*) FROM incidents WHERE status != 'Закрыто'");
        const criminals = await pool.query('SELECT COUNT(*) FROM criminal_records WHERE is_active = true');
        
        res.json({
            citizens: parseInt(citizens.rows[0].count),
            weapons: parseInt(weapons.rows[0].count),
            wanted: parseInt(wanted.rows[0].count),
            vehicles: parseInt(vehicles.rows[0].count),
            stolenVehicles: parseInt(stolenVehicles.rows[0].count),
            unpaidFines: parseInt(violations.rows[0].count),
            activeIncidents: parseInt(incidents.rows[0].count),
            criminals: parseInt(criminals.rows[0].count)
        });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== ЗАПУСК ==========
const PORT = process.env.PORT || 3000;

initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`╔════════════════════════════════════════════════════╗`);
        console.log(`║     ИСОД МВД РОССИИ - УМВД по г. Провинция        ║`);
        console.log(`║     🚀 Сервер запущен на порту ${PORT}                    ║`);
        console.log(`║     💾 База данных: PostgreSQL                     ║`);
        console.log(`╚════════════════════════════════════════════════════╝`);
    });
});
