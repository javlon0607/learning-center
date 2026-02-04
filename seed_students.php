<?php
/**
 * Seed script to add 20 random students
 * Run with: php seed_students.php
 */

require_once __DIR__ . '/config.php';

// Uzbek male names
$maleNames = [
    'Aziz', 'Bekzod', 'Doniyor', 'Eldor', 'Farrux', 'Gulom', 'Husan', 'Ibrohim',
    'Jasur', 'Kamol', 'Laziz', 'Mansur', 'Nodir', 'Otabek', 'Sardor', 'Temur',
    'Ulugbek', 'Vohid', 'Yusuf', 'Zafar', 'Abbos', 'Bobur', 'Dilshod', 'Elbek',
    'Farhod', 'Sherzod', 'Akmal', 'Rustam', 'Sanjar', 'Jamshid'
];

// Uzbek female names
$femaleNames = [
    'Aziza', 'Barno', 'Dilnoza', 'Ezoza', 'Feruza', 'Gulnora', 'Hilola', 'Iroda',
    'Jamila', 'Kamola', 'Lola', 'Malika', 'Nargiza', 'Ozoda', 'Parizod', 'Rayhon',
    'Sabina', 'Tamila', 'Umida', 'Viloyat', 'Yulduz', 'Zarina', 'Madina', 'Nilufar',
    'Sevinch', 'Shahzoda', 'Dilfuza', 'Mohira', 'Nodira', 'Saida'
];

// Uzbek last names (family names)
$lastNames = [
    'Karimov', 'Rahimov', 'Toshmatov', 'Abdullayev', 'Yusupov', 'Mirzayev', 'Aliyev', 'Ergashev',
    'Saidov', 'Xolmatov', 'Nazarov', 'Qodirov', 'Boymurodov', 'Tursunov', 'Ismoilov', 'Xaydarov',
    'Umarov', 'Sultonov', 'Xoliqov', 'Rasulov', 'Nurmatov', 'Olimov', 'Sodiqov', 'Murodov',
    'Berdiyev', 'Salimov', 'Hakimov', 'Raxmonov', 'Mamadov', 'Ochilov'
];

// Uzbek parent names (fathers)
$parentFirstNames = [
    'Anvar', 'Baxtiyor', 'Davron', 'Eshmat', 'Farmon', 'Gafur', 'Hamid', 'Ikrom',
    'Jahongir', 'Komil', 'Latif', 'Mirzo', 'Nabi', 'Odil', 'Pulat', 'Rahim'
];

function randomPhone() {
    $prefixes = ['90', '91', '93', '94', '95', '97', '99', '88', '33'];
    $prefix = $prefixes[array_rand($prefixes)];
    return '+998 ' . $prefix . ' ' . rand(100, 999) . ' ' . rand(10, 99) . ' ' . rand(10, 99);
}

function randomDob() {
    $year = rand(2008, 2018);
    $month = str_pad(rand(1, 12), 2, '0', STR_PAD_LEFT);
    $day = str_pad(rand(1, 28), 2, '0', STR_PAD_LEFT);
    return "$year-$month-$day";
}

function randomEmail($firstName, $lastName) {
    $domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'mail.com'];
    $domain = $domains[array_rand($domains)];
    return strtolower($firstName) . '.' . strtolower($lastName) . rand(1, 99) . '@' . $domain;
}

echo "Adding 20 random students...\n";

$stmt = db()->prepare("
    INSERT INTO students (first_name, last_name, dob, phone, email, parent_name, parent_phone, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
");

$count = 0;
for ($i = 0; $i < 20; $i++) {
    // Randomly choose male or female
    $isMale = rand(0, 1) === 1;
    $firstName = $isMale ? $maleNames[array_rand($maleNames)] : $femaleNames[array_rand($femaleNames)];
    $lastName = $lastNames[array_rand($lastNames)];
    // Adjust last name for females (add 'a' suffix)
    if (!$isMale && substr($lastName, -2) === 'ov') {
        $lastName = $lastName . 'a';
    }
    $parentFirst = $parentFirstNames[array_rand($parentFirstNames)];
    $parentName = $parentFirst . ' ' . rtrim($lastName, 'a');

    $dob = randomDob();
    $phone = randomPhone();
    $email = randomEmail($firstName, $lastName);
    $parentPhone = randomPhone();
    $notes = 'Seeded student #' . ($i + 1);

    try {
        $stmt->execute([
            $firstName,
            $lastName,
            $dob,
            $phone,
            $email,
            $parentName,
            $parentPhone,
            $notes
        ]);
        $count++;
        echo "  Added: $firstName $lastName\n";
    } catch (PDOException $e) {
        echo "  Error adding $firstName $lastName: " . $e->getMessage() . "\n";
    }
}

echo "\nDone! Added $count students.\n";
