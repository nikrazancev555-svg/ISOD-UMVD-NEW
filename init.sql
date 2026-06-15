-- ============================================
-- ИСОД МВД РОССИИ - ПОЛНАЯ БАЗА ДАННЫХ
-- УМВД России по г. Провинция
-- ============================================

-- 1. ГРАЖДАНЕ
CREATE TABLE IF NOT EXISTS citizens (
    id SERIAL PRIMARY KEY,
    nickname VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    birth_date DATE,
    phone VARCHAR(20),
    address TEXT,
    passport_number VARCHAR(20) UNIQUE,
    is_wanted BOOLEAN DEFAULT FALSE,
    wanted_reason TEXT,
    wanted_since TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. ОРУЖИЕ
CREATE TABLE IF NOT EXISTS weapons (
    id SERIAL PRIMARY KEY,
    serial_number VARCHAR(50) UNIQUE NOT NULL,
    weapon_type VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    caliber VARCHAR(20),
    owner_id INTEGER REFERENCES citizens(id) ON DELETE SET NULL,
    license_number VARCHAR(50),
    is_stolen BOOLEAN DEFAULT FALSE,
    stolen_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. КРИМИНАЛЬНЫЙ РЕЕСТР
CREATE TABLE IF NOT EXISTS criminal_records (
    id SERIAL PRIMARY KEY,
    citizen_id INTEGER REFERENCES citizens(id) ON DELETE CASCADE,
    record_type VARCHAR(50) NOT NULL,
    crime_article VARCHAR(50) NOT NULL,
    crime_description TEXT,
    crime_date DATE,
    sentence_date DATE,
    sentence_type VARCHAR(100),
    sentence_term_years INTEGER DEFAULT 0,
    sentence_term_months INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    court_name VARCHAR(255),
    case_number VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 4. ЖУРНАЛ ДЕЙСТВИЙ
CREATE TABLE IF NOT EXISTS action_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INTEGER,
    details TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 5. ГИБДД: АВТОМОБИЛИ
CREATE TABLE IF NOT EXISTS vehicles (
    id SERIAL PRIMARY KEY,
    plate_number VARCHAR(20) UNIQUE NOT NULL,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    color VARCHAR(50) NOT NULL,
    year INTEGER,
    vin VARCHAR(17),
    owner_id INTEGER REFERENCES citizens(id) ON DELETE SET NULL,
    is_stolen BOOLEAN DEFAULT FALSE,
    stolen_at TIMESTAMP,
    stolen_description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 6. ГИБДД: НАРУШЕНИЯ
CREATE TABLE IF NOT EXISTS traffic_violations (
    id SERIAL PRIMARY KEY,
    violation_number VARCHAR(50) UNIQUE,
    citizen_id INTEGER REFERENCES citizens(id) ON DELETE SET NULL,
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    violation_type VARCHAR(100) NOT NULL,
    violation_date TIMESTAMP DEFAULT NOW(),
    location TEXT,
    fine_amount DECIMAL(10,2),
    points INTEGER DEFAULT 0,
    is_paid BOOLEAN DEFAULT FALSE,
    description TEXT,
    officer_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 7. КУСП: ПРОИСШЕСТВИЯ
CREATE TABLE IF NOT EXISTS incidents (
    id SERIAL PRIMARY KEY,
    kusp_number VARCHAR(50) UNIQUE,
    incident_type VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'Средний',
    status VARCHAR(20) DEFAULT 'Зарегистрировано',
    assigned_to INTEGER REFERENCES citizens(id),
    created_by INTEGER REFERENCES citizens(id),
    created_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP
);

-- 8. ДЕЖУРНАЯ СМЕНА
CREATE TABLE IF NOT EXISTS duty_shifts (
    id SERIAL PRIMARY KEY,
    shift_number VARCHAR(50) UNIQUE,
    server_id VARCHAR(100) NOT NULL,
    user_id INTEGER REFERENCES citizens(id),
    started_at TIMESTAMP DEFAULT NOW(),
    ended_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- 9. СЭД: ДОКУМЕНТЫ
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    doc_number VARCHAR(50) UNIQUE,
    doc_type VARCHAR(50) NOT NULL,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'Черновик',
    created_by INTEGER REFERENCES citizens(id),
    signed_by INTEGER REFERENCES citizens(id),
    created_at TIMESTAMP DEFAULT NOW(),
    signed_at TIMESTAMP
);

-- ТЕСТОВЫЙ ПОЛЬЗОВАТЕЛЬ
INSERT INTO citizens (nickname, full_name, passport_number) 
VALUES ('system', 'Система', '0000 000000') ON CONFLICT (nickname) DO NOTHING;

-- ИНДЕКСЫ
CREATE INDEX IF NOT EXISTS idx_citizens_nickname ON citizens(nickname);
CREATE INDEX IF NOT EXISTS idx_citizens_full_name ON citizens(full_name);
CREATE INDEX IF NOT EXISTS idx_citizens_wanted ON citizens(is_wanted);
CREATE INDEX IF NOT EXISTS idx_weapons_serial ON weapons(serial_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(plate_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_owner ON vehicles(owner_id);
CREATE INDEX IF NOT EXISTS idx_violations_citizen ON traffic_violations(citizen_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_duty_active ON duty_shifts(is_active);
CREATE INDEX IF NOT EXISTS idx_logs_created ON action_logs(created_at);

-- ВСЁ ГОТОВО!