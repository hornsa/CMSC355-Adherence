from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session, joinedload

from app.core.deps import ensure_provider_assignment, get_admin_user, get_current_user, get_verified_provider
from app.database import get_db
from app.models.dose_confirmation import DoseConfirmation
from app.models.medication import Medication
from app.models.medication_request import MedicationRequest
from app.models.patient_provider_assignment import PatientProviderAssignment
from app.models.provider_profile import ProviderProfile
from app.models.schedule import MedicationSchedule
from app.models.user import User
from app.routes.auth import to_user_response
from app.routes.medications import build_frequency_label, ensure_unique_name, serialize_medication
from app.routes.schedules import (
    apply_confirmations_to_instances,
    generate_dose_instances,
    get_user_medication_or_404,
    serialize_schedule_group,
)
from app.schemas.auth import UserResponse
from app.schemas.medication import MedicationCreate, MedicationResponse, MedicationUpdate
from app.schemas.medication_request import MedicationRequestResponse, MedicationRequestReview
from app.schemas.provider import (
    AdherenceReportResponse,
    PatientProviderAssignmentCreate,
    PatientSummaryResponse,
    ProviderApplicationRequest,
    ProviderPatientDetailResponse,
    ProviderProfileResponse,
    ProviderReviewRequest,
)
from app.schemas.schedule import DoseInstanceResponse, ScheduleResponse

router = APIRouter()


def serialize_provider_profile(profile: ProviderProfile) -> ProviderProfileResponse:
    return ProviderProfileResponse(
        user_id=profile.user_id,
        name=profile.user.name,
        email=profile.user.email,
        role=profile.user.role,
        organization_name=profile.organization_name,
        license_number=profile.license_number,
        specialty=profile.specialty,
        work_email=profile.work_email,
        verification_status=profile.verification_status,
        verified_at=profile.verified_at,
        rejection_reason=profile.rejection_reason,
    )


def get_patient_user_or_404(patient_user_id: int, db: Session) -> User:
    patient = db.query(User).filter(User.id == patient_user_id, User.role == "patient").first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


def get_provider_user_or_404(provider_user_id: int, db: Session) -> User:
    provider = db.query(User).filter(User.id == provider_user_id, User.role == "provider").first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider


def get_provider_profile_or_404(provider_user_id: int, db: Session) -> ProviderProfile:
    profile = (
        db.query(ProviderProfile)
        .options(joinedload(ProviderProfile.user))
        .filter(ProviderProfile.user_id == provider_user_id)
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Provider profile not found")
    return profile


def get_patient_schedule_groups(patient_user_id: int, db: Session) -> list[ScheduleResponse]:
    schedules = (
        db.query(MedicationSchedule)
        .options(joinedload(MedicationSchedule.medication))
        .filter(MedicationSchedule.user_id == patient_user_id)
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
        grouped.setdefault(schedule.schedule_group_id or f"legacy-{schedule.id}", []).append(schedule)
    return [serialize_schedule_group(group) for group in grouped.values()]


def get_patient_dose_instances(
    patient_user_id: int,
    db: Session,
    start_date: date,
    end_date: date,
) -> list[DoseInstanceResponse]:
    schedules = (
        db.query(MedicationSchedule)
        .options(joinedload(MedicationSchedule.medication))
        .filter(
            MedicationSchedule.user_id == patient_user_id,
            MedicationSchedule.start_date <= end_date,
        )
        .all()
    )
    active_schedules = [schedule for schedule in schedules if schedule.end_date is None or schedule.end_date >= start_date]
    instances = generate_dose_instances(active_schedules, start_date, end_date)
    confirmations = (
        db.query(DoseConfirmation)
        .filter(
            DoseConfirmation.user_id == patient_user_id,
            DoseConfirmation.scheduled_date >= start_date,
            DoseConfirmation.scheduled_date <= end_date,
        )
        .all()
    )
    return apply_confirmations_to_instances(instances, confirmations)


def build_patient_summary(patient: User, db: Session) -> PatientSummaryResponse:
    today = datetime.now().date()
    active_medications = db.query(Medication).filter(Medication.user_id == patient.id).count()
    instances = get_patient_dose_instances(patient.id, db, today, today)
    confirmed_today = sum(1 for instance in instances if instance.status == "confirmed")
    overdue_today = sum(1 for instance in instances if instance.status == "overdue")

    return PatientSummaryResponse(
        id=patient.id,
        name=patient.name,
        email=patient.email,
        role=patient.role,
        active_medications=active_medications,
        today_doses=len(instances),
        confirmed_today=confirmed_today,
        overdue_today=overdue_today,
    )


def build_adherence_report(patient: User, db: Session, start_date: date, end_date: date) -> AdherenceReportResponse:
    instances = get_patient_dose_instances(patient.id, db, start_date, end_date)
    confirmed = sum(1 for instance in instances if instance.status == "confirmed")
    overdue = sum(1 for instance in instances if instance.status == "overdue")
    scheduled = len(instances)
    pending = max(scheduled - confirmed - overdue, 0)
    adherence_rate = round((confirmed / scheduled) * 100) if scheduled else 0

    return AdherenceReportResponse(
        patient=to_user_response(patient),
        start_date=start_date,
        end_date=end_date,
        totals={
            "scheduled": scheduled,
            "confirmed": confirmed,
            "overdue": overdue,
            "pending": pending,
        },
        adherence_rate=adherence_rate,
        instances=instances,
    )


def get_patient_medication_requests(patient_user_id: int, db: Session) -> list[MedicationRequest]:
    return (
        db.query(MedicationRequest)
        .filter(MedicationRequest.patient_user_id == patient_user_id)
        .order_by(MedicationRequest.created_at.desc(), MedicationRequest.id.desc())
        .all()
    )


def get_patient_medication_request_or_404(request_id: int, patient_user_id: int, db: Session) -> MedicationRequest:
    request_row = (
        db.query(MedicationRequest)
        .filter(
            MedicationRequest.id == request_id,
            MedicationRequest.patient_user_id == patient_user_id,
        )
        .first()
    )
    if not request_row:
        raise HTTPException(status_code=404, detail="Medication request not found")
    return request_row


@router.post("/providers/apply", response_model=ProviderProfileResponse)
def apply_as_provider(
    payload: ProviderApplicationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == current_user.id).first()
    if profile and profile.verification_status == "approved":
        raise HTTPException(status_code=409, detail="Provider account is already approved")

    if profile is None:
        profile = ProviderProfile(user_id=current_user.id)
        db.add(profile)

    profile.organization_name = payload.organization_name.strip()
    profile.license_number = payload.license_number.strip()
    profile.specialty = payload.specialty.strip() if payload.specialty else None
    profile.work_email = payload.work_email.lower()
    profile.verification_status = "pending"
    profile.verified_by_user_id = None
    profile.verified_at = None
    profile.rejection_reason = None

    db.commit()
    profile = get_provider_profile_or_404(current_user.id, db)
    return serialize_provider_profile(profile)


@router.get("/providers/me", response_model=ProviderProfileResponse)
def get_my_provider_profile(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = get_provider_profile_or_404(current_user.id, db)
    return serialize_provider_profile(profile)


@router.get("/admin/providers/pending", response_model=list[ProviderProfileResponse])
def list_pending_providers(admin_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    del admin_user
    profiles = (
        db.query(ProviderProfile)
        .options(joinedload(ProviderProfile.user))
        .filter(ProviderProfile.verification_status == "pending")
        .order_by(ProviderProfile.created_at.asc(), ProviderProfile.user_id.asc())
        .all()
    )
    return [serialize_provider_profile(profile) for profile in profiles]


@router.get("/admin/providers/approved", response_model=list[ProviderProfileResponse])
def list_approved_providers(admin_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    del admin_user
    profiles = (
        db.query(ProviderProfile)
        .options(joinedload(ProviderProfile.user))
        .filter(ProviderProfile.verification_status == "approved")
        .order_by(ProviderProfile.user_id.asc())
        .all()
    )
    return [serialize_provider_profile(profile) for profile in profiles]


@router.get("/admin/patients", response_model=list[UserResponse])
def list_patient_accounts(admin_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    del admin_user
    patients = db.query(User).filter(User.role == "patient").order_by(User.name.asc(), User.id.asc()).all()
    return [to_user_response(patient) for patient in patients]


@router.post("/admin/providers/{provider_user_id}/approve", response_model=ProviderProfileResponse)
def approve_provider(
    provider_user_id: int,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    profile = get_provider_profile_or_404(provider_user_id, db)
    profile.verification_status = "approved"
    profile.verified_by_user_id = admin_user.id
    profile.verified_at = datetime.now().astimezone()
    profile.rejection_reason = None
    profile.user.role = "provider"
    db.commit()
    profile = get_provider_profile_or_404(provider_user_id, db)
    return serialize_provider_profile(profile)


@router.post("/admin/providers/{provider_user_id}/reject", response_model=ProviderProfileResponse)
def reject_provider(
    provider_user_id: int,
    payload: ProviderReviewRequest,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    profile = get_provider_profile_or_404(provider_user_id, db)
    profile.verification_status = "rejected"
    profile.verified_by_user_id = admin_user.id
    profile.verified_at = datetime.now().astimezone()
    profile.rejection_reason = payload.rejection_reason.strip() if payload.rejection_reason else "Application rejected"
    db.commit()
    profile = get_provider_profile_or_404(provider_user_id, db)
    return serialize_provider_profile(profile)


@router.post("/admin/assignments", status_code=status.HTTP_201_CREATED)
def create_patient_provider_assignment(
    payload: PatientProviderAssignmentCreate,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    patient = get_patient_user_or_404(payload.patient_user_id, db)
    provider = get_provider_user_or_404(payload.provider_user_id, db)
    profile = get_provider_profile_or_404(provider.id, db)
    if profile.verification_status != "approved":
        raise HTTPException(status_code=400, detail="Provider must be approved before assignment")

    assignment = (
        db.query(PatientProviderAssignment)
        .filter(
            PatientProviderAssignment.patient_user_id == patient.id,
            PatientProviderAssignment.provider_user_id == provider.id,
        )
        .first()
    )
    if assignment is None:
        assignment = PatientProviderAssignment(
            patient_user_id=patient.id,
            provider_user_id=provider.id,
            assigned_by_user_id=admin_user.id,
            status="active",
        )
        db.add(assignment)
    else:
        assignment.status = "active"
        assignment.assigned_by_user_id = admin_user.id

    db.commit()
    return {"message": "Assignment saved"}


@router.get("/provider/patients", response_model=list[PatientSummaryResponse])
def list_provider_patients(provider_user: User = Depends(get_verified_provider), db: Session = Depends(get_db)):
    assignments = (
        db.query(PatientProviderAssignment)
        .options(joinedload(PatientProviderAssignment.patient))
        .filter(
            PatientProviderAssignment.provider_user_id == provider_user.id,
            PatientProviderAssignment.status == "active",
        )
        .order_by(PatientProviderAssignment.created_at.asc())
        .all()
    )
    return [build_patient_summary(assignment.patient, db) for assignment in assignments if assignment.patient is not None]


@router.get("/provider/patients/{patient_user_id}", response_model=ProviderPatientDetailResponse)
def get_provider_patient_detail(
    patient_user_id: int,
    provider_user: User = Depends(get_verified_provider),
    db: Session = Depends(get_db),
):
    ensure_provider_assignment(provider_user.id, patient_user_id, db)
    patient = get_patient_user_or_404(patient_user_id, db)
    medications = (
        db.query(Medication)
        .filter(Medication.user_id == patient.id)
        .order_by(Medication.name.asc(), Medication.id.asc())
        .all()
    )
    schedules = get_patient_schedule_groups(patient.id, db)
    today = datetime.now().date()
    today_instances = get_patient_dose_instances(patient.id, db, today, today)

    return ProviderPatientDetailResponse(
        patient=to_user_response(patient),
        medications=[serialize_medication(medication) for medication in medications],
        medication_requests=get_patient_medication_requests(patient.id, db),
        schedules=schedules,
        today_instances=today_instances,
    )


@router.get("/provider/patients/{patient_user_id}/adherence-report", response_model=AdherenceReportResponse)
def get_provider_patient_adherence_report(
    patient_user_id: int,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    provider_user: User = Depends(get_verified_provider),
    db: Session = Depends(get_db),
):
    ensure_provider_assignment(provider_user.id, patient_user_id, db)
    patient = get_patient_user_or_404(patient_user_id, db)
    report_end = end_date or datetime.now().date()
    report_start = start_date or (report_end - timedelta(days=6))
    if report_start > report_end:
        raise HTTPException(status_code=400, detail="Start date must be on or before end date")
    return build_adherence_report(patient, db, report_start, report_end)


@router.get("/provider/patients/{patient_user_id}/medications", response_model=list[MedicationResponse])
def list_patient_medications_for_provider(
    patient_user_id: int,
    provider_user: User = Depends(get_verified_provider),
    db: Session = Depends(get_db),
):
    ensure_provider_assignment(provider_user.id, patient_user_id, db)
    medications = (
        db.query(Medication)
        .filter(Medication.user_id == patient_user_id)
        .order_by(Medication.name.asc(), Medication.id.asc())
        .all()
    )
    return [serialize_medication(medication) for medication in medications]


@router.get("/provider/patients/{patient_user_id}/medication-requests", response_model=list[MedicationRequestResponse])
def list_patient_medication_requests_for_provider(
    patient_user_id: int,
    provider_user: User = Depends(get_verified_provider),
    db: Session = Depends(get_db),
):
    ensure_provider_assignment(provider_user.id, patient_user_id, db)
    return get_patient_medication_requests(patient_user_id, db)


@router.post("/provider/patients/{patient_user_id}/medication-requests/{request_id}/approve", response_model=MedicationRequestResponse)
def approve_patient_medication_request(
    patient_user_id: int,
    request_id: int,
    payload: MedicationRequestReview,
    provider_user: User = Depends(get_verified_provider),
    db: Session = Depends(get_db),
):
    ensure_provider_assignment(provider_user.id, patient_user_id, db)
    request_row = get_patient_medication_request_or_404(request_id, patient_user_id, db)
    if request_row.status != "pending":
        raise HTTPException(status_code=409, detail="Medication request has already been resolved")

    ensure_unique_name(request_row.medication_name, patient_user_id, db)

    medication = Medication(
        user_id=patient_user_id,
        name=request_row.medication_name,
        dosage=request_row.dosage,
        frequency=build_frequency_label(request_row.frequency_count, request_row.frequency_unit),
        frequency_count=request_row.frequency_count,
        frequency_unit=request_row.frequency_unit,
        instructions=request_row.instructions,
    )
    db.add(medication)
    request_row.provider_user_id = provider_user.id
    request_row.status = "approved"
    request_row.resolution_note = payload.resolution_note
    request_row.resolved_at = datetime.now().astimezone()
    db.commit()
    db.refresh(request_row)
    return request_row


@router.post("/provider/patients/{patient_user_id}/medication-requests/{request_id}/reject", response_model=MedicationRequestResponse)
def reject_patient_medication_request(
    patient_user_id: int,
    request_id: int,
    payload: MedicationRequestReview,
    provider_user: User = Depends(get_verified_provider),
    db: Session = Depends(get_db),
):
    ensure_provider_assignment(provider_user.id, patient_user_id, db)
    request_row = get_patient_medication_request_or_404(request_id, patient_user_id, db)
    if request_row.status != "pending":
        raise HTTPException(status_code=409, detail="Medication request has already been resolved")

    request_row.provider_user_id = provider_user.id
    request_row.status = "rejected"
    request_row.resolution_note = payload.resolution_note or "Request rejected"
    request_row.resolved_at = datetime.now().astimezone()
    db.commit()
    db.refresh(request_row)
    return request_row


@router.post("/provider/patients/{patient_user_id}/medications", response_model=MedicationResponse, status_code=status.HTTP_201_CREATED)
def create_patient_medication_for_provider(
    patient_user_id: int,
    payload: MedicationCreate,
    provider_user: User = Depends(get_verified_provider),
    db: Session = Depends(get_db),
):
    ensure_provider_assignment(provider_user.id, patient_user_id, db)
    get_patient_user_or_404(patient_user_id, db)
    ensure_unique_name(payload.name, patient_user_id, db)

    medication = Medication(
        user_id=patient_user_id,
        name=payload.name,
        dosage=payload.dosage,
        frequency=build_frequency_label(payload.frequency_count, payload.frequency_unit),
        frequency_count=payload.frequency_count,
        frequency_unit=payload.frequency_unit,
        instructions=payload.instructions,
    )
    db.add(medication)
    db.commit()
    db.refresh(medication)
    return serialize_medication(medication)


@router.put("/provider/patients/{patient_user_id}/medications/{medication_id}", response_model=MedicationResponse)
def update_patient_medication_for_provider(
    patient_user_id: int,
    medication_id: int,
    payload: MedicationUpdate,
    provider_user: User = Depends(get_verified_provider),
    db: Session = Depends(get_db),
):
    ensure_provider_assignment(provider_user.id, patient_user_id, db)
    medication = get_user_medication_or_404(medication_id, patient_user_id, db)
    ensure_unique_name(payload.name, patient_user_id, db, exclude_id=medication.id)

    medication.name = payload.name
    medication.dosage = payload.dosage
    medication.frequency = build_frequency_label(payload.frequency_count, payload.frequency_unit)
    medication.frequency_count = payload.frequency_count
    medication.frequency_unit = payload.frequency_unit
    medication.instructions = payload.instructions

    db.commit()
    db.refresh(medication)
    return serialize_medication(medication)


@router.delete("/provider/patients/{patient_user_id}/medications/{medication_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient_medication_for_provider(
    patient_user_id: int,
    medication_id: int,
    provider_user: User = Depends(get_verified_provider),
    db: Session = Depends(get_db),
):
    ensure_provider_assignment(provider_user.id, patient_user_id, db)
    medication = get_user_medication_or_404(medication_id, patient_user_id, db)
    db.delete(medication)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/provider/patients/{patient_user_id}/schedules", response_model=list[ScheduleResponse])
def list_patient_schedules_for_provider(
    patient_user_id: int,
    provider_user: User = Depends(get_verified_provider),
    db: Session = Depends(get_db),
):
    ensure_provider_assignment(provider_user.id, patient_user_id, db)
    get_patient_user_or_404(patient_user_id, db)
    return get_patient_schedule_groups(patient_user_id, db)


@router.get("/provider/patients/{patient_user_id}/schedules/instances", response_model=list[DoseInstanceResponse])
def list_patient_schedule_instances_for_provider(
    patient_user_id: int,
    start_date: date | None = Query(default=None),
    days: int = Query(default=14, ge=1, le=60),
    provider_user: User = Depends(get_verified_provider),
    db: Session = Depends(get_db),
):
    ensure_provider_assignment(provider_user.id, patient_user_id, db)
    get_patient_user_or_404(patient_user_id, db)
    window_start = start_date or datetime.now().date()
    window_end = window_start + timedelta(days=days - 1)
    return get_patient_dose_instances(patient_user_id, db, window_start, window_end)

