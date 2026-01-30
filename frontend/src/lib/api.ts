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

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
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
    const response = await fetch(url.toString(), {
      credentials: 'include',
    })
    return handleResponse<T>(response)
  },

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(response)
  },

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(response)
  },

  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    return handleResponse<T>(response)
  },
}

// Auth API
export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ user: User }>('/login', { username, password }),

  logout: () => api.post<{ ok: boolean }>('/logout'),

  me: () => api.get<{ user: User; last_activity: number }>('/me'),
}

// Students API
export const studentsApi = {
  getAll: (params?: { status?: string; search?: string }) =>
    api.get<Student[]>('/students', params),

  getById: (id: number) => api.get<Student>(`/students/${id}`),

  create: (data: Omit<Student, 'id' | 'created_at'>) =>
    api.post<{ id: number }>('/students', data),

  update: (id: number, data: Partial<Student>) =>
    api.put<{ ok: boolean }>(`/students/${id}`, data),

  delete: (id: number) => api.delete<{ ok: boolean }>(`/students/${id}`),
}

// Teachers API
export const teachersApi = {
  getAll: () => api.get<Teacher[]>('/teachers'),

  getById: (id: number) => api.get<Teacher>(`/teachers/${id}`),

  create: (data: Omit<Teacher, 'id' | 'created_at'>) =>
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

  create: (studentId: number, groupId: number) =>
    api.post<{ ok: boolean }>('/enrollments', { student_id: studentId, group_id: groupId }),

  delete: (id: number) => api.delete<{ ok: boolean }>(`/enrollments/${id}`),
}

// Payments API
export const paymentsApi = {
  getAll: () => api.get<Payment[]>('/payments'),

  create: (data: Omit<Payment, 'id' | 'created_at' | 'student_name' | 'group_name'>) =>
    api.post<{ id: number; invoice_no: string }>('/payments', data),
}

// Expenses API
export const expensesApi = {
  getAll: () => api.get<Expense[]>('/expenses'),

  create: (data: Omit<Expense, 'id' | 'created_at'>) =>
    api.post<{ id: number }>('/expenses', data),
}

// Leads API
export const leadsApi = {
  getAll: () => api.get<Lead[]>('/leads'),

  create: (data: Omit<Lead, 'id' | 'created_at' | 'updated_at' | 'converted_student_id'>) =>
    api.post<{ id: number }>('/leads', data),

  update: (id: number, data: Partial<Lead>) =>
    api.put<{ ok: boolean }>(`/leads/${id}`, data),

  delete: (id: number) => api.delete<{ ok: boolean }>(`/leads/${id}`),

  convert: (id: number) =>
    api.post<{ student_id: number }>(`/leads/${id}/convert`),
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

  create: (data: Omit<SalarySlip, 'id' | 'created_at' | 'teacher_name' | 'total_amount'>) =>
    api.post<{ id: number }>('/salary-slips', data),

  update: (id: number, data: { status: string; paid_at?: string }) =>
    api.put<{ ok: boolean }>(`/salary-slips/${id}`, data),
}

// Dashboard API
export const dashboardApi = {
  getStats: () =>
    api.get<DashboardStats>('/dashboard/stats'),
}

// Reports API
export const reportsApi = {
  getPayments: (from: string, to: string) =>
    api.get<Payment[]>('/reports/payments', { from, to }),

  getExpenses: (from: string, to: string) =>
    api.get<Expense[]>('/reports/expenses', { from, to }),

  getIncomeExpense: (from: string, to: string) =>
    api.get<{ from: string; to: string; income: number; expense: number }>('/reports/income-expense', { from, to }),
}

// Types
export interface User {
  id: number
  username: string
  name: string
  role: 'admin' | 'manager' | 'teacher' | 'accountant' | 'user'
  email?: string
  phone?: string
  is_active?: boolean
  last_login?: string
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
}

export interface Teacher {
  id: number
  first_name: string
  last_name: string
  phone?: string
  email?: string
  subjects?: string
  salary_type: 'fixed' | 'hourly' | 'per_student'
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
  price: number
  level?: string
  start_date?: string
  end_date?: string
  pricing_type?: 'monthly' | 'per_session' | 'package'
  status: 'active' | 'inactive' | 'completed'
  created_at: string
}

export interface Enrollment {
  id: number
  student_id: number
  group_id: number
  student_name?: string
  group_name?: string
  enrolled_at: string
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
}

export interface Expense {
  id: number
  category: string
  amount: number
  description?: string
  expense_date: string
  created_at: string
}

export interface Lead {
  id: number
  first_name: string
  last_name: string
  phone?: string
  email?: string
  parent_name?: string
  parent_phone?: string
  source?: string
  status: 'new' | 'contacted' | 'trial' | 'enrolled' | 'lost'
  notes?: string
  follow_up_date?: string
  converted_student_id?: number
  created_at: string
  updated_at: string
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
  total_amount: number
  status: 'pending' | 'paid'
  paid_at?: string
  notes?: string
  created_at: string
}

export interface DashboardStats {
  students: number
  teachers: number
  groups: number
  revenue: number
  expenses: number
  profit: number
  leads_pending: number
}
