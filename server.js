const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.static('.'));

// ПОДКЛЮЧЕНИЕ К БД
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ========== СОЗДАНИЕ ТАБЛИЦ ==========
async function initDatabase() {
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
}

// ========== ГРАЖДАНЕ ==========
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
        `SELECT * FROM citizens WHERE full_name ILIKE $1 OR nickname ILIKE $1 OR phone ILIKE $1 LIMIT 50`,
        [`%${q}%`]
    );
    res.json(result.rows);
});

// ========== РОЗЫСК ==========
app.get('/api/wanted', async (req, res) => {
    const result = await pool.query('SELECT * FROM citizens WHERE is_wanted = TRUE ORDER BY wanted_since DESC');
    res.json(result.rows);
});

app.post('/api/citizens/:id/wanted', async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const result = await pool.query(
        `UPDATE citizens SET is_wanted = TRUE, wanted_reason = $1, wanted_since = NOW() WHERE id = $2 RETURNING *`,
        [reason || 'Подозревается в преступлении', id]
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

// ========== СТАТИСТИКА ==========
app.get('/api/stats', async (req, res) => {
    const citizens = await pool.query('SELECT COUNT(*) FROM citizens');
    const wanted = await pool.query('SELECT COUNT(*) FROM citizens WHERE is_wanted = true');
    res.json({
        citizens: parseInt(citizens.rows[0].count),
        wanted: parseInt(wanted.rows[0].count)
    });
});

// ========== ЗАПУСК ==========
const PORT = process.env.PORT || 3000;

initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`✅ ИСОД МВД запущен на порту ${PORT}`);
    });
});
