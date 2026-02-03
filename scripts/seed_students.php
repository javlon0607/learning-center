<?php
/**
 * Seed 40 random students with Uzbek names.
 * Run from project root: php scripts/seed_students.php
 */
require_once __DIR__ . '/../config.php';

initDB();

$students = [
    ['Muhammadali', 'Karimov'],
    ['Soliha', 'Yusupova'],
    ['Mustafo', 'Abdullayev'],
    ['Yasmina', 'Rahimova'],
    ['Abdulloh', 'Ibragimov'],
    ['Muslima', 'Umarova'],
    ['Muhammad', 'Usmanov'],
    ['Hadicha', 'Sultanova'],
    ['Muhammadyusuf', 'Toshmatov'],
    ['Imona', 'Nazarova'],
    ['Timur', 'Ergashev'],
    ['Madina', 'Ismoilova'],
    ['Rustam', 'Hasanov'],
    ['Nargiza', 'Rahmonova'],
    ['Alisher', 'Salimov'],
    ['Firuza', 'Qodirova'],
    ['Aziz', 'Jorayev'],
    ['Dilnoza', 'Boltayeva'],
    ['Akmal', 'Turgunov'],
    ['Feruza', 'Ergasheva'],
    ['Sardor', 'Karimov'],
    ['Gulnora', 'Yusupova'],
    ['Dilshod', 'Abdullayev'],
    ['Nigora', 'Rahimova'],
    ['Farruh', 'Ibragimov'],
    ['Ozoda', 'Umarova'],
    ['Jamshid', 'Usmanov'],
    ['Sabina', 'Sultanova'],
    ['Ulugbek', 'Toshmatov'],
    ['Sarvinoz', 'Nazarova'],
    ['Otabek', 'Ergashev'],
    ['Malika', 'Ismoilova'],
    ['Jasur', 'Hasanov'],
    ['Kamola', 'Rahmonova'],
    ['Doniyor', 'Salimov'],
    ['Dildora', 'Qodirova'],
    ['Shohruh', 'Jorayev'],
    ['Nilufar', 'Boltayeva'],
    ['Behzod', 'Turgunov'],
    ['Shahlo', 'Karimova'],
];

$stmt = db()->prepare(
    "INSERT INTO students (first_name, last_name, dob, phone, email, parent_name, parent_phone, status, notes) 
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)"
);

$phones = ['+99890', '+99891', '+99893', '+99894', '+99897'];
$count = 0;
foreach ($students as $i => $row) {
    $firstName = $row[0];
    $lastName = $row[1];
    // Optional random fields for variety
    $dob = (rand(0, 3) === 0) ? (2008 + rand(0, 8)) . '-' . str_pad((string)rand(1, 12), 2, '0', STR_PAD_LEFT) . '-' . str_pad((string)rand(1, 28), 2, '0', STR_PAD_LEFT) : null;
    $phone = $phones[array_rand($phones)] . rand(1000000, 9999999);
    $email = (rand(0, 2) !== 0) ? strtolower($firstName) . '.' . strtolower($lastName) . '@mail.uz' : null;
    $parentNames = ['Rustam Karimov', 'Dilnoza Yusupova', 'Aziz Abdullayev', 'Madina Rahimova', 'Sardor Toshmatov', 'Nargiza Nazarova', 'Ulugbek Ergashev', 'Feruza Ismoilova'];
    $parentName = (rand(0, 3) !== 0) ? $parentNames[array_rand($parentNames)] : null;
    $parentPhone = (rand(0, 2) !== 0) ? $phones[array_rand($phones)] . rand(1000000, 9999999) : null;
    $notes = (rand(0, 4) === 0) ? 'Qayd.' : null;

    $stmt->execute([$firstName, $lastName, $dob, $phone, $email, $parentName, $parentPhone, $notes]);
    $count++;
}

echo "Inserted {$count} students with Uzbek names.\n";
