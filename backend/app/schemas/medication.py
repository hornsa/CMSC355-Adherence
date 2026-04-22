from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

FrequencyUnit = Literal["daily", "weekly", "monthly"]


class MedicationBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    dosage: str = Field(min_length=1, max_length=120)
    frequency_count: int = Field(ge=1, le=12)
    frequency_unit: FrequencyUnit
    instructions: str | None = Field(default=None, max_length=500)

    @field_validator("name", "dosage", "instructions")
    @classmethod
    def strip_text(cls, value: str | None):
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("name", "dosage")
    @classmethod
    def require_text(cls, value: str | None):
        if not value:
            raise ValueError("This field is required")
        return value

    @model_validator(mode="after")
    def validate_frequency_count(self):
        if self.frequency_unit == "daily" and self.frequency_count > 6:
            raise ValueError("Daily medications can have at most 6 time slots")
        if self.frequency_unit == "weekly" and self.frequency_count > 7:
            raise ValueError("Weekly medications can have at most 7 time slots")
        return self


class MedicationCreate(MedicationBase):
    pass


class MedicationUpdate(MedicationBase):
    pass


class MedicationResponse(MedicationBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    frequency: str
