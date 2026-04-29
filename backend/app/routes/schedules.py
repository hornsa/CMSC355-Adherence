from calendar import monthrange
from datetime import date, datetime, time, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session, joinedload

from app.core.deps import require_roles
from app.database import get_db
from app.models.dose_confirmation import DoseConfirmation
from app.models.medication import Medication
from app.models.schedule import MedicationSchedule
from app.models.user import User
from app.schemas.schedule import (
    DoseInstanceResponse,
    ScheduleCreate,
    ScheduleResponse,
    ScheduleSlotResponse,
    ScheduleUpdate,
)

router = APIRouter()


def serialize_schedule_group(schedules: list[MedicationSchedule]) -> ScheduleResponse:
    ordered = sorted(schedules, key=lambda schedule: (schedule.start_date, schedule.time_of_day, schedule.id))
    first = ordered[0]
    medication = first.medication
    if medication is None:
        raise HTTPException(status_code=500, detail="Schedule is missing its medication")
    return ScheduleResponse(
        schedule_group_id=first.schedule_group_id,
        user_id=first.user_id,
        medication_id=first.medication_id,
        medication_name=medication.name,
        medication_dosage=medication.dosage,
        frequency_count=medication.frequency_count,
        frequency_unit=medication.frequency_unit,
        end_date=first.end_date,
        notes=first.notes,
        slots=[
            ScheduleSlotResponse(
                schedule_id=schedule.id,
                start_date=schedule.start_date,
                time_of_day=schedule.time_of_day,
            )
            for schedule in ordered
        ],
    )


def get_dose_confirmation_key(schedule_id: int, scheduled_date: date, time_of_day: time) -> tuple[int, date, str]:
    return (schedule_id, scheduled_date, time_of_day.isoformat())


def get_user_medication_or_404(medication_id: int, user_id: int, db: Session) -> Medication:
    medication = (
        db.query(Medication)
        .filter(Medication.id == medication_id, Medication.user_id == user_id)
        .first()
    )
    if not medication:
        raise HTTPException(status_code=404, detail="Medication not found")
    return medication


def get_schedule_group_or_404(schedule_group_id: str, user_id: int, db: Session) -> list[MedicationSchedule]:
    schedules = (
        db.query(MedicationSchedule)
        .options(joinedload(MedicationSchedule.medication))
        .filter(
            MedicationSchedule.schedule_group_id == schedule_group_id,
            MedicationSchedule.user_id == user_id,
        )
        .order_by(MedicationSchedule.start_date.asc(), MedicationSchedule.time_of_day.asc(), MedicationSchedule.id.asc())
        .all()
    )
    if not schedules:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedules


def date_ranges_overlap(start_a: date, end_a: date | None, start_b: date, end_b: date | None) -> bool:
    far_future = date(9999, 12, 31)
    return start_a <= (end_b or far_future) and start_b <= (end_a or far_future)


def ensure_schedule_matches_medication(payload: ScheduleCreate | ScheduleUpdate, medication: Medication) -> None:
    if len(payload.slots) != medication.frequency_count:
        raise HTTPException(
            status_code=400,
            detail=f"This medication requires exactly {medication.frequency_count} time slots",
        )

    slot_dates = [slot.start_date for slot in payload.slots]
    if medication.frequency_unit == "daily":
        if len(set(slot_dates)) != 1:
            raise HTTPException(status_code=400, detail="Daily schedules must use the same start date for every slot")
    elif medication.frequency_unit == "weekly":
        weeks = {(slot_date.isocalendar().year, slot_date.isocalendar().week) for slot_date in slot_dates}
        if len(weeks) != 1:
            raise HTTPException(status_code=400, detail="Weekly schedules must keep all slot dates in the same week")
    elif medication.frequency_unit == "monthly":
        months = {(slot_date.year, slot_date.month) for slot_date in slot_dates}
        if len(months) != 1:
            raise HTTPException(status_code=400, detail="Monthly schedules must keep all slot dates in the same month")


def ensure_no_duplicate_schedule(
    payload: ScheduleCreate | ScheduleUpdate,
    medication: Medication,
    user_id: int,
    db: Session,
    exclude_group_id: str | None = None,
) -> None:
    for slot in payload.slots:
        candidates = (
            db.query(MedicationSchedule)
            .filter(
                MedicationSchedule.user_id == user_id,
                MedicationSchedule.medication_id == medication.id,
                MedicationSchedule.start_date == slot.start_date,
                MedicationSchedule.time_of_day == slot.time_of_day,
            )
            .all()
        )
        for candidate in candidates:
            if exclude_group_id and candidate.schedule_group_id == exclude_group_id:
                continue
            if date_ranges_overlap(slot.start_date, payload.end_date, candidate.start_date, candidate.end_date):
                raise HTTPException(
                    status_code=409,
                    detail="A matching schedule slot already exists for this medication",
                )


def add_monthly_occurrence(anchor_date: date, months_forward: int) -> date:
    total_month = anchor_date.month - 1 + months_forward
    year = anchor_date.year + total_month // 12
    month = total_month % 12 + 1
    day = min(anchor_date.day, monthrange(year, month)[1])
    return date(year, month, day)


def iter_schedule_dates(schedule: MedicationSchedule, window_start: date, window_end: date, unit: str):
    if unit == "daily":
        current = max(schedule.start_date, window_start)
        last = min(window_end, schedule.end_date or window_end)
        while current <= last:
            yield current
            current += timedelta(days=1)
        return

    if unit == "weekly":
        current = schedule.start_date
        while current < window_start:
            current += timedelta(days=7)
        last = min(window_end, schedule.end_date or window_end)
        while current <= last:
            yield current
            current += timedelta(days=7)
        return

    months_forward = 0
    current = schedule.start_date
    while current < window_start:
        months_forward += 1
        current = add_monthly_occurrence(schedule.start_date, months_forward)
    last = min(window_end, schedule.end_date or window_end)
    while current <= last:
        yield current
        months_forward += 1
        current = add_monthly_occurrence(schedule.start_date, months_forward)


def generate_dose_instances(
    schedules: list[MedicationSchedule],
    start_date: date,
    end_date: date,
) -> list[DoseInstanceResponse]:
    instances: list[DoseInstanceResponse] = []
    now = datetime.now().astimezone()

    for schedule in schedules:
        medication = schedule.medication
        if medication is None:
            continue
        for scheduled_date in iter_schedule_dates(schedule, start_date, end_date, medication.frequency_unit):
            due_at = datetime.combine(scheduled_date, schedule.time_of_day).astimezone()
            status = "overdue" if due_at < now else "scheduled"
            instances.append(
                DoseInstanceResponse(
                    medication_id=schedule.medication_id,
                    medication_name=medication.name,
                    medication_dosage=medication.dosage,
                    schedule_id=schedule.id,
                    schedule_group_id=schedule.schedule_group_id,
                    scheduled_date=scheduled_date,
                    time_of_day=schedule.time_of_day,
                    due_at=due_at,
                    notes=schedule.notes,
                    status=status,
                    can_confirm=due_at <= now,
                )
            )

    instances.sort(key=lambda item: (item.scheduled_date, item.time_of_day, item.medication_name))
    return instances


def apply_confirmations_to_instances(
    instances: list[DoseInstanceResponse],
    confirmations: list[DoseConfirmation],
) -> list[DoseInstanceResponse]:
    confirmation_map = {
        get_dose_confirmation_key(
            confirmation.schedule_id,
            confirmation.scheduled_date,
            confirmation.time_of_day,
        ): confirmation
        for confirmation in confirmations
    }

    for instance in instances:
        confirmation = confirmation_map.get(
            get_dose_confirmation_key(instance.schedule_id, instance.scheduled_date, instance.time_of_day)
        )
        if confirmation:
            instance.status = "confirmed"
            instance.confirmation_id = confirmation.id
            instance.confirmed_at = confirmation.confirmed_at
            instance.can_confirm = False

    return instances


def replace_schedule_group(
    schedule_group_id: str,
    payload: ScheduleCreate | ScheduleUpdate,
    user_id: int,
    medication: Medication,
    db: Session,
) -> list[MedicationSchedule]:
    existing = (
        db.query(MedicationSchedule)
        .filter(
            MedicationSchedule.user_id == user_id,
            MedicationSchedule.schedule_group_id == schedule_group_id,
        )
        .all()
    )
    for schedule in existing:
        db.delete(schedule)
    db.flush()

    created_rows: list[MedicationSchedule] = []
    for slot in payload.slots:
        schedule = MedicationSchedule(
            schedule_group_id=schedule_group_id,
            user_id=user_id,
            medication_id=medication.id,
            time_of_day=slot.time_of_day,
            days_of_week="",
            start_date=slot.start_date,
            end_date=payload.end_date,
            notes=payload.notes,
        )
        db.add(schedule)
        created_rows.append(schedule)

    db.commit()
    return get_schedule_group_or_404(schedule_group_id, user_id, db)


@router.get("", response_model=list[ScheduleResponse])
def list_schedules(current_user: User = Depends(require_roles("patient")), db: Session = Depends(get_db)):
    schedules = (
        db.query(MedicationSchedule)
        .options(joinedload(MedicationSchedule.medication))
        .filter(MedicationSchedule.user_id == current_user.id)
        .order_by(
            MedicationSchedule.schedule_group_id.asc(),
            MedicationSchedule.start_date.asc(),
            MedicationSchedule.time_of_day.asc(),
            MedicationSchedule.id.asc(),
        )
        .all()
    )

    grouped: dict[str, list[MedicationSchedule]] = {}
    for schedule in schedules:
        if schedule.medication is None:
            continue
        group_id = schedule.schedule_group_id or f"legacy-{schedule.id}"
        grouped.setdefault(group_id, []).append(schedule)

    ordered_groups = sorted(grouped.values(), key=lambda group: (group[0].start_date, group[0].time_of_day, group[0].id))
    return [serialize_schedule_group(group) for group in ordered_groups]


@router.post("", response_model=ScheduleResponse, status_code=status.HTTP_201_CREATED)
def create_schedule(
    payload: ScheduleCreate,
    current_user: User = Depends(require_roles("patient")),
    db: Session = Depends(get_db),
):
    medication = get_user_medication_or_404(payload.medication_id, current_user.id, db)
    ensure_schedule_matches_medication(payload, medication)
    ensure_no_duplicate_schedule(payload, medication, current_user.id, db)

    schedules = replace_schedule_group(str(uuid4()), payload, current_user.id, medication, db)
    return serialize_schedule_group(schedules)


@router.get("/instances", response_model=list[DoseInstanceResponse])
def list_schedule_instances(
    start_date: date | None = Query(default=None),
    days: int = Query(default=14, ge=1, le=60),
    current_user: User = Depends(require_roles("patient")),
    db: Session = Depends(get_db),
):
    window_start = start_date or datetime.now().date()
    window_end = window_start + timedelta(days=days - 1)

    schedules = (
        db.query(MedicationSchedule)
        .options(joinedload(MedicationSchedule.medication))
        .filter(
            MedicationSchedule.user_id == current_user.id,
            MedicationSchedule.start_date <= window_end,
        )
        .all()
    )
    active_schedules = [schedule for schedule in schedules if schedule.end_date is None or schedule.end_date >= window_start]
    instances = generate_dose_instances(active_schedules, window_start, window_end)
    confirmations = (
        db.query(DoseConfirmation)
        .filter(
            DoseConfirmation.user_id == current_user.id,
            DoseConfirmation.scheduled_date >= window_start,
            DoseConfirmation.scheduled_date <= window_end,
        )
        .all()
    )
    return apply_confirmations_to_instances(instances, confirmations)


@router.put("/{schedule_group_id}", response_model=ScheduleResponse)
def update_schedule(
    schedule_group_id: str,
    payload: ScheduleUpdate,
    current_user: User = Depends(require_roles("patient")),
    db: Session = Depends(get_db),
):
    get_schedule_group_or_404(schedule_group_id, current_user.id, db)
    medication = get_user_medication_or_404(payload.medication_id, current_user.id, db)
    ensure_schedule_matches_medication(payload, medication)
    ensure_no_duplicate_schedule(payload, medication, current_user.id, db, exclude_group_id=schedule_group_id)

    schedules = replace_schedule_group(schedule_group_id, payload, current_user.id, medication, db)
    return serialize_schedule_group(schedules)


@router.delete("/{schedule_group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule(
    schedule_group_id: str,
    current_user: User = Depends(require_roles("patient")),
    db: Session = Depends(get_db),
):
    schedules = get_schedule_group_or_404(schedule_group_id, current_user.id, db)
    for schedule in schedules:
        db.delete(schedule)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
