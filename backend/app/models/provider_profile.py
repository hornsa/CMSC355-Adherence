from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.database import Base


class ProviderProfile(Base):
    __tablename__ = "provider_profiles"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    organization_name = Column(String(255), nullable=False)
    license_number = Column(String(100), nullable=False)
    specialty = Column(String(100), nullable=True)
    work_email = Column(String(255), nullable=False)
    verification_status = Column(String(20), nullable=False, default="pending")
    verified_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", foreign_keys=[user_id], back_populates="provider_profile")
    verified_by = relationship("User", foreign_keys=[verified_by_user_id])
