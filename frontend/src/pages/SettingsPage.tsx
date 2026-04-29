import { FormEvent, useEffect, useState } from 'react'
import { api, ConnectionAssignment, ProviderProfile, User } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const emptyApplication = {
  organization_name: '',
  license_number: '',
  specialty: '',
  work_email: '',
}

function formatConnectionStatus(status: string) {
  if (status === 'pending_patient') return 'Awaiting your response'
  if (status === 'pending_provider') return 'Awaiting provider response'
  return status.replace('_', ' ')
}

export function SettingsPage() {
  const { user, refreshUser } = useAuth()
  const [application, setApplication] = useState(emptyApplication)
  const [profile, setProfile] = useState<ProviderProfile | null>(null)
  const [pendingProviders, setPendingProviders] = useState<ProviderProfile[]>([])
  const [approvedProviders, setApprovedProviders] = useState<ProviderProfile[]>([])
  const [patientConnections, setPatientConnections] = useState<ConnectionAssignment[]>([])
  const [patients, setPatients] = useState<User[]>([])
  const [assignment, setAssignment] = useState({ patient_user_id: 0, provider_user_id: 0 })
  const [providerRequest, setProviderRequest] = useState({ provider_user_id: 0, request_message: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    loadData()
  }, [user?.role])

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      if (user?.role === 'admin') {
        const [pending, approved, patientData] = await Promise.all([
          api.listPendingProviders(),
          api.listApprovedProviders(),
          api.listAdminPatients(),
        ])
        setPendingProviders(pending)
        setApprovedProviders(approved)
        setPatients(patientData)
        setAssignment({
          patient_user_id: patientData[0]?.id ?? 0,
          provider_user_id: approved[0]?.user_id ?? 0,
        })
        setProfile(null)
      } else if (user?.role === 'provider' || user?.provider_verification_status) {
        const providerProfile = await api.myProviderProfile().catch(() => null)
        setProfile(providerProfile)
      } else {
        const [directory, connections] = await Promise.all([
          api.listProviderDirectory(),
          api.listMyConnections(),
        ])
        setApprovedProviders(directory)
        setPatientConnections(connections)
        setProviderRequest({
          provider_user_id: directory[0]?.user_id ?? 0,
          request_message: '',
        })
        setProfile(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load settings')
    } finally {
      setLoading(false)
    }
  }

  async function handlePatientConnectionRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await api.requestProviderConnection(providerRequest)
      await loadData()
      setProviderRequest((current) => ({ ...current, request_message: '' }))
      setSuccess('Connection request sent to provider.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send connection request')
    } finally {
      setSaving(false)
    }
  }

  async function handlePatientConnectionReview(assignmentId: number, action: 'accept' | 'reject') {
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
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to review connection request')
    }
  }

  async function handleApply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      await api.applyProvider(application)
      await refreshUser()
      await loadData()
      setSuccess('Provider application submitted for review.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit provider application')
    } finally {
      setSaving(false)
    }
  }

  async function handleApprove(providerUserId: number) {
    setError('')
    setSuccess('')
    try {
      await api.approveProvider(providerUserId)
      await loadData()
      setSuccess('Provider approved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to approve provider')
    }
  }

  async function handleReject(providerUserId: number) {
    const reason = window.prompt('Reason for rejection?')?.trim() || 'Application rejected'
    setError('')
    setSuccess('')
    try {
      await api.rejectProvider(providerUserId, reason)
      await loadData()
      setSuccess('Provider rejected.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reject provider')
    }
  }

  async function handleAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      await api.createAssignment(assignment)
      setSuccess('Patient assignment saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create assignment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-white p-6 shadow-soft">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">
          {user?.role === 'admin' ? 'Admin Console' : 'Account'}
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">
          {user?.role === 'admin' ? 'Provider review and assignments' : 'Settings and provider access'}
        </h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          {user?.role === 'admin'
            ? 'Review provider applications, approve access, and connect verified providers to patients.'
            : 'Manage your account state and, if needed, submit a provider application for administrative review.'}
        </p>
        {error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}
      </section>

      {loading ? (
        <section className="rounded-3xl bg-white p-6 shadow-soft text-slate-500">Loading settings...</section>
      ) : user?.role === 'admin' ? (
        <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
          <section className="rounded-3xl bg-white p-6 shadow-soft">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Pending Providers</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">Verification queue</h2>
            <div className="mt-6 space-y-4">
              {pendingProviders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-slate-500">
                  No pending provider applications.
                </div>
              ) : (
                pendingProviders.map((item) => (
                  <article key={item.user_id} className="rounded-3xl border border-slate-200 p-5">
                    <h3 className="text-xl font-semibold text-slate-900">{item.name}</h3>
                    <p className="mt-2 text-sm text-slate-600">{item.email}</p>
                    <p className="mt-2 text-sm text-slate-600">{item.organization_name}</p>
                    <p className="mt-1 text-sm text-slate-500">License: {item.license_number}</p>
                    <p className="mt-1 text-sm text-slate-500">Work email: {item.work_email}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.specialty || 'No specialty listed'}</p>
                    <div className="mt-4 flex gap-3">
                      <button
                        type="button"
                        onClick={() => handleApprove(item.user_id)}
                        className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(item.user_id)}
                        className="rounded-2xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-soft">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Assignments</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">Connect patients and providers</h2>
            <form onSubmit={handleAssignment} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Patient</span>
                <select
                  value={assignment.patient_user_id}
                  onChange={(event) => setAssignment((current) => ({ ...current, patient_user_id: Number(event.target.value) }))}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                >
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.name} - {patient.email}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Verified provider</span>
                <select
                  value={assignment.provider_user_id}
                  onChange={(event) => setAssignment((current) => ({ ...current, provider_user_id: Number(event.target.value) }))}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                >
                  {approvedProviders.map((provider) => (
                    <option key={provider.user_id} value={provider.user_id}>
                      {provider.name} - {provider.organization_name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                disabled={saving || !assignment.patient_user_id || !assignment.provider_user_id}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save assignment'}
              </button>
            </form>

            <div className="mt-8 rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">Approved providers</p>
              <div className="mt-3 space-y-3">
                {approvedProviders.length === 0 ? (
                  <p className="text-sm text-slate-500">No approved providers yet.</p>
                ) : (
                  approvedProviders.map((provider) => (
                    <div key={provider.user_id} className="rounded-2xl bg-white px-4 py-3">
                      <p className="font-medium text-slate-900">{provider.name}</p>
                      <p className="text-sm text-slate-500">{provider.organization_name}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
          <section className="rounded-3xl bg-white p-6 shadow-soft">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Current Status</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">Account role</h2>
            <div className="mt-6 rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Role</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{user?.role}</p>
              <p className="mt-3 text-sm text-slate-600">
                {profile
                  ? `Provider verification status: ${profile.verification_status}.`
                  : 'You are currently using the patient experience.'}
              </p>
              {profile?.rejection_reason ? <p className="mt-3 text-sm text-red-700">Last review note: {profile.rejection_reason}</p> : null}
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-soft">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Provider Access</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">
              {profile ? 'Provider application details' : 'Apply to become a provider'}
            </h2>

            {profile ? (
              <div className="mt-6 space-y-4 rounded-2xl bg-slate-50 p-5">
                <div>
                  <p className="text-sm text-slate-500">Organization</p>
                  <p className="mt-1 font-medium text-slate-900">{profile.organization_name}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">License</p>
                  <p className="mt-1 font-medium text-slate-900">{profile.license_number}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Work email</p>
                  <p className="mt-1 font-medium text-slate-900">{profile.work_email}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Specialty</p>
                  <p className="mt-1 font-medium text-slate-900">{profile.specialty || 'Not provided'}</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleApply} className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Organization name</span>
                  <input
                    value={application.organization_name}
                    onChange={(event) => setApplication((current) => ({ ...current, organization_name: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">License number</span>
                  <input
                    value={application.license_number}
                    onChange={(event) => setApplication((current) => ({ ...current, license_number: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Specialty</span>
                  <input
                    value={application.specialty}
                    onChange={(event) => setApplication((current) => ({ ...current, specialty: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Work email</span>
                  <input
                    type="email"
                    value={application.work_email}
                    onChange={(event) => setApplication((current) => ({ ...current, work_email: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Submitting...' : 'Submit provider application'}
                </button>
              </form>
            )}
          </section>

          {user?.role === 'patient' ? (
            <section className="rounded-3xl bg-white p-6 shadow-soft">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Care Team</p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-900">Request a provider connection</h2>
              <p className="mt-3 text-slate-600">
                Send a connection request to an approved provider so they can manage your medication plan and review adherence.
              </p>

              <form onSubmit={handlePatientConnectionRequest} className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Approved provider</span>
                  <select
                    value={providerRequest.provider_user_id}
                    onChange={(event) => setProviderRequest((current) => ({ ...current, provider_user_id: Number(event.target.value) }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                  >
                    {approvedProviders.map((provider) => (
                      <option key={provider.user_id} value={provider.user_id}>
                        {provider.name} - {provider.organization_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Message</span>
                  <textarea
                    value={providerRequest.request_message}
                    onChange={(event) => setProviderRequest((current) => ({ ...current, request_message: event.target.value }))}
                    rows={4}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                    placeholder="I'd like to connect so you can manage my medication plan."
                  />
                </label>

                <button
                  type="submit"
                  disabled={saving || !providerRequest.provider_user_id}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Sending...' : 'Send request'}
                </button>
              </form>

              <div className="mt-8 space-y-3">
                <p className="text-sm font-medium text-slate-700">My connection requests</p>
                {patientConnections.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">No provider connections yet.</div>
                ) : (
                  patientConnections.map((connection) => (
                    <div key={connection.id} className="rounded-2xl bg-slate-50 px-4 py-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-medium text-slate-900">{connection.provider_name}</p>
                          <p className="text-sm text-slate-500">{connection.provider_email}</p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.15em] text-slate-600">
                          {formatConnectionStatus(connection.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{connection.request_message || 'No request message.'}</p>
                      {connection.status === 'pending_patient' ? (
                        <div className="mt-4 flex gap-3">
                          <button
                            type="button"
                            onClick={() => handlePatientConnectionReview(connection.id, 'accept')}
                            className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePatientConnectionReview(connection.id, 'reject')}
                            className="rounded-2xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
                          >
                            Reject
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  )
}
