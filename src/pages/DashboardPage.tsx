import { useEffect, useState } from 'react'
import { DashboardResponse, api } from '../lib/api'

function PatientDashboard({ data }: { data: DashboardResponse }) {
  const stats = data.stats as Extract<DashboardResponse['stats'], { active_medications: number }>

  return (
    <>
      <section className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Active Medications', value: String(stats.active_medications) },
          { label: "Today's Doses", value: String(stats.today_doses) },
          { label: 'Confirmed Today', value: String(stats.confirmed_today) },
          { label: 'Overdue Today', value: String(stats.overdue_today) },
        ].map((card) => (
          <div key={card.label} className="rounded-3xl bg-white p-6 shadow-soft">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-4 text-4xl font-semibold text-slate-900">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <div className="rounded-3xl bg-white p-6 shadow-soft">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Today</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">Dose completion snapshot</h2>
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Confirmed doses</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">
                {stats.confirmed_today} / {stats.today_doses}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Missed or pending today</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{stats.missed_today}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Overdue doses today</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{stats.overdue_today}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Last 7 days</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">
                {stats.confirmed_week} / {stats.scheduled_week}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-soft">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Trend</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">7-day adherence</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-7">
            {stats.adherence_trend.map((point) => (
              <div key={point.date} className="flex flex-col items-center rounded-2xl bg-slate-50 px-3 py-4">
                <p className="text-xs font-medium uppercase tracking-[0.15em] text-slate-500">
                  {new Date(`${point.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}
                </p>
                <div className="mt-4 flex h-28 w-8 items-end rounded-full bg-slate-200 p-1">
                  <div className="w-full rounded-full bg-brand-600 transition-all" style={{ height: `${Math.max(point.adherence_rate, 8)}%` }} />
                </div>
                <p className="mt-3 text-lg font-semibold text-slate-900">{point.adherence_rate}%</p>
                <p className="text-center text-xs text-slate-500">
                  {point.confirmed}/{point.scheduled || 0}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

function ProviderDashboard({ data }: { data: DashboardResponse }) {
  const stats = data.stats as Extract<DashboardResponse['stats'], { assigned_patients: number }>

  return (
    <>
      <section className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Assigned Patients', value: String(stats.assigned_patients) },
          { label: "Today's Doses", value: String(stats.today_doses_across_patients) },
          { label: 'Confirmed Today', value: String(stats.confirmed_today_across_patients) },
          { label: 'Overdue Today', value: String(stats.overdue_today_across_patients) },
        ].map((card) => (
          <div key={card.label} className="rounded-3xl bg-white p-6 shadow-soft">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-4 text-4xl font-semibold text-slate-900">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <div className="rounded-3xl bg-white p-6 shadow-soft">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Care Team</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">Provider overview</h2>
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Patients with overdue doses</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{stats.patients_with_overdue}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Average weekly adherence</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{stats.average_weekly_adherence}%</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Verification status</p>
              <p className="mt-2 text-3xl font-semibold capitalize text-slate-900">{stats.verification_status}</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-soft">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Next Steps</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">Provider workspace</h2>
          <div className="mt-6 space-y-4 text-slate-600">
            <p>Open “My Patients” to review individual adherence, adjust medications, and update schedules for assigned patients.</p>
          </div>
        </div>
      </section>
    </>
  )
}

function AdminDashboard({ data }: { data: DashboardResponse }) {
  const stats = data.stats as Extract<DashboardResponse['stats'], { pending_providers: number }>

  return (
    <>
      <section className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Pending Providers', value: String(stats.pending_providers) },
          { label: 'Approved Providers', value: String(stats.approved_providers) },
          { label: 'Patients', value: String(stats.total_patients) },
          { label: 'Active Assignments', value: String(stats.active_assignments) },
        ].map((card) => (
          <div key={card.label} className="rounded-3xl bg-white p-6 shadow-soft">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-4 text-4xl font-semibold text-slate-900">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl bg-white p-6 shadow-soft">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Operations</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">Admin priorities</h2>
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Provider review queue</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{stats.pending_providers}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Patient-provider links</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{stats.active_assignments}</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-soft">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Next Steps</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">Admin console</h2>
          <div className="mt-6 space-y-4 text-slate-600">
            <p>Open “Admin” in the sidebar to approve providers and connect verified providers to patient accounts.</p>
          </div>
        </div>
      </section>
    </>
  )
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [message, setMessage] = useState('Loading your dashboard...')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const loadDashboard = () => {
      api.dashboard()
        .then((dashboardData) => {
          setData(dashboardData)
          setMessage(dashboardData.message)
          setLoadError('')
        })
        .catch((error) => {
          setMessage('Unable to load dashboard data')
          setLoadError(error instanceof Error ? error.message : 'Dashboard request failed')
        })
    }

    loadDashboard()
    window.addEventListener('focus', loadDashboard)
    return () => window.removeEventListener('focus', loadDashboard)
  }, [])

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-white p-6 shadow-soft">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Overview</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">{message}</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          {data?.kind === 'provider'
            ? 'Review your patient panel, track overdue doses, and move into patient-specific care work from one place.'
            : data?.kind === 'admin'
              ? 'Monitor provider onboarding, assignment coverage, and the operational health of the platform.'
              : 'Manage your medications from one place, keep duplicates out, and stay on top of adherence.'}
        </p>
        {loadError ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div> : null}
      </section>

      {data?.kind === 'provider' ? <ProviderDashboard data={data} /> : null}
      {data?.kind === 'admin' ? <AdminDashboard data={data} /> : null}
      {!data || data.kind === 'patient' ? <PatientDashboard data={data ?? ({ kind: 'patient', message: '', user: {} as any, stats: { active_medications: 0, today_doses: 0, confirmed_today: 0, missed_today: 0, overdue_today: 0, adherence_rate: 0, confirmed_week: 0, scheduled_week: 0, adherence_trend: [] } } as DashboardResponse)} /> : null}
    </div>
  )
}
