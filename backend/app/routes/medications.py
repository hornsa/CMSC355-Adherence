from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import require_roles
from app.database import get_db
from app.models.medication import Medication
from app.models.user import User
from app.schemas.medication import MedicationCreate, MedicationResponse, MedicationUpdate

router = APIRouter()


def build_frequency_label(count: int, unit: str) -> str:
    return f"{count} {unit}"


def serialize_medication(medication: Medication) -> MedicationResponse:
    return MedicationResponse.model_validate(medication)


def get_user_medication_or_404(medication_id: int, user_id: int, db: Session) -> Medication:
    medication = (
        db.query(Medication)
        .filter(Medication.id == medication_id, Medication.user_id == user_id)
        .first()
    )
    if not medication:
        raise HTTPException(status_code=404, detail="Medication not found")
    return medication


def ensure_unique_name(name: str, user_id: int, db: Session, exclude_id: int | None = None) -> None:
    query = db.query(Medication).filter(
        Medication.user_id == user_id,
        func.lower(Medication.name) == name.lower(),
    )
    if exclude_id is not None:
        query = query.filter(Medication.id != exclude_id)

    existing = query.first()
    if existing:
        raise HTTPException(status_code=409, detail="You already have a medication with this name")


@router.get("", response_model=list[MedicationResponse])
def list_medications(current_user: User = Depends(require_roles("patient")), db: Session = Depends(get_db)):
    medications = (
        db.query(Medication)
        .filter(Medication.user_id == current_user.id)
        .order_by(Medication.name.asc(), Medication.id.asc())
        .all()
    )
    return [serialize_medication(medication) for medication in medications]


@router.post("", response_model=MedicationResponse, status_code=status.HTTP_201_CREATED)
def create_medication(
    payload: MedicationCreate,
    current_user: User = Depends(require_roles("patient")),
    db: Session = Depends(get_db),
):
    del payload, current_user, db
    raise HTTPException(status_code=403, detail="Only providers can create official medications")


@router.put("/{medication_id}", response_model=MedicationResponse)
def update_medication(
    medication_id: int,
    payload: MedicationUpdate,
    current_user: User = Depends(require_roles("patient")),
    db: Session = Depends(get_db),
):
    del medication_id, payload, current_user, db
    raise HTTPException(status_code=403, detail="Only providers can update official medications")


@router.delete("/{medication_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_medication(
    medication_id: int,
    current_user: User = Depends(require_roles("patient")),
    db: Session = Depends(get_db),
):
    del medication_id, current_user, db
    raise HTTPException(status_code=403, detail="Only providers can remove official medications")
