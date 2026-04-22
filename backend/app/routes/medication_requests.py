from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import require_roles
from app.database import get_db
from app.models.medication_request import MedicationRequest
from app.models.user import User
from app.schemas.medication_request import MedicationRequestCreate, MedicationRequestResponse

router = APIRouter()


@router.get("", response_model=list[MedicationRequestResponse])
def list_medication_requests(current_user: User = Depends(require_roles("patient")), db: Session = Depends(get_db)):
    requests = (
        db.query(MedicationRequest)
        .filter(MedicationRequest.patient_user_id == current_user.id)
        .order_by(MedicationRequest.created_at.desc(), MedicationRequest.id.desc())
        .all()
    )
    return requests


@router.post("", response_model=MedicationRequestResponse, status_code=status.HTTP_201_CREATED)
def create_medication_request(
    payload: MedicationRequestCreate,
    current_user: User = Depends(require_roles("patient")),
    db: Session = Depends(get_db),
):
    existing_pending = (
        db.query(MedicationRequest)
        .filter(
            MedicationRequest.patient_user_id == current_user.id,
            MedicationRequest.medication_name.ilike(payload.medication_name),
            MedicationRequest.status == "pending",
        )
        .first()
    )
    if existing_pending:
        raise HTTPException(status_code=409, detail="You already have a pending request for this medication")

    request_row = MedicationRequest(
        patient_user_id=current_user.id,
        medication_name=payload.medication_name,
        dosage=payload.dosage,
        frequency_count=payload.frequency_count,
        frequency_unit=payload.frequency_unit,
        instructions=payload.instructions,
        request_notes=payload.request_notes,
        status="pending",
        resolved_at=None,
    )
    db.add(request_row)
    db.commit()
    db.refresh(request_row)
    return request_row
