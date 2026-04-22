from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.database import Base


class PatientProviderAssignment(Base):
    __tablename__ = "patient_provider_assignments"
    __table_args__ = (
        UniqueConstraint("patient_user_id", "provider_user_id", name="uq_patient_provider_assignment"),
    )

    id = Column(Integer, primary_key=True, index=True)
    patient_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    provider_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="active")
    assigned_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    patient = relationship("User", foreign_keys=[patient_user_id], back_populates="provider_assignments")
    provider = relationship("User", foreign_keys=[provider_user_id], back_populates="patient_assignments")
    assigned_by = relationship("User", foreign_keys=[assigned_by_user_id])
