<?php
require 'config.php';
auth();

// Handle POST requests
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    
    if ($action === 'create') {
        $stmt = db()->prepare("INSERT INTO students (first_name, last_name, phone, email, parent_name, parent_phone, notes) VALUES (?,?,?,?,?,?,?)");
        $stmt->execute([$_POST['first_name'], $_POST['last_name'], $_POST['phone'], $_POST['email'], $_POST['parent_name'], $_POST['parent_phone'], $_POST['notes']]);
    } elseif ($action === 'update') {
        $stmt = db()->prepare("UPDATE students SET first_name=?, last_name=?, phone=?, email=?, parent_name=?, parent_phone=?, notes=?, status=? WHERE id=?");
        $stmt->execute([$_POST['first_name'], $_POST['last_name'], $_POST['phone'], $_POST['email'], $_POST['parent_name'], $_POST['parent_phone'], $_POST['notes'], $_POST['status'], $_POST['id']]);
    } elseif ($action === 'delete') {
        db()->prepare("DELETE FROM students WHERE id=?")->execute([$_POST['id']]);
    }
    header('Location: students.php');
    exit;
}

$students = db()->query("SELECT * FROM students ORDER BY created_at DESC")->fetchAll();
?>
<!DOCTYPE html>
<html>
<head>
    <title>Students</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
</head>
<body class="bg-gray-100" x-data="{modal: false, form: {}, edit: false}">
    <div class="flex">
        <nav class="bg-gray-800 text-white w-64 min-h-screen p-4">
            <h2 class="text-xl font-bold mb-6">Learning CRM</h2>
            <a href="dashboard.php" class="block py-2 px-4 hover:bg-gray-700 rounded mb-2">📊 Dashboard</a>
            <a href="students.php" class="block py-2 px-4 bg-gray-700 rounded mb-2">👥 Students</a>
            <a href="teachers.php" class="block py-2 px-4 hover:bg-gray-700 rounded mb-2">👨‍🏫 Teachers</a>
            <a href="groups.php" class="block py-2 px-4 hover:bg-gray-700 rounded mb-2">📚 Groups</a>
            <a href="payments.php" class="block py-2 px-4 hover:bg-gray-700 rounded mb-2">💰 Payments</a>
            <a href="expenses.php" class="block py-2 px-4 hover:bg-gray-700 rounded mb-2">📉 Expenses</a>
            <a href="logout.php" class="block py-2 px-4 hover:bg-red-700 rounded mt-4">🚪 Logout</a>
        </nav>
        
        <main class="flex-1 p-8">
            <div class="flex justify-between items-center mb-8">
                <h1 class="text-3xl font-bold">Students</h1>
                <button @click="modal=true; form={}; edit=false" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">+ Add Student</button>
            </div>
            
            <div class="bg-white rounded-lg shadow overflow-hidden">
                <table class="w-full">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Parent</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
                        <?php foreach($students as $s): ?>
                        <tr>
                            <td class="px-6 py-4"><?=htmlspecialchars($s['first_name'].' '.$s['last_name'])?></td>
                            <td class="px-6 py-4"><?=htmlspecialchars($s['phone']??'-')?></td>
                            <td class="px-6 py-4"><?=htmlspecialchars($s['parent_name']??'-')?></td>
                            <td class="px-6 py-4"><span class="px-2 py-1 text-xs rounded bg-green-100 text-green-800"><?=$s['status']?></span></td>
                            <td class="px-6 py-4">
                                <button @click="form=<?=htmlspecialchars(json_encode($s))?>; modal=true; edit=true" class="text-blue-600 hover:underline mr-3">Edit</button>
                                <form method="POST" class="inline" onsubmit="return confirm('Delete?')">
                                    <input type="hidden" name="action" value="delete">
                                    <input type="hidden" name="id" value="<?=$s['id']?>">
                                    <button class="text-red-600 hover:underline">Delete</button>
                                </form>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
            
            <!-- Modal -->
            <div x-show="modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" x-cloak style="display:none">
                <div class="bg-white rounded-lg p-8 w-2/3 max-h-screen overflow-y-auto" @click.away="modal=false">
                    <h2 class="text-2xl font-bold mb-4" x-text="edit ? 'Edit Student' : 'Add Student'"></h2>
                    <form method="POST">
                        <input type="hidden" name="action" :value="edit ? 'update' : 'create'">
                        <input type="hidden" name="id" x-model="form.id">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium mb-1">First Name*</label>
                                <input type="text" name="first_name" x-model="form.first_name" class="w-full border rounded px-3 py-2" required>
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-1">Last Name*</label>
                                <input type="text" name="last_name" x-model="form.last_name" class="w-full border rounded px-3 py-2" required>
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-1">Phone</label>
                                <input type="text" name="phone" x-model="form.phone" class="w-full border rounded px-3 py-2">
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-1">Email</label>
                                <input type="email" name="email" x-model="form.email" class="w-full border rounded px-3 py-2">
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-1">Parent Name</label>
                                <input type="text" name="parent_name" x-model="form.parent_name" class="w-full border rounded px-3 py-2">
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-1">Parent Phone</label>
                                <input type="text" name="parent_phone" x-model="form.parent_phone" class="w-full border rounded px-3 py-2">
                            </div>
                            <div x-show="edit" class="col-span-2">
                                <label class="block text-sm font-medium mb-1">Status</label>
                                <select name="status" x-model="form.status" class="w-full border rounded px-3 py-2">
                                    <option value="active">Active</option>
                                    <option value="suspended">Suspended</option>
                                    <option value="graduated">Graduated</option>
                                </select>
                            </div>
                            <div class="col-span-2">
                                <label class="block text-sm font-medium mb-1">Notes</label>
                                <textarea name="notes" x-model="form.notes" class="w-full border rounded px-3 py-2" rows="3"></textarea>
                            </div>
                        </div>
                        <div class="flex justify-end space-x-3 mt-6">
                            <button type="button" @click="modal=false" class="px-4 py-2 border rounded">Cancel</button>
                            <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
                        </div>
                    </form>
                </div>
            </div>
        </main>
    </div>
</body>
</html>
