import { FormEvent, useEffect, useMemo, useState } from 'react'
import { api, DoseInstance, Medication, MedicationSchedule, SchedulePayload } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const today = new Date().toISOString().slice(0, 10)

const emptyForm: SchedulePayload = {
  medication_id: 0,
  end_date: null,
  notes: '',
  slots: [],
}

function formatDateLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatTimeLabel(value: string) {
  return new Date(`1970-01-01T${value}`).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getWeekKey(value: string) {
  const current = new Date(`${value}T00:00:00`)
  const weekday = (current.getDay() + 6) % 7
  current.setDate(current.getDate() - weekday)
  return current.toISOString().slice(0, 10)
}

function buildSlots(count: number, existing: SchedulePayload['slots']) {
  return Array.from({ length: count }, (_, index) => existing[index] ?? { start_date: today, time_of_day: '08:00' })
}

export function SchedulePage() {
  const { user } = useAuth()
  const [medications, setMedications] = useState<Medication[]>([])
  const [schedules, setSchedules] = useState<MedicationSchedule[]>([])
  const [instances, setInstances] = useState<DoseInstance[]>([])
  const [form, setForm] = useState<SchedulePayload>(emptyForm)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmingKey, setConfirmingKey] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const selectedMedication = useMemo(
    () => medications.find((medication) => medication.id === form.medication_id) ?? null,
    [medications, form.medication_id],
  )

  const groupedInstances = useMemo(() => {
    const groups = new Map<string, DoseInstance[]>()
    for (const instance of instances) {
      const current = groups.get(instance.scheduled_date) ?? []
      current.push(instance)
      groups.set(instance.scheduled_date, current)
    }
    return Array.from(groups.entries())
  }, [instances])

  const selectedMedicationSummary = selectedMedication
    ? `${selectedMedication.frequency_count} slot${selectedMedication.frequency_count === 1 ? '' : 's'} per ${selectedMedication.frequency_unit}`
    : 'Choose a medication to begin.'

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (!selectedMedication) return
    setForm((current) => ({
      ...current,
      slots: buildSlots(selectedMedication.frequency_count, current.slots),
    }))
  }, [selectedMedication?.id, selectedMedication?.frequency_count])

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      const [medicationData, scheduleData, instanceData] = await Promise.all([
        api.listMedications(),
        api.listSchedules(),
        api.listDoseInstances(today, 14),
      ])
      setMedications(medicationData)
      setSchedules(scheduleData)
      setInstances(instanceData)
      if (medicationData.length > 0) {
        const firstMedicationId = medicationData[0].id
        setForm((current) => ({
          ...current,
          medication_id: current.medication_id || firstMedicationId,
          slots: buildSlots(
            medicationData.find((medication) => medication.id === (current.medication_id || firstMedicationId))?.frequency_count ?? 1,
            current.slots,
          ),
        }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load schedule data')
    } finally {
      setLoading(false)
    }
  }

  function updateField<K extends keyof SchedulePayload>(key: K, value: SchedulePayload[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function updateSlot(index: number, key: 'start_date' | 'time_of_day', value: string) {
    setForm((current) => ({
      ...current,
      slots: current.slots.map((slot, slotIndex) => (slotIndex === index ? { ...slot, [key]: value } : slot)),
    }))
  }

  function resetForm() {
    const medicationId = medications[0]?.id ?? 0
    const medication = medications.find((item) => item.id === medicationId)
    setEditingGroupId(null)
    setForm({
      medication_id: medicationId,
      end_date: null,
      notes: '',
      slots: buildSlots(medication?.frequency_count ?? 1, []),
    })
  }

  function validateSchedulePayload(payload: SchedulePayload, medication: Medication | null) {
    if (!medication) {
      return 'Please choose a medication.'
    }
    if (payload.slots.length !== medication.frequency_count) {
      return `This medication requires exactly ${medication.frequency_count} time slots.`
    }
    if (payload.slots.some((slot) => !slot.start_date || !slot.time_of_day)) {
      return 'Every slot needs a start date and time.'
    }
    if (payload.end_date && payload.slots.some((slot) => payload.end_date && payload.end_date < slot.start_date)) {
      return 'End date must be on or after every slot start date.'
    }

    const uniqueKeys = new Set(payload.slots.map((slot) => `${slot.start_date}-${slot.time_of_day}`))
    if (uniqueKeys.size !== payload.slots.length) {
      return 'Each slot must have a unique date and time.'
    }

    const slotDates = payload.slots.map((slot) => slot.start_date)
    if (medication.frequency_unit === 'daily' && new Set(slotDates).size !== 1) {
      return 'Daily medications require all slot start dates to be the same.'
    }
    if (medication.frequency_unit === 'weekly' && new Set(slotDates.map(getWeekKey)).size !== 1) {
      return 'Weekly medications require all slot dates to be within the same week.'
    }
    if (medication.frequency_unit === 'monthly' && new Set(slotDates.map((value) => value.slice(0, 7))).size !== 1) {
      return 'Monthly medications require all slot dates to be within the same month.'
    }

    return ''
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    const payload: SchedulePayload = {
      medication_id: form.medication_id,
      end_date: form.end_date || null,
      notes: form.notes.trim(),
      slots: form.slots.map((slot) => ({
        start_date: slot.start_date,
        time_of_day: slot.time_of_day,
      })),
    }

    const validationError = validateSchedulePayload(payload, selectedMedication)
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    try {
      if (editingGroupId === null) {
        await api.createSchedule(payload)
        setSuccess('Schedule created.')
      } else {
        await api.updateSchedule(editingGroupId, payload)
        setSuccess('Schedule updated.')
      }
      await loadData()
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save schedule')
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(schedule: MedicationSchedule) {
    setEditingGroupId(schedule.schedule_group_id)
    setForm({
      medication_id: schedule.medication_id,
      end_date: schedule.end_date,
      notes: schedule.notes ?? '',
      slots: schedule.slots.map((slot) => ({
        start_date: slot.start_date,
        time_of_day: slot.time_of_day.slice(0, 5),
      })),
    })
    setError('')
    setSuccess('')
  }

  async function handleDelete(schedule: MedicationSchedule) {
    if (!window.confirm(`Delete the ${schedule.medication_name} schedule?`)) {
      return
    }

    setError('')
    setSuccess('')

    try {
      await api.deleteSchedule(schedule.schedule_group_id)
      await loadData()
      if (editingGroupId === schedule.schedule_group_id) resetForm()
      setSuccess('Schedule deleted.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete schedule')
    }
  }

  async function handleToggleConfirmation(instance: DoseInstance) {
    const key = `${instance.schedule_id}-${instance.scheduled_date}-${instance.time_of_day}`
    setConfirmingKey(key)
    setError('')
    setSuccess('')

    try {
      if (instance.confirmation_id) {
        await api.unconfirmDose(instance.confirmation_id)
        setSuccess('Dose confirmation removed.')
      } else {
        await api.confirmDose({
          medication_id: instance.medication_id,
          schedule_id: instance.schedule_id,
          scheduled_date: instance.scheduled_date,
          time_of_day: instance.time_of_day,
        })
        setSuccess('Dose confirmed.')
      }
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update dose confirmation')
    } finally {
      setConfirmingKey('')
    }
  }

  if (user?.role !== 'patient') {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-soft">
        <h1 className="text-2xl font-semibold text-slate-900">Patient access only</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Personal schedule management is reserved for patient accounts. Providers can review schedules inside each assigned patient workspace, and admins do not manage schedules directly.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-white p-6 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Dose Planner</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-900">Schedules and upcoming doses</h1>
            <p className="mt-3 max-w-3xl text-slate-600">
              Each medication now controls how many slots belong in a schedule. Daily schedules share a date, weekly schedules stay in one week, and monthly schedules stay in one month.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:w-auto">
            <div className="rounded-2xl bg-brand-50 px-4 py-3">
              <p className="text-sm text-brand-700">Schedules</p>
              <p className="text-3xl font-semibold text-brand-900">{schedules.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-100 px-4 py-3">
              <p className="text-sm text-slate-600">Next 14 days</p>
              <p className="text-3xl font-semibold text-slate-900">{instances.length}</p>
            </div>
          </div>
        </div>
        {error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <section className="rounded-3xl bg-white p-6 shadow-soft">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">{editingGroupId === null ? 'New Schedule' : 'Edit Schedule'}</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            {editingGroupId === null ? 'Create recurring reminders' : 'Adjust recurring reminders'}
          </h2>
          <p className="mt-3 text-slate-600">{selectedMedication ? `${selectedMedication.name} needs ${selectedMedicationSummary}.` : selectedMedicationSummary}</p>

          {medications.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              Add at least one medication before creating a schedule.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Medication</span>
                <select
                  value={form.medication_id}
                  onChange={(event) => updateField('medication_id', Number(event.target.value))}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                >
                  {medications.map((medication) => (
                    <option key={medication.id} value={medication.id}>
                      {medication.name} - {medication.dosage} - {medication.frequency}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">End date</span>
                <input
                  type="date"
                  value={form.end_date ?? ''}
                  onChange={(event) => updateField('end_date', event.target.value || null)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                />
                <span className="mt-2 block text-xs text-slate-500">Leave blank for an ongoing schedule.</span>
              </label>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-700">Required slots</p>
                <p className="mt-2 text-sm text-slate-500">
                  {selectedMedication ? selectedMedicationSummary : 'Choose a medication to see the required slot count.'}
                </p>
              </div>

              <div className="space-y-4">
                {form.slots.map((slot, index) => (
                  <div key={index} className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-sm font-medium text-slate-700">Slot {index + 1}</p>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-sm text-slate-600">Start date</span>
                        <input
                          type="date"
                          value={slot.start_date}
                          onChange={(event) => updateSlot(index, 'start_date', event.target.value)}
                          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm text-slate-600">Time</span>
                        <input
                          type="time"
                          value={slot.time_of_day}
                          onChange={(event) => updateSlot(index, 'time_of_day', event.target.value)}
                          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Notes</span>
                <textarea
                  value={form.notes}
                  onChange={(event) => updateField('notes', event.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                  placeholder="Take after breakfast or with plenty of water."
                />
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={saving || medications.length === 0}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Saving...' : editingGroupId === null ? 'Create schedule' : 'Save changes'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Clear form
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="space-y-6">
          <div className="rounded-3xl bg-white p-6 shadow-soft">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Upcoming Calendar</p>
                <h2 className="mt-3 text-2xl font-semibold text-slate-900">Next 14 days</h2>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {loading ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">Loading upcoming doses...</div>
              ) : groupedInstances.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-slate-500">
                  No generated dose instances yet.
                </div>
              ) : (
                groupedInstances.map(([date, entries]) => (
                  <div key={date} className="rounded-3xl border border-slate-200 p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-slate-900">{formatDateLabel(date)}</h3>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.15em] text-slate-600">
                        {entries.length} dose{entries.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {entries.map((entry) => {
                        const actionKey = `${entry.schedule_id}-${entry.scheduled_date}-${entry.time_of_day}`
                        return (
                          <div key={actionKey} className="rounded-2xl bg-slate-50 px-4 py-3">
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium text-slate-900">{entry.medication_name}</p>
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-[0.15em] ${
                                      entry.status === 'confirmed'
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : entry.status === 'overdue'
                                          ? 'bg-red-100 text-red-700'
                                          : 'bg-amber-100 text-amber-700'
                                    }`}
                                  >
                                    {entry.status}
                                  </span>
                                </div>
                                <p className="text-sm text-slate-600">{entry.medication_dosage}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right text-sm text-slate-700">
                                  <div>{formatTimeLabel(entry.time_of_day)}</div>
                                  <div className="text-xs text-slate-500">
                                    {entry.status === 'confirmed'
                                      ? `Confirmed ${entry.confirmed_at ? new Date(entry.confirmed_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}`
                                      : entry.status === 'overdue'
                                        ? 'Past due'
                                        : 'Not due yet'}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleToggleConfirmation(entry)}
                                  disabled={
                                    confirmingKey === actionKey ||
                                    (!entry.can_confirm && entry.status !== 'confirmed')
                                  }
                                  className={`rounded-xl px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                    entry.status === 'confirmed'
                                      ? 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                      : 'bg-slate-900 text-white hover:bg-slate-700'
                                  }`}
                                >
                                  {confirmingKey === actionKey
                                    ? 'Saving...'
                                    : entry.status === 'confirmed'
                                      ? 'Undo'
                                      : entry.can_confirm
                                        ? 'Confirm'
                                        : 'Locked'}
                                </button>
                              </div>
                            </div>
                            <p className="mt-2 text-sm text-slate-500">{entry.notes || 'No schedule notes.'}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-soft">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Saved Schedules</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">Recurring schedule groups</h2>

            <div className="mt-6 space-y-4">
              {loading ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">Loading schedules...</div>
              ) : schedules.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-slate-500">
                  No schedules yet. Create one to start generating dose instances.
                </div>
              ) : (
                schedules.map((schedule) => (
                  <article key={schedule.schedule_group_id} className="rounded-3xl border border-slate-200 p-5 transition hover:border-brand-200 hover:shadow-soft">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-xl font-semibold text-slate-900">{schedule.medication_name}</h3>
                          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.15em] text-brand-700">
                            {schedule.frequency_count} {schedule.frequency_unit}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{schedule.medication_dosage}</p>
                        <div className="mt-3 space-y-2">
                          {schedule.slots.map((slot, index) => (
                            <p key={slot.schedule_id} className="text-sm text-slate-500">
                              Slot {index + 1}: {slot.start_date} at {formatTimeLabel(slot.time_of_day)}
                            </p>
                          ))}
                        </div>
                        <p className="mt-2 text-sm text-slate-500">{schedule.end_date ? `Ends ${schedule.end_date}` : 'Ongoing schedule'}</p>
                        <p className="mt-2 text-sm text-slate-500">{schedule.notes || 'No schedule notes.'}</p>
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => handleEdit(schedule)}
                          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-brand-200 hover:text-brand-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(schedule)}
                          className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
