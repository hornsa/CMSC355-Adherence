import logging
import os
import smtplib
from dataclasses import dataclass
from datetime import datetime
from email.message import EmailMessage

logger = logging.getLogger(__name__)


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class SmtpSettings:
    host: str
    port: int
    username: str | None
    password: str | None
    from_email: str
    use_tls: bool
    use_ssl: bool


def get_smtp_settings() -> SmtpSettings | None:
    host = os.getenv("SMTP_HOST")
    from_email = os.getenv("SMTP_FROM_EMAIL")
    if not host or not from_email:
        return None

    return SmtpSettings(
        host=host,
        port=int(os.getenv("SMTP_PORT", "587")),
        username=os.getenv("SMTP_USERNAME"),
        password=os.getenv("SMTP_PASSWORD"),
        from_email=from_email,
        use_tls=_env_flag("SMTP_USE_TLS", default=True),
        use_ssl=_env_flag("SMTP_USE_SSL", default=False),
    )


def email_notifications_enabled() -> bool:
    return get_smtp_settings() is not None


def send_missed_dose_email(
    *,
    user_email: str,
    user_name: str,
    medication_name: str,
    medication_dosage: str,
    due_at: datetime,
) -> None:
    settings = get_smtp_settings()
    if settings is None:
        raise RuntimeError("SMTP settings are not configured")

    message = EmailMessage()
    message["Subject"] = f"Medication reminder: {medication_name}"
    message["From"] = settings.from_email
    message["To"] = user_email
    message.set_content(
        "\n".join(
            [
                f"Hi {user_name},",
                "",
                "This is a reminder that a scheduled medication dose is still unconfirmed.",
                f"Medication: {medication_name}",
                f"Dosage: {medication_dosage}",
                f"Scheduled time: {due_at.strftime('%Y-%m-%d %I:%M %p %Z')}",
                "",
                "If you already took it, you can return to the app and confirm the dose.",
            ]
        )
    )

    smtp_class = smtplib.SMTP_SSL if settings.use_ssl else smtplib.SMTP
    with smtp_class(settings.host, settings.port, timeout=30) as smtp:
        if not settings.use_ssl and settings.use_tls:
            smtp.starttls()
        if settings.username:
            smtp.login(settings.username, settings.password or "")
        smtp.send_message(message)

    logger.info("Sent missed dose reminder email to %s", user_email)
