<?php
/**
 * Auto-migration: runs all schema SQL files on startup.
 * Safe to run repeatedly — all statements use IF NOT EXISTS / IF NOT EXISTS.
 */

$maxRetries = 10;
$retryDelay = 2;

$host = getenv('DB_HOST') ?: 'postgres';
$port = getenv('DB_PORT') ?: '5432';
$name = getenv('DB_NAME') ?: 'learning_center_db';
$user = getenv('DB_USER') ?: 'learning_center_user';
$pass = getenv('DB_PASS') ?: 'postgres123';

$dsn = "pgsql:host=$host;port=$port;dbname=$name";

// Wait for database to be ready
$pdo = null;
for ($i = 1; $i <= $maxRetries; $i++) {
    try {
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
        echo "[migrate] Connected to database.\n";
        break;
    } catch (PDOException $e) {
        echo "[migrate] Waiting for database (attempt $i/$maxRetries)...\n";
        sleep($retryDelay);
    }
}

if (!$pdo) {
    echo "[migrate] ERROR: Could not connect to database after $maxRetries attempts.\n";
    exit(1);
}

// Schema files in order (paths inside the container)
$schemaFiles = [
    '/var/www/html/schema.sql',
    '/var/www/schemas/schema_additions.sql',
    '/var/www/schemas/schema_v2.sql',
    '/var/www/schemas/schema_source_tracking.sql',
];

foreach ($schemaFiles as $file) {
    $resolved = realpath($file);
    if (!$resolved || !file_exists($resolved)) {
        echo "[migrate] Skipping $file (not found)\n";
        continue;
    }
    $sql = file_get_contents($resolved);
    if (empty(trim($sql))) {
        echo "[migrate] Skipping $resolved (empty)\n";
        continue;
    }
    try {
        $pdo->exec($sql);
        echo "[migrate] Applied: " . basename($resolved) . "\n";
    } catch (PDOException $e) {
        echo "[migrate] Warning in " . basename($resolved) . ": " . $e->getMessage() . "\n";
        // Don't exit — some statements may fail if partially applied, that's OK
    }
}

echo "[migrate] Done.\n";
