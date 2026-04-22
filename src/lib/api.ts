const API_BASE_URL = "http://127.0.0.1:8000";

export type User = {
  id: number
  name: string
  email: string
  role: string
  notifications_enabled: boolean
  provider_verification_status?: string | null
}

export type AuthResponse = {
  access_token: string
  token_type: string
  user: User
}

export type Medication = {
  id: number
  user_id: number
  name: string
  dosage: string
  frequency: string
  frequency_count: number
  frequency_unit: 'daily' | 'weekly' | 'monthly'
  instructions: string | null
}

export type MedicationPayload = {
  name: string
  dosage: string
  frequency_count: number
  frequency_unit: 'daily' | 'weekly' | 'monthly'
  instructions: string
}

export type MedicationRequest = {
  id: number
  patient_user_id: number
  provider_user_id: number | null
  medication_name: string
  dosage: string
  frequency_count: number
  frequency_unit: 'daily' | 'weekly' | 'monthly'
  instructions: string | null
  request_notes: string | null
  status: string
  resolution_note: string | null
  resolved_at: string | null
  created_at: string
}

export type DashboardResponse = {
  kind: 'patient' | 'provider' | 'admin'
  message: string
  user: User
  stats:
    | {
        active_medications: number
        today_doses: number
        confirmed_today: number
        missed_today: number
        overdue_today: number
        adherence_rate: number
        confirmed_week: number
        scheduled_week: number
        adherence_trend: Array<{
          date: string
          scheduled: number
          confirmed: number
          adherence_rate: number
        }>
      }
    | {
        assigned_patients: number
        today_doses_across_patients: number
        confirmed_today_across_patients: number
        overdue_today_across_patients: number
        patients_with_overdue: number
        average_weekly_adherence: number
        verification_status: string
      }
    | {
        pending_providers: number
        approved_providers: number
        total_patients: number
        active_assignments: number
      }
}

export type MedicationSchedule = {
  schedule_group_id: string
  user_id: number
  medication_id: number
  medication_name: string
  medication_dosage: string
  frequency_count: number
  frequency_unit: 'daily' | 'weekly' | 'monthly'
  end_date: string | null
  notes: string | null
  slots: Array<{
    schedule_id: number
    start_date: string
    time_of_day: string
  }>
}

export type SchedulePayload = {
  medication_id: number
  end_date: string | null
  notes: string
  slots: Array<{
    start_date: string
    time_of_day: string
  }>
}

export type DoseInstance = {
  medication_id: number
  medication_name: string
  medication_dosage: string
  schedule_id: number
  schedule_group_id: string
  scheduled_date: string
  time_of_day: string
  due_at: string
  notes: string | null
  status: string
  confirmation_id: number | null
  confirmed_at: string | null
  can_confirm: boolean
}

export type DoseConfirmation = {
  id: number
  medication_id: number
  schedule_id: number
  scheduled_date: string
  time_of_day: string
  confirmed_at: string
}

export type ProviderProfile = {
  user_id: number
  name: string
  email: string
  role: string
  organization_name: string
  license_number: string
  specialty: string | null
  work_email: string
  verification_status: string
  verified_at: string | null
  rejection_reason: string | null
}

export type PatientSummary = {
  id: number
  name: string
  email: string
  role: string
  active_medications: number
  today_doses: number
  confirmed_today: number
  overdue_today: number
}

export type ConnectionAssignment = {
  id: number
  patient_user_id: number
  patient_name: string
  patient_email: string
  provider_user_id: number
  provider_name: string
  provider_email: string
  status: string
  request_message: string | null
  initiated_by_user_id: number | null
  responded_by_user_id: number | null
  responded_at: string | null
  created_at: string
}

export type ProviderPatientDetail = {
  patient: User
  medications: Medication[]
  medication_requests: MedicationRequest[]
  schedules: MedicationSchedule[]
  today_instances: DoseInstance[]
}

export type AdherenceReport = {
  patient: User
  start_date: string
  end_date: string
  totals: {
    scheduled: number
    confirmed: number
    overdue: number
    pending: number
  }
  adherence_rate: number
  instances: DoseInstance[]
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token')

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({ detail: 'Something went wrong' }))

    let message = 'Request failed'

    if (typeof data.detail === 'string') {
      message = data.detail
    } else if (Array.isArray(data.detail)) {
      message = data.detail
        .map((item: any) => {
          const field = item?.loc?.[item.loc.length - 1]

          if (field === 'password') return 'Password must be at least 8 characters.'
          if (field === 'confirm_password') return 'Confirm password must be at least 8 characters.'
          if (field === 'email') return 'Please enter a valid email address.'
          if (field === 'name') return 'Please enter your name.'
          if (field === 'dosage') return 'Please enter a dosage.'
          if (field === 'frequency_count') return 'Please enter a valid frequency count.'
          if (field === 'frequency_unit') return 'Please choose daily, weekly, or monthly.'
          if (field === 'instructions') return 'Instructions must be 500 characters or fewer.'
          if (field === 'medication_id') return 'Please choose a medication.'
          if (field === 'time_of_day') return 'Please choose a time.'
          if (field === 'start_date') return 'Please choose a start date.'
          if (field === 'end_date') return 'End date must be on or after the start date.'
          if (field === 'notes') return 'Notes must be 500 characters or fewer.'
          if (field === 'scheduled_date') return 'Please choose a valid scheduled date.'

          return item?.msg || 'Invalid input.'
        })
        .join(' ')
    }

    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

export const api = {
  register: (payload: { name: string; email: string; password: string; confirm_password: string }) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  me: () => request<User>('/auth/me'),

  dashboard: () => request<DashboardResponse>('/protected/dashboard'),

  listMedicationRequests: () => request<MedicationRequest[]>('/medication-requests'),

  createMedicationRequest: (payload: {
    medication_name: string
    dosage: string
    frequency_count: number
    frequency_unit: 'daily' | 'weekly' | 'monthly'
    instructions: string
    request_notes: string
  }) =>
    request<MedicationRequest>('/medication-requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listMedications: () => request<Medication[]>('/medications'),

  createMedication: (payload: MedicationPayload) =>
    request<Medication>('/medications', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateMedication: (id: number, payload: MedicationPayload) =>
    request<Medication>(`/medications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteMedication: (id: number) =>
    request<void>(`/medications/${id}`, {
      method: 'DELETE',
    }),

  listSchedules: () => request<MedicationSchedule[]>('/schedules'),

  createSchedule: (payload: SchedulePayload) =>
    request<MedicationSchedule>('/schedules', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSchedule: (scheduleGroupId: string, payload: SchedulePayload) =>
    request<MedicationSchedule>(`/schedules/${scheduleGroupId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteSchedule: (scheduleGroupId: string) =>
    request<void>(`/schedules/${scheduleGroupId}`, {
      method: 'DELETE',
    }),

  listDoseInstances: (startDate?: string, days = 14) => {
    const params = new URLSearchParams({ days: String(days) })
    if (startDate) params.set('start_date', startDate)
    return request<DoseInstance[]>(`/schedules/instances?${params.toString()}`)
  },

  confirmDose: (payload: { medication_id: number; schedule_id: number; scheduled_date: string; time_of_day: string }) =>
    request<DoseConfirmation>('/doses/confirm', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  unconfirmDose: (confirmationId: number) =>
    request<void>(`/doses/confirm/${confirmationId}`, {
      method: 'DELETE',
    }),

  applyProvider: (payload: { organization_name: string; license_number: string; specialty: string; work_email: string }) =>
    request<ProviderProfile>('/providers/apply', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  myProviderProfile: () => request<ProviderProfile>('/providers/me'),

  listPendingProviders: () => request<ProviderProfile[]>('/admin/providers/pending'),

  listApprovedProviders: () => request<ProviderProfile[]>('/admin/providers/approved'),

  approveProvider: (providerUserId: number) =>
    request<ProviderProfile>(`/admin/providers/${providerUserId}/approve`, {
      method: 'POST',
    }),

  rejectProvider: (providerUserId: number, rejectionReason: string) =>
    request<ProviderProfile>(`/admin/providers/${providerUserId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejection_reason: rejectionReason }),
    }),

  listAdminPatients: () => request<User[]>('/admin/patients'),

  listProviderDirectory: () => request<ProviderProfile[]>('/providers/directory'),

  listPatientDirectory: () => request<User[]>('/patients/directory'),

  listMyConnections: () => request<ConnectionAssignment[]>('/connections/mine'),

  requestProviderConnection: (payload: { provider_user_id: number; request_message: string }) =>
    request<ConnectionAssignment>('/connections/request/patient', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  requestPatientConnection: (payload: { patient_user_id: number; request_message: string }) =>
    request<ConnectionAssignment>('/connections/request/provider', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  acceptConnectionRequest: (assignmentId: number, responseMessage: string) =>
    request<ConnectionAssignment>(`/connections/${assignmentId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ response_message: responseMessage }),
    }),

  rejectConnectionRequest: (assignmentId: number, responseMessage: string) =>
    request<ConnectionAssignment>(`/connections/${assignmentId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ response_message: responseMessage }),
    }),

  createAssignment: (payload: { patient_user_id: number; provider_user_id: number }) =>
    request<{ message: string }>('/admin/assignments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listProviderPatients: () => request<PatientSummary[]>('/provider/patients'),

  getProviderPatientDetail: (patientUserId: number) =>
    request<ProviderPatientDetail>(`/provider/patients/${patientUserId}`),

  getProviderPatientAdherenceReport: (patientUserId: number, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams()
    if (startDate) params.set('start_date', startDate)
    if (endDate) params.set('end_date', endDate)
    const query = params.toString()
    return request<AdherenceReport>(`/provider/patients/${patientUserId}/adherence-report${query ? `?${query}` : ''}`)
  },

  listProviderPatientMedications: (patientUserId: number) =>
    request<Medication[]>(`/provider/patients/${patientUserId}/medications`),

  listProviderPatientMedicationRequests: (patientUserId: number) =>
    request<MedicationRequest[]>(`/provider/patients/${patientUserId}/medication-requests`),

  approveProviderPatientMedicationRequest: (patientUserId: number, requestId: number, resolutionNote: string) =>
    request<MedicationRequest>(`/provider/patients/${patientUserId}/medication-requests/${requestId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ resolution_note: resolutionNote }),
    }),

  rejectProviderPatientMedicationRequest: (patientUserId: number, requestId: number, resolutionNote: string) =>
    request<MedicationRequest>(`/provider/patients/${patientUserId}/medication-requests/${requestId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ resolution_note: resolutionNote }),
    }),

  createProviderPatientMedication: (patientUserId: number, payload: MedicationPayload) =>
    request<Medication>(`/provider/patients/${patientUserId}/medications`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProviderPatientMedication: (patientUserId: number, medicationId: number, payload: MedicationPayload) =>
    request<Medication>(`/provider/patients/${patientUserId}/medications/${medicationId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteProviderPatientMedication: (patientUserId: number, medicationId: number) =>
    request<void>(`/provider/patients/${patientUserId}/medications/${medicationId}`, {
      method: 'DELETE',
    }),

  listProviderPatientSchedules: (patientUserId: number) =>
    request<MedicationSchedule[]>(`/provider/patients/${patientUserId}/schedules`),

  listProviderPatientDoseInstances: (patientUserId: number, startDate?: string, days = 14) => {
    const params = new URLSearchParams({ days: String(days) })
    if (startDate) params.set('start_date', startDate)
    return request<DoseInstance[]>(`/provider/patients/${patientUserId}/schedules/instances?${params.toString()}`)
  },

  createProviderPatientSchedule: (patientUserId: number, payload: SchedulePayload) =>
    request<MedicationSchedule>(`/provider/patients/${patientUserId}/schedules`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProviderPatientSchedule: (patientUserId: number, scheduleGroupId: string, payload: SchedulePayload) =>
    request<MedicationSchedule>(`/provider/patients/${patientUserId}/schedules/${scheduleGroupId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteProviderPatientSchedule: (patientUserId: number, scheduleGroupId: string) =>
    request<void>(`/provider/patients/${patientUserId}/schedules/${scheduleGroupId}`, {
      method: 'DELETE',
    }),
}
