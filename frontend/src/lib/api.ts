const API_BASE = '/api'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Global session expiry handler — set by AuthProvider
let onSessionExpired: (() => void) | null = null
export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler
}

// ── Token management (in-memory only) ────────────────────────────────────

let accessToken: string | null = null
let tokenExpiresAt = 0

export function setAccessToken(token: string, expiresIn: number) {
  accessToken = token
  tokenExpiresAt = Date.now() + expiresIn * 1000
}

export function getAccessToken() {
  return accessToken
}

export function clearTokens() {
  accessToken = null
  tokenExpiresAt = 0
}

// ── Refresh logic ────────────────────────────────────────────────────────

let refreshPromise: Promise<boolean> | null = null

export async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        clearTokens()
        return false
      }
      const data = await res.json()
      setAccessToken(data.access_token, data.expires_in)
      return true
    } catch {
      clearTokens()
      return false
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

// ── Fetch with auth ──────────────────────────────────────────────────────

async function fetchWithAuth(url: string, init: RequestInit = {}): Promise<Response> {
  // Proactive refresh if token expires within 60s
  if (accessToken && tokenExpiresAt - Date.now() < 60_000) {
    await refreshAccessToken()
  }

  const headers = new Headers(init.headers)
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  let response = await fetch(url, { ...init, headers, credentials: 'include' })

  // On 401, try refresh once and retry
  if (response.status === 401 && accessToken) {
    const ok = await refreshAccessToken()
    if (ok) {
      const retryHeaders = new Headers(init.headers)
      retryHeaders.set('Authorization', `Bearer ${accessToken}`)
      response = await fetch(url, { ...init, headers: retryHeaders, credentials: 'include' })
    }
  }

  return response
}

// ── Response handler ─────────────────────────────────────────────────────

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    if (response.status === 401) {
      onSessionExpired?.()
    }
    throw new ApiError(
      response.status,
      data.error || 'An error occurred',
      data.code
    )
  }
  return response.json()
}

export const api = {
  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${API_BASE}${endpoint}`, window.location.origin)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.append(key, value)
      })
    }
    const response = await fetchWithAuth(url.toString())
    return handleResponse<T>(response)
  },

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetchWithAuth(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(response)
  },

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetchWithAuth(`${API_BASE}${endpoint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(response)
  },

  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetchWithAuth(`${API_BASE}${endpoint}`, {
      method: 'DELETE',
    })
    return handleResponse<T>(response)
  },
}

// Shared source options for leads and students
export const sourceOptions = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'phone', label: 'Phone Call' },
  { value: 'flyer', label: 'Flyer/Banner' },
  { value: 'event', label: 'Event' },
  { value: 'other', label: 'Other' },
] as const

export interface Referrer {
  id: number
  name: string
}

// Auth API
export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ user: User; access_token: string; expires_in: number }>('/login', { username, password }),

  logout: () => api.post<{ ok: boolean }>('/logout'),

  me: () => api.get<{ user: User }>('/me'),
}

// Students API
export const studentsApi = {
  getAll: (params?: { status?: string; search?: string; group_id?: string; source?: string }) =>
    api.get<Student[]>('/students', params),

  getById: (id: number) => api.get<Student>(`/students/${id}`),

  create: (data: Omit<Student, 'id' | 'created_at' | 'groups_list' | 'enrollments' | 'current_month_debt' | 'current_month_expected' | 'current_month_paid'>) =>
    api.post<{ id: number }>('/students', data),

  update: (id: number, data: Partial<Student>) =>
    api.put<{ ok: boolean }>(`/students/${id}`, data),

  delete: (id: number) => api.delete<{ ok: boolean }>(`/students/${id}`),
}

// Teachers API
export const teachersApi = {
  getAll: () => api.get<Teacher[]>('/teachers'),

  getById: (id: number) => api.get<Teacher>(`/teachers/${id}`),

  create: (data: { user_id: number; subjects?: string; salary_type?: Teacher['salary_type']; salary_amount?: number; status?: Teacher['status'] }) =>
    api.post<{ id: number }>('/teachers', data),

  update: (id: number, data: Partial<Teacher>) =>
    api.put<{ ok: boolean }>(`/teachers/${id}`, data),

  delete: (id: number) => api.delete<{ ok: boolean }>(`/teachers/${id}`),
}

// Groups API
export const groupsApi = {
  getAll: () => api.get<Group[]>('/groups'),

  getById: (id: number) => api.get<Group>(`/groups/${id}`),

  create: (data: Omit<Group, 'id' | 'created_at' | 'teacher_name'>) =>
    api.post<{ id: number }>('/groups', data),

  update: (id: number, data: Partial<Group>) =>
    api.put<{ ok: boolean }>(`/groups/${id}`, data),

  delete: (id: number) => api.delete<{ ok: boolean }>(`/groups/${id}`),
}

// Enrollments API
export const enrollmentsApi = {
  getByGroup: (groupId: number) =>
    api.get<Enrollment[]>('/enrollments', { group_id: String(groupId) }),

  getByStudent: (studentId: number) =>
    api.get<Enrollment[]>('/enrollments', { student_id: String(studentId) }),

  create: (studentId: number, groupId: number, discountPercentage: number = 0) =>
    api.post<{ ok: boolean }>('/enrollments', { student_id: studentId, group_id: groupId, discount_percentage: discountPercentage }),

  update: (id: number, data: { discount_percentage: number }) =>
    api.put<{ ok: boolean }>(`/enrollments/${id}`, data),

  delete: (id: number) => api.delete<{ ok: boolean }>(`/enrollments/${id}`),
}

// Group Transfers API
export const groupTransfersApi = {
  getByStudent: (studentId: number) =>
    api.get<GroupTransfer[]>('/group-transfers', { student_id: String(studentId) }),

  getAll: () => api.get<GroupTransfer[]>('/group-transfers'),

  transfer: (data: {
    student_id: number
    from_group_id: number
    to_group_id: number
    reason?: string
    discount_percentage?: number
  }) => api.post<{ ok: boolean; paid_month_transferred: boolean; message: string }>('/group-transfers', data),
}

// Payments API
export const paymentsApi = {
  getAll: (params?: { student_id?: string }) => api.get<Payment[]>('/payments', params),

  create: (data: Omit<Payment, 'id' | 'created_at' | 'student_name' | 'group_name' | 'months_covered'> & { months?: string[] }) =>
    api.post<{ id: number; invoice_no: string }>('/payments', data),

  delete: (id: number) => api.delete<{ ok: boolean }>(`/payments/${id}`),
}

// Student Debt API
export const studentDebtApi = {
  get: (studentId: number, groupId: number, month: string) =>
    api.get<StudentDebt>('/student-debt', { student_id: String(studentId), group_id: String(groupId), month }),
}

// Expenses API
export const expensesApi = {
  getAll: () => api.get<Expense[]>('/expenses'),

  create: (data: Omit<Expense, 'id' | 'created_at'>) =>
    api.post<{ id: number }>('/expenses', data),

  delete: (id: number) => api.delete<{ ok: boolean }>(`/expenses/${id}`),
}

// Leads API
export const leadsApi = {
  getAll: () => api.get<Lead[]>('/leads'),

  create: (data: Omit<Lead, 'id' | 'created_at' | 'updated_at' | 'converted_student_id' | 'trial_group_name' | 'interaction_count'>) =>
    api.post<{ id: number }>('/leads', data),

  update: (id: number, data: Partial<Lead>) =>
    api.put<{ ok: boolean }>(`/leads/${id}`, data),

  delete: (id: number) => api.delete<{ ok: boolean }>(`/leads/${id}`),

  convert: (id: number) =>
    api.post<{ student_id: number }>(`/leads/${id}/convert`),

  getStats: () => api.get<LeadStats>('/lead-stats'),

  getInteractions: (leadId: number) =>
    api.get<LeadInteraction[]>(`/leads/${leadId}/interactions`),

  addInteraction: (leadId: number, data: Omit<LeadInteraction, 'id' | 'lead_id' | 'created_at' | 'created_by' | 'created_by_name'>) =>
    api.post<{ id: number }>(`/leads/${leadId}/interactions`, data),
}

// Referrers API
export const referrersApi = {
  getByType: (type: 'student' | 'teacher' | 'user') =>
    api.get<Referrer[]>('/referrers', { type }),
}

// Attendance API
export const attendanceApi = {
  get: (groupId: number, date: string) =>
    api.get<{ date: string; group_id: number; rows: AttendanceRow[] }>('/attendance', {
      group_id: String(groupId),
      date,
    }),

  save: (groupId: number, date: string, rows: { student_id: number; status: string }[]) =>
    api.post<{ ok: boolean }>('/attendance', { group_id: groupId, date, rows }),
}

// Salary Slips API
export const salarySlipsApi = {
  getAll: () => api.get<SalarySlip[]>('/salary-slips'),

  create: (data: Omit<SalarySlip, 'id' | 'created_at' | 'teacher_name' | 'total'>) =>
    api.post<{ id: number }>('/salary-slips', data),

  update: (id: number, data: { status: string; paid_at?: string }) =>
    api.put<{ ok: boolean }>(`/salary-slips/${id}`, data),

  delete: (id: number) => api.delete<{ ok: boolean }>(`/salary-slips/${id}`),

  preview: (teacherId: number, month: string) =>
    api.get<TeacherSalaryPreview>('/teacher-salary-preview', { teacher_id: String(teacherId), month }),
}

// Dashboard API
export interface RevenueChartData {
  months: {
    month: string
    month_year: string
    revenue: number
    expenses: number
    profit: number
  }[]
  growth_percentage: number
}

export const dashboardApi = {
  getStats: () =>
    api.get<DashboardStats>('/dashboard/stats'),

  getRevenueChart: () =>
    api.get<RevenueChartData>('/dashboard/revenue-chart'),
}

// Reports API
export const reportsApi = {
  getPayments: (from: string, to: string) =>
    api.get<Payment[]>('/reports/payments', { from, to }),

  getExpenses: (from: string, to: string) =>
    api.get<Expense[]>('/reports/expenses', { from, to }),

  getIncomeExpense: (from: string, to: string) =>
    api.get<{ from: string; to: string; income: number; expense: number }>('/reports/income-expense', { from, to }),

  getMonthly: (month: string) =>
    api.get<MonthlyReport>('/reports/monthly', { month }),

  getGroupDebtors: (groupId: number, month: string) =>
    api.get<GroupDebtor[]>('/group-debtors', { group_id: String(groupId), month }),
}

export interface GroupDebtor {
  id: number
  first_name: string
  last_name: string
  phone?: string
  expected: number
  paid: number
  debt: number
}

// Users API (admin only)
export const usersApi = {
  getAll: () => api.get<User[]>('/users'),

  create: (data: { username: string; password: string; name: string; role: string | UserRole[]; teacher_id?: number | null; email?: string; phone?: string }) =>
    api.post<{ id: number }>('/users', data),

  update: (id: number, data: Partial<Pick<User, 'name' | 'role' | 'email' | 'phone' | 'is_active' | 'teacher_id'>> & { password?: string }) =>
    api.put<{ ok: boolean }>(`/users/${id}`, data),

  delete: (id: number) => api.delete<{ ok: boolean }>(`/users/${id}`),
}

// Unified audit log: tracks all entity changes (Students, Teachers, Groups, Leads, Users, Payments, Discounts, Attendance, Salaries) and actions (login, logout, lead_convert)
export interface AuditLogResponse {
  rows: AuditLogEntry[]
  total: number
}

export const auditLogApi = {
  getList: (params?: { entity_type?: string; entity_id?: string; action?: string; date_from?: string; date_to?: string; limit?: string; offset?: string }) =>
    api.get<AuditLogResponse>('/audit-log', params as Record<string, string> | undefined),
}

// Student Attendance API
export interface StudentAttendanceRecord {
  attendance_date: string
  status: 'present' | 'absent' | 'late' | 'excused'
  group_name: string
  group_id: number
}

export const studentAttendanceApi = {
  getByStudent: (studentId: number, limit?: number) =>
    api.get<StudentAttendanceRecord[]>('/student-attendance', {
      student_id: String(studentId),
      ...(limit ? { limit: String(limit) } : {}),
    }),
}

// Collections API
export interface CollectionDebtor {
  id: number
  first_name: string
  last_name: string
  phone?: string
  parent_phone?: string
  enrollments: { group_id: number; group_name: string; price: number; discount: number }[]
  expected: number
  paid: number
  debt: number
  last_call_date?: string
  last_call_notes?: string
  call_count: number
}

export interface CollectionCall {
  id: number
  student_id: number
  notes: string
  created_by: number | null
  created_by_name: string | null
  created_at: string
}

export const collectionsApi = {
  getDebtors: () => api.get<CollectionDebtor[]>('/collections'),
  getCallHistory: (studentId: number) =>
    api.get<CollectionCall[]>('/collection-calls', { student_id: String(studentId) }),
  addCall: (studentId: number, notes: string) =>
    api.post<{ id: number }>('/collection-calls', { student_id: studentId, notes }),
}

// Student Notes API
export interface StudentNote {
  id: number
  student_id: number
  content: string
  created_by: number | null
  created_by_name: string | null
  created_at: string
}

export const studentNotesApi = {
  getByStudent: (studentId: number) =>
    api.get<StudentNote[]>('/student-notes', { student_id: String(studentId) }),
  create: (studentId: number, content: string) =>
    api.post<{ id: number }>('/student-notes', { student_id: studentId, content }),
  delete: (id: number) => api.delete<{ ok: boolean }>(`/student-notes/${id}`),
}

// Birthdays API
export interface BirthdayStudent {
  id: number
  first_name: string
  last_name: string
  dob: string
  phone?: string
  status: string
}

export const birthdaysApi = {
  getToday: () => api.get<BirthdayStudent[]>('/birthdays'),
}

// Notifications API
export interface Notification {
  id: number
  user_id: number
  type: string
  title: string
  message?: string
  link?: string
  is_read: boolean
  created_at: string
}

export const notificationsApi = {
  getAll: () => api.get<Notification[]>('/notifications'),
  markRead: (id: number) => api.put<{ ok: boolean }>(`/notifications/${id}/read`),
  markAllRead: () => api.put<{ ok: boolean }>('/notifications/read-all'),
}

// Settings API
export interface SystemSettings {
  organization_name?: string
  currency?: string
  session_timeout?: string
  payment_reminder_days?: string
  payment_reminder_day?: string
  notification_payment_reminders?: string
  notification_new_leads?: string
  notification_enrollment?: string
  notification_schedule?: string
  notification_attendance?: string
  notification_birthdays?: string
  contact_email?: string
  contact_phone?: string
}

export const settingsApi = {
  getAll: () => api.get<SystemSettings>('/settings'),
  update: (data: Partial<SystemSettings>) => api.put<{ ok: boolean }>('/settings', data),
}

// Cron Notifications API (admin trigger)
export const cronNotificationsApi = {
  run: () => api.post<{ ok: boolean; notifications_created: number }>('/cron-notifications'),
}

// Profile API (update current user)
export const profileApi = {
  update: (data: { name?: string; email?: string; phone?: string }) =>
    api.put<{ ok: boolean }>('/profile', data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put<{ ok: boolean }>('/profile/password', { current_password: currentPassword, new_password: newPassword }),
}

// Types
export type UserRole = 'admin' | 'manager' | 'teacher' | 'accountant' | 'user'

export interface User {
  id: number
  username: string
  name: string
  /** Comma-separated roles, e.g. "admin,teacher" */
  role: string
  teacher_id?: number | null
  teacher_name?: string | null
  email?: string
  phone?: string
  is_active?: boolean
  last_login?: string
}

export interface StudentEnrollment {
  group_id: number
  group_name: string
  price: number
  discount: number
}

export interface Student {
  id: number
  first_name: string
  last_name: string
  dob?: string
  phone?: string
  email?: string
  parent_name?: string
  parent_phone?: string
  parent_email?: string
  gender?: string
  address?: string
  emergency_contact?: string
  emergency_phone?: string
  photo_url?: string
  status: 'active' | 'inactive' | 'graduated' | 'suspended'
  notes?: string
  created_at: string
  // Source tracking
  source?: string
  referred_by_type?: 'student' | 'teacher' | 'user'
  referred_by_id?: number
  referred_by_name?: string
  lead_id?: number
  created_by?: number
  created_by_name?: string
  // Enriched fields
  groups_list?: string
  enrollments?: StudentEnrollment[]
  current_month_debt?: number
  current_month_expected?: number
  current_month_paid?: number
}

export interface Teacher {
  id: number
  first_name: string
  last_name: string
  phone?: string
  email?: string
  subjects?: string
  salary_type: 'fixed' | 'per_student'
  salary_amount: number
  status: 'active' | 'inactive'
  created_at: string
}

export interface Group {
  id: number
  name: string
  subject?: string
  teacher_id?: number
  teacher_name?: string
  capacity: number
  student_count: number
  price: number
  level?: string
  start_date?: string
  end_date?: string
  pricing_type?: 'monthly' | 'per_session' | 'package'
  schedule_days?: string
  schedule_time_start?: string
  schedule_time_end?: string
  room?: string
  status: 'active' | 'inactive' | 'completed'
  created_at: string
}

export interface Enrollment {
  id: number
  student_id: number
  group_id: number
  student_name?: string
  group_name?: string
  group_price?: number
  enrolled_at: string
  discount_percentage: number
}

export interface GroupTransfer {
  id: number
  student_id: number
  from_group_id: number
  to_group_id: number
  from_group_name?: string
  to_group_name?: string
  student_name?: string
  transfer_date: string
  reason?: string
  paid_month?: string
  discount_percentage: number
  transferred_by?: number
  transferred_by_name?: string
  created_at: string
}

export interface Payment {
  id: number
  student_id: number
  group_id?: number
  student_name?: string
  group_name?: string
  amount: number
  payment_date: string
  method: 'cash' | 'card' | 'transfer' | 'other'
  notes?: string
  created_at: string
  months_covered?: { month: string; amount: number }[]
  deleted_at?: string
}

export interface StudentDebt {
  student_id: number
  group_id: number
  month: string
  group_price: number
  discount_percentage: number
  monthly_debt: number
  paid_amount: number
  remaining_debt: number
}

export interface MonthlyReportGroup {
  group_id: number
  group_name: string
  teacher_name: string
  teacher_salary_type: string
  teacher_salary_amount: number
  student_count: number
  paid_student_count: number
  expected_amount: number
  collected_amount: number
  remaining_debt: number
  payment_percentage: number
  teacher_portion: number
  center_portion: number
}

export interface MonthlyReport {
  month: string
  groups: MonthlyReportGroup[]
  totals: {
    student_count: number
    paid_student_count: number
    expected_amount: number
    collected_amount: number
    remaining_debt: number
    payment_percentage: number
    teacher_portion: number
    center_portion: number
  }
}

export interface Expense {
  id: number
  category: string
  amount: number
  description?: string
  expense_date: string
  created_at: string
  deleted_at?: string
}

export interface Lead {
  id: number
  first_name: string
  last_name: string
  phone?: string
  email?: string
  parent_name?: string
  parent_phone?: string
  source: string
  status: 'new' | 'contacted' | 'interested' | 'trial_scheduled' | 'trial_completed' | 'negotiating' | 'enrolled' | 'lost' | 'postponed'
  notes?: string
  follow_up_date?: string
  converted_student_id?: number
  created_at: string
  updated_at: string
  // Enhanced fields
  priority?: 'hot' | 'warm' | 'cold'
  interested_courses?: string
  trial_date?: string
  trial_group_id?: number
  trial_group_name?: string
  last_contact_date?: string
  birth_year?: number
  preferred_schedule?: string
  budget?: string
  loss_reason?: string
  interaction_count?: number
  // Source tracking
  created_by?: number
  referred_by_type?: 'student' | 'teacher' | 'user'
  referred_by_id?: number
}

export interface LeadInteraction {
  id: number
  lead_id: number
  type: 'call' | 'whatsapp' | 'email' | 'meeting' | 'trial' | 'note'
  notes?: string
  scheduled_at?: string
  completed_at?: string
  created_by?: number
  created_by_name?: string
  created_at: string
}

export interface LeadStats {
  by_status: Record<string, number>
  follow_ups_today: number
  follow_ups_overdue: number
  trials_scheduled: number
  hot_leads: number
  conversions_this_month: number
  by_source: { source: string; count: number }[]
}

export interface AttendanceRow {
  student_id: number
  student_name: string
  attendance_id?: number
  attendance_status?: 'present' | 'absent' | 'late' | 'excused'
}

export interface SalarySlip {
  id: number
  teacher_id: number
  teacher_name?: string
  period_start: string
  period_end: string
  base_amount: number
  bonus: number
  deduction: number
  total: number
  status: 'pending' | 'paid'
  paid_at?: string
  notes?: string
  created_at: string
  deleted_at?: string
}

export interface TeacherSalaryPreview {
  teacher_id: number
  month: string
  salary_type: 'fixed' | 'per_student'
  salary_percentage: number
  collected_amount: number
  base_amount: number
}

export interface DashboardStats {
  students: number
  teachers: number
  groups: number
  revenue: number
  expenses: number
  profit: number
  leads_pending: number
  trends?: {
    students: number
    revenue: number
    expenses: number
    profit: number
  }
}

/** Unified audit log: tracks all entity changes and actions with before/after values and timestamp. */
export interface AuditLogEntry {
  id: number
  user_id: number | null
  action: string
  entity_type: string
  entity_id: number | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
  changed_by_name: string | null
  changed_by_username: string | null
}
