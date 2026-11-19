from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    LargeBinary,
    String,
    Float,
    false,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Officer(Base):
    __tablename__ = "officers"
    officer_id: Mapped[str] = mapped_column(String(20), primary_key=True)  # OFF-1042
    name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20), default="field_officer")
    zone: Mapped[str] = mapped_column(String(80), default="")
    language: Mapped[str] = mapped_column(String(5), default="en", server_default="en")
    password_hash: Mapped[str] = mapped_column(String(100))
    is_disabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    __table_args__ = (
        Index("ix_login_attempts_officer_window", "officer_id", "succeeded", "rate_limited", "created_at"),
        Index("ix_login_attempts_ip_window", "ip", "succeeded", "rate_limited", "created_at"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    officer_id: Mapped[str] = mapped_column(String(80))
    ip: Mapped[str] = mapped_column(String(45))
    succeeded: Mapped[bool] = mapped_column(Boolean)
    rate_limited: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    __table_args__ = (Index("ix_refresh_tokens_officer_revoked", "officer_id", "revoked_at"),)
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    officer_id: Mapped[str] = mapped_column(ForeignKey("officers.officer_id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (Index("ix_audit_log_who_at", "who", "at"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    who: Mapped[str] = mapped_column(String(160))
    action: Mapped[str] = mapped_column(String(80))
    object_id: Mapped[str] = mapped_column("object", String(160))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    ip: Mapped[str] = mapped_column(String(45))


class Evidence(Base):  # mirrors EvidenceRecord in src/types/index.ts
    __tablename__ = "evidence"
    __table_args__ = (
        Index("ix_evidence_officer_id_captured_at", "officer_id", "captured_at"),
        Index("ix_evidence_case_id", "case_id"),
        Index("ix_evidence_zone_captured_at", "zone", "captured_at"),
        Index("ix_evidence_zone_released", "zone", "released"),
    )
    id: Mapped[str] = mapped_column(String(20), primary_key=True)  # NT-2026-00142 (generated on device)
    case_id: Mapped[str] = mapped_column(String(40))
    officer_id: Mapped[str] = mapped_column(ForeignKey("officers.officer_id"))
    zone: Mapped[str] = mapped_column(String(80), default="", server_default="")
    released: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    test_kit_id: Mapped[str] = mapped_column(String(30))
    sample_type: Mapped[str] = mapped_column(String(100))
    verdict: Mapped[str] = mapped_column(String(15))  # positive|negative|inconclusive
    substance: Mapped[str] = mapped_column(String(80))
    confidence: Mapped[float] = mapped_column(Float)
    reaction_color: Mapped[str] = mapped_column(String(40))
    model_version: Mapped[str] = mapped_column(String(80))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    location: Mapped[str] = mapped_column(String(120), default="")
    temperature_c: Mapped[float] = mapped_column(Float, nullable=True)
    lighting_lux: Mapped[float] = mapped_column(Float, nullable=True)
    device_id: Mapped[str] = mapped_column(String(40))
    image_sha256: Mapped[str] = mapped_column(String(64))  # hash of the ORIGINAL photo bytes, made on device
    image_stored_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    image_enc: Mapped[bytes] = mapped_column(LargeBinary)  # AES-GCM encrypted stored photo bytes
    extra: Mapped[dict] = mapped_column(JSON, default=dict)  # inconclusive reasons etc.
    custody: Mapped[list["CustodyEvent"]] = relationship(order_by="CustodyEvent.seq", back_populates="evidence")


class CustodyEvent(Base):
    __tablename__ = "custody_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    evidence_id: Mapped[str] = mapped_column(ForeignKey("evidence.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    payload: Mapped[dict] = mapped_column(JSON)  # label, timestamp, actor, location, gpsVerified
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64))
    evidence: Mapped[Evidence] = relationship(back_populates="custody")
