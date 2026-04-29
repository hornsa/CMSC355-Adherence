from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict


class DoseConfirmationCreate(BaseModel):
    medication_id: int
    schedule_id: int
    scheduled_date: date
    time_of_day: time


class DoseConfirmationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    medication_id: int
    schedule_id: int
    scheduled_date: date
    time_of_day: time
    confirmed_at: datetime
