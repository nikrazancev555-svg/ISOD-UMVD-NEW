const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('.'));

// ПОДКЛЮЧЕНИЕ К БД
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ГЛАВНАЯ СТРАНИЦА
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ========== СОЗДАНИЕ ТАБЛИЦЫ ==========
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS citizens (
                id SERIAL PRIMARY KEY,
                nickname VARCHAR(100) UNIQUE,
                full_name VARCHAR(255),
                passport_number VARCHAR(20),
                is_wanted BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Таблица citizens готова');
        return true;
    } catch(e) {
        console.error('❌ Ошибка:', e.message);
        return false;
    }
}

// ========== ВСЕ ГРАЖДАНЕ ==========
app.get('/api/citizens', async (req, res) => {
    const result = await pool.query('SELECT * FROM citizens ORDER BY id DESC');
    res.json(result.rows);
});

// ========== ДОБАВИТЬ ГРАЖДАНИНА ==========
app.post('/api/citizens', async (req, res) => {
    console.log('📥 Получен запрос на добавление:', req.body);
    
    const { nickname, full_name } = req.body;
    
    if (!nickname || !full_name) {
        return res.status(400).json({ error: 'Никнейм и ФИО обязательны' });
    }
    
    const passport = `${Math.floor(Math.random()*9000+1000)} ${Math.floor(Math.random()*900000+100000)}`;
    
    const result = await pool.query(
        `INSERT INTO citizens (nickname, full_name, passport_number) 
         VALUES ($1, $2, $3) 
         RETURNING *`,
        [nickname, full_name, passport]
    );
    
    console.log('✅ Гражданин добавлен:', result.rows[0]);
    res.json(result.rows[0]);
});

// ========== РОЗЫСК ==========
app.get('/api/wanted', async (req, res) => {
    const result = await pool.query('SELECT * FROM citizens WHERE is_wanted = TRUE');
    res.json(result.rows);
});

app.post('/api/citizens/:id/wanted', async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(
        'UPDATE citizens SET is_wanted = TRUE WHERE id = $1 RETURNING *',
        [id]
    );
    res.json(result.rows[0]);
});

app.post('/api/citizens/:id/unwanted', async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(
        'UPDATE citizens SET is_wanted = FALSE WHERE id = $1 RETURNING *',
        [id]
    );
    res.json(result.rows[0]);
});

// ========== СТАТИСТИКА ==========
app.get('/api/stats', async (req, res) => {
    const citizens = await pool.query('SELECT COUNT(*) FROM citizens');
    const wanted = await pool.query('SELECT COUNT(*) FROM citizens WHERE is_wanted = TRUE');
    res.json({
        citizens: parseInt(citizens.rows[0].count),
        wanted: parseInt(wanted.rows[0].count)
    });
});

// ========== ЗАПУСК ==========
const PORT = process.env.PORT || 3000;

initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`╔════════════════════════════════╗`);
        console.log(`║   ИСОД МВД РОССИИ             ║`);
        console.log(`║   Порт: ${PORT}                    ║`);
        console.log(`╚════════════════════════════════╝`);
    });
});
