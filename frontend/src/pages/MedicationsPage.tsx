import { FormEvent, useEffect, useState } from 'react'
import { Medication, MedicationRequest, api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const emptyRequest = {
  medication_name: '',
  dosage: '',
  frequency_count: 1,
  frequency_unit: 'daily' as const,
  instructions: '',
  request_notes: '',
}

function formatFrequency(count: number, unit: string) {
  return `${count} ${unit}`
}

export function MedicationsPage() {
  const { user } = useAuth()
  const [medications, setMedications] = useState<Medication[]>([])
  const [requests, setRequests] = useState<MedicationRequest[]>([])
  const [form, setForm] = useState(emptyRequest)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [medicationData, requestData] = await Promise.all([
        api.listMedications(),
        api.listMedicationRequests(),
      ])
      setMedications(medicationData)
      setRequests(requestData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load medication data')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    const payload = {
      medication_name: form.medication_name.trim(),
      dosage: form.dosage.trim(),
      frequency_count: Number(form.frequency_count),
      frequency_unit: form.frequency_unit,
      instructions: form.instructions.trim(),
      request_notes: form.request_notes.trim(),
    }

    if (!payload.medication_name || !payload.dosage) {
      setError('Medication name and dosage are required.')
      return
    }

    setSaving(true)
    try {
      await api.createMedicationRequest(payload)
      setForm(emptyRequest)
      await loadData()
      setSuccess('Medication request submitted.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit medication request')
    } finally {
      setSaving(false)
    }
  }

  if (user?.role !== 'patient') {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-soft">
        <h1 className="text-2xl font-semibold text-slate-900">Patient access only</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Medication self-management is only available for patient accounts. Providers manage medications from patient-specific workspaces, and admins use the admin console.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
      <section className="rounded-3xl bg-white p-6 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Medication Library</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-900">Provider-managed medications</h1>
            <p className="mt-3 max-w-2xl text-slate-600">
              Your official medication list is maintained by your provider. You can review active medications here and submit requests when something needs to be added or changed.
            </p>
          </div>
          <div className="rounded-2xl bg-brand-50 px-4 py-3 text-right">
            <p className="text-sm text-brand-700">Active medications</p>
            <p className="text-3xl font-semibold text-brand-900">{medications.length}</p>
          </div>
        </div>

        {error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

        <div className="mt-6 space-y-4">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">Loading medications...</div>
          ) : medications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-slate-500">
              No provider-approved medications yet.
            </div>
          ) : (
            medications.map((medication) => (
              <article key={medication.id} className="rounded-3xl border border-slate-200 p-5">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-semibold text-slate-900">{medication.name}</h2>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-600">
                      {formatFrequency(medication.frequency_count, medication.frequency_unit)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">Dosage: {medication.dosage}</p>
                  <p className="text-sm text-slate-500">{medication.instructions || 'No instructions provided.'}</p>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="mt-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Request History</p>
          <div className="mt-4 space-y-3">
            {requests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                No medication requests yet.
              </div>
            ) : (
              requests.map((request) => (
                <article key={request.id} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{request.medication_name}</p>
                      <p className="text-sm text-slate-500">
                        {request.dosage} • {formatFrequency(request.frequency_count, request.frequency_unit)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.15em] ${
                        request.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-700'
                          : request.status === 'rejected'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {request.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{request.request_notes || 'No request note provided.'}</p>
                  {request.resolution_note ? <p className="mt-2 text-sm text-slate-500">Review note: {request.resolution_note}</p> : null}
                </article>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-3xl bg-white p-6 shadow-soft">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">New Request</p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-900">Ask your provider to add a medication</h2>
        <p className="mt-3 text-slate-600">
          This does not create an official medication immediately. Your provider reviews the request and can approve it into your active medication plan.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Medication name</span>
            <input
              value={form.medication_name}
              onChange={(event) => setForm((current) => ({ ...current, medication_name: event.target.value }))}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
              placeholder="Metformin"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Dosage</span>
            <input
              value={form.dosage}
              onChange={(event) => setForm((current) => ({ ...current, dosage: event.target.value }))}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
              placeholder="500 mg"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-[0.45fr,0.55fr]">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Frequency count</span>
              <input
                type="number"
                min={1}
                max={12}
                value={form.frequency_count}
                onChange={(event) => setForm((current) => ({ ...current, frequency_count: Number(event.target.value) }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Frequency unit</span>
              <select
                value={form.frequency_unit}
                onChange={(event) => setForm((current) => ({ ...current, frequency_unit: event.target.value as typeof form.frequency_unit }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Instructions</span>
            <textarea
              value={form.instructions}
              onChange={(event) => setForm((current) => ({ ...current, instructions: event.target.value }))}
              rows={4}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
              placeholder="Take with food in the morning and evening."
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Why are you requesting this?</span>
            <textarea
              value={form.request_notes}
              onChange={(event) => setForm((current) => ({ ...current, request_notes: event.target.value }))}
              rows={4}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
              placeholder="My provider told me to start this medication after my last visit."
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Submitting...' : 'Submit request'}
          </button>
        </form>
      </section>
    </div>
  )
}
