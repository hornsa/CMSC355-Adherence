import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConnectionAssignment, PatientSummary, User, api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

function formatConnectionStatus(status: string) {
  if (status === 'pending_patient') return 'Awaiting patient response'
  if (status === 'pending_provider') return 'Awaiting your response'
  return status.replace('_', ' ')
}

export function ProviderPatientsPage() {
  const { isProviderVerified, user } = useAuth()
  const [patients, setPatients] = useState<PatientSummary[]>([])
  const [directory, setDirectory] = useState<User[]>([])
  const [connections, setConnections] = useState<ConnectionAssignment[]>([])
  const [requestForm, setRequestForm] = useState({ patient_user_id: 0, request_message: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const incomingRequests = useMemo(
    () => connections.filter((connection) => connection.status === 'pending_provider' && connection.provider_user_id === user?.id),
    [connections, user?.id],
  )
  const outgoingRequests = useMemo(
    () => connections.filter((connection) => connection.status === 'pending_patient' && connection.provider_user_id === user?.id),
    [connections, user?.id],
  )

  useEffect(() => {
    if (!isProviderVerified) {
      setLoading(false)
      return
    }

    Promise.all([api.listProviderPatients(), api.listPatientDirectory(), api.listMyConnections()])
      .then(([patientData, directoryData, connectionData]) => {
        setPatients(patientData)
        setDirectory(directoryData)
        setConnections(connectionData)
        setRequestForm({
          patient_user_id: directoryData[0]?.id ?? 0,
          request_message: '',
        })
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load patients'))
      .finally(() => setLoading(false))
  }, [isProviderVerified])

  async function reloadConnections() {
    const [patientData, directoryData, connectionData] = await Promise.all([
      api.listProviderPatients(),
      api.listPatientDirectory(),
      api.listMyConnections(),
    ])
    setPatients(patientData)
    setDirectory(directoryData)
    setConnections(connectionData)
    if (!requestForm.patient_user_id && directoryData.length) {
      setRequestForm((current) => ({ ...current, patient_user_id: directoryData[0].id }))
    }
  }

  async function handleRequestPatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await api.requestPatientConnection(requestForm)
      await reloadConnections()
      setRequestForm((current) => ({ ...current, request_message: '' }))
      setSuccess('Connection request sent to patient.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to request patient connection')
    } finally {
      setSaving(false)
    }
  }

  async function handleReview(assignmentId: number, action: 'accept' | 'reject') {
    const message = window.prompt(action === 'accept' ? 'Optional acceptance note:' : 'Reason for rejection:')?.trim() || ''
    setError('')
    setSuccess('')
    try {
      if (action === 'accept') {
        await api.acceptConnectionRequest(assignmentId, message)
        setSuccess('Connection request accepted.')
      } else {
        await api.rejectConnectionRequest(assignmentId, message)
        setSuccess('Connection request rejected.')
      }
      await reloadConnections()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to review request')
    }
  }

  if (!isProviderVerified) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-soft">
        <h1 className="text-2xl font-semibold text-slate-900">Provider access required</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          This area opens after your provider profile is approved and an administrator assigns patients to you.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-white p-6 shadow-soft">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Provider Workspace</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">Assigned patients</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Review medication activity, manage connection requests, and open patient workspaces from one place.
        </p>
        {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <div className="rounded-3xl bg-white p-6 shadow-soft">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Incoming Requests</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">Patients asking to connect</h2>
          <div className="mt-6 space-y-3">
            {incomingRequests.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">No incoming requests right now.</div>
            ) : (
              incomingRequests.map((request) => (
                <article key={request.id} className="rounded-2xl border border-slate-200 p-4">
                  <p className="font-medium text-slate-900">{request.patient_name}</p>
                  <p className="text-sm text-slate-500">{request.patient_email}</p>
                  <p className="mt-3 text-sm text-slate-600">{request.request_message || 'No request message.'}</p>
                  <div className="mt-4 flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleReview(request.id, 'accept')}
                      className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReview(request.id, 'reject')}
                      className="rounded-2xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
                    >
                      Reject
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-soft">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Request a Patient</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">Start a connection yourself</h2>
          <form onSubmit={handleRequestPatient} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Patient</span>
              <select
                value={requestForm.patient_user_id}
                onChange={(event) => setRequestForm((current) => ({ ...current, patient_user_id: Number(event.target.value) }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
              >
                {directory.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name} - {patient.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Message</span>
              <textarea
                value={requestForm.request_message}
                onChange={(event) => setRequestForm((current) => ({ ...current, request_message: event.target.value }))}
                rows={4}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                placeholder="I'd like to connect so I can manage your medication plan."
              />
            </label>
            <button
              type="submit"
              disabled={saving || !requestForm.patient_user_id}
              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Sending...' : 'Send request'}
            </button>
          </form>

          <div className="mt-8 space-y-3">
            <p className="text-sm font-medium text-slate-700">Outgoing requests</p>
            {outgoingRequests.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">No outgoing requests yet.</div>
            ) : (
              outgoingRequests.map((request) => (
                <div key={request.id} className="rounded-2xl bg-slate-50 px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-slate-900">{request.patient_name}</p>
                      <p className="text-sm text-slate-500">{request.patient_email}</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.15em] text-slate-600">
                      {formatConnectionStatus(request.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{request.request_message || 'No request message.'}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div className="rounded-3xl bg-white p-6 text-slate-500 shadow-soft">Loading patients...</div>
        ) : patients.length === 0 ? (
          <div className="rounded-3xl bg-white p-6 text-slate-500 shadow-soft">No assigned patients yet.</div>
        ) : (
          patients.map((patient) => (
            <article key={patient.id} className="rounded-3xl bg-white p-6 shadow-soft">
              <h2 className="text-xl font-semibold text-slate-900">{patient.name}</h2>
              <p className="mt-2 text-sm text-slate-500">{patient.email}</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Active Meds</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{patient.active_medications}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Today</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{patient.today_doses}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Confirmed</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{patient.confirmed_today}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Overdue</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{patient.overdue_today}</p>
                </div>
              </div>
              <Link
                to={`/provider/patients/${patient.id}`}
                className="mt-5 inline-flex rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Open patient
              </Link>
            </article>
          ))
        )}
      </section>
    </div>
  )
}
