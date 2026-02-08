<?php
// config.php - Database and app configuration (TRD-aligned)

define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_PORT', getenv('DB_PORT') ?: '5432');
define('DB_NAME', getenv('DB_NAME') ?: 'learning_crm');
define('DB_USER', getenv('DB_USER') ?: 'postgres');
define('DB_PASS', getenv('DB_PASS') ?: 'admin');
define('SESSION_TIMEOUT_MINUTES', (int)(getenv('SESSION_TIMEOUT') ?: 30));
if (!defined('IS_API')) {
    $uri = $_SERVER['REQUEST_URI'] ?? '';
    define('IS_API', strpos($uri, '/api') !== false || !empty($_SERVER['HTTP_X_REQUESTED_WITH']));
}

function db() {
    static $pdo = null;
    if (!$pdo) {
        try {
            $pdo = new PDO(
                "pgsql:host=".DB_HOST.";port=".DB_PORT.";dbname=".DB_NAME,
                DB_USER, DB_PASS,
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
            );
        } catch(PDOException $e) {
            die(json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]));
        }
    }
    return $pdo;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function checkSessionTimeout() {
    if (!isset($_SESSION['user'])) return false;
    $last = $_SESSION['last_activity'] ?? 0;
    if (time() - $last > SESSION_TIMEOUT_MINUTES * 60) {
        unset($_SESSION['user'], $_SESSION['last_activity']);
        return false;
    }
    $_SESSION['last_activity'] = time();
    return true;
}

function auth() {
    if (!checkSessionTimeout()) {
        if (IS_API) {
            header('Content-Type: application/json');
            http_response_code(401);
            die(json_encode(['error' => 'Unauthorized', 'code' => 'SESSION_EXPIRED']));
        }
        header('Location: /index.php');
        exit;
    }
    // Re-check is_active so deactivated users are logged out on next request
    $userId = $_SESSION['user']['id'] ?? null;
    if ($userId) {
        try {
            $stmt = db()->prepare("SELECT is_active FROM users WHERE id = ?");
            $stmt->execute([$userId]);
            $row = $stmt->fetch();
            if ($row && isset($row['is_active']) && ($row['is_active'] === false || $row['is_active'] === 'f' || $row['is_active'] === 0)) {
                unset($_SESSION['user'], $_SESSION['last_activity']);
                if (IS_API) {
                    header('Content-Type: application/json');
                    http_response_code(403);
                    die(json_encode(['error' => 'Account is deactivated.', 'code' => 'ACCOUNT_DEACTIVATED']));
                }
                header('Location: /index.php');
                exit;
            }
        } catch (Exception $e) { /* ignore */ }
    }
}

function requireRole($allowed) {
    auth();
    $roleStr = $_SESSION['user']['role'] ?? 'user';
    $userRoles = array_map('trim', explode(',', $roleStr));
    $userRoles = array_filter($userRoles);
    if (empty($userRoles)) $userRoles = ['user'];
    $allowed = is_array($allowed) ? $allowed : [$allowed];
    $hasAny = count(array_intersect($userRoles, $allowed)) > 0;
    if (!$hasAny) {
        if (IS_API) {
            header('Content-Type: application/json');
            http_response_code(403);
            die(json_encode(['error' => 'Forbidden']));
        }
        die('Access denied');
    }
}

function activityLog($action, $entity = null, $entityId = null, $details = null) {
    $userId = $_SESSION['user']['id'] ?? null;
    try {
        $stmt = db()->prepare("INSERT INTO activity_log (user_id, action, entity, entity_id, details) VALUES (?,?,?,?,?)");
        $stmt->execute([$userId, $action, $entity, $entityId, $details]);
    } catch (Exception $e) { /* ignore */ }
}

/**
 * Audit log: who changed, before/after values, timestamp.
 * Use for Payments, Discounts, Attendance, Salaries.
 */
function auditLog($action, $entityType, $entityId, $oldValues = null, $newValues = null) {
    $userId = $_SESSION['user']['id'] ?? null;
    $ip = $_SERVER['REMOTE_ADDR'] ?? null;
    $oldJson = $oldValues !== null ? json_encode($oldValues, JSON_UNESCAPED_UNICODE) : null;
    $newJson = $newValues !== null ? json_encode($newValues, JSON_UNESCAPED_UNICODE) : null;
    try {
        $stmt = db()->prepare("INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_values, new_values, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$userId, $action, $entityType, $entityId, $oldJson, $newJson, $ip]);
    } catch (Exception $e) { /* ignore */ }
}

function initDB() {
    $sql = "
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100),
        role VARCHAR(100) DEFAULT 'user',
        email VARCHAR(100),
        phone VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
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
    
    CREATE TABLE IF NOT EXISTS groups (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        subject VARCHAR(100),
        teacher_id INT REFERENCES teachers(id),
        capacity INT DEFAULT 15,
        price DECIMAL(10,2),
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS enrollments (
        id SERIAL PRIMARY KEY,
        student_id INT REFERENCES students(id) ON DELETE CASCADE,
        group_id INT REFERENCES groups(id) ON DELETE CASCADE,
        enrolled_at DATE DEFAULT CURRENT_DATE,
        discount_percentage DECIMAL(5,2) DEFAULT 0,
        UNIQUE(student_id, group_id)
    );
    
    CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        student_id INT REFERENCES students(id),
        group_id INT REFERENCES groups(id),
        amount DECIMAL(10,2) NOT NULL,
        payment_date DATE DEFAULT CURRENT_DATE,
        method VARCHAR(20) DEFAULT 'cash',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        category VARCHAR(50),
        amount DECIMAL(10,2) NOT NULL,
        description TEXT,
        expense_date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    INSERT INTO users (username, password, name, role) 
    SELECT 'admin', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Administrator', 'admin'
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');
    ";
    
    foreach(explode(';', $sql) as $query) {
        if (trim($query)) db()->exec($query);
    }

    // Ensure users table has email, phone, is_active, last_login, teacher_id (for existing DBs)
    $userColumns = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(100)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP",
    ];
    try {
        db()->exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS teacher_id INT");
    } catch (PDOException $e) { /* ignore */ }
    try {
        db()->exec("ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(100)");
    } catch (PDOException $e) { /* ignore */ }
    foreach ($userColumns as $alter) {
        try { db()->exec($alter); } catch (PDOException $e) { /* ignore */ }
    }

    $additions = __DIR__ . '/schema_additions.sql';
    if (file_exists($additions)) {
        $addSql = file_get_contents($additions);
        // Remove SQL comments before processing
        $addSql = preg_replace('/--[^\n]*\n/', "\n", $addSql);
        foreach (explode(';', $addSql) as $q) {
            $q = trim($q);
            if ($q === '') continue;
            if (stripos($q, 'CREATE') === 0 || stripos($q, 'INSERT') === 0) {
                try { db()->exec($q); } catch (PDOException $e) { /* ignore */ }
            }
        }
    }

    // Load schema v2 enhancements
    $schemaV2 = __DIR__ . '/schema_v2.sql';
    if (file_exists($schemaV2)) {
        $v2Sql = file_get_contents($schemaV2);
        // Remove SQL comments before processing
        $v2Sql = preg_replace('/--[^\n]*\n/', "\n", $v2Sql);
        foreach (explode(';', $v2Sql) as $q) {
            $q = trim($q);
            if ($q === '') continue;
            if (stripos($q, 'CREATE') === 0 || stripos($q, 'ALTER') === 0 || stripos($q, 'INSERT') === 0) {
                try { db()->exec($q); } catch (PDOException $e) { /* ignore duplicates */ }
            }
        }
    }

    // Add discount_percentage to enrollments for existing DBs
    try {
        db()->exec("ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS discount_percentage DECIMAL(5,2) DEFAULT 0");
    } catch (PDOException $e) { /* ignore */ }

    // Create payment_months table for month tracking
    $paymentMonthsSql = "
    CREATE TABLE IF NOT EXISTS payment_months (
        id SERIAL PRIMARY KEY,
        payment_id INT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
        for_month DATE NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(payment_id, for_month)
    )";
    try { db()->exec($paymentMonthsSql); } catch (PDOException $e) { /* ignore */ }

    // Create indexes for payment_months
    try { db()->exec("CREATE INDEX IF NOT EXISTS idx_payment_months_payment ON payment_months(payment_id)"); } catch (PDOException $e) { /* ignore */ }
    try { db()->exec("CREATE INDEX IF NOT EXISTS idx_payment_months_month ON payment_months(for_month)"); } catch (PDOException $e) { /* ignore */ }

    // Migrate existing payments to payment_months (assign to their payment month)
    try {
        db()->exec("
            INSERT INTO payment_months (payment_id, for_month, amount)
            SELECT p.id, date_trunc('month', p.payment_date)::DATE, p.amount
            FROM payments p
            WHERE NOT EXISTS (SELECT 1 FROM payment_months pm WHERE pm.payment_id = p.id)
            ON CONFLICT DO NOTHING
        ");
    } catch (PDOException $e) { /* ignore */ }

    // Enhanced leads table columns
    $leadColumns = [
        "ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority VARCHAR(10) DEFAULT 'warm'",
        "ALTER TABLE leads ADD COLUMN IF NOT EXISTS interested_courses TEXT",
        "ALTER TABLE leads ADD COLUMN IF NOT EXISTS trial_date DATE",
        "ALTER TABLE leads ADD COLUMN IF NOT EXISTS trial_group_id INT REFERENCES groups(id)",
        "ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact_date DATE",
        "ALTER TABLE leads ADD COLUMN IF NOT EXISTS birth_year INT",
        "ALTER TABLE leads ADD COLUMN IF NOT EXISTS preferred_schedule TEXT",
        "ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget VARCHAR(50)",
        "ALTER TABLE leads ADD COLUMN IF NOT EXISTS loss_reason TEXT",
    ];
    foreach ($leadColumns as $alter) {
        try { db()->exec($alter); } catch (PDOException $e) { /* ignore */ }
    }

    // Create lead_interactions table for tracking communication history
    $leadInteractionsSql = "
    CREATE TABLE IF NOT EXISTS lead_interactions (
        id SERIAL PRIMARY KEY,
        lead_id INT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL,
        notes TEXT,
        scheduled_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_by INT REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )";
    try { db()->exec($leadInteractionsSql); } catch (PDOException $e) { /* ignore */ }
    try { db()->exec("CREATE INDEX IF NOT EXISTS idx_lead_interactions_lead ON lead_interactions(lead_id)"); } catch (PDOException $e) { /* ignore */ }

    // Source tracking columns for students and leads
    $sourceTrackingColumns = [
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'walk_in'",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS referred_by_type VARCHAR(20)",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS referred_by_id INTEGER",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES leads(id)",
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id)",
        "ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id)",
        "ALTER TABLE leads ADD COLUMN IF NOT EXISTS referred_by_type VARCHAR(20)",
        "ALTER TABLE leads ADD COLUMN IF NOT EXISTS referred_by_id INTEGER",
    ];
    foreach ($sourceTrackingColumns as $alter) {
        try { db()->exec($alter); } catch (PDOException $e) { /* ignore */ }
    }
    // Make leads.source NOT NULL
    try {
        db()->exec("UPDATE leads SET source = 'walk_in' WHERE source IS NULL OR source = ''");
        db()->exec("ALTER TABLE leads ALTER COLUMN source SET DEFAULT 'walk_in'");
        db()->exec("ALTER TABLE leads ALTER COLUMN source SET NOT NULL");
    } catch (PDOException $e) { /* ignore */ }
    try { db()->exec("CREATE INDEX IF NOT EXISTS idx_students_source ON students(source)"); } catch (PDOException $e) { /* ignore */ }
    try { db()->exec("CREATE INDEX IF NOT EXISTS idx_students_lead_id ON students(lead_id)"); } catch (PDOException $e) { /* ignore */ }
    try { db()->exec("CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source)"); } catch (PDOException $e) { /* ignore */ }

    // Soft-delete: add deleted_at column to payments, expenses, salary_slips
    $softDeleteColumns = [
        "ALTER TABLE payments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL",
        "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL",
        "ALTER TABLE salary_slips ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL",
    ];
    foreach ($softDeleteColumns as $alter) {
        try { db()->exec($alter); } catch (PDOException $e) { /* ignore */ }
    }
}
