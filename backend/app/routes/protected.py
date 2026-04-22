from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user
from app.database import get_db
from app.models.dose_confirmation import DoseConfirmation
from app.models.medication import Medication
from app.models.patient_provider_assignment import PatientProviderAssignment
from app.models.provider_profile import ProviderProfile
from app.models.schedule import MedicationSchedule
from app.models.user import User
from app.routes.schedules import apply_confirmations_to_instances, generate_dose_instances

router = APIRouter()


def serialize_user(current_user: User) -> dict:
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "notifications_enabled": current_user.notifications_enabled,
        "provider_verification_status": current_user.provider_profile.verification_status if current_user.provider_profile else None,
    }


def get_patient_week_instances(user_id: int, db: Session, today):
    week_start = today - timedelta(days=6)
    schedules = (
        db.query(MedicationSchedule)
        .options(joinedload(MedicationSchedule.medication))
        .filter(
            MedicationSchedule.user_id == user_id,
            MedicationSchedule.start_date <= today,
        )
        .all()
    )
    active_schedules = [
        schedule
        for schedule in schedules
        if schedule.medication is not None and (schedule.end_date is None or schedule.end_date >= week_start)
    ]
    week_instances = generate_dose_instances(active_schedules, week_start, today)
    confirmations = (
        db.query(DoseConfirmation)
        .filter(
            DoseConfirmation.user_id == user_id,
            DoseConfirmation.scheduled_date >= week_start,
            DoseConfirmation.scheduled_date <= today,
        )
        .all()
    )
    return apply_confirmations_to_instances(week_instances, confirmations), week_start


def build_patient_dashboard(current_user: User, db: Session) -> dict:
    active_medications = db.query(Medication).filter(Medication.user_id == current_user.id).count()
    today = datetime.now().date()
    week_instances, week_start = get_patient_week_instances(current_user.id, db, today)
    today_instances = [instance for instance in week_instances if instance.scheduled_date == today]
    confirmed_today = sum(1 for instance in today_instances if instance.status == "confirmed")
    overdue_today = sum(1 for instance in today_instances if instance.status == "overdue")
    today_doses = len(today_instances)
    scheduled_week = len(week_instances)
    confirmed_week = sum(1 for instance in week_instances if instance.status == "confirmed")
    adherence_rate = round((confirmed_week / scheduled_week) * 100) if scheduled_week else 0
    adherence_trend = []
    for offset in range(7):
        day = week_start + timedelta(days=offset)
        day_instances = [instance for instance in week_instances if instance.scheduled_date == day]
        day_total = len(day_instances)
        day_confirmed = sum(1 for instance in day_instances if instance.status == "confirmed")
        day_rate = round((day_confirmed / day_total) * 100) if day_total else 0
        adherence_trend.append(
            {
                "date": day.isoformat(),
                "scheduled": day_total,
                "confirmed": day_confirmed,
                "adherence_rate": day_rate,
            }
        )

    return {
        "kind": "patient",
        "message": f"Welcome back, {current_user.name}!",
        "user": serialize_user(current_user),
        "stats": {
            "active_medications": active_medications,
            "today_doses": today_doses,
            "confirmed_today": confirmed_today,
            "missed_today": max(today_doses - confirmed_today, 0),
            "overdue_today": overdue_today,
            "adherence_rate": adherence_rate,
            "confirmed_week": confirmed_week,
            "scheduled_week": scheduled_week,
            "adherence_trend": adherence_trend,
        },
    }


def build_provider_dashboard(current_user: User, db: Session) -> dict:
    assignments = (
        db.query(PatientProviderAssignment)
        .options(joinedload(PatientProviderAssignment.patient))
        .filter(
            PatientProviderAssignment.provider_user_id == current_user.id,
            PatientProviderAssignment.status == "active",
        )
        .all()
    )
    today = datetime.now().date()
    assigned_patients = 0
    patients_with_overdue = 0
    total_today_doses = 0
    total_confirmed_today = 0
    total_overdue_today = 0
    weekly_rates: list[int] = []

    for assignment in assignments:
        patient = assignment.patient
        if patient is None:
            continue
        assigned_patients += 1
        patient_week_instances, _ = get_patient_week_instances(patient.id, db, today)
        patient_today_instances = [instance for instance in patient_week_instances if instance.scheduled_date == today]
        patient_confirmed_today = sum(1 for instance in patient_today_instances if instance.status == "confirmed")
        patient_overdue_today = sum(1 for instance in patient_today_instances if instance.status == "overdue")
        patient_scheduled_week = len(patient_week_instances)
        patient_confirmed_week = sum(1 for instance in patient_week_instances if instance.status == "confirmed")
        if patient_overdue_today:
            patients_with_overdue += 1
        total_today_doses += len(patient_today_instances)
        total_confirmed_today += patient_confirmed_today
        total_overdue_today += patient_overdue_today
        weekly_rates.append(round((patient_confirmed_week / patient_scheduled_week) * 100) if patient_scheduled_week else 0)

    verification_status = current_user.provider_profile.verification_status if current_user.provider_profile else "pending"
    return {
        "kind": "provider",
        "message": f"Provider dashboard for {current_user.name}",
        "user": serialize_user(current_user),
        "stats": {
            "assigned_patients": assigned_patients,
            "today_doses_across_patients": total_today_doses,
            "confirmed_today_across_patients": total_confirmed_today,
            "overdue_today_across_patients": total_overdue_today,
            "patients_with_overdue": patients_with_overdue,
            "average_weekly_adherence": round(sum(weekly_rates) / len(weekly_rates)) if weekly_rates else 0,
            "verification_status": verification_status,
        },
    }


def build_admin_dashboard(current_user: User, db: Session) -> dict:
    pending_providers = db.query(ProviderProfile).filter(ProviderProfile.verification_status == "pending").count()
    approved_providers = db.query(ProviderProfile).filter(ProviderProfile.verification_status == "approved").count()
    total_patients = db.query(User).filter(User.role == "patient").count()
    active_assignments = db.query(PatientProviderAssignment).filter(PatientProviderAssignment.status == "active").count()

    return {
        "kind": "admin",
        "message": f"Admin dashboard for {current_user.name}",
        "user": serialize_user(current_user),
        "stats": {
            "pending_providers": pending_providers,
            "approved_providers": approved_providers,
            "total_patients": total_patients,
            "active_assignments": active_assignments,
        },
    }


@router.get("/dashboard")
def get_dashboard(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role == "admin":
        return build_admin_dashboard(current_user, db)
    if current_user.role == "provider":
        return build_provider_dashboard(current_user, db)
    return build_patient_dashboard(current_user, db)
