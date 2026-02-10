-- Learning Center CRM Database Schema V2
-- PostgreSQL - Enhanced schema per TRD requirements

-- Enhanced students table (add missing TRD fields)
ALTER TABLE students ADD COLUMN IF NOT EXISTS gender VARCHAR(10);
ALTER TABLE students ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_email VARCHAR(100);
ALTER TABLE students ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(100);
ALTER TABLE students ADD COLUMN IF NOT EXISTS emergency_phone VARCHAR(20);
ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url VARCHAR(255);

-- Enhanced groups table
ALTER TABLE groups ADD COLUMN IF NOT EXISTS level VARCHAR(50);
ALTER TABLE groups ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS pricing_type VARCHAR(20) DEFAULT 'monthly';
ALTER TABLE groups ADD COLUMN IF NOT EXISTS schedule_days VARCHAR(50);
ALTER TABLE groups ADD COLUMN IF NOT EXISTS schedule_time_start TIME;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS schedule_time_end TIME;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS room VARCHAR(50);

-- Enhanced users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Group schedules
CREATE TABLE IF NOT EXISTS group_schedules (
    id SERIAL PRIMARY KEY,
    group_id INT REFERENCES groups(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 6=Saturday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    classroom VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_group_schedules_group ON group_schedules(group_id);

-- Documents storage
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(20) NOT NULL, -- student, teacher, group
    entity_id INT NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    file_path VARCHAR(500),
    file_size INT,
    mime_type VARCHAR(100),
    uploaded_by INT REFERENCES users(id),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);

-- Communication log for CRM
CREATE TABLE IF NOT EXISTS communication_log (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,
    lead_id INT REFERENCES leads(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL, -- call, meeting, email, note, sms
    subject VARCHAR(255),
    content TEXT,
    outcome VARCHAR(50), -- positive, neutral, negative, no_answer
    next_action VARCHAR(255),
    next_action_date DATE,
    logged_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (student_id IS NOT NULL OR lead_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_communication_log_student ON communication_log(student_id);
CREATE INDEX IF NOT EXISTS idx_communication_log_lead ON communication_log(lead_id);

-- System settings
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT,
    description VARCHAR(255),
    updated_by INT REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT INTO settings (key, value, description) VALUES
    ('organization_name', 'Learning Center', 'Name of the organization'),
    ('currency', 'USD', 'Default currency'),
    ('session_timeout', '30', 'Session timeout in minutes'),
    ('payment_reminder_days', '7', 'Days before payment due to send reminder')
ON CONFLICT (key) DO NOTHING;

-- Enhanced teachers table
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(100);
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS emergency_phone VARCHAR(20);
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS notes TEXT;

-- Enhanced payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_url VARCHAR(255);

-- Enhanced expenses table
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vendor VARCHAR(100);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_url VARCHAR(255);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_by INT REFERENCES users(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'approved';

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    link VARCHAR(255),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- Student notes/journal
CREATE TABLE IF NOT EXISTS student_notes (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    note_type VARCHAR(50) NOT NULL, -- progress, behavior, health, general
    content TEXT NOT NULL,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_student_notes_student ON student_notes(student_id);

-- Payment plans (for installments)
CREATE TABLE IF NOT EXISTS payment_plans (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    group_id INT REFERENCES groups(id),
    total_amount DECIMAL(10,2) NOT NULL,
    installments INT NOT NULL,
    start_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_plan_items (
    id SERIAL PRIMARY KEY,
    plan_id INT NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
    due_date DATE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_id INT REFERENCES payments(id),
    status VARCHAR(20) DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_payment_plan_items_plan ON payment_plan_items(plan_id);

-- Audit trail for important changes
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

-- Group transfers history (track student movements between groups)
CREATE TABLE IF NOT EXISTS group_transfers (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    from_group_id INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    to_group_id INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reason TEXT,
    paid_month DATE,  -- If student paid for this month in source group, they don't pay in target
    discount_percentage DECIMAL(5,2) DEFAULT 0,  -- Discount in the new group
    transferred_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_group_transfers_student ON group_transfers(student_id);
CREATE INDEX IF NOT EXISTS idx_group_transfers_from ON group_transfers(from_group_id);
CREATE INDEX IF NOT EXISTS idx_group_transfers_to ON group_transfers(to_group_id);

-- Create additional indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_students_created ON students(created_at);
CREATE INDEX IF NOT EXISTS idx_teachers_created ON teachers(created_at);
CREATE INDEX IF NOT EXISTS idx_groups_created ON groups(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_follow_up ON leads(follow_up_date) WHERE status IN ('new', 'contacted', 'trial');
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_group ON enrollments(group_id);
