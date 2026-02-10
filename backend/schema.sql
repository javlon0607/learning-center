-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    role VARCHAR(100) DEFAULT 'user',
    teacher_id INT,
    email VARCHAR(100),
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin user (password: password)
INSERT INTO users (username, password, name, role, is_active)
VALUES ('admin', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Administrator', 'admin', true)
ON CONFLICT (username) DO NOTHING;

-- Students table
CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    dob DATE,
    phone VARCHAR(20),
    email VARCHAR(100),
    parent_name VARCHAR(100),
    parent_phone VARCHAR(20),
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    source VARCHAR(30) NOT NULL DEFAULT 'walk_in',
    referred_by_type VARCHAR(20),
    referred_by_id INTEGER,
    lead_id INTEGER,
    created_by INTEGER,
    deleted_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teachers table
CREATE TABLE IF NOT EXISTS teachers (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100),
    subjects TEXT,
    salary_type VARCHAR(20) DEFAULT 'fixed',
    salary_amount DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Groups table
CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    subject VARCHAR(100),
    teacher_id INT REFERENCES teachers(id),
    capacity INT DEFAULT 15,
    price DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'active',
    schedule_days TEXT,
    schedule_time_start TEXT,
    schedule_time_end TEXT,
    room TEXT,
    deleted_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enrollments table
CREATE TABLE IF NOT EXISTS enrollments (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    group_id INT REFERENCES groups(id) ON DELETE CASCADE,
    enrolled_at DATE DEFAULT CURRENT_DATE,
    discount_percentage DECIMAL(5,2) DEFAULT 0,
    UNIQUE(student_id, group_id)
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id),
    group_id INT REFERENCES groups(id),
    amount DECIMAL(10,2) NOT NULL,
    payment_date DATE DEFAULT CURRENT_DATE,
    method VARCHAR(20) DEFAULT 'cash',
    notes TEXT,
    deleted_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment months table
CREATE TABLE IF NOT EXISTS payment_months (
    id SERIAL PRIMARY KEY,
    payment_id INT REFERENCES payments(id) ON DELETE CASCADE,
    for_month DATE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(payment_id, for_month)
);

-- Attendance table
CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id),
    group_id INT REFERENCES groups(id),
    attendance_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'present',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, group_id, attendance_date)
);

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    description TEXT,
    expense_date DATE DEFAULT CURRENT_DATE,
    deleted_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Salary slips table
CREATE TABLE IF NOT EXISTS salary_slips (
    id SERIAL PRIMARY KEY,
    teacher_id INT REFERENCES teachers(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    base_amount DECIMAL(10,2) NOT NULL,
    bonus DECIMAL(10,2) DEFAULT 0,
    deduction DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    paid_at TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id INT,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INT,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(50),
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100),
    parent_name VARCHAR(100),
    parent_phone VARCHAR(20),
    source VARCHAR(30) NOT NULL DEFAULT 'walk_in',
    status VARCHAR(20) DEFAULT 'new',
    priority VARCHAR(10) DEFAULT 'warm',
    notes TEXT,
    follow_up_date DATE,
    interested_courses TEXT,
    trial_date DATE,
    trial_group_id INT,
    birth_year INT,
    preferred_schedule TEXT,
    budget VARCHAR(50),
    loss_reason TEXT,
    last_contact_date DATE,
    converted_student_id INT,
    created_by INTEGER,
    referred_by_type VARCHAR(20),
    referred_by_id INTEGER,
    deleted_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
