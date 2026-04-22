from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.auth import UserResponse
from app.schemas.medication import MedicationResponse
from app.schemas.medication_request import MedicationRequestResponse
from app.schemas.schedule import DoseInstanceResponse, ScheduleResponse


class ProviderApplicationRequest(BaseModel):
    organization_name: str = Field(min_length=1, max_length=255)
    license_number: str = Field(min_length=1, max_length=100)
    specialty: str | None = Field(default=None, max_length=100)
    work_email: EmailStr


class ProviderProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    name: str
    email: EmailStr
    role: str
    organization_name: str
    license_number: str
    specialty: str | None
    work_email: EmailStr
    verification_status: str
    verified_at: datetime | None
    rejection_reason: str | None


class ProviderReviewRequest(BaseModel):
    rejection_reason: str | None = Field(default=None, max_length=500)


class PatientProviderAssignmentCreate(BaseModel):
    patient_user_id: int
    provider_user_id: int


class ConnectionRequestCreate(BaseModel):
    provider_user_id: int | None = None
    patient_user_id: int | None = None
    request_message: str | None = Field(default=None, max_length=500)


class ConnectionRequestReview(BaseModel):
    response_message: str | None = Field(default=None, max_length=500)


class PatientProviderAssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_user_id: int
    patient_name: str
    patient_email: EmailStr
    provider_user_id: int
    provider_name: str
    provider_email: EmailStr
    status: str
    request_message: str | None
    initiated_by_user_id: int | None
    responded_by_user_id: int | None
    responded_at: datetime | None
    created_at: datetime


class PatientSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr
    role: str
    active_medications: int
    today_doses: int
    confirmed_today: int
    overdue_today: int


class ProviderPatientDetailResponse(BaseModel):
    patient: UserResponse
    medications: list[MedicationResponse]
    medication_requests: list[MedicationRequestResponse]
    schedules: list[ScheduleResponse]
    today_instances: list[DoseInstanceResponse]


class AdherenceReportResponse(BaseModel):
    patient: UserResponse
    start_date: date
    end_date: date
    totals: dict[str, int]
    adherence_rate: int
    instances: list[DoseInstanceResponse]
