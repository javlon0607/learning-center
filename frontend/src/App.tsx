import { Routes, Route, Navigate } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MainLayout } from '@/components/layout/MainLayout'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { Students } from '@/pages/Students'
import { StudentDetail } from '@/pages/StudentDetail'
import { Groups } from '@/pages/Groups'
import { GroupDetail } from '@/pages/GroupDetail'
import { Teachers } from '@/pages/Teachers'
import { TeacherDetail } from '@/pages/TeacherDetail'
import { Leads } from '@/pages/Leads'
import { Attendance } from '@/pages/Attendance'
import { Payments } from '@/pages/Payments'
import { Expenses } from '@/pages/Expenses'
import { Salaries } from '@/pages/Salaries'
import { Reports } from '@/pages/Reports'
import { Settings } from '@/pages/Settings'
import { Users } from '@/pages/Users'

function App() {
  return (
    <TooltipProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="students" element={<Students />} />
          <Route path="students/:id" element={<StudentDetail />} />
          <Route path="groups" element={<Groups />} />
          <Route path="groups/:id" element={<GroupDetail />} />
          <Route path="teachers" element={<Teachers />} />
          <Route path="teachers/:id" element={<TeacherDetail />} />
          <Route path="leads" element={<Leads />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="payments" element={<Payments />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="salaries" element={<Salaries />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="settings/users" element={<Users />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TooltipProvider>
  )
}

export default App
