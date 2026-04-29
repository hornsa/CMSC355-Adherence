from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ScheduleSlotInput(BaseModel):
    start_date: date
    time_of_day: time


class ScheduleSlotResponse(BaseModel):
    schedule_id: int
    start_date: date
    time_of_day: time


class ScheduleBase(BaseModel):
    medication_id: int
    end_date: date | None = None
    notes: str | None = Field(default=None, max_length=500)
    slots: list[ScheduleSlotInput] = Field(min_length=1, max_length=12)

    @field_validator("notes")
    @classmethod
    def validate_notes(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @model_validator(mode="after")
    def validate_slot_duplicates(self):
        seen = set()
        for slot in self.slots:
            key = (slot.start_date, slot.time_of_day)
            if key in seen:
                raise ValueError("Each schedule slot must have a unique date and time")
            seen.add(key)
        return self


class ScheduleCreate(ScheduleBase):
    pass


class ScheduleUpdate(ScheduleBase):
    pass


class ScheduleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    schedule_group_id: str
    user_id: int
    medication_id: int
    medication_name: str
    medication_dosage: str
    frequency_count: int
    frequency_unit: str
    end_date: date | None
    notes: str | None
    slots: list[ScheduleSlotResponse]


class DoseInstanceResponse(BaseModel):
    medication_id: int
    medication_name: str
    medication_dosage: str
    schedule_id: int
    schedule_group_id: str
    scheduled_date: date
    time_of_day: time
    due_at: datetime
    notes: str | None
    status: str = "scheduled"
    confirmation_id: int | None = None
    confirmed_at: datetime | None = None
    can_confirm: bool = False
