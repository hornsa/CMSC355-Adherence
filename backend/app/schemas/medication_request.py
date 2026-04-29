from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.medication import FrequencyUnit


class MedicationRequestCreate(BaseModel):
    medication_name: str = Field(min_length=1, max_length=120)
    dosage: str = Field(min_length=1, max_length=120)
    frequency_count: int = Field(ge=1, le=12)
    frequency_unit: FrequencyUnit
    instructions: str | None = Field(default=None, max_length=500)
    request_notes: str | None = Field(default=None, max_length=500)

    @field_validator("medication_name", "dosage", "instructions", "request_notes")
    @classmethod
    def strip_text(cls, value: str | None):
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class MedicationRequestReview(BaseModel):
    resolution_note: str | None = Field(default=None, max_length=500)

    @field_validator("resolution_note")
    @classmethod
    def strip_text(cls, value: str | None):
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class MedicationRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_user_id: int
    provider_user_id: int | None
    medication_name: str
    dosage: str
    frequency_count: int
    frequency_unit: FrequencyUnit
    instructions: str | None
    request_notes: str | None
    status: str
    resolution_note: str | None
    resolved_at: datetime | None
    created_at: datetime
