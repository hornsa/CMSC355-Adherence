from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Time, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.database import Base


class DoseConfirmation(Base):
    __tablename__ = "dose_confirmations"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "schedule_id",
            "scheduled_date",
            "time_of_day",
            name="uq_dose_confirmation_slot",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    medication_id = Column(Integer, ForeignKey("medications.id"), nullable=False, index=True)
    schedule_id = Column(Integer, ForeignKey("medication_schedules.id"), nullable=False, index=True)
    scheduled_date = Column(Date, nullable=False, index=True)
    time_of_day = Column(Time, nullable=False)
    confirmed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="dose_confirmations")
    medication = relationship("Medication", back_populates="dose_confirmations")
    schedule = relationship("MedicationSchedule", back_populates="dose_confirmations")
