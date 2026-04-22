import { FormEvent, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AdherenceReport, Medication, MedicationPayload, MedicationRequest, MedicationSchedule, api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const emptyMedication: MedicationPayload = {
  name: '',
  dosage: '',
  frequency_count: 1,
  frequency_unit: 'daily',
  instructions: '',
}

function formatTimeLabel(value: string) {
  return new Date(`1970-01-01T${value}`).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function ProviderPatientDetailPage() {
  const { patientId } = useParams()
  const { isProviderVerified } = useAuth()
  const patientUserId = Number(patientId)
  const [medications, setMedications] = useState<Medication[]>([])
  const [schedules, setSchedules] = useState<MedicationSchedule[]>([])
  const [report, setReport] = useState<AdherenceReport | null>(null)
  const [medicationRequests, setMedicationRequests] = useState<MedicationRequest[]>([])
  const [patientName, setPatientName] = useState('')
  const [medicationForm, setMedicationForm] = useState<MedicationPayload>(emptyMedication)
  const [editingMedicationId, setEditingMedicationId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingMedication, setSavingMedication] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!isProviderVerified || !patientUserId) {
      setLoading(false)
      return
    }
    loadData()
  }, [isProviderVerified, patientUserId])

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      const [detail, adherenceReport] = await Promise.all([
        api.getProviderPatientDetail(patientUserId),
        api.getProviderPatientAdherenceReport(patientUserId),
      ])
      setPatientName(detail.patient.name)
      setMedications(detail.medications)
      setMedicationRequests(detail.medication_requests)
      setSchedules(detail.schedules)
      setReport(adherenceReport)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load patient workspace')
    } finally {
      setLoading(false)
    }
  }

  function resetMedicationForm() {
    setMedicationForm(emptyMedication)
    setEditingMedicationId(null)
  }

  function hasDuplicateMedicationName(name: string) {
    const normalized = name.trim().toLowerCase()
    return medications.some((medication) => medication.name.trim().toLowerCase() === normalized && medication.id !== editingMedicationId)
  }

  async function handleMedicationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    const payload: MedicationPayload = {
      name: medicationForm.name.trim(),
      dosage: medicationForm.dosage.trim(),
      frequency_count: Number(medicationForm.frequency_count),
      frequency_unit: medicationForm.frequency_unit,
      instructions: medicationForm.instructions.trim(),
    }

    if (!payload.name || !payload.dosage) {
      setError('Medication name and dosage are required.')
      return
    }
    if (hasDuplicateMedicationName(payload.name)) {
      setError('A medication with this name already exists for this patient.')
      return
    }

    setSavingMedication(true)
    try {
      if (editingMedicationId === null) {
        await api.createProviderPatientMedication(patientUserId, payload)
        setSuccess('Medication added for patient.')
      } else {
        await api.updateProviderPatientMedication(patientUserId, editingMedicationId, payload)
        setSuccess('Medication updated for patient.')
      }
      await loadData()
      resetMedicationForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save medication')
    } finally {
      setSavingMedication(false)
    }
  }

  async function handleDeleteMedication(medication: Medication) {
    if (!window.confirm(`Delete ${medication.name}?`)) return
    setError('')
    setSuccess('')
    try {
      await api.deleteProviderPatientMedication(patientUserId, medication.id)
      await loadData()
      if (editingMedicationId === medication.id) resetMedicationForm()
      setSuccess('Medication deleted.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete medication')
    }
  }

  async function handleMedicationRequestAction(requestId: number, action: 'approve' | 'reject') {
    const note =
      window.prompt(action === 'approve' ? 'Optional approval note:' : 'Reason for rejection:')?.trim() || ''
    setError('')
    setSuccess('')
    try {
      if (action === 'approve') {
        await api.approveProviderPatientMedicationRequest(patientUserId, requestId, note)
        setSuccess('Medication request approved and added to the patient record.')
      } else {
        await api.rejectProviderPatientMedicationRequest(patientUserId, requestId, note)
        setSuccess('Medication request rejected.')
      }
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update medication request')
    }
  }

  if (!isProviderVerified) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-soft">
        <h1 className="text-2xl font-semibold text-slate-900">Provider access required</h1>
        <p className="mt-3 text-slate-600">This workspace is only available to approved providers.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-white p-6 shadow-soft">
        <Link to="/provider/patients" className="text-sm font-medium text-brand-700 hover:text-brand-800">
          Back to patients
        </Link>
        <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Patient Workspace</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">{patientName || 'Loading patient...'}</h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          Manage provider-owned medications, review patient-submitted medication requests, and monitor adherence and patient-created schedules from one screen.
        </p>
        {error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}
      </section>

      {loading ? (
        <section className="rounded-3xl bg-white p-6 text-slate-500 shadow-soft">Loading patient workspace...</section>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <div className="rounded-3xl bg-white p-6 shadow-soft">
              <p className="text-sm text-slate-500">Medications</p>
              <p className="mt-4 text-4xl font-semibold text-slate-900">{medications.length}</p>
            </div>
            <div className="rounded-3xl bg-white p-6 shadow-soft">
              <p className="text-sm text-slate-500">Schedules</p>
              <p className="mt-4 text-4xl font-semibold text-slate-900">{schedules.length}</p>
            </div>
            <div className="rounded-3xl bg-white p-6 shadow-soft">
              <p className="text-sm text-slate-500">Confirmed</p>
              <p className="mt-4 text-4xl font-semibold text-slate-900">{report?.totals.confirmed ?? 0}</p>
            </div>
            <div className="rounded-3xl bg-white p-6 shadow-soft">
              <p className="text-sm text-slate-500">Adherence</p>
              <p className="mt-4 text-4xl font-semibold text-slate-900">{report?.adherence_rate ?? 0}%</p>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
            <section className="rounded-3xl bg-white p-6 shadow-soft">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">
                {editingMedicationId === null ? 'Add Medication' : 'Edit Medication'}
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-900">Medication plan</h2>
              <form onSubmit={handleMedicationSubmit} className="mt-6 space-y-4">
                <input
                  value={medicationForm.name}
                  onChange={(event) => setMedicationForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Medication name"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                />
                <input
                  value={medicationForm.dosage}
                  onChange={(event) => setMedicationForm((current) => ({ ...current, dosage: event.target.value }))}
                  placeholder="Dosage"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={medicationForm.frequency_count}
                    onChange={(event) => setMedicationForm((current) => ({ ...current, frequency_count: Number(event.target.value) }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                  />
                  <select
                    value={medicationForm.frequency_unit}
                    onChange={(event) =>
                      setMedicationForm((current) => ({ ...current, frequency_unit: event.target.value as MedicationPayload['frequency_unit'] }))
                    }
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <textarea
                  value={medicationForm.instructions}
                  onChange={(event) => setMedicationForm((current) => ({ ...current, instructions: event.target.value }))}
                  rows={4}
                  placeholder="Instructions"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                />
                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={savingMedication}
                    className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingMedication ? 'Saving...' : editingMedicationId === null ? 'Add medication' : 'Save medication'}
                  </button>
                  <button
                    type="button"
                    onClick={resetMedicationForm}
                    className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Clear
                  </button>
                </div>
              </form>

              <div className="mt-6 space-y-3">
                {medications.map((medication) => (
                  <article key={medication.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{medication.name}</h3>
                        <p className="text-sm text-slate-600">{medication.dosage}</p>
                        <p className="mt-2 text-sm text-slate-500">
                          {medication.frequency_count} {medication.frequency_unit}
                        </p>
                        <p className="mt-2 text-sm text-slate-500">{medication.instructions || 'No instructions provided.'}</p>
                      </div>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMedicationId(medication.id)
                            setMedicationForm({
                              name: medication.name,
                              dosage: medication.dosage,
                              frequency_count: medication.frequency_count,
                              frequency_unit: medication.frequency_unit,
                              instructions: medication.instructions ?? '',
                            })
                          }}
                          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-brand-200 hover:text-brand-700"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMedication(medication)}
                          className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-3xl bg-white p-6 shadow-soft">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Medication Requests</p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-900">Patient-submitted requests</h2>
              <div className="mt-6 space-y-3">
                {medicationRequests.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-slate-500">
                    No medication requests from this patient.
                  </div>
                ) : (
                  medicationRequests.map((request) => (
                    <article key={request.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-semibold text-slate-900">{request.medication_name}</h3>
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
                          <p className="mt-2 text-sm text-slate-600">
                            {request.dosage} | {request.frequency_count} {request.frequency_unit}
                          </p>
                          <p className="mt-2 text-sm text-slate-500">{request.instructions || 'No instructions provided.'}</p>
                          <p className="mt-2 text-sm text-slate-500">{request.request_notes || 'No request note provided.'}</p>
                          {request.resolution_note ? <p className="mt-2 text-sm text-slate-500">Review note: {request.resolution_note}</p> : null}
                        </div>
                        {request.status === 'pending' ? (
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => handleMedicationRequestAction(request.id, 'approve')}
                              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMedicationRequestAction(request.id, 'reject')}
                              className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                            >
                              Reject
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr]">
            <section className="rounded-3xl bg-white p-6 shadow-soft">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Patient Schedule</p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-900">Patient-created schedule groups</h2>
              <p className="mt-3 text-slate-600">
                Providers can review schedules here, but patients are the only users who can create or edit reminder timing. Medication frequency rules still constrain every schedule.
              </p>

              <div className="mt-6 space-y-3">
                {schedules.map((schedule) => (
                  <article key={schedule.schedule_group_id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{schedule.medication_name}</h3>
                        <p className="mt-2 text-sm text-slate-500">{schedule.notes || 'No schedule notes.'}</p>
                        <div className="mt-3 space-y-2">
                          {schedule.slots.map((slot, index) => (
                            <p key={slot.schedule_id} className="text-sm text-slate-500">
                              Slot {index + 1}: {slot.start_date} at {formatTimeLabel(slot.time_of_day)}
                            </p>
                          ))}
                        </div>
                        <p className="mt-2 text-sm text-slate-500">{schedule.end_date ? `Ends ${schedule.end_date}` : 'Ongoing schedule'}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">View only</div>
                    </div>
                  </article>
                ))}
                {schedules.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-slate-500">
                    This patient has not created a schedule yet.
                  </div>
                ) : null}
              </div>
            </section>
          </div>

          <section className="rounded-3xl bg-white p-6 shadow-soft">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Adherence Report</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">Last 7 days</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Scheduled</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{report?.totals.scheduled ?? 0}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Confirmed</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{report?.totals.confirmed ?? 0}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Overdue</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{report?.totals.overdue ?? 0}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Pending</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{report?.totals.pending ?? 0}</p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {(report?.instances ?? []).map((instance) => (
                <div key={`${instance.schedule_id}-${instance.scheduled_date}-${instance.time_of_day}`} className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{instance.medication_name}</p>
                      <p className="text-sm text-slate-500">
                        {instance.scheduled_date} at {formatTimeLabel(instance.time_of_day)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.15em] ${
                        instance.status === 'confirmed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : instance.status === 'overdue'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {instance.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
