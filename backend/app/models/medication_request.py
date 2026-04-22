from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.database import Base


class MedicationRequest(Base):
    __tablename__ = "medication_requests"

    id = Column(Integer, primary_key=True, index=True)
    patient_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    provider_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    medication_name = Column(String(120), nullable=False)
    dosage = Column(String(120), nullable=False)
    frequency_count = Column(Integer, nullable=False, default=1)
    frequency_unit = Column(String(20), nullable=False, default="daily")
    instructions = Column(Text, nullable=True)
    request_notes = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="pending")
    resolution_note = Column(Text, nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    patient = relationship("User", foreign_keys=[patient_user_id], back_populates="medication_requests")
    provider = relationship("User", foreign_keys=[provider_user_id])
