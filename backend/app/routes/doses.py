from datetime import datetime, timezone
from calendar import monthrange

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.deps import require_roles
from app.database import get_db
from app.models.dose_confirmation import DoseConfirmation
from app.models.medication import Medication
from app.models.schedule import MedicationSchedule
from app.models.user import User
from app.schemas.dose import DoseConfirmationCreate, DoseConfirmationResponse

router = APIRouter()


def add_monthly_occurrence(anchor_date, months_forward: int):
    total_month = anchor_date.month - 1 + months_forward
    year = anchor_date.year + total_month // 12
    month = total_month % 12 + 1
    day = min(anchor_date.day, monthrange(year, month)[1])
    return anchor_date.replace(year=year, month=month, day=day)


def get_user_schedule_or_404(schedule_id: int, user_id: int, db: Session) -> MedicationSchedule:
    schedule = (
        db.query(MedicationSchedule)
        .filter(MedicationSchedule.id == schedule_id, MedicationSchedule.user_id == user_id)
        .first()
    )
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


def get_user_medication_or_404(medication_id: int, user_id: int, db: Session) -> Medication:
    medication = (
        db.query(Medication)
        .filter(Medication.id == medication_id, Medication.user_id == user_id)
        .first()
    )
    if not medication:
        raise HTTPException(status_code=404, detail="Medication not found")
    return medication


@router.post("/confirm", response_model=DoseConfirmationResponse, status_code=status.HTTP_201_CREATED)
def confirm_dose(
    payload: DoseConfirmationCreate,
    current_user: User = Depends(require_roles("patient")),
    db: Session = Depends(get_db),
):
    schedule = get_user_schedule_or_404(payload.schedule_id, current_user.id, db)
    medication = get_user_medication_or_404(payload.medication_id, current_user.id, db)

    if schedule.medication_id != medication.id:
        raise HTTPException(status_code=400, detail="Schedule does not belong to the selected medication")
    if payload.time_of_day != schedule.time_of_day:
        raise HTTPException(status_code=400, detail="Dose time does not match the selected schedule")
    if payload.scheduled_date < schedule.start_date:
        raise HTTPException(status_code=400, detail="Scheduled date is outside the schedule range")
    if schedule.end_date and payload.scheduled_date > schedule.end_date:
        raise HTTPException(status_code=400, detail="Scheduled date is outside the schedule range")
    if medication.frequency_unit == "weekly":
        if (payload.scheduled_date - schedule.start_date).days % 7 != 0:
            raise HTTPException(status_code=400, detail="Scheduled date does not match the weekly schedule")
    elif medication.frequency_unit == "monthly":
        months_apart = (payload.scheduled_date.year - schedule.start_date.year) * 12 + (
            payload.scheduled_date.month - schedule.start_date.month
        )
        if months_apart < 0 or add_monthly_occurrence(schedule.start_date, months_apart) != payload.scheduled_date:
            raise HTTPException(status_code=400, detail="Scheduled date does not match the monthly schedule")
    scheduled_datetime = datetime.combine(payload.scheduled_date, payload.time_of_day).astimezone()
    if scheduled_datetime > datetime.now().astimezone():
        raise HTTPException(status_code=400, detail="You cannot confirm a dose before its scheduled time")

    existing = (
        db.query(DoseConfirmation)
        .filter(
            DoseConfirmation.user_id == current_user.id,
            DoseConfirmation.schedule_id == payload.schedule_id,
            DoseConfirmation.scheduled_date == payload.scheduled_date,
            DoseConfirmation.time_of_day == payload.time_of_day,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="This dose has already been confirmed")

    confirmation = DoseConfirmation(
        user_id=current_user.id,
        medication_id=payload.medication_id,
        schedule_id=payload.schedule_id,
        scheduled_date=payload.scheduled_date,
        time_of_day=payload.time_of_day,
        confirmed_at=datetime.now(timezone.utc),
    )
    db.add(confirmation)
    db.commit()
    db.refresh(confirmation)
    return confirmation


@router.delete("/confirm/{confirmation_id}", status_code=status.HTTP_204_NO_CONTENT)
def unconfirm_dose(
    confirmation_id: int,
    current_user: User = Depends(require_roles("patient")),
    db: Session = Depends(get_db),
):
    confirmation = (
        db.query(DoseConfirmation)
        .filter(DoseConfirmation.id == confirmation_id, DoseConfirmation.user_id == current_user.id)
        .first()
    )
    if not confirmation:
        raise HTTPException(status_code=404, detail="Dose confirmation not found")

    db.delete(confirmation)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
