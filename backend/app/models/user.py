from sqlalchemy import Boolean, Column, DateTime, Integer, String, func
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="patient")
    notifications_enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    medications = relationship("Medication", back_populates="user", cascade="all, delete-orphan")
    schedules = relationship("MedicationSchedule", back_populates="user", cascade="all, delete-orphan")
    dose_confirmations = relationship("DoseConfirmation", back_populates="user", cascade="all, delete-orphan")
    dose_reminders = relationship("DoseReminder", back_populates="user", cascade="all, delete-orphan")
    medication_requests = relationship(
        "MedicationRequest",
        back_populates="patient",
        foreign_keys="MedicationRequest.patient_user_id",
        cascade="all, delete-orphan",
    )
    provider_profile = relationship("ProviderProfile", back_populates="user", uselist=False, foreign_keys="ProviderProfile.user_id")
    provider_assignments = relationship(
        "PatientProviderAssignment",
        back_populates="patient",
        foreign_keys="PatientProviderAssignment.patient_user_id",
        cascade="all, delete-orphan",
    )
    patient_assignments = relationship(
        "PatientProviderAssignment",
        back_populates="provider",
        foreign_keys="PatientProviderAssignment.provider_user_id",
        cascade="all, delete-orphan",
    )
