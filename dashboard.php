<?php
require 'config.php';
auth();

$stats = [
    'students' => db()->query("SELECT COUNT(*) FROM students WHERE status='active'")->fetchColumn(),
    'teachers' => db()->query("SELECT COUNT(*) FROM teachers WHERE status='active'")->fetchColumn(),
    'groups' => db()->query("SELECT COUNT(*) FROM groups WHERE status='active'")->fetchColumn(),
    'revenue' => db()->query("SELECT COALESCE(SUM(amount),0) FROM payments WHERE EXTRACT(MONTH FROM payment_date)=EXTRACT(MONTH FROM CURRENT_DATE)")->fetchColumn(),
    'expenses' => db()->query("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE EXTRACT(MONTH FROM expense_date)=EXTRACT(MONTH FROM CURRENT_DATE)")->fetchColumn(),
];
$stats['profit'] = $stats['revenue'] - $stats['expenses'];
?>
<!DOCTYPE html>
<html>
<head>
    <title>Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
</head>
<body class="bg-gray-100">
    <div class="flex">
        <nav class="bg-gray-800 text-white w-64 min-h-screen p-4">
            <h2 class="text-xl font-bold mb-6">Learning CRM</h2>
            <a href="dashboard.php" class="block py-2 px-4 bg-gray-700 rounded mb-2">📊 Dashboard</a>
            <a href="students.php" class="block py-2 px-4 hover:bg-gray-700 rounded mb-2">👥 Students</a>
            <a href="teachers.php" class="block py-2 px-4 hover:bg-gray-700 rounded mb-2">👨‍🏫 Teachers</a>
            <a href="groups.php" class="block py-2 px-4 hover:bg-gray-700 rounded mb-2">📚 Groups</a>
            <a href="payments.php" class="block py-2 px-4 hover:bg-gray-700 rounded mb-2">💰 Payments</a>
            <a href="expenses.php" class="block py-2 px-4 hover:bg-gray-700 rounded mb-2">📉 Expenses</a>
            <a href="logout.php" class="block py-2 px-4 hover:bg-red-700 rounded mt-4">🚪 Logout</a>
        </nav>
        
        <main class="flex-1 p-8">
            <h1 class="text-3xl font-bold mb-8">Dashboard</h1>
            
            <div class="grid grid-cols-4 gap-6 mb-8">
                <div class="bg-white p-6 rounded-lg shadow">
                    <div class="text-gray-600 text-sm">Students</div>
                    <div class="text-3xl font-bold"><?=$stats['students']?></div>
                </div>
                <div class="bg-white p-6 rounded-lg shadow">
                    <div class="text-gray-600 text-sm">Groups</div>
                    <div class="text-3xl font-bold"><?=$stats['groups']?></div>
                </div>
                <div class="bg-white p-6 rounded-lg shadow">
                    <div class="text-gray-600 text-sm">Revenue</div>
                    <div class="text-3xl font-bold text-green-600">$<?=number_format($stats['revenue'],2)?></div>
                </div>
                <div class="bg-white p-6 rounded-lg shadow">
                    <div class="text-gray-600 text-sm">Profit</div>
                    <div class="text-3xl font-bold <?=$stats['profit']>=0?'text-green-600':'text-red-600'?>">$<?=number_format($stats['profit'],2)?></div>
                </div>
            </div>
            
            <div class="bg-white p-6 rounded-lg shadow">
                <h2 class="text-xl font-bold mb-4">Quick Actions</h2>
                <div class="space-x-4">
                    <a href="students.php" class="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">+ Add Student</a>
                    <a href="payments.php" class="inline-block bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">+ Record Payment</a>
                    <a href="groups.php" class="inline-block bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">+ Create Group</a>
                </div>
            </div>
        </main>
    </div>
</body>
</html>
