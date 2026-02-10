-- Source tracking migration for students and leads tables
-- PostgreSQL

-- Students table: add source tracking columns
ALTER TABLE students ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'walk_in';
ALTER TABLE students ADD COLUMN IF NOT EXISTS referred_by_type VARCHAR(20);
ALTER TABLE students ADD COLUMN IF NOT EXISTS referred_by_id INTEGER;
ALTER TABLE students ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES leads(id);
ALTER TABLE students ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);

-- Leads table: add referral tracking columns
ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referred_by_type VARCHAR(20);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referred_by_id INTEGER;

-- Make leads.source NOT NULL with default
ALTER TABLE leads ALTER COLUMN source SET DEFAULT 'walk_in';
ALTER TABLE leads ALTER COLUMN source SET NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_students_source ON students(source);
CREATE INDEX IF NOT EXISTS idx_students_lead_id ON students(lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
