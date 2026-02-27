<?php
// Database Configuration (from Docker environment)
define('DB_HOST', getenv('DB_HOST') ?: 'postgres');
define('DB_PORT', getenv('DB_PORT') ?: '5432');
define('DB_NAME', getenv('DB_NAME') ?: 'learning_center_db');
define('DB_USER', getenv('DB_USER') ?: 'learning_center_user');
define('DB_PASS', getenv('DB_PASS') ?: 'postgres123');

// JWT Configuration
define('JWT_SECRET', getenv('JWT_SECRET') ?: 'CHANGE_ME_TO_A_RANDOM_64_CHARACTER_STRING');
define('JWT_ACCESS_TTL', (int)(getenv('JWT_ACCESS_TTL') ?: 1800));
define('JWT_REFRESH_TTL', (int)(getenv('JWT_REFRESH_TTL') ?: 604800));

// Error Reporting
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// CORS Configuration
$origin = $_SERVER['HTTP_ORIGIN'] ?? 'http://localhost';
header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Database Connection
function getDB() {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $dsn = "pgsql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME;
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            $pdo->exec("SET timezone = 'Asia/Tashkent'");
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
            exit;
        }
    }
    return $pdo;
}

// Alias for backward compatibility
function db() {
    return getDB();
}

// Initialize database schema
function initDB() {
    // Create role_permissions table if not exists
    try {
        getDB()->exec("
            CREATE TABLE IF NOT EXISTS role_permissions (
                id SERIAL PRIMARY KEY,
                role VARCHAR(30) NOT NULL,
                feature VARCHAR(50) NOT NULL,
                UNIQUE(role, feature)
            )
        ");
    } catch (PDOException $e) { /* ignore */ }

    // Create translations table if not exists
    try {
        getDB()->exec("
            CREATE TABLE IF NOT EXISTS translations (
                id SERIAL PRIMARY KEY,
                lang VARCHAR(5) NOT NULL,
                key VARCHAR(200) NOT NULL,
                value TEXT NOT NULL,
                UNIQUE(lang, key)
            )
        ");
    } catch (PDOException $e) { /* ignore */ }

    // Seed default permissions only on first run (table empty = fresh install)
    try {
        $existingPerms = (int)getDB()->query("SELECT COUNT(*) FROM role_permissions")->fetchColumn();
        if ($existingPerms === 0) {
            $defaultPermissions = [
                ['admin', 'dashboard'], ['manager', 'dashboard'], ['teacher', 'dashboard'], ['accountant', 'dashboard'],
                ['admin', 'students'], ['manager', 'students'], ['teacher', 'students'], ['accountant', 'students'],
                ['admin', 'teachers'], ['manager', 'teachers'], ['accountant', 'teachers'],
                ['admin', 'groups'],   ['manager', 'groups'],   ['teacher', 'groups'],   ['accountant', 'groups'],
                ['admin', 'leads'],    ['manager', 'leads'],
                ['admin', 'attendance'], ['manager', 'attendance'], ['teacher', 'attendance'], ['accountant', 'attendance'],
                ['admin', 'payments'],   ['manager', 'payments'],   ['accountant', 'payments'],
                ['admin', 'payments_delete'], ['manager', 'payments_delete'], ['accountant', 'payments_delete'],
                ['admin', 'expenses'],   ['manager', 'expenses'],   ['accountant', 'expenses'],
                ['admin', 'expenses_delete'], ['manager', 'expenses_delete'], ['accountant', 'expenses_delete'],
                ['admin', 'collections'],['manager', 'collections'],['accountant', 'collections'],
                ['admin', 'salary_slips'], ['accountant', 'salary_slips'],
                ['admin', 'reports'],  ['manager', 'reports'],  ['accountant', 'reports'],
                ['admin', 'logs'],
                ['admin', 'settings'],
                ['admin', 'users'],
                ['admin', 'permissions'],
                ['admin', 'translations'],
                // owner gets all features by default (configurable via permissions page)
                ['owner', 'dashboard'], ['owner', 'students'], ['owner', 'teachers'], ['owner', 'groups'],
                ['owner', 'leads'], ['owner', 'attendance'], ['owner', 'payments'], ['owner', 'payments_delete'], ['owner', 'expenses'], ['owner', 'expenses_delete'],
                ['owner', 'collections'], ['owner', 'salary_slips'], ['owner', 'reports'], ['owner', 'logs'],
                ['owner', 'settings'], ['owner', 'users'], ['owner', 'permissions'], ['owner', 'translations'],
                // developer bypasses all checks but seed permissions anyway
                ['developer', 'permissions'], ['developer', 'translations'],
            ];
            $stmt = getDB()->prepare("INSERT INTO role_permissions (role, feature) VALUES (?, ?) ON CONFLICT DO NOTHING");
            foreach ($defaultPermissions as [$role, $feature]) {
                $stmt->execute([$role, $feature]);
            }
        }
    } catch (PDOException $e) { /* ignore */ }

    // Migration: ensure admin always has permissions + translations access (idempotent)
    try {
        $stmt = getDB()->prepare("INSERT INTO role_permissions (role, feature) VALUES (?, ?) ON CONFLICT DO NOTHING");
        $stmt->execute(['admin', 'permissions']);
        $stmt->execute(['admin', 'translations']);
    } catch (PDOException $e) { /* ignore */ }

    // Seed default translations only on first run
    try {
        $existingTrans = (int)getDB()->query("SELECT COUNT(*) FROM translations")->fetchColumn();
        if ($existingTrans === 0) {
            $defaultTranslations = [
                // Navigation
                ['en','nav.dashboard','Dashboard'], ['uz','nav.dashboard','Bosh sahifa'],
                ['en','nav.students','Students'], ['uz','nav.students',"O'quvchilar"],
                ['en','nav.groups','Groups'], ['uz','nav.groups','Guruhlar'],
                ['en','nav.teachers','Teachers'], ['uz','nav.teachers',"O'qituvchilar"],
                ['en','nav.leads','Leads'], ['uz','nav.leads','Potentsial mijozlar'],
                ['en','nav.attendance','Attendance'], ['uz','nav.attendance','Davomat'],
                ['en','nav.payments','Payments'], ['uz','nav.payments',"To'lovlar"],
                ['en','nav.expenses','Expenses'], ['uz','nav.expenses','Xarajatlar'],
                ['en','nav.collections','Collections'], ['uz','nav.collections','Qarzdorlar'],
                ['en','nav.reports','Reports'], ['uz','nav.reports','Hisobotlar'],
                ['en','nav.logs','Logs'], ['uz','nav.logs','Jurnallar'],
                ['en','nav.settings','Settings'], ['uz','nav.settings','Sozlamalar'],
                ['en','nav.permissions','Permissions'], ['uz','nav.permissions','Ruxsatlar'],
                ['en','nav.translations','Translations'], ['uz','nav.translations','Tarjimalar'],
                ['en','nav.system_online','System Online'], ['uz','nav.system_online','Tizim ishlayapti'],
                // Common
                ['en','common.save','Save'], ['uz','common.save','Saqlash'],
                ['en','common.cancel','Cancel'], ['uz','common.cancel','Bekor qilish'],
                ['en','common.delete','Delete'], ['uz','common.delete',"O'chirish"],
                ['en','common.edit','Edit'], ['uz','common.edit','Tahrirlash'],
                ['en','common.add','Add'], ['uz','common.add',"Qo'shish"],
                ['en','common.search','Search'], ['uz','common.search','Qidirish'],
                ['en','common.loading','Loading...'], ['uz','common.loading','Yuklanmoqda...'],
                ['en','common.name','Name'], ['uz','common.name','Ism'],
                ['en','common.phone','Phone'], ['uz','common.phone','Telefon'],
                ['en','common.email','Email'], ['uz','common.email','Email'],
                ['en','common.status','Status'], ['uz','common.status','Holati'],
                ['en','common.actions','Actions'], ['uz','common.actions','Amallar'],
                ['en','common.notes','Notes'], ['uz','common.notes','Izohlar'],
                ['en','common.amount','Amount'], ['uz','common.amount','Miqdor'],
                ['en','common.date','Date'], ['uz','common.date','Sana'],
                ['en','common.total','Total'], ['uz','common.total','Jami'],
                ['en','common.save_changes','Save Changes'], ['uz','common.save_changes',"O'zgarishlarni saqlash"],
                ['en','common.active','Active'], ['uz','common.active','Faol'],
                ['en','common.inactive','Inactive'], ['uz','common.inactive','Faol emas'],
                ['en','common.all','All'], ['uz','common.all','Barchasi'],
                ['en','common.filter','Filter'], ['uz','common.filter','Filtr'],
                ['en','common.no_data','No data found'], ['uz','common.no_data',"Ma'lumot topilmadi"],
                ['en','common.confirm_delete','Are you sure you want to delete this?'], ['uz','common.confirm_delete',"O'chirishni tasdiqlaysizmi?"],
                // Login
                ['en','login.welcome','Welcome back'], ['uz','login.welcome','Xush kelibsiz'],
                ['en','login.subtitle','Sign in to access your dashboard'], ['uz','login.subtitle',"Boshqaruv paneliga kirish uchun tizimga kiring"],
                ['en','login.username','Username'], ['uz','login.username','Foydalanuvchi nomi'],
                ['en','login.password','Password'], ['uz','login.password','Parol'],
                ['en','login.sign_in','Sign in'], ['uz','login.sign_in','Kirish'],
                ['en','login.signing_in','Signing in...'], ['uz','login.signing_in','Kirilmoqda...'],
                // Dashboard
                ['en','dashboard.welcome','Welcome back,'], ['uz','dashboard.welcome','Xush kelibsiz,'],
                ['en','dashboard.subtitle',"Here's what's happening at Legacy Academy today"], ['uz','dashboard.subtitle',"Bugun Legacy Academiyada nima bo'layotganligi"],
                ['en','dashboard.active_students','Active Students'], ['uz','dashboard.active_students',"Faol o'quvchilar"],
                ['en','dashboard.active_groups','Active Groups'], ['uz','dashboard.active_groups','Faol guruhlar'],
                ['en','dashboard.currently_running','Currently running'], ['uz','dashboard.currently_running','Hozirda davom etmoqda'],
                ['en','dashboard.teachers','Teachers'], ['uz','dashboard.teachers',"O'qituvchilar"],
                ['en','dashboard.active_instructors','Active instructors'], ['uz','dashboard.active_instructors',"Faol o'qituvchilar"],
                ['en','dashboard.pending_leads','Pending Leads'], ['uz','dashboard.pending_leads','Kutilayotgan mijozlar'],
                ['en','dashboard.awaiting_follow_up','Awaiting follow-up'], ['uz','dashboard.awaiting_follow_up','Kuzatuv kutmoqda'],
                ['en','dashboard.monthly_revenue','Monthly Revenue'], ['uz','dashboard.monthly_revenue','Oylik daromad'],
                ['en','dashboard.total_income','Total income this month'], ['uz','dashboard.total_income','Bu oydagi umumiy daromad'],
                ['en','dashboard.monthly_expenses','Monthly Expenses'], ['uz','dashboard.monthly_expenses','Oylik xarajatlar'],
                ['en','dashboard.total_expenses','Total expenses this month'], ['uz','dashboard.total_expenses','Bu oydagi umumiy xarajatlar'],
                ['en','dashboard.net_profit','Net Profit'], ['uz','dashboard.net_profit','Sof foyda'],
                ['en','dashboard.revenue_minus_expenses','Revenue minus expenses'], ['uz','dashboard.revenue_minus_expenses','Daromad minus xarajatlar'],
                ['en','dashboard.quick_actions','Quick Actions'], ['uz','dashboard.quick_actions','Tezkor amallar'],
                ['en','dashboard.add_new_student','Add New Student'], ['uz','dashboard.add_new_student',"Yangi o'quvchi qo'shish"],
                ['en','dashboard.register_student','Register a new student'], ['uz','dashboard.register_student',"Yangi o'quvchini ro'yxatdan o'tkazish"],
                ['en','dashboard.record_payment','Record Payment'], ['uz','dashboard.record_payment',"To'lovni qayd etish"],
                ['en','dashboard.add_payment','Add a new payment'], ['uz','dashboard.add_payment',"Yangi to'lov qo'shish"],
                ['en','dashboard.mark_attendance','Mark Attendance'], ['uz','dashboard.mark_attendance','Davomatni belgilash'],
                ['en','dashboard.take_attendance',"Take today's attendance"], ['uz','dashboard.take_attendance','Bugungi davomatni olish'],
                ['en','dashboard.manage_leads','Manage Leads'], ['uz','dashboard.manage_leads','Mijozlarni boshqarish'],
                ['en','dashboard.follow_up','Follow up with prospects'], ['uz','dashboard.follow_up','Potentsial mijozlar bilan ishlash'],
                // Revenue Chart
                ['en','chart.revenue_overview','Revenue Overview'], ['uz','chart.revenue_overview',"Daromad ko'rinishi"],
                ['en','chart.subtitle','Monthly revenue vs expenses'], ['uz','chart.subtitle','Oylik daromad va xarajatlar'],
                ['en','chart.revenue','Revenue'], ['uz','chart.revenue','Daromad'],
                ['en','chart.expenses','Expenses'], ['uz','chart.expenses','Xarajatlar'],
                ['en','chart.no_data','No revenue data available yet'], ['uz','chart.no_data',"Daromad ma'lumotlari hali mavjud emas"],
                ['en','chart.failed_load','Failed to load revenue data'], ['uz','chart.failed_load',"Daromad ma'lumotlarini yuklashda xatolik"],
                // Students
                ['en','students.title','Students'], ['uz','students.title',"O'quvchilar"],
                ['en','students.description','Manage and track all student records'], ['uz','students.description',"Barcha o'quvchi yozuvlarini boshqaring va kuzating"],
                ['en','students.add','Add Student'], ['uz','students.add',"O'quvchi qo'shish"],
                ['en','students.search','Search students...'], ['uz','students.search',"O'quvchilarni qidirish..."],
                ['en','students.col_name','Name'], ['uz','students.col_name','Ism'],
                ['en','students.col_phone','Phone'], ['uz','students.col_phone','Telefon'],
                ['en','students.col_groups','Groups'], ['uz','students.col_groups','Guruhlar'],
                ['en','students.col_debt','Debt'], ['uz','students.col_debt','Qarzdorlik'],
                ['en','students.col_source','Source'], ['uz','students.col_source','Manba'],
                ['en','students.col_registered','Registered'], ['uz','students.col_registered',"Ro'yxatdan o'tgan"],
                // Teachers
                ['en','teachers.title','Teachers'], ['uz','teachers.title',"O'qituvchilar"],
                ['en','teachers.description','Manage your teaching staff'], ['uz','teachers.description',"O'qituvchilar xodimlarini boshqaring"],
                ['en','teachers.add','Add Teacher'], ['uz','teachers.add',"O'qituvchi qo'shish"],
                ['en','teachers.col_name','Name'], ['uz','teachers.col_name','Ism'],
                ['en','teachers.col_phone','Phone'], ['uz','teachers.col_phone','Telefon'],
                ['en','teachers.col_email','Email'], ['uz','teachers.col_email','Email'],
                ['en','teachers.col_subjects','Subjects'], ['uz','teachers.col_subjects','Fanlar'],
                ['en','teachers.col_salary','Salary'], ['uz','teachers.col_salary','Maosh'],
                ['en','teachers.col_status','Status'], ['uz','teachers.col_status','Holati'],
                // Groups
                ['en','groups.title','Groups'], ['uz','groups.title','Guruhlar'],
                ['en','groups.description','Manage your learning groups'], ['uz','groups.description',"O'quv guruhlaringizni boshqaring"],
                ['en','groups.add','Add Group'], ['uz','groups.add',"Guruh qo'shish"],
                ['en','groups.col_name','Name'], ['uz','groups.col_name','Nomi'],
                ['en','groups.col_subject','Subject'], ['uz','groups.col_subject','Fan'],
                ['en','groups.col_teacher','Teacher'], ['uz','groups.col_teacher',"O'qituvchi"],
                ['en','groups.col_schedule','Schedule'], ['uz','groups.col_schedule','Jadval'],
                ['en','groups.col_room','Room'], ['uz','groups.col_room','Xona'],
                ['en','groups.col_students','Students'], ['uz','groups.col_students',"O'quvchilar"],
                ['en','groups.col_price','Price'], ['uz','groups.col_price','Narx'],
                ['en','groups.col_status','Status'], ['uz','groups.col_status','Holati'],
                // Leads
                ['en','leads.title','Leads'], ['uz','leads.title','Potentsial mijozlar'],
                ['en','leads.description','Manage prospects and convert them to students'], ['uz','leads.description',"Potentsial mijozlarni boshqaring va o'quvchilarga aylantiring"],
                ['en','leads.add','Add Lead'], ['uz','leads.add',"Mijoz qo'shish"],
                ['en','leads.active_leads','Active Leads'], ['uz','leads.active_leads','Faol mijozlar'],
                ['en','leads.col_name','Name'], ['uz','leads.col_name','Ism'],
                ['en','leads.col_phone','Phone'], ['uz','leads.col_phone','Telefon'],
                ['en','leads.col_status','Status'], ['uz','leads.col_status','Holati'],
                ['en','leads.col_source','Source'], ['uz','leads.col_source','Manba'],
                ['en','leads.col_follow_up','Follow Up'], ['uz','leads.col_follow_up','Kuzatuv'],
                // Attendance
                ['en','attendance.title','Attendance'], ['uz','attendance.title','Davomat'],
                ['en','attendance.save','Save Attendance'], ['uz','attendance.save','Davomatni saqlash'],
                ['en','attendance.select_group','Select Group'], ['uz','attendance.select_group','Guruhni tanlang'],
                ['en','attendance.present','Present'], ['uz','attendance.present','Kelgan'],
                ['en','attendance.absent','Absent'], ['uz','attendance.absent','Kelmagan'],
                ['en','attendance.late','Late'], ['uz','attendance.late','Kech kelgan'],
                ['en','attendance.excused','Excused'], ['uz','attendance.excused','Sababli'],
                // Payments
                ['en','payments.title','Payments'], ['uz','payments.title',"To'lovlar"],
                ['en','payments.description','Track student payments'], ['uz','payments.description',"O'quvchilar to'lovlarini kuzating"],
                ['en','payments.record','Record Payment'], ['uz','payments.record',"To'lovni qayd etish"],
                ['en','payments.search','Search payments...'], ['uz','payments.search',"To'lovlarni qidirish..."],
                ['en','payments.col_student','Student'], ['uz','payments.col_student',"O'quvchi"],
                ['en','payments.col_group','Group'], ['uz','payments.col_group','Guruh'],
                ['en','payments.col_paid_for','Paid for'], ['uz','payments.col_paid_for',"To'langan oy"],
                ['en','payments.col_amount','Amount'], ['uz','payments.col_amount','Miqdor'],
                ['en','payments.col_method','Method'], ['uz','payments.col_method','Usul'],
                ['en','payments.col_notes','Notes'], ['uz','payments.col_notes','Izoh'],
                ['en','payments.col_date','Date'], ['uz','payments.col_date','Sana'],
                // Expenses
                ['en','expenses.title','Expenses'], ['uz','expenses.title','Xarajatlar'],
                ['en','expenses.description','Track business expenses'], ['uz','expenses.description','Biznes xarajatlarini kuzating'],
                ['en','expenses.add','Add Expense'], ['uz','expenses.add',"Xarajat qo'shish"],
                ['en','expenses.this_month','This Month'], ['uz','expenses.this_month','Bu oy'],
                ['en','expenses.filtered_total','Filtered Total'], ['uz','expenses.filtered_total','Filtrlangan jami'],
                ['en','expenses.col_category','Category'], ['uz','expenses.col_category','Kategoriya'],
                ['en','expenses.col_description','Description'], ['uz','expenses.col_description','Tavsif'],
                ['en','expenses.col_date','Date'], ['uz','expenses.col_date','Sana'],
                ['en','expenses.col_amount','Amount'], ['uz','expenses.col_amount','Miqdor'],
                // Collections
                ['en','collections.title','Collections'], ['uz','collections.title','Qarzdorlar'],
                ['en','collections.description','Students with outstanding debt'], ['uz','collections.description',"Qarzdor o'quvchilar"],
                ['en','collections.col_student','Student'], ['uz','collections.col_student',"O'quvchi"],
                ['en','collections.col_phone','Phone'], ['uz','collections.col_phone','Telefon'],
                ['en','collections.col_groups','Groups'], ['uz','collections.col_groups','Guruhlar'],
                ['en','collections.col_expected','Expected'], ['uz','collections.col_expected','Kutilgan'],
                ['en','collections.col_paid','Paid'], ['uz','collections.col_paid',"To'langan"],
                ['en','collections.col_debt','Debt'], ['uz','collections.col_debt','Qarzdorlik'],
                ['en','collections.col_last_call','Last Call'], ['uz','collections.col_last_call',"Oxirgi qo'ng'iroq"],
                ['en','collections.col_calls','Calls'], ['uz','collections.col_calls',"Qo'ng'iroqlar"],
                ['en','collections.log_call','Log Call'], ['uz','collections.log_call',"Qo'ng'iroqni qayd etish"],
                // Reports
                ['en','reports.title','Reports'], ['uz','reports.title','Hisobotlar'],
                ['en','reports.tab_overview','Overview'], ['uz','reports.tab_overview',"Umumiy ko'rinish"],
                ['en','reports.tab_monthly','Monthly'], ['uz','reports.tab_monthly','Oylik'],
                ['en','reports.tab_payments','Payments'], ['uz','reports.tab_payments',"To'lovlar"],
                ['en','reports.tab_expenses','Expenses'], ['uz','reports.tab_expenses','Xarajatlar'],
                // Logs
                ['en','logs.title','Audit Logs'], ['uz','logs.title','Audit jurnallari'],
                ['en','logs.description','Track all system changes and activities'], ['uz','logs.description',"Barcha tizim o'zgarishlari va faoliyatni kuzating"],
                ['en','logs.col_username','Username'], ['uz','logs.col_username','Foydalanuvchi'],
                ['en','logs.col_entity','Entity'], ['uz','logs.col_entity',"Ob'ekt"],
                ['en','logs.col_action','Action'], ['uz','logs.col_action','Amal'],
                ['en','logs.col_before','Before'], ['uz','logs.col_before','Oldin'],
                ['en','logs.col_after','After'], ['uz','logs.col_after','Keyin'],
                ['en','logs.col_ip','IP'], ['uz','logs.col_ip','IP'],
                ['en','logs.col_timestamp','Timestamp'], ['uz','logs.col_timestamp','Vaqt'],
                // Settings
                ['en','settings.title','Settings'], ['uz','settings.title','Sozlamalar'],
                ['en','settings.description','Manage your application settings'], ['uz','settings.description','Dastur sozlamalarini boshqaring'],
                ['en','settings.profile','Profile'], ['uz','settings.profile','Profil'],
                ['en','settings.organization','Organization'], ['uz','settings.organization','Tashkilot'],
                ['en','settings.notifications','Notifications'], ['uz','settings.notifications','Bildirishnomalar'],
                ['en','settings.security','Security'], ['uz','settings.security','Xavfsizlik'],
                ['en','settings.user_management','User Management'], ['uz','settings.user_management','Foydalanuvchilarni boshqarish'],
                // Users
                ['en','users.title','User Management'], ['uz','users.title','Foydalanuvchilarni boshqarish'],
                ['en','users.description','Manage system users and permissions'], ['uz','users.description','Tizim foydalanuvchilari va ruxsatlarini boshqaring'],
                ['en','users.add','Add User'], ['uz','users.add',"Foydalanuvchi qo'shish"],
                ['en','users.col_username','Username'], ['uz','users.col_username','Foydalanuvchi nomi'],
                ['en','users.col_name','Name'], ['uz','users.col_name','Ism'],
                ['en','users.col_email','Email'], ['uz','users.col_email','Email'],
                ['en','users.col_phone','Phone'], ['uz','users.col_phone','Telefon'],
                ['en','users.col_role','Role'], ['uz','users.col_role','Rol'],
                ['en','users.col_status','Status'], ['uz','users.col_status','Holati'],
                // Permissions
                ['en','permissions.title','Permissions'], ['uz','permissions.title','Ruxsatlar'],
                ['en','permissions.description','Configure which roles can access which features'], ['uz','permissions.description',"Qaysi rollar qaysi xususiyatlarga kirishi mumkinligini sozlang"],
                ['en','permissions.save','Save Permissions'], ['uz','permissions.save','Ruxsatlarni saqlash'],
                ['en','permissions.feature','Feature'], ['uz','permissions.feature','Xususiyat'],
                // Translations
                ['en','translations.title','Translations'], ['uz','translations.title','Tarjimalar'],
                ['en','translations.description','Manage interface translations'], ['uz','translations.description','Interfeys tarjimalarini boshqaring'],
                ['en','translations.col_key','Key'], ['uz','translations.col_key','Kalit'],
                ['en','translations.col_english','English'], ['uz','translations.col_english','Inglizcha'],
                ['en','translations.col_uzbek','Uzbek'], ['uz','translations.col_uzbek',"O'zbekcha"],
                ['en','translations.save_all','Save All'], ['uz','translations.save_all','Hammasini saqlash'],
                ['en','translations.saved','Translations saved successfully'], ['uz','translations.saved','Tarjimalar muvaffaqiyatli saqlandi'],
                ['en','translations.add_key','Add Key'], ['uz','translations.add_key',"Kalit qo'shish"],
                ['en','translations.search','Search keys...'], ['uz','translations.search','Kalitlarni qidirish...'],
            ];
            $stmt = getDB()->prepare("INSERT INTO translations (lang, key, value) VALUES (?, ?, ?) ON CONFLICT DO NOTHING");
            foreach ($defaultTranslations as [$lang, $key, $value]) {
                $stmt->execute([$lang, $key, $value]);
            }
        }
    } catch (PDOException $e) { /* ignore */ }

    // Migration: insert missing translation keys (ON CONFLICT DO NOTHING = safe for existing installs)
    try {
        $stmt = getDB()->prepare("INSERT INTO translations (lang, key, value) VALUES (?, ?, ?) ON CONFLICT DO NOTHING");
        $newKeys = [
            // Common shared
            ['en','common.btn_cancel','Cancel'], ['uz','common.btn_cancel','Bekor qilish'],
            ['en','common.btn_delete','Delete'], ['uz','common.btn_delete',"O'chirish"],
            ['en','common.btn_edit','Edit'], ['uz','common.btn_edit','Tahrirlash'],
            ['en','common.btn_view','View'], ['uz','common.btn_view',"Ko'rish"],
            ['en','common.btn_update','Update'], ['uz','common.btn_update','Yangilash'],
            ['en','common.btn_create','Create'], ['uz','common.btn_create','Yaratish'],
            ['en','common.btn_export','Export'], ['uz','common.btn_export','Eksport'],
            ['en','common.btn_clear','Clear'], ['uz','common.btn_clear','Tozalash'],
            ['en','common.per_page','per page'], ['uz','common.per_page','sahifada'],
            ['en','common.page','Page'], ['uz','common.page','Sahifa'],
            ['en','common.of','of'], ['uz','common.of','dan'],
            ['en','common.showing','Showing'], ['uz','common.showing',"Ko'rsatilmoqda"],
            ['en','common.status_active','Active'], ['uz','common.status_active','Faol'],
            ['en','common.status_inactive','Inactive'], ['uz','common.status_inactive','Faol emas'],
            ['en','common.status_paid','Paid'], ['uz','common.status_paid',"To'langan"],
            ['en','common.status_graduated','Graduated'], ['uz','common.status_graduated','Bitirgan'],
            ['en','common.status_suspended','Suspended'], ['uz','common.status_suspended',"To'xtatilgan"],
            ['en','common.all_statuses','All statuses'], ['uz','common.all_statuses','Barcha holatlari'],
            ['en','common.all_groups','All groups'], ['uz','common.all_groups','Barcha guruhlar'],
            ['en','common.all_sources','All sources'], ['uz','common.all_sources','Barcha manbalar'],
            ['en','common.all_methods','All methods'], ['uz','common.all_methods','Barcha usullar'],
            ['en','common.all_categories','All categories'], ['uz','common.all_categories','Barcha kategoriyalar'],
            ['en','common.all_months','All months'], ['uz','common.all_months','Barcha oylar'],
            ['en','common.not_found','Not found'], ['uz','common.not_found','Topilmadi'],
            ['en','common.failed_load','Failed to load data'], ['uz','common.failed_load',"Ma'lumotlarni yuklashda xatolik"],
            ['en','common.yes','Yes'], ['uz','common.yes','Ha'],
            ['en','common.are_you_sure','This action cannot be undone.'], ['uz','common.are_you_sure',"Bu amalni ortga qaytarib bo'lmaydi."],
            ['en','common.col_actions','Actions'], ['uz','common.col_actions','Amallar'],
            ['en','common.col_status','Status'], ['uz','common.col_status','Holati'],
            ['en','common.col_date','Date'], ['uz','common.col_date','Sana'],
            ['en','common.col_name','Name'], ['uz','common.col_name','Ism'],
            ['en','common.col_amount','Amount'], ['uz','common.col_amount','Miqdor'],
            ['en','common.deleted_badge','Deleted'], ['uz','common.deleted_badge',"O'chirilgan"],
            // Students
            ['en','students.stat_total','Total Students'], ['uz','students.stat_total',"Jami o'quvchilar"],
            ['en','students.stat_active','Active Students'], ['uz','students.stat_active',"Faol o'quvchilar"],
            ['en','students.stat_with_debt','With Debt'], ['uz','students.stat_with_debt','Qarzdorlar'],
            ['en','students.stat_total_debt','Total Debt (Month)'], ['uz','students.stat_total_debt','Jami qarzdorlik (oy)'],
            ['en','students.search_placeholder','Search by name, phone, email...'], ['uz','students.search_placeholder',"Ism, telefon, email bo'yicha qidirish..."],
            ['en','students.filter_debt_only','Debt only'], ['uz','students.filter_debt_only','Faqat qarzdorlar'],
            ['en','students.btn_clear_filters','Clear filters'], ['uz','students.btn_clear_filters','Filtrlarni tozalash'],
            ['en','students.not_enrolled','Not enrolled'], ['uz','students.not_enrolled','Guruhsiz'],
            ['en','students.age_suffix','y/o'], ['uz','students.age_suffix','yosh'],
            ['en','students.menu_view','View Details'], ['uz','students.menu_view','Batafsil'],
            ['en','students.menu_edit','Edit Student'], ['uz','students.menu_edit',"O'quvchini tahrirlash"],
            ['en','students.menu_delete','Delete Student'], ['uz','students.menu_delete',"O'quvchini o'chirish"],
            ['en','students.dialog_delete_title','Delete Student'], ['uz','students.dialog_delete_title',"O'quvchini o'chirish"],
            ['en','students.empty_heading','No students found'], ['uz','students.empty_heading',"O'quvchilar topilmadi"],
            ['en','students.filter_graduated','Graduated'], ['uz','students.filter_graduated','Bitirgan'],
            ['en','students.filter_suspended','Suspended'], ['uz','students.filter_suspended',"To'xtatilgan"],
            // Teachers
            ['en','teachers.search_placeholder','Search teachers...'], ['uz','teachers.search_placeholder',"O'qituvchilarni qidirish..."],
            ['en','teachers.empty_msg','No teachers found'], ['uz','teachers.empty_msg',"O'qituvchilar topilmadi"],
            ['en','teachers.salary_per_student','per student'], ['uz','teachers.salary_per_student',"o'quvchi uchun"],
            ['en','teachers.salary_fixed','(fixed)'], ['uz','teachers.salary_fixed','(belgilangan)'],
            ['en','teachers.menu_view','View'], ['uz','teachers.menu_view',"Ko'rish"],
            ['en','teachers.menu_edit','Edit'], ['uz','teachers.menu_edit','Tahrirlash'],
            ['en','teachers.menu_delete','Delete'], ['uz','teachers.menu_delete',"O'chirish"],
            ['en','teachers.dialog_edit_title','Edit Teacher'], ['uz','teachers.dialog_edit_title',"O'qituvchini tahrirlash"],
            ['en','teachers.dialog_create_title','Add New Teacher'], ['uz','teachers.dialog_create_title',"Yangi o'qituvchi qo'shish"],
            ['en','teachers.dialog_delete_title','Delete Teacher'], ['uz','teachers.dialog_delete_title',"O'qituvchini o'chirish"],
            ['en','teachers.form_subjects','Subjects'], ['uz','teachers.form_subjects','Fanlar'],
            ['en','teachers.form_subjects_placeholder','e.g., Math, English, Science'], ['uz','teachers.form_subjects_placeholder','Masalan: Matematika, Ingliz tili'],
            ['en','teachers.form_salary_type','Salary Type'], ['uz','teachers.form_salary_type','Maosh turi'],
            ['en','teachers.form_salary_fixed','Fixed'], ['uz','teachers.form_salary_fixed','Belgilangan'],
            ['en','teachers.form_salary_per_student','Per Student'], ['uz','teachers.form_salary_per_student',"O'quvchi uchun"],
            ['en','teachers.form_first_name','First Name *'], ['uz','teachers.form_first_name','Ism *'],
            ['en','teachers.form_last_name','Last Name *'], ['uz','teachers.form_last_name','Familiya *'],
            ['en','teachers.form_status','Status'], ['uz','teachers.form_status','Holati'],
            ['en','teachers.form_status_active','Active'], ['uz','teachers.form_status_active','Faol'],
            ['en','teachers.form_status_inactive','Inactive'], ['uz','teachers.form_status_inactive','Faol emas'],
            ['en','teachers.form_select_user','Select user (teacher role) *'], ['uz','teachers.form_select_user',"Foydalanuvchi tanlang (o'qituvchi roli) *"],
            // Groups
            ['en','groups.search_placeholder','Search groups...'], ['uz','groups.search_placeholder','Guruhlarni qidirish...'],
            ['en','groups.empty_msg','No groups found'], ['uz','groups.empty_msg','Guruhlar topilmadi'],
            ['en','groups.menu_view','View'], ['uz','groups.menu_view',"Ko'rish"],
            ['en','groups.menu_edit','Edit'], ['uz','groups.menu_edit','Tahrirlash'],
            ['en','groups.menu_delete','Delete'], ['uz','groups.menu_delete',"O'chirish"],
            ['en','groups.dialog_edit_title','Edit Group'], ['uz','groups.dialog_edit_title','Guruhni tahrirlash'],
            ['en','groups.dialog_create_title','Add New Group'], ['uz','groups.dialog_create_title',"Yangi guruh qo'shish"],
            ['en','groups.dialog_delete_title','Delete Group'], ['uz','groups.dialog_delete_title',"Guruhni o'chirish"],
            ['en','groups.form_name','Name *'], ['uz','groups.form_name','Nomi *'],
            ['en','groups.form_subject','Subject'], ['uz','groups.form_subject','Fan'],
            ['en','groups.form_teacher','Teacher *'], ['uz','groups.form_teacher',"O'qituvchi *"],
            ['en','groups.form_capacity','Capacity'], ['uz','groups.form_capacity',"Sig'im"],
            ['en','groups.form_price','Price'], ['uz','groups.form_price','Narx'],
            ['en','groups.form_status','Status'], ['uz','groups.form_status','Holati'],
            ['en','groups.form_room','Room'], ['uz','groups.form_room','Xona'],
            ['en','groups.form_schedule_days','Schedule Days'], ['uz','groups.form_schedule_days','Jadval kunlari'],
            ['en','groups.form_start_time','Start Time'], ['uz','groups.form_start_time','Boshlanish vaqti'],
            ['en','groups.form_end_time','End Time'], ['uz','groups.form_end_time','Tugash vaqti'],
            ['en','groups.form_status_active','Active'], ['uz','groups.form_status_active','Faol'],
            ['en','groups.form_status_inactive','Inactive'], ['uz','groups.form_status_inactive','Faol emas'],
            ['en','groups.form_status_completed','Completed'], ['uz','groups.form_status_completed','Yakunlangan'],
            ['en','groups.filter_all_statuses','All statuses'], ['uz','groups.filter_all_statuses','Barcha holatlari'],
            ['en','groups.filter_active','Active'], ['uz','groups.filter_active','Faol'],
            ['en','groups.filter_inactive','Inactive'], ['uz','groups.filter_inactive','Faol emas'],
            ['en','groups.filter_completed','Completed'], ['uz','groups.filter_completed','Yakunlangan'],
            // Leads
            ['en','leads.search_placeholder','Search by name or phone...'], ['uz','leads.search_placeholder',"Ism yoki telefon bo'yicha qidirish..."],
            ['en','leads.filter_all_statuses','All Statuses'], ['uz','leads.filter_all_statuses','Barcha holatlar'],
            ['en','leads.filter_all_priorities','All Priorities'], ['uz','leads.filter_all_priorities','Barcha ustuvorliklar'],
            ['en','leads.filter_all_sources','All Sources'], ['uz','leads.filter_all_sources','Barcha manbalar'],
            ['en','leads.tab_pipeline','Pipeline'], ['uz','leads.tab_pipeline','Quvur'],
            ['en','leads.tab_list','List View'], ['uz','leads.tab_list',"Ro'yxat"],
            ['en','leads.stat_hot','Hot Leads'], ['uz','leads.stat_hot','Issiq mijozlar'],
            ['en','leads.stat_followups','Follow-ups Due'], ['uz','leads.stat_followups','Kuzatish muddati'],
            ['en','leads.stat_trials','Trials Scheduled'], ['uz','leads.stat_trials','Rejalashtirilgan sinovlar'],
            ['en','leads.stat_enrolled','Enrolled (Month)'], ['uz','leads.stat_enrolled',"Ro'yxatdan o'tgan (oy)"],
            ['en','leads.status_new','New'], ['uz','leads.status_new','Yangi'],
            ['en','leads.status_contacted','Contacted'], ['uz','leads.status_contacted',"Bog'lanilgan"],
            ['en','leads.status_interested','Interested'], ['uz','leads.status_interested','Qiziqmoqda'],
            ['en','leads.status_trial_scheduled','Trial Scheduled'], ['uz','leads.status_trial_scheduled','Sinov rejalashtirilgan'],
            ['en','leads.status_trial_done','Trial Done'], ['uz','leads.status_trial_done',"Sinov o'tkazilgan"],
            ['en','leads.status_negotiating','Negotiating'], ['uz','leads.status_negotiating','Muzokaralar'],
            ['en','leads.status_enrolled','Enrolled'], ['uz','leads.status_enrolled',"Ro'yxatdan o'tgan"],
            ['en','leads.status_lost','Lost'], ['uz','leads.status_lost',"Yo'qotilgan"],
            ['en','leads.status_postponed','Postponed'], ['uz','leads.status_postponed','Kechiktirilgan'],
            ['en','leads.priority_hot','Hot'], ['uz','leads.priority_hot','Issiq'],
            ['en','leads.priority_warm','Warm'], ['uz','leads.priority_warm','Iliq'],
            ['en','leads.priority_cold','Cold'], ['uz','leads.priority_cold','Sovuq'],
            ['en','leads.dialog_create_title','Add New Lead'], ['uz','leads.dialog_create_title',"Yangi mijoz qo'shish"],
            ['en','leads.dialog_edit_title','Edit Lead'], ['uz','leads.dialog_edit_title','Mijozni tahrirlash'],
            ['en','leads.dialog_delete_title','Delete Lead'], ['uz','leads.dialog_delete_title',"Mijozni o'chirish"],
            ['en','leads.dialog_convert_title','Convert to Student'], ['uz','leads.dialog_convert_title',"O'quvchiga aylantirish"],
            ['en','leads.form_first_name','First Name *'], ['uz','leads.form_first_name','Ism *'],
            ['en','leads.form_last_name','Last Name *'], ['uz','leads.form_last_name','Familiya *'],
            ['en','leads.form_status','Status'], ['uz','leads.form_status','Holati'],
            ['en','leads.form_priority','Priority'], ['uz','leads.form_priority','Ustuvorlik'],
            ['en','leads.form_source','Source *'], ['uz','leads.form_source','Manba *'],
            ['en','leads.form_followup_date','Follow-up Date'], ['uz','leads.form_followup_date','Kuzatuv sanasi'],
            ['en','leads.form_notes','Notes'], ['uz','leads.form_notes','Izohlar'],
            ['en','leads.menu_edit','Edit'], ['uz','leads.menu_edit','Tahrirlash'],
            ['en','leads.menu_convert','Convert to Student'], ['uz','leads.menu_convert',"O'quvchiga aylantirish"],
            ['en','leads.menu_delete','Delete'], ['uz','leads.menu_delete',"O'chirish"],
            ['en','leads.empty_list','No active leads found'], ['uz','leads.empty_list','Faol mijozlar topilmadi'],
            // Attendance
            ['en','attendance.description','Mark daily attendance for groups'], ['uz','attendance.description','Guruhlar uchun kunlik davomatni belgilang'],
            ['en','attendance.form_group','Group'], ['uz','attendance.form_group','Guruh'],
            ['en','attendance.form_date','Date'], ['uz','attendance.form_date','Sana'],
            ['en','attendance.empty_no_group','Select a group to mark attendance'], ['uz','attendance.empty_no_group','Davomat belgilash uchun guruh tanlang'],
            ['en','attendance.empty_no_students','No students enrolled in this group'], ['uz','attendance.empty_no_students',"Bu guruhda o'quvchilar yo'q"],
            ['en','attendance.mark_all','Mark all as:'], ['uz','attendance.mark_all','Hammasini belgilash:'],
            ['en','attendance.legend_title','Legend'], ['uz','attendance.legend_title','Belgilar izohi'],
            ['en','attendance.toast_saved','Attendance saved successfully'], ['uz','attendance.toast_saved','Davomat muvaffaqiyatli saqlandi'],
            // Payments
            ['en','payments.filter_all_methods','All methods'], ['uz','payments.filter_all_methods','Barcha usullar'],
            ['en','payments.filter_all_groups','All groups'], ['uz','payments.filter_all_groups','Barcha guruhlar'],
            ['en','payments.filter_from_date','From date'], ['uz','payments.filter_from_date','Boshlanish sanasi'],
            ['en','payments.filter_to_date','To date'], ['uz','payments.filter_to_date','Tugash sanasi'],
            ['en','payments.col_datetime','Date & time'], ['uz','payments.col_datetime','Sana va vaqt'],
            ['en','payments.col_actions','Actions'], ['uz','payments.col_actions','Amallar'],
            ['en','payments.empty_msg','No payments found'], ['uz','payments.empty_msg',"To'lovlar topilmadi"],
            ['en','payments.dialog_title','Record Payment'], ['uz','payments.dialog_title',"To'lovni qayd etish"],
            ['en','payments.form_group','Group *'], ['uz','payments.form_group','Guruh *'],
            ['en','payments.form_student','Student *'], ['uz','payments.form_student',"O'quvchi *"],
            ['en','payments.form_months','Months to Pay *'], ['uz','payments.form_months',"To'lanadigan oylar *"],
            ['en','payments.form_amount','Amount *'], ['uz','payments.form_amount','Miqdor *'],
            ['en','payments.form_date','Date *'], ['uz','payments.form_date','Sana *'],
            ['en','payments.form_method','Payment Method'], ['uz','payments.form_method',"To'lov usuli"],
            ['en','payments.form_notes','Notes'], ['uz','payments.form_notes','Izohlar'],
            ['en','payments.form_method_cash','Cash'], ['uz','payments.form_method_cash','Naqd pul'],
            ['en','payments.form_method_card','Card'], ['uz','payments.form_method_card','Karta'],
            ['en','payments.form_method_transfer','Bank Transfer'], ['uz','payments.form_method_transfer',"Bank o'tkazmasi"],
            ['en','payments.form_method_other','Other'], ['uz','payments.form_method_other','Boshqa'],
            ['en','payments.label_group_price','Group Price:'], ['uz','payments.label_group_price','Guruh narxi:'],
            ['en','payments.label_discount','Discount:'], ['uz','payments.label_discount','Chegirma:'],
            ['en','payments.label_monthly_rate','Monthly Rate:'], ['uz','payments.label_monthly_rate',"Oylik to'lov:"],
            ['en','payments.label_remaining','Remaining:'], ['uz','payments.label_remaining','Qoldiq:'],
            ['en','payments.label_total_remaining','Total Remaining:'], ['uz','payments.label_total_remaining','Jami qoldiq:'],
            ['en','payments.btn_pay_full','Pay full remaining'], ['uz','payments.btn_pay_full',"To'liq to'lash"],
            // Expenses
            ['en','expenses.search_placeholder','Search expenses...'], ['uz','expenses.search_placeholder','Xarajatlarni qidirish...'],
            ['en','expenses.btn_clear','Clear'], ['uz','expenses.btn_clear','Tozalash'],
            ['en','expenses.empty_msg','No expenses found'], ['uz','expenses.empty_msg','Xarajatlar topilmadi'],
            ['en','expenses.col_actions','Actions'], ['uz','expenses.col_actions','Amallar'],
            ['en','expenses.dialog_title','Add Expense'], ['uz','expenses.dialog_title',"Xarajat qo'shish"],
            ['en','expenses.form_category','Category *'], ['uz','expenses.form_category','Kategoriya *'],
            ['en','expenses.form_amount','Amount *'], ['uz','expenses.form_amount','Miqdor *'],
            ['en','expenses.form_date','Date *'], ['uz','expenses.form_date','Sana *'],
            ['en','expenses.form_description','Description'], ['uz','expenses.form_description','Tavsif'],
            ['en','expenses.form_notes','Notes'], ['uz','expenses.form_notes','Izohlar'],
            ['en','expenses.form_teacher','Teacher *'], ['uz','expenses.form_teacher',"O'qituvchi *"],
            ['en','expenses.form_month','Month *'], ['uz','expenses.form_month','Oy *'],
            ['en','expenses.form_base_amount','Base Amount *'], ['uz','expenses.form_base_amount','Asosiy miqdor *'],
            ['en','expenses.form_bonus','Bonus'], ['uz','expenses.form_bonus','Bonus'],
            ['en','expenses.form_deduction','Deduction'], ['uz','expenses.form_deduction','Ushlanma'],
            ['en','expenses.salary_heading','Per-Student Salary Calculation'], ['uz','expenses.salary_heading',"O'quvchi boshiga maosh hisoblash"],
            ['en','expenses.btn_add_salary','Add Salary Expense'], ['uz','expenses.btn_add_salary',"Maosh xarajatini qo'shish"],
            ['en','expenses.cat_rent','Rent'], ['uz','expenses.cat_rent','Ijara'],
            ['en','expenses.cat_utilities','Utilities'], ['uz','expenses.cat_utilities','Kommunal xizmatlar'],
            ['en','expenses.cat_supplies','Supplies'], ['uz','expenses.cat_supplies','Materiallar'],
            ['en','expenses.cat_marketing','Marketing'], ['uz','expenses.cat_marketing','Marketing'],
            ['en','expenses.cat_equipment','Equipment'], ['uz','expenses.cat_equipment','Jihozlar'],
            ['en','expenses.cat_maintenance','Maintenance'], ['uz','expenses.cat_maintenance',"Ta'mirlash"],
            ['en','expenses.cat_salaries','Salaries'], ['uz','expenses.cat_salaries','Maoshlar'],
            ['en','expenses.cat_other','Other'], ['uz','expenses.cat_other','Boshqa'],
            // Collections
            ['en','collections.search_placeholder','Search by name or phone...'], ['uz','collections.search_placeholder',"Ism yoki telefon bo'yicha qidirish..."],
            ['en','collections.stat_students','Students with Debt'], ['uz','collections.stat_students',"Qarzdor o'quvchilar"],
            ['en','collections.stat_total','Total Outstanding'], ['uz','collections.stat_total','Jami qarzdorlik'],
            ['en','collections.stat_calls','Calls Made'], ['uz','collections.stat_calls',"Qilingan qo'ng'iroqlar"],
            ['en','collections.empty_search','No matching students found.'], ['uz','collections.empty_search',"Mos o'quvchilar topilmadi."],
            ['en','collections.empty_no_debt','No students with outstanding debt this month.'], ['uz','collections.empty_no_debt',"Bu oy qarzdor o'quvchilar yo'q."],
            ['en','collections.form_placeholder','What was discussed during the call?'], ['uz','collections.form_placeholder',"Qo'ng'iroq davomida nima muhokama qilindi?"],
            ['en','collections.section_history','Call History'], ['uz','collections.section_history',"Qo'ng'iroqlar tarixi"],
            ['en','collections.empty_calls','No calls recorded yet.'], ['uz','collections.empty_calls',"Hali qo'ng'iroqlar qayd etilmagan."],
            ['en','collections.toast_logged','Call logged successfully'], ['uz','collections.toast_logged',"Qo'ng'iroq muvaffaqiyatli qayd etildi"],
            // Reports
            ['en','reports.description','Financial reports and analytics'], ['uz','reports.description','Moliyaviy hisobotlar va tahlillar'],
            ['en','reports.label_from','From'], ['uz','reports.label_from','Dan'],
            ['en','reports.label_to','To'], ['uz','reports.label_to','Gacha'],
            ['en','reports.card_income','Total Income'], ['uz','reports.card_income','Jami daromad'],
            ['en','reports.card_expenses','Total Expenses'], ['uz','reports.card_expenses','Jami xarajatlar'],
            ['en','reports.card_profit','Net Profit'], ['uz','reports.card_profit','Sof foyda'],
            ['en','reports.chart_expenses','Expenses by Category'], ['uz','reports.chart_expenses',"Kategoriya bo'yicha xarajatlar"],
            ['en','reports.chart_methods','Payment Methods'], ['uz','reports.chart_methods',"To'lov usullari"],
            ['en','reports.label_month','Select Month'], ['uz','reports.label_month','Oy tanlang'],
            ['en','reports.card_expected','Expected'], ['uz','reports.card_expected','Kutilgan'],
            ['en','reports.card_collected','Collected'], ['uz','reports.card_collected',"Yig'ilgan"],
            ['en','reports.card_teacher','Teacher Portions'], ['uz','reports.card_teacher',"O'qituvchi ulushi"],
            ['en','reports.card_center','Center Portion'], ['uz','reports.card_center','Markaz ulushi'],
            ['en','reports.card_group_report','Detailed Group Report'], ['uz','reports.card_group_report',"Guruh bo'yicha batafsil hisobot"],
            ['en','reports.empty_select_month','Select a month to view report'], ['uz','reports.empty_select_month',"Hisobotni ko'rish uchun oy tanlang"],
            ['en','reports.card_payments','Payment Details'], ['uz','reports.card_payments',"To'lov tafsilotlari"],
            ['en','reports.card_expenses_detail','Expense Details'], ['uz','reports.card_expenses_detail','Xarajat tafsilotlari'],
            ['en','reports.empty_period','No payments in this period'], ['uz','reports.empty_period',"Bu davrda to'lovlar yo'q"],
            ['en','reports.empty_period_expenses','No expenses in this period'], ['uz','reports.empty_period_expenses',"Bu davrda xarajatlar yo'q"],
            ['en','reports.total_label','TOTAL'], ['uz','reports.total_label','JAMI'],
            ['en','reports.col_group','Group'], ['uz','reports.col_group','Guruh'],
            ['en','reports.col_teacher','Teacher'], ['uz','reports.col_teacher',"O'qituvchi"],
            ['en','reports.col_students','Students'], ['uz','reports.col_students',"O'quvchilar"],
            ['en','reports.col_collected','Collected'], ['uz','reports.col_collected',"Yig'ilgan"],
            ['en','reports.col_remaining','Remaining'], ['uz','reports.col_remaining','Qoldiq'],
            ['en','reports.col_student','Student'], ['uz','reports.col_student',"O'quvchi"],
            ['en','reports.col_method','Method'], ['uz','reports.col_method','Usul'],
            ['en','reports.col_category','Category'], ['uz','reports.col_category','Kategoriya'],
            ['en','reports.col_description','Description'], ['uz','reports.col_description','Tavsif'],
            // Logs
            ['en','logs.btn_export','Export CSV'], ['uz','logs.btn_export','CSV eksport'],
            ['en','logs.search_placeholder','Search username, entity, IP...'], ['uz','logs.search_placeholder',"Foydalanuvchi, ob'ekt, IP bo'yicha qidirish..."],
            ['en','logs.label_from','From'], ['uz','logs.label_from','Dan'],
            ['en','logs.label_to','To'], ['uz','logs.label_to','Gacha'],
            ['en','logs.label_entity','Entity'], ['uz','logs.label_entity',"Ob'ekt"],
            ['en','logs.filter_all_entities','All entities'], ['uz','logs.filter_all_entities',"Barcha ob'ektlar"],
            ['en','logs.label_action','Action'], ['uz','logs.label_action','Amal'],
            ['en','logs.filter_all_actions','All actions'], ['uz','logs.filter_all_actions','Barcha amallar'],
            ['en','logs.btn_clear','Clear'], ['uz','logs.btn_clear','Tozalash'],
            ['en','logs.empty_msg','No logs found'], ['uz','logs.empty_msg','Jurnallar topilmadi'],
            // Settings
            ['en','settings.card_profile_desc','Your personal information'], ['uz','settings.card_profile_desc',"Shaxsiy ma'lumotlaringiz"],
            ['en','settings.form_full_name','Full Name'], ['uz','settings.form_full_name',"To'liq ism"],
            ['en','settings.btn_save_profile','Save Profile'], ['uz','settings.btn_save_profile','Profilni saqlash'],
            ['en','settings.card_org_desc','Business information and branding'], ['uz','settings.card_org_desc',"Biznes ma'lumotlari"],
            ['en','settings.form_org_name','Organization Name'], ['uz','settings.form_org_name','Tashkilot nomi'],
            ['en','settings.form_contact_email','Contact Email'], ['uz','settings.form_contact_email','Aloqa email'],
            ['en','settings.form_contact_phone','Contact Phone'], ['uz','settings.form_contact_phone','Aloqa telefon'],
            ['en','settings.card_notifications_desc','Configure notification preferences'], ['uz','settings.card_notifications_desc','Bildirishnoma sozlamalarini sozlang'],
            ['en','settings.btn_save_preferences','Save Preferences'], ['uz','settings.btn_save_preferences','Sozlamalarni saqlash'],
            ['en','settings.card_security_desc','Password and session settings'], ['uz','settings.card_security_desc','Parol va sessiya sozlamalari'],
            ['en','settings.form_timeout','Session Timeout (minutes)'], ['uz','settings.form_timeout','Sessiya muddati (daqiqalarda)'],
            ['en','settings.btn_save_settings','Save Settings'], ['uz','settings.btn_save_settings','Sozlamalarni saqlash'],
            ['en','settings.btn_change_password','Change Password'], ['uz','settings.btn_change_password',"Parolni o'zgartirish"],
            ['en','settings.card_data_desc','Backup and export options'], ['uz','settings.card_data_desc','Zaxira va eksport imkoniyatlari'],
            ['en','settings.dialog_password_title','Change Password'], ['uz','settings.dialog_password_title',"Parolni o'zgartirish"],
            ['en','settings.form_current_password','Current Password'], ['uz','settings.form_current_password','Joriy parol'],
            ['en','settings.form_new_password','New Password'], ['uz','settings.form_new_password','Yangi parol'],
            ['en','settings.form_confirm_password','Confirm New Password'], ['uz','settings.form_confirm_password','Yangi parolni tasdiqlang'],
            ['en','settings.btn_cancel','Cancel'], ['uz','settings.btn_cancel','Bekor qilish'],
            ['en','settings.btn_change','Change Password'], ['uz','settings.btn_change',"Parolni o'zgartirish"],
            ['en','settings.card_users_desc','Manage users and permissions'], ['uz','settings.card_users_desc','Foydalanuvchilar va ruxsatlarni boshqaring'],
            // Users
            ['en','users.search_placeholder','Search users...'], ['uz','users.search_placeholder','Foydalanuvchilarni qidirish...'],
            ['en','users.empty_msg','No users found'], ['uz','users.empty_msg','Foydalanuvchilar topilmadi'],
            ['en','users.status_active','Active'], ['uz','users.status_active','Faol'],
            ['en','users.status_inactive','Inactive'], ['uz','users.status_inactive','Faol emas'],
            ['en','users.dialog_create_title','Add New User'], ['uz','users.dialog_create_title',"Yangi foydalanuvchi qo'shish"],
            ['en','users.dialog_edit_title','Edit User'], ['uz','users.dialog_edit_title','Foydalanuvchini tahrirlash'],
            ['en','users.form_username','Username *'], ['uz','users.form_username','Foydalanuvchi nomi *'],
            ['en','users.form_full_name','Full Name *'], ['uz','users.form_full_name',"To'liq ism *"],
            ['en','users.form_roles','Roles *'], ['uz','users.form_roles','Rollar *'],
            ['en','users.form_password','Password'], ['uz','users.form_password','Parol'],
            ['en','users.btn_update','Update'], ['uz','users.btn_update','Yangilash'],
            ['en','users.btn_create','Create'], ['uz','users.btn_create','Yaratish'],
            ['en','users.btn_deactivate','Deactivate'], ['uz','users.btn_deactivate',"O'chirish"],
            ['en','users.btn_activate','Activate'], ['uz','users.btn_activate','Faollashtirish'],
            ['en','users.dialog_deactivate','Deactivate user?'], ['uz','users.dialog_deactivate',"Foydalanuvchini o'chirish?"],
            ['en','users.dialog_activate','Activate user?'], ['uz','users.dialog_activate','Foydalanuvchini faollashtirish?'],
            // Permissions
            ['en','permissions.toast_saved','Permissions saved successfully'], ['uz','permissions.toast_saved','Ruxsatlar muvaffaqiyatli saqlandi'],
            ['en','permissions.toast_error','Failed to save permissions'], ['uz','permissions.toast_error','Ruxsatlarni saqlashda xatolik'],
        ];
        foreach ($newKeys as [$lang, $key, $value]) {
            $stmt->execute([$lang, $key, $value]);
        }
    } catch (PDOException $e) { /* ignore */ }

    // Migration 2: Add correctly-named keys that match frontend t() calls (ON CONFLICT DO NOTHING = safe)
    try {
        $stmt = getDB()->prepare("INSERT INTO translations (lang, key, value) VALUES (?, ?, ?) ON CONFLICT DO NOTHING");
        $newKeys2 = [
            // Common - missing keys
            ['en','common.deleted','Deleted'], ['uz','common.deleted',"O'chirilgan"],
            ['en','common.from_date','From date'], ['uz','common.from_date','Boshlanish sanasi'],
            ['en','common.to_date','To date'], ['uz','common.to_date','Tugash sanasi'],
            ['en','common.form_notes','Notes'], ['uz','common.form_notes','Izohlar'],
            ['en','common.notes_placeholder','Any additional notes...'], ['uz','common.notes_placeholder',"Qo'shimcha izohlar..."],
            ['en','common.btn_save','Save'], ['uz','common.btn_save','Saqlash'],
            // Payments - correct-named keys matching frontend t() calls
            ['en','payments.method_cash','Cash'], ['uz','payments.method_cash','Naqd pul'],
            ['en','payments.method_card','Card'], ['uz','payments.method_card','Karta'],
            ['en','payments.method_transfer','Bank Transfer'], ['uz','payments.method_transfer',"Bank o'tkazmasi"],
            ['en','payments.method_other','Other'], ['uz','payments.method_other','Boshqa'],
            ['en','payments.all_payment_months','All payment months'], ['uz','payments.all_payment_months',"Barcha to'lov oylar"],
            ['en','payments.all_course_months','All course months'], ['uz','payments.all_course_months','Barcha kurs oylar'],
            ['en','payments.all_groups','All groups'], ['uz','payments.all_groups','Barcha guruhlar'],
            ['en','payments.all_methods','All methods'], ['uz','payments.all_methods','Barcha usullar'],
            ['en','payments.filter_payment_month','Payment month'], ['uz','payments.filter_payment_month',"To'lov oyi"],
            ['en','payments.filter_course_month','Course month'], ['uz','payments.filter_course_month','Kurs oyi'],
            ['en','payments.filter_group','Group'], ['uz','payments.filter_group','Guruh'],
            ['en','payments.filter_method','Method'], ['uz','payments.filter_method','Usul'],
            ['en','payments.no_data','No payments found'], ['uz','payments.no_data',"To'lovlar topilmadi"],
            ['en','payments.dialog_record','Record Payment'], ['uz','payments.dialog_record',"To'lovni qayd etish"],
            ['en','payments.form_select_group','Select group'], ['uz','payments.form_select_group','Guruh tanlang'],
            ['en','payments.form_select_student','Select student in this group'], ['uz','payments.form_select_student',"Bu guruhdan o'quvchi tanlang"],
            ['en','payments.loading_months','Loading months...'], ['uz','payments.loading_months','Oylar yuklanmoqda...'],
            ['en','payments.loading_debt','Loading debt info...'], ['uz','payments.loading_debt',"Qarz ma'lumotlari yuklanmoqda..."],
            ['en','payments.debt_group_price','Group Price'], ['uz','payments.debt_group_price','Guruh narxi'],
            ['en','payments.debt_discount','Discount'], ['uz','payments.debt_discount','Chegirma'],
            ['en','payments.debt_monthly_rate','Monthly Rate'], ['uz','payments.debt_monthly_rate',"Oylik to'lov"],
            ['en','payments.debt_remaining','Remaining'], ['uz','payments.debt_remaining','Qoldiq'],
            ['en','payments.debt_total_remaining','Total Remaining'], ['uz','payments.debt_total_remaining','Jami qoldiq'],
            ['en','payments.debt_paid','Paid'], ['uz','payments.debt_paid',"To'langan"],
            ['en','payments.toast_recorded','Payment recorded'], ['uz','payments.toast_recorded',"To'lov qayd etildi"],
            ['en','payments.toast_deleted','Payment deleted successfully'], ['uz','payments.toast_deleted',"To'lov muvaffaqiyatli o'chirildi"],
            ['en','payments.toast_delete_error','Cannot delete payment'], ['uz','payments.toast_delete_error',"To'lovni o'chirib bo'lmaydi"],
            ['en','payments.toast_invalid_amount','Enter a valid amount'], ['uz','payments.toast_invalid_amount',"To'g'ri miqdor kiriting"],
            ['en','payments.toast_exceeds_debt','Amount exceeds remaining debt'], ['uz','payments.toast_exceeds_debt','Miqdor qoldiq qarzdan oshib ketdi'],
            ['en','payments.confirm_delete','Are you sure you want to delete this payment? This action marks it as deleted.'], ['uz','payments.confirm_delete',"Bu to'lovni o'chirishni tasdiqlaysizmi?"],
            ['en','payments.no_students_group','No students in this group'], ['uz','payments.no_students_group',"Bu guruhda o'quvchilar yo'q"],
            ['en','payments.no_students_enrolled','No students enrolled in this group'], ['uz','payments.no_students_enrolled',"Bu guruhga o'quvchilar ro'yxatga olinmagan"],
            ['en','payments.amount_exceeds','Amount exceeds remaining debt'], ['uz','payments.amount_exceeds','Miqdor qoldiq qarzdan oshib ketdi'],
            ['en','payments.form_payment_method','Payment Method'], ['uz','payments.form_payment_method',"To'lov usuli"],
            ['en','payments.btn_record','Record Payment'], ['uz','payments.btn_record',"To'lovni qayd etish"],
            // Leads - stat cards
            ['en','leads.stat_active','Active Leads'], ['uz','leads.stat_active','Faol mijozlar'],
            ['en','leads.stat_lost','Lost (Total)'], ['uz','leads.stat_lost',"Yo'qotilgan (jami)"],
            // Leads - tabs and pipeline
            ['en','leads.tab_closed','Closed'], ['uz','leads.tab_closed','Yopilgan'],
            ['en','leads.pipeline_empty','No leads'], ['uz','leads.pipeline_empty',"Mijozlar yo'q"],
            ['en','leads.closed_empty','No closed leads'], ['uz','leads.closed_empty',"Yopilgan mijozlar yo'q"],
            // Leads - card actions
            ['en','leads.card_add_note','Add Note'], ['uz','leads.card_add_note',"Izoh qo'shish"],
            ['en','leads.card_mark_lost','Mark as Lost'], ['uz','leads.card_mark_lost',"Yo'qotilgan deb belgilash"],
            ['en','leads.card_trial','Trial'], ['uz','leads.card_trial','Sinov'],
            ['en','leads.card_reason','Reason'], ['uz','leads.card_reason','Sabab'],
            // Leads - detail panel actions
            ['en','leads.detail_move_to','Move to'], ['uz','leads.detail_move_to',"Ko'chirish:"],
            ['en','leads.detail_convert','Convert'], ['uz','leads.detail_convert','Aylantirish'],
            ['en','leads.detail_edit','Edit'], ['uz','leads.detail_edit','Tahrirlash'],
            ['en','leads.detail_add_note','Add Note'], ['uz','leads.detail_add_note',"Izoh qo'shish"],
            // Leads - detail panel sections
            ['en','leads.detail_contact','Contact'], ['uz','leads.detail_contact','Aloqa'],
            ['en','leads.detail_parent','Parent'], ['uz','leads.detail_parent','Ota-ona'],
            ['en','leads.detail_section','Details'], ['uz','leads.detail_section','Tafsilotlar'],
            ['en','leads.detail_source','Source'], ['uz','leads.detail_source','Manba'],
            ['en','leads.detail_interested','Interested in'], ['uz','leads.detail_interested','Qiziqishi'],
            ['en','leads.detail_birth_year','Birth Year'], ['uz','leads.detail_birth_year',"Tug'ilgan yil"],
            ['en','leads.detail_years','years'], ['uz','leads.detail_years','yosh'],
            ['en','leads.detail_schedule','Preferred Schedule'], ['uz','leads.detail_schedule','Qulaylik vaqti'],
            ['en','leads.detail_budget','Budget'], ['uz','leads.detail_budget','Byudjet'],
            ['en','leads.detail_section_schedule','Schedule'], ['uz','leads.detail_section_schedule','Jadval'],
            ['en','leads.detail_follow_up','Follow-up'], ['uz','leads.detail_follow_up','Kuzatuv'],
            ['en','leads.detail_overdue','Overdue'], ['uz','leads.detail_overdue',"Muddati o'tgan"],
            ['en','leads.detail_today','Today'], ['uz','leads.detail_today','Bugun'],
            ['en','leads.detail_trial','Trial'], ['uz','leads.detail_trial','Sinov'],
            ['en','leads.detail_last_contact','Last contact'], ['uz','leads.detail_last_contact',"Oxirgi aloqa"],
            ['en','leads.detail_section_notes','Notes'], ['uz','leads.detail_section_notes','Izohlar'],
            ['en','leads.detail_section_history','Interaction History'], ['uz','leads.detail_section_history','Muloqotlar tarixi'],
            ['en','leads.detail_no_interactions','No interactions recorded yet.'], ['uz','leads.detail_no_interactions','Hali muloqotlar qayd etilmagan.'],
            ['en','leads.detail_created','Created'], ['uz','leads.detail_created','Yaratilgan'],
            ['en','leads.detail_updated','Updated'], ['uz','leads.detail_updated','Yangilangan'],
            // Leads - form labels
            ['en','leads.form_phone','Phone'], ['uz','leads.form_phone','Telefon'],
            ['en','leads.form_email','Email'], ['uz','leads.form_email','Email'],
            ['en','leads.form_parent_name','Parent Name'], ['uz','leads.form_parent_name',"Ota-ona ismi"],
            ['en','leads.form_parent_phone','Parent Phone'], ['uz','leads.form_parent_phone',"Ota-ona telefoni"],
            ['en','leads.form_interested_courses','Interested Courses'], ['uz','leads.form_interested_courses','Qiziquvchi kurslar'],
            ['en','leads.form_birth_year','Birth Year'], ['uz','leads.form_birth_year',"Tug'ilgan yil"],
            ['en','leads.form_preferred_schedule','Preferred Schedule'], ['uz','leads.form_preferred_schedule','Qulaylik vaqti'],
            ['en','leads.form_budget','Budget'], ['uz','leads.form_budget','Byudjet'],
            ['en','leads.form_trial_date','Trial Date'], ['uz','leads.form_trial_date','Sinov sanasi'],
            ['en','leads.form_trial_group','Trial Group'], ['uz','leads.form_trial_group','Sinov guruhi'],
            ['en','leads.form_select_source','Select source'], ['uz','leads.form_select_source','Manba tanlang'],
            ['en','leads.form_select_group','Select group'], ['uz','leads.form_select_group','Guruh tanlang'],
            ['en','leads.form_follow_up_date','Follow-up Date'], ['uz','leads.form_follow_up_date','Kuzatuv sanasi'],
            ['en','leads.form_referrer_type','Referrer Type'], ['uz','leads.form_referrer_type','Tavsiyachi turi'],
            ['en','leads.form_referrer_student','Student'], ['uz','leads.form_referrer_student',"O'quvchi"],
            ['en','leads.form_referrer_teacher','Teacher'], ['uz','leads.form_referrer_teacher',"O'qituvchi"],
            ['en','leads.form_referrer_staff','Staff'], ['uz','leads.form_referrer_staff','Xodim'],
            ['en','leads.form_referred_by','Referred By'], ['uz','leads.form_referred_by','Kim tavsiya qildi'],
            ['en','leads.form_select_person','Select person'], ['uz','leads.form_select_person','Shaxs tanlang'],
            // Leads - interaction dialog
            ['en','leads.interaction_title','Add Interaction'], ['uz','leads.interaction_title',"Muloqot qo'shish"],
            ['en','leads.interaction_type','Type'], ['uz','leads.interaction_type','Turi'],
            ['en','leads.interaction_notes_label','Notes'], ['uz','leads.interaction_notes_label','Izohlar'],
            ['en','leads.interaction_placeholder','What happened during this interaction?'], ['uz','leads.interaction_placeholder','Bu muloqot davomida nima sodir bo\'ldi?'],
            ['en','leads.interaction_call','Phone Call'], ['uz','leads.interaction_call',"Telefon qo'ng'iroq"],
            ['en','leads.interaction_whatsapp','WhatsApp/Telegram'], ['uz','leads.interaction_whatsapp','WhatsApp/Telegram'],
            ['en','leads.interaction_meeting','Meeting'], ['uz','leads.interaction_meeting','Uchrashuv'],
            ['en','leads.interaction_trial','Trial Class'], ['uz','leads.interaction_trial','Sinov darsi'],
            ['en','leads.interaction_note','Note'], ['uz','leads.interaction_note','Izoh'],
            // Leads - dialogs descriptions
            ['en','leads.delete_description','This action cannot be undone.'], ['uz','leads.delete_description',"Bu amalni ortga qaytarib bo'lmaydi."],
            ['en','leads.convert_description','This will create a new student record and mark this lead as enrolled.'], ['uz','leads.convert_description',"Bu yangi o'quvchi yozuvini yaratadi va bu mijozni ro'yxatga olingan deb belgilaydi."],
            // Leads - toast messages
            ['en','leads.toast_created','Lead created successfully'], ['uz','leads.toast_created','Mijoz muvaffaqiyatli yaratildi'],
            ['en','leads.toast_updated','Lead updated successfully'], ['uz','leads.toast_updated','Mijoz muvaffaqiyatli yangilandi'],
            ['en','leads.toast_deleted','Lead deleted successfully'], ['uz','leads.toast_deleted',"Mijoz muvaffaqiyatli o'chirildi"],
            ['en','leads.toast_delete_error','Cannot delete lead'], ['uz','leads.toast_delete_error',"Mijozni o'chirib bo'lmaydi"],
            ['en','leads.toast_converted','Lead converted to student!'], ['uz','leads.toast_converted',"Mijoz o'quvchiga aylandi!"],
            ['en','leads.toast_interaction','Interaction added'], ['uz','leads.toast_interaction',"Muloqot qo'shildi"],
        ];
        foreach ($newKeys2 as [$lang, $key, $value]) {
            $stmt->execute([$lang, $key, $value]);
        }
    } catch (PDOException $e) { /* ignore */ }
}

// ── JWT helpers ──────────────────────────────────────────────────────────

function base64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode(string $data): string {
    return base64_decode(strtr($data, '-_', '+/'));
}

function jwtEncode(array $payload): string {
    $header = base64url_encode(json_encode(['typ' => 'JWT', 'alg' => 'HS256']));
    $payload = base64url_encode(json_encode($payload));
    $signature = base64url_encode(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    return "$header.$payload.$signature";
}

function jwtDecode(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$header, $payload, $signature] = $parts;
    $expected = base64url_encode(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    if (!hash_equals($expected, $signature)) return null;
    $data = json_decode(base64url_decode($payload), true);
    if (!$data || !isset($data['exp']) || $data['exp'] < time()) return null;
    return $data;
}

// ── Token pair generation ────────────────────────────────────────────────

function generateTokenPair(array $user): array {
    $now = time();

    // Access token (JWT)
    $accessPayload = [
        'sub'  => (int)$user['id'],
        'name' => $user['name'],
        'role' => $user['role'],
        'iat'  => $now,
        'exp'  => $now + JWT_ACCESS_TTL,
    ];
    $accessToken = jwtEncode($accessPayload);

    // Refresh token (random hex, store SHA-256 hash in DB)
    $refreshToken = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $refreshToken);

    $db = getDB();
    $stmt = $db->prepare("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, to_timestamp(?))");
    $stmt->execute([(int)$user['id'], $tokenHash, $now + JWT_REFRESH_TTL]);

    return [
        'access_token'  => $accessToken,
        'refresh_token' => $refreshToken,
        'expires_in'    => JWT_ACCESS_TTL,
    ];
}

// ── Refresh-token cookie helpers ─────────────────────────────────────────

function setRefreshTokenCookie(string $token): void {
    setcookie('refresh_token', $token, [
        'expires'  => time() + JWT_REFRESH_TTL,
        'path'     => '/api',
        'httponly'  => true,
        'samesite' => 'Lax',
        'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    ]);
}

function clearRefreshTokenCookie(): void {
    setcookie('refresh_token', '', [
        'expires'  => 1,
        'path'     => '/api',
        'httponly'  => true,
        'samesite' => 'Lax',
        'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    ]);
}

// ── Authentication (JWT-based) ───────────────────────────────────────────

function auth() {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (strpos($header, 'Bearer ') !== 0) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }

    $token = substr($header, 7);
    $payload = jwtDecode($token);
    if (!$payload) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }

    // Check if user is still active
    $db = getDB();
    $stmt = $db->prepare("SELECT is_active FROM users WHERE id = ?");
    $stmt->execute([$payload['sub']]);
    $user = $stmt->fetch();

    if (!$user || ($user['is_active'] === false || $user['is_active'] === 'f' || $user['is_active'] === 0)) {
        http_response_code(403);
        echo json_encode(['error' => 'Account deactivated']);
        exit;
    }

    $GLOBALS['jwt_user'] = [
        'id'   => (int)$payload['sub'],
        'name' => $payload['name'],
        'role' => $payload['role'],
    ];
}

// Check if user has required role
function requireRole($allowed) {
    auth();
    $roleStr = $GLOBALS['jwt_user']['role'] ?? '';
    $userRoles = array_map('trim', explode(',', $roleStr));
    $userRoles = array_filter($userRoles);
    if (empty($userRoles)) $userRoles = ['user'];
    // owner and developer inherit all admin permissions
    if (array_intersect($userRoles, ['owner', 'developer'])) {
        $userRoles[] = 'admin';
    }
    $allowed = is_array($allowed) ? $allowed : [$allowed];
    if (count(array_intersect($userRoles, $allowed)) > 0) {
        return true;
    }
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden']);
    exit;
}

// Check if user's role has access to a feature (DB-driven, configurable)
function requireFeature($feature) {
    auth();
    $roleStr = $GLOBALS['jwt_user']['role'] ?? '';
    $userRoles = array_map('trim', explode(',', $roleStr));
    $userRoles = array_filter($userRoles);
    if (empty($userRoles)) $userRoles = ['user'];
    // only developer bypasses all feature checks
    if (in_array('developer', $userRoles)) return;
    try {
        $placeholders = implode(',', array_fill(0, count($userRoles), '?'));
        $stmt = getDB()->prepare("SELECT COUNT(*) FROM role_permissions WHERE feature = ? AND role IN ($placeholders)");
        $stmt->execute(array_merge([$feature], array_values($userRoles)));
        if ((int)$stmt->fetchColumn() > 0) return;
    } catch (PDOException $e) { /* ignore */ }
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden']);
    exit;
}

// Activity logging
function activityLog($action, $entity = null, $entity_id = null, $details = null) {
    $user_id = $GLOBALS['jwt_user']['id'] ?? null;
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

    try {
        $db = getDB();
        $stmt = $db->prepare("
            INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address, details, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        ");

        $stmt->execute([
            $user_id,
            $action,
            $entity,
            $entity_id,
            $ip,
            $details
        ]);
    } catch (PDOException $e) {
        error_log("Activity log failed: " . $e->getMessage());
    }
}

// Audit logging with before/after values
function auditLog($action, $entity_type, $entity_id, $old_values = null, $new_values = null) {
    $user_id = $GLOBALS['jwt_user']['id'] ?? null;
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

    try {
        $db = getDB();
        $stmt = $db->prepare("
            INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        ");

        $stmt->execute([
            $user_id,
            $action,
            $entity_type,
            $entity_id,
            $old_values ? json_encode($old_values) : null,
            $new_values ? json_encode($new_values) : null,
            $ip
        ]);
    } catch (PDOException $e) {
        error_log("Audit log failed: " . $e->getMessage());
    }
}

// ── Notification helpers ─────────────────────────────────────────────────

function isNotificationEnabled(string $type): bool
{
    $settingMap = [
        'payment_reminder' => 'notification_payment_reminders',
        'lead_followup_overdue' => 'notification_new_leads',
        'student_enrolled' => 'notification_enrollment',
        'student_removed' => 'notification_enrollment',
        'schedule_change' => 'notification_schedule',
    ];
    $settingKey = $settingMap[$type] ?? null;
    if (!$settingKey) return true; // unknown types default to enabled
    try {
        $db = getDB();
        $stmt = $db->prepare("SELECT value FROM settings WHERE key = ?");
        $stmt->execute([$settingKey]);
        $val = $stmt->fetchColumn();
        return $val !== 'false'; // enabled by default unless explicitly 'false'
    } catch (PDOException $e) {
        return true; // if settings table missing, default to enabled
    }
}

function createNotification(int $userId, string $type, string $title, string $message = '', string $link = ''): void
{
    try {
        if (!isNotificationEnabled($type)) return;
        $db = getDB();
        $stmt = $db->prepare("INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$userId, $type, $title, $message, $link]);
    } catch (PDOException $e) {
        error_log("Notification insert failed: " . $e->getMessage());
    }
}

function getTeacherUserId(int $groupId): ?int
{
    try {
        $db = getDB();
        $stmt = $db->prepare("SELECT u.id FROM users u JOIN groups g ON u.teacher_id = g.teacher_id WHERE g.id = ? AND u.is_active = true LIMIT 1");
        $stmt->execute([$groupId]);
        $row = $stmt->fetch();
        return $row ? (int)$row['id'] : null;
    } catch (PDOException $e) {
        error_log("getTeacherUserId failed: " . $e->getMessage());
        return null;
    }
}
