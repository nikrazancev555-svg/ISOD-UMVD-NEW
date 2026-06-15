const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.static('.'));

// ПРОВЕРКА НАЛИЧИЯ БД
if (!process.env.DATABASE_URL) {
    console.error('❌ НЕТ БД! Добавь PostgreSQL: New → Database → PostgreSQL');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ========== ПРОСТОЙ ТЕСТОВЫЙ МАРШРУТ ==========
app.get('/api/test', (req, res) => {
    res.json({ message: 'Сервер работает!', time: new Date().toISOString() });
});

// ========== СОЗДАНИЕ ТАБЛИЦЫ ==========
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS citizens (
                id SERIAL PRIMARY KEY,
                nickname VARCHAR(100),
                full_name VARCHAR(255)
            )
        `);
        console.log('✅ Таблица создана');
    } catch(e) {
        console.log('⚠️ Ошибка создания таблицы:', e.message);
    }
}

// ========== МАРШРУТЫ ==========
app.get('/api/citizens', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM citizens');
        res.json(result.rows);
    } catch(e) {
        res.json([]);
    }
});

app.post('/api/citizens', async (req, res) => {
    try {
        const { nickname, full_name } = req.body;
        console.log('Получено:', nickname, full_name);
        
        const result = await pool.query(
            'INSERT INTO citizens (nickname, full_name) VALUES ($1, $2) RETURNING *',
            [nickname, full_name]
        );
        res.json(result.rows[0]);
    } catch(e) {
        console.error('Ошибка вставки:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ========== HTML СТРАНИЦА ==========
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>ИСОД МВД</title>
            <style>
                body { font-family: Arial; padding: 20px; }
                input, button { padding: 10px; margin: 5px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { padding: 10px; border-bottom: 1px solid #ddd; text-align: left; }
                th { background: #003366; color: white; }
            </style>
        </head>
        <body>
            <h1>🏛️ ИСОД МВД России</h1>
            <p>УМВД России по г. Провинция</p>
            
            <div>
                <h3>➕ Добавить гражданина</h3>
                <input type="text" id="nickname" placeholder="Никнейм">
                <input type="text" id="fullname" placeholder="ФИО">
                <button onclick="addCitizen()">Добавить</button>
            </div>
            
            <div>
                <h3>📋 Список граждан</h3>
                <table>
                    <thead><tr><th>ID</th><th>Никнейм</th><th>ФИО</th></tr></thead>
                    <tbody id="citizensList"></tbody>
                </table>
            </div>
            
            <script>
                async function api(url, options = {}) {
                    const res = await fetch(url, options);
                    return res.json();
                }
                
                async function loadCitizens() {
                    const citizens = await api('/api/citizens');
                    document.getElementById('citizensList').innerHTML = citizens.map(c => 
                        '<tr><td>' + c.id + '</td><td>' + c.nickname + '</td><td>' + c.full_name + '</td></tr>'
                    ).join('');
                }
                
                async function addCitizen() {
                    const nickname = document.getElementById('nickname').value;
                    const fullname = document.getElementById('fullname').value;
                    if (!nickname || !fullname) {
                        alert('Заполните поля');
                        return;
                    }
                    const result = await api('/api/citizens', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ nickname, full_name: fullname })
                    });
                    alert('✅ Добавлен! ID: ' + result.id);
                    document.getElementById('nickname').value = '';
                    document.getElementById('fullname').value = '';
                    loadCitizens();
                }
                
                loadCitizens();
            </script>
        </body>
        </html>
    `);
});

// ========== ЗАПУСК ==========
const PORT = process.env.PORT || 3000;

initDB().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Сервер запущен на порту ${PORT}`);
        console.log(`🌐 Открой: http://localhost:${PORT}`);
    });
});
