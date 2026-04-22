from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.database import get_db
from app.models.patient_provider_assignment import PatientProviderAssignment
from app.models.provider_profile import ProviderProfile
from app.models.user import User


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    email = decode_access_token(token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_roles(*roles: str) -> Callable:
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="You do not have permission to access this resource")
        return current_user

    return dependency


def get_admin_user(current_user: User = Depends(require_roles("admin"))) -> User:
    return current_user


def get_verified_provider(
    current_user: User = Depends(require_roles("provider")),
    db: Session = Depends(get_db),
) -> User:
    profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == current_user.id).first()
    if not profile or profile.verification_status != "approved":
        raise HTTPException(status_code=403, detail="Provider account is not verified")
    return current_user


def ensure_provider_assignment(provider_id: int, patient_user_id: int, db: Session) -> None:
    assignment = (
        db.query(PatientProviderAssignment)
        .filter(
            PatientProviderAssignment.provider_user_id == provider_id,
            PatientProviderAssignment.patient_user_id == patient_user_id,
            PatientProviderAssignment.status == "active",
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=403, detail="Provider is not assigned to this patient")
