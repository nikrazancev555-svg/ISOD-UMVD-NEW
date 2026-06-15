const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.static('.'));

// ПОДКЛЮЧЕНИЕ К БД (ДЛЯ RAILWAY)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ========== ЛОГИРОВАНИЕ ==========
async function logAction(userId, action, entityType, entityId, details = null) {
    try {
        await pool.query(
            `INSERT INTO action_logs (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId || 1, action, entityType, entityId, details]
        );
    } catch(e) { console.error('Log error:', e); }
}

// ========== ГРАЖДАНЕ ==========
app.get('/api/citizens', async (req, res) => {
    const result = await pool.query(`
        SELECT c.*, 
               (SELECT COUNT(*) FROM weapons WHERE owner_id = c.id) as weapons_count,
               (SELECT COUNT(*) FROM criminal_records WHERE citizen_id = c.id AND is_active = true) as criminal_count,
               (SELECT COUNT(*) FROM vehicles WHERE owner_id = c.id) as vehicles_count,
               (SELECT COUNT(*) FROM traffic_violations WHERE citizen_id = c.id AND is_paid = false) as unpaid_fines
        FROM citizens c 
        ORDER BY c.id DESC
    `);
    res.json(result.rows);
});

app.get('/api/citizens/search', async (req, res) => {
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
});

app.post('/api/citizens', async (req, res) => {
    const { nickname, full_name, birth_date, phone, address } = req.body;
    
    const existing = await pool.query('SELECT id FROM citizens WHERE nickname = $1', [nickname]);
    if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Никнейм уже существует' });
    }
    
    const passport = `${Math.floor(Math.random()*9000+1000)} ${Math.floor(Math.random()*900000+100000)}`;
    
    const result = await pool.query(
        `INSERT INTO citizens (nickname, full_name, birth_date, phone, address, passport_number)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [nickname, full_name, birth_date, phone, address, passport]
    );
    
    await logAction(1, 'ДОБАВЛЕНИЕ', 'citizen', result.rows[0].id, `Добавлен гражданин ${full_name}`);
    res.json(result.rows[0]);
});

app.get('/api/citizens/:id', async (req, res) => {
    const { id } = req.params;
    const citizen = await pool.query('SELECT * FROM citizens WHERE id = $1', [id]);
    if (citizen.rows.length === 0) return res.status(404).json({ error: 'Не найден' });
    
    const weapons = await pool.query('SELECT * FROM weapons WHERE owner_id = $1', [id]);
    const vehicles = await pool.query('SELECT * FROM vehicles WHERE owner_id = $1', [id]);
    const criminal = await pool.query('SELECT * FROM criminal_records WHERE citizen_id = $1 AND is_active = true', [id]);
    const violations = await pool.query('SELECT * FROM traffic_violations WHERE citizen_id = $1 ORDER BY violation_date DESC LIMIT 10', [id]);
    
    res.json({ ...citizen.rows[0], weapons: weapons.rows, vehicles: vehicles.rows, criminal: criminal.rows, violations: violations.rows });
});

// ========== РОЗЫСК ==========
app.post('/api/citizens/:id/wanted', async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const result = await pool.query(
        `UPDATE citizens SET is_wanted = TRUE, wanted_reason = $1, wanted_since = NOW() WHERE id = $2 RETURNING *`,
        [reason || 'Подозревается в совершении преступления', id]
    );
    await logAction(1, 'РОЗЫСК', 'citizen', id, `Объявлен в розыск: ${reason}`);
    res.json(result.rows[0]);
});

app.post('/api/citizens/:id/unwanted', async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(
        `UPDATE citizens SET is_wanted = FALSE, wanted_reason = NULL, wanted_since = NULL WHERE id = $1 RETURNING *`,
        [id]
    );
    await logAction(1, 'СНЯТИЕ_РОЗЫСКА', 'citizen', id, `Снят с розыска`);
    res.json(result.rows[0]);
});

app.get('/api/wanted', async (req, res) => {
    const result = await pool.query(
        'SELECT * FROM citizens WHERE is_wanted = TRUE ORDER BY wanted_since DESC'
    );
    res.json(result.rows);
});

// ========== ОРУЖИЕ ==========
app.get('/api/weapons', async (req, res) => {
    const { serial } = req.query;
    if (serial) {
        const result = await pool.query(
            `SELECT w.*, c.nickname as owner_nickname, c.full_name as owner_name
             FROM weapons w LEFT JOIN citizens c ON w.owner_id = c.id
             WHERE w.serial_number ILIKE $1 LIMIT 20`,
            [`%${serial}%`]
        );
        return res.json(result.rows);
    }
    const result = await pool.query(`
        SELECT w.*, c.nickname as owner_nickname, c.full_name as owner_name
        FROM weapons w
        LEFT JOIN citizens c ON w.owner_id = c.id
        ORDER BY w.id DESC
    `);
    res.json(result.rows);
});

app.post('/api/weapons', async (req, res) => {
    const { serial_number, weapon_type, model, caliber, owner_id } = req.body;
    if (!serial_number || !weapon_type || !model) {
        return res.status(400).json({ error: 'Серийный номер, тип и модель обязательны' });
    }
    const existing = await pool.query('SELECT id FROM weapons WHERE serial_number = $1', [serial_number]);
    if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Оружие уже зарегистрировано' });
    }
    const license = `ЛИЦ-${Math.floor(Math.random()*10000)}-${Date.now() % 10000}`;
    const result = await pool.query(
        `INSERT INTO weapons (serial_number, weapon_type, model, caliber, owner_id, license_number)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [serial_number, weapon_type, model, caliber || null, owner_id || null, license]
    );
    await logAction(1, 'ДОБАВЛЕНИЕ_ОРУЖИЯ', 'weapon', result.rows[0].id, `${weapon_type} ${model}`);
    res.json(result.rows[0]);
});

app.post('/api/weapons/:id/stolen', async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(`UPDATE weapons SET is_stolen = TRUE, stolen_at = NOW() WHERE id = $1 RETURNING *`, [id]);
    await logAction(1, 'УГОН_ОРУЖИЯ', 'weapon', id, `Объявлено в угон`);
    res.json(result.rows[0]);
});

app.post('/api/weapons/:id/unstolen', async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(`UPDATE weapons SET is_stolen = FALSE, stolen_at = NULL WHERE id = $1 RETURNING *`, [id]);
    await logAction(1, 'СНЯТИЕ_УГОНА', 'weapon', id, `Снято с угона`);
    res.json(result.rows[0]);
});

app.get('/api/citizens/:id/weapons', async (req, res) => {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM weapons WHERE owner_id = $1 ORDER BY created_at DESC', [id]);
    res.json(result.rows);
});

// ========== КРИМИНАЛЬНЫЙ РЕЕСТР ==========
app.get('/api/criminal', async (req, res) => {
    const result = await pool.query(`
        SELECT cr.*, c.nickname, c.full_name, c.passport_number
        FROM criminal_records cr
        JOIN citizens c ON cr.citizen_id = c.id
        WHERE cr.is_active = true
        ORDER BY cr.created_at DESC
    `);
    res.json(result.rows);
});

app.get('/api/citizens/:id/criminal', async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(
        'SELECT * FROM criminal_records WHERE citizen_id = $1 ORDER BY created_at DESC',
        [id]
    );
    res.json(result.rows);
});

app.post('/api/criminal', async (req, res) => {
    const { citizen_id, record_type, crime_article, crime_description, crime_date, sentence_date, sentence_type, sentence_term_years, sentence_term_months, court_name, case_number, notes } = req.body;
    
    if (!citizen_id || !record_type || !crime_article) {
        return res.status(400).json({ error: 'ID гражданина, тип учёта и статья обязательны' });
    }
    
    const result = await pool.query(
        `INSERT INTO criminal_records (citizen_id, record_type, crime_article, crime_description, crime_date, sentence_date, sentence_type, sentence_term_years, sentence_term_months, court_name, case_number, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [citizen_id, record_type, crime_article, crime_description, crime_date, sentence_date, sentence_type, sentence_term_years || 0, sentence_term_months || 0, court_name, case_number, notes]
    );
    await logAction(1, 'ДОБАВЛЕНИЕ_ЗАПИСИ', 'criminal', result.rows[0].id, `${record_type}: ${crime_article}`);
    res.json(result.rows[0]);
});

app.put('/api/criminal/:id/close', async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(
        'UPDATE criminal_records SET is_active = false WHERE id = $1 RETURNING *',
        [id]
    );
    await logAction(1, 'ПОГАШЕНИЕ', 'criminal', id, `Запись погашена`);
    res.json(result.rows[0]);
});

app.delete('/api/criminal/:id', async (req, res) => {
    const { id } = req.params;
    await pool.query('DELETE FROM criminal_records WHERE id = $1', [id]);
    await logAction(1, 'УДАЛЕНИЕ', 'criminal', id, `Запись удалена`);
    res.json({ message: 'Запись удалена' });
});

// ========== ГИБДД: АВТОМОБИЛИ ==========
app.get('/api/vehicles', async (req, res) => {
    const { plate } = req.query;
    if (plate) {
        const result = await pool.query(
            `SELECT v.*, c.nickname as owner_nickname, c.full_name as owner_name
             FROM vehicles v
             LEFT JOIN citizens c ON v.owner_id = c.id
             WHERE v.plate_number ILIKE $1`,
            [`%${plate}%`]
        );
        return res.json(result.rows);
    }
    const result = await pool.query(`
        SELECT v.*, c.nickname as owner_nickname, c.full_name as owner_name
        FROM vehicles v
        LEFT JOIN citizens c ON v.owner_id = c.id
        ORDER BY v.id DESC
    `);
    res.json(result.rows);
});

app.post('/api/vehicles', async (req, res) => {
    const { plate_number, brand, model, color, year, vin, owner_id } = req.body;
    if (!plate_number || !brand || !model || !color) {
        return res.status(400).json({ error: 'Госномер, марка, модель и цвет обязательны' });
    }
    const existing = await pool.query('SELECT id FROM vehicles WHERE plate_number = $1', [plate_number]);
    if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Автомобиль с таким госномером уже зарегистрирован' });
    }
    const result = await pool.query(
        `INSERT INTO vehicles (plate_number, brand, model, color, year, vin, owner_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [plate_number, brand, model, color, year || null, vin || null, owner_id || null]
    );
    await logAction(1, 'ДОБАВЛЕНИЕ_АВТО', 'vehicle', result.rows[0].id, `${brand} ${model} (${plate_number})`);
    res.json(result.rows[0]);
});

app.post('/api/vehicles/:id/stolen', async (req, res) => {
    const { id } = req.params;
    const { description } = req.body;
    const result = await pool.query(
        `UPDATE vehicles SET is_stolen = TRUE, stolen_at = NOW(), stolen_description = $1 WHERE id = $2 RETURNING *`,
        [description, id]
    );
    await logAction(1, 'УГОН_АВТО', 'vehicle', id, description);
    res.json(result.rows[0]);
});

app.post('/api/vehicles/:id/unstolen', async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(
        `UPDATE vehicles SET is_stolen = FALSE, stolen_at = NULL, stolen_description = NULL WHERE id = $1 RETURNING *`,
        [id]
    );
    await logAction(1, 'СНЯТИЕ_УГОНА', 'vehicle', id, 'Автомобиль найден');
    res.json(result.rows[0]);
});

app.get('/api/citizens/:id/vehicles', async (req, res) => {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM vehicles WHERE owner_id = $1 ORDER BY created_at DESC', [id]);
    res.json(result.rows);
});

// ========== ГИБДД: НАРУШЕНИЯ ==========
app.get('/api/violations', async (req, res) => {
    const { citizen_id, vehicle_id } = req.query;
    let query = `
        SELECT v.*, c.nickname as citizen_nickname, c.full_name as citizen_name,
               ve.plate_number
        FROM traffic_violations v
        LEFT JOIN citizens c ON v.citizen_id = c.id
        LEFT JOIN vehicles ve ON v.vehicle_id = ve.id
        WHERE 1=1
    `;
    const params = [];
    if (citizen_id) {
        params.push(citizen_id);
        query += ` AND v.citizen_id = $${params.length}`;
    }
    if (vehicle_id) {
        params.push(vehicle_id);
        query += ` AND v.vehicle_id = $${params.length}`;
    }
    query += ` ORDER BY v.violation_date DESC LIMIT 100`;
    const result = await pool.query(query, params);
    res.json(result.rows);
});

app.post('/api/violations', async (req, res) => {
    const { citizen_id, vehicle_id, violation_type, location, fine_amount, points, description, officer_name } = req.body;
    if (!violation_type) {
        return res.status(400).json({ error: 'Тип нарушения обязателен' });
    }
    const violation_number = `НАР-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const result = await pool.query(
        `INSERT INTO traffic_violations (violation_number, citizen_id, vehicle_id, violation_type, location, fine_amount, points, description, officer_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [violation_number, citizen_id || null, vehicle_id || null, violation_type, location, fine_amount || 0, points || 0, description, officer_name]
    );
    await logAction(1, 'ДОБАВЛЕНИЕ_НАРУШЕНИЯ', 'violation', result.rows[0].id, `${violation_type} на сумму ${fine_amount}₽`);
    res.json(result.rows[0]);
});

app.put('/api/violations/:id/pay', async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(
        `UPDATE traffic_violations SET is_paid = TRUE WHERE id = $1 RETURNING *`,
        [id]
    );
    await logAction(1, 'ОПЛАТА_ШТРАФА', 'violation', id, 'Штраф оплачен');
    res.json(result.rows[0]);
});

// ========== КУСП (ПРОИСШЕСТВИЯ) ==========
app.get('/api/incidents', async (req, res) => {
    const { status } = req.query;
    let query = `
        SELECT i.*, 
               a.nickname as assigned_nickname,
               c.nickname as created_nickname
        FROM incidents i
        LEFT JOIN citizens a ON i.assigned_to = a.id
        LEFT JOIN citizens c ON i.created_by = c.id
        WHERE 1=1
    `;
    if (status && status !== 'all') {
        query += ` AND i.status = '${status}'`;
    }
    query += ` ORDER BY 
        CASE i.priority WHEN 'Высший' THEN 1 WHEN 'Средний' THEN 2 ELSE 3 END,
        i.created_at DESC
        LIMIT 100`;
    const result = await pool.query(query);
    res.json(result.rows);
});

app.post('/api/incidents', async (req, res) => {
    const { incident_type, address, description, priority, assigned_to } = req.body;
    if (!incident_type || !address || !description) {
        return res.status(400).json({ error: 'Тип, адрес и описание обязательны' });
    }
    const kusp_number = `КУСП-${Date.now()}-${Math.floor(Math.random()*10000)}`;
    const result = await pool.query(
        `INSERT INTO incidents (kusp_number, incident_type, address, description, priority, assigned_to, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [kusp_number, incident_type, address, description, priority || 'Средний', assigned_to || null, 1]
    );
    await logAction(1, 'СОЗДАНИЕ_КУСП', 'incident', result.rows[0].id, `${incident_type} по адресу ${address}`);
    res.json(result.rows[0]);
});

app.put('/api/incidents/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const result = await pool.query(
        `UPDATE incidents SET status = $1, closed_at = CASE WHEN $1 = 'Закрыто' THEN NOW() ELSE closed_at END WHERE id = $2 RETURNING *`,
        [status, id]
    );
    await logAction(1, 'ИЗМЕНЕНИЕ_СТАТУСА', 'incident', id, `Новый статус: ${status}`);
    res.json(result.rows[0]);
});

// ========== ДЕЖУРНАЯ СМЕНА ==========
app.get('/api/duty/active', async (req, res) => {
    const result = await pool.query(`
        SELECT ds.*, c.nickname, c.full_name
        FROM duty_shifts ds
        LEFT JOIN citizens c ON ds.user_id = c.id
        WHERE ds.is_active = true
        ORDER BY ds.started_at DESC LIMIT 1
    `);
    res.json(result.rows[0] || null);
});

app.post('/api/duty/start', async (req, res) => {
    const { server_id, user_id } = req.body;
    if (!server_id) return res.status(400).json({ error: 'Server ID обязателен' });
    
    await pool.query(`UPDATE duty_shifts SET is_active = false, ended_at = NOW() WHERE user_id = $1 AND is_active = true`, [user_id || 1]);
    const shift_number = `СМ-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const result = await pool.query(
        `INSERT INTO duty_shifts (shift_number, server_id, user_id) VALUES ($1, $2, $3) RETURNING *`,
        [shift_number, server_id, user_id || 1]
    );
    await logAction(1, 'НАЧАЛО_СМЕНЫ', 'duty', result.rows[0].id, `Server ID: ${server_id}`);
    res.json(result.rows[0]);
});

app.post('/api/duty/end', async (req, res) => {
    const { user_id } = req.body;
    const result = await pool.query(
        `UPDATE duty_shifts SET is_active = false, ended_at = NOW() WHERE user_id = $1 AND is_active = true RETURNING *`,
        [user_id || 1]
    );
    await logAction(1, 'КОНЕЦ_СМЕНЫ', 'duty', result.rows[0]?.id, 'Смена завершена');
    res.json(result.rows[0] || { message: 'Нет активной смены' });
});

// ========== СЭД: ДОКУМЕНТЫ ==========
app.get('/api/documents', async (req, res) => {
    const result = await pool.query(`
        SELECT d.*, c.nickname as creator_nickname
        FROM documents d
        LEFT JOIN citizens c ON d.created_by = c.id
        ORDER BY d.created_at DESC LIMIT 100
    `);
    res.json(result.rows);
});

app.post('/api/documents', async (req, res) => {
    const { doc_type, title, content } = req.body;
    if (!doc_type || !title || !content) {
        return res.status(400).json({ error: 'Тип, заголовок и содержание обязательны' });
    }
    const doc_number = `ДОК-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const result = await pool.query(
        `INSERT INTO documents (doc_number, doc_type, title, content, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [doc_number, doc_type, title, content, 1]
    );
    await logAction(1, 'СОЗДАНИЕ_ДОКУМЕНТА', 'document', result.rows[0].id, `${doc_type}: ${title}`);
    res.json(result.rows[0]);
});

app.put('/api/documents/:id/sign', async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(
        `UPDATE documents SET status = 'Подписан', signed_by = $1, signed_at = NOW() WHERE id = $2 RETURNING *`,
        [1, id]
    );
    await logAction(1, 'ПОДПИСАНИЕ_ДОКУМЕНТА', 'document', id, 'Подписан ЭЦП');
    res.json(result.rows[0]);
});

// ========== ЖУРНАЛ ДЕЙСТВИЙ ==========
app.get('/api/logs', async (req, res) => {
    const { limit = 100 } = req.query;
    const result = await pool.query(`
        SELECT l.*, c.nickname as user_nickname
        FROM action_logs l
        LEFT JOIN citizens c ON l.user_id = c.id
        ORDER BY l.created_at DESC
        LIMIT $1
    `, [limit]);
    res.json(result.rows);
});

// ========== СТАТИСТИКА ==========
app.get('/api/stats', async (req, res) => {
    const citizens = await pool.query('SELECT COUNT(*) FROM citizens');
    const weapons = await pool.query('SELECT COUNT(*) FROM weapons');
    const criminal = await pool.query('SELECT COUNT(*) FROM criminal_records WHERE is_active = true');
    const wanted = await pool.query('SELECT COUNT(*) FROM citizens WHERE is_wanted = true');
    const stolenWeapons = await pool.query('SELECT COUNT(*) FROM weapons WHERE is_stolen = true');
    const vehicles = await pool.query('SELECT COUNT(*) FROM vehicles');
    const stolenVehicles = await pool.query('SELECT COUNT(*) FROM vehicles WHERE is_stolen = true');
    const violations = await pool.query('SELECT COUNT(*) FROM traffic_violations');
    const unpaidFines = await pool.query('SELECT COUNT(*) FROM traffic_violations WHERE is_paid = false');
    const activeIncidents = await pool.query("SELECT COUNT(*) FROM incidents WHERE status != 'Закрыто'");
    const activeDuty = await pool.query('SELECT COUNT(*) FROM duty_shifts WHERE is_active = true');
    const documents = await pool.query("SELECT COUNT(*) FROM documents WHERE status = 'Черновик'");
    
    res.json({
        citizens: parseInt(citizens.rows[0].count),
        weapons: parseInt(weapons.rows[0].count),
        criminal: parseInt(criminal.rows[0].count),
        wanted: parseInt(wanted.rows[0].count),
        stolenWeapons: parseInt(stolenWeapons.rows[0].count),
        vehicles: parseInt(vehicles.rows[0].count),
        stolenVehicles: parseInt(stolenVehicles.rows[0].count),
        violations: parseInt(violations.rows[0].count),
        unpaidFines: parseInt(unpaidFines.rows[0].count),
        activeIncidents: parseInt(activeIncidents.rows[0].count),
        activeDuty: parseInt(activeDuty.rows[0].count),
        draftDocuments: parseInt(documents.rows[0].count)
    });
});

// ========== ЗАПУСК ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ ИСОД МВД России запущен на порту ${PORT}`);
});