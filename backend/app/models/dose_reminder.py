from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Time, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.database import Base


class DoseReminder(Base):
    __tablename__ = "dose_reminders"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "schedule_id",
            "scheduled_date",
            "time_of_day",
            "channel",
            name="uq_dose_reminder_slot_channel",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    medication_id = Column(Integer, ForeignKey("medications.id"), nullable=False, index=True)
    schedule_id = Column(Integer, ForeignKey("medication_schedules.id"), nullable=False, index=True)
    scheduled_date = Column(Date, nullable=False, index=True)
    time_of_day = Column(Time, nullable=False)
    channel = Column(String(32), nullable=False, default="email")
    sent_at = Column(DateTime(timezone=True), nullable=True)
    last_attempt_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="dose_reminders")
    medication = relationship("Medication", back_populates="dose_reminders")
    schedule = relationship("MedicationSchedule", back_populates="dose_reminders")
