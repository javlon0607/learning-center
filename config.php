<?php
// config.php - Database and app configuration (TRD-aligned)

define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_PORT', getenv('DB_PORT') ?: '5432');
define('DB_NAME', getenv('DB_NAME') ?: 'learning_crm');
define('DB_USER', getenv('DB_USER') ?: 'postgres');
define('DB_PASS', getenv('DB_PASS') ?: 'postgres123');
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
}

function requireRole($allowed) {
    auth();
    $role = $_SESSION['user']['role'] ?? 'user';
    $allowed = is_array($allowed) ? $allowed : [$allowed];
    if (!in_array($role, $allowed)) {
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
        role VARCHAR(20) DEFAULT 'user',
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
    $additions = __DIR__ . '/schema_additions.sql';
    if (file_exists($additions)) {
        $addSql = file_get_contents($additions);
        foreach (explode(';', $addSql) as $q) {
            $q = trim($q);
            if ($q === '' || stripos($q, '--') === 0) continue;
            if (stripos($q, 'CREATE') === 0 || stripos($q, 'INSERT') === 0) {
                try { db()->exec($q); } catch (PDOException $e) { /* ignore */ }
            }
        }
    }

    // Load schema v2 enhancements
    $schemaV2 = __DIR__ . '/schema_v2.sql';
    if (file_exists($schemaV2)) {
        $v2Sql = file_get_contents($schemaV2);
        foreach (explode(';', $v2Sql) as $q) {
            $q = trim($q);
            if ($q === '' || stripos($q, '--') === 0) continue;
            if (stripos($q, 'CREATE') === 0 || stripos($q, 'ALTER') === 0 || stripos($q, 'INSERT') === 0) {
                try { db()->exec($q); } catch (PDOException $e) { /* ignore duplicates */ }
            }
        }
    }
}
