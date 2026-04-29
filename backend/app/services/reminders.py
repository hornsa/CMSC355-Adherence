import logging
import os
import threading
from datetime import datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload

from app.database import SessionLocal
from app.models.dose_confirmation import DoseConfirmation
from app.models.dose_reminder import DoseReminder
from app.models.schedule import MedicationSchedule
from app.routes.schedules import get_dose_confirmation_key, iter_schedule_dates
from app.services.email import email_notifications_enabled, send_missed_dose_email

logger = logging.getLogger(__name__)

REMINDER_CHANNEL_EMAIL = "email"
MISSED_DOSE_REMINDER_DELAY_MINUTES = int(os.getenv("MISSED_DOSE_REMINDER_DELAY_MINUTES", "5"))
REMINDER_CHECK_INTERVAL_SECONDS = int(os.getenv("REMINDER_CHECK_INTERVAL_SECONDS", "60"))
REMINDER_LOOKBACK_DAYS = int(os.getenv("REMINDER_LOOKBACK_DAYS", "1"))

_worker_thread: threading.Thread | None = None
_stop_event = threading.Event()
_smtp_warning_logged = False


def _reminder_key(schedule_id: int, scheduled_date, time_of_day) -> tuple[int, object, str]:
    return (schedule_id, scheduled_date, time_of_day.isoformat())


def _build_due_candidates(db, now: datetime) -> list[dict]:
    window_start = (now - timedelta(days=REMINDER_LOOKBACK_DAYS)).date()
    window_end = now.date()
    reminder_threshold = now - timedelta(minutes=MISSED_DOSE_REMINDER_DELAY_MINUTES)

    schedules = (
        db.query(MedicationSchedule)
        .options(
            joinedload(MedicationSchedule.user),
            joinedload(MedicationSchedule.medication),
        )
        .filter(MedicationSchedule.start_date <= window_end)
        .all()
    )
    active_schedules = [schedule for schedule in schedules if schedule.end_date is None or schedule.end_date >= window_start]

    confirmations = (
        db.query(DoseConfirmation)
        .filter(
            DoseConfirmation.scheduled_date >= window_start,
            DoseConfirmation.scheduled_date <= window_end,
        )
        .all()
    )
    confirmed_keys = {
        get_dose_confirmation_key(confirmation.schedule_id, confirmation.scheduled_date, confirmation.time_of_day)
        for confirmation in confirmations
    }

    reminders = (
        db.query(DoseReminder)
        .filter(
            DoseReminder.channel == REMINDER_CHANNEL_EMAIL,
            DoseReminder.scheduled_date >= window_start,
            DoseReminder.scheduled_date <= window_end,
        )
        .all()
    )
    reminder_map = {
        _reminder_key(reminder.schedule_id, reminder.scheduled_date, reminder.time_of_day): reminder for reminder in reminders
    }

    candidates: list[dict] = []
    for schedule in active_schedules:
        if schedule.user is None or schedule.medication is None or not schedule.user.notifications_enabled:
            continue

        for scheduled_date in iter_schedule_dates(schedule, window_start, window_end, schedule.medication.frequency_unit):
            due_at = datetime.combine(scheduled_date, schedule.time_of_day).astimezone()
            if due_at > reminder_threshold:
                continue

            confirmation_key = get_dose_confirmation_key(schedule.id, scheduled_date, schedule.time_of_day)
            if confirmation_key in confirmed_keys:
                continue

            reminder_key = _reminder_key(schedule.id, scheduled_date, schedule.time_of_day)
            reminder = reminder_map.get(reminder_key)
            if reminder and reminder.sent_at is not None:
                continue

            candidates.append(
                {
                    "user_id": schedule.user_id,
                    "user_name": schedule.user.name,
                    "user_email": schedule.user.email,
                    "medication_id": schedule.medication_id,
                    "medication_name": schedule.medication.name,
                    "medication_dosage": schedule.medication.dosage,
                    "schedule_id": schedule.id,
                    "scheduled_date": scheduled_date,
                    "time_of_day": schedule.time_of_day,
                    "due_at": due_at,
                }
            )

    return candidates


def _get_or_create_reminder(db, candidate: dict) -> DoseReminder:
    reminder = (
        db.query(DoseReminder)
        .filter(
            DoseReminder.user_id == candidate["user_id"],
            DoseReminder.schedule_id == candidate["schedule_id"],
            DoseReminder.scheduled_date == candidate["scheduled_date"],
            DoseReminder.time_of_day == candidate["time_of_day"],
            DoseReminder.channel == REMINDER_CHANNEL_EMAIL,
        )
        .first()
    )
    if reminder:
        return reminder

    reminder = DoseReminder(
        user_id=candidate["user_id"],
        medication_id=candidate["medication_id"],
        schedule_id=candidate["schedule_id"],
        scheduled_date=candidate["scheduled_date"],
        time_of_day=candidate["time_of_day"],
        channel=REMINDER_CHANNEL_EMAIL,
    )
    db.add(reminder)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        reminder = (
            db.query(DoseReminder)
            .filter(
                DoseReminder.user_id == candidate["user_id"],
                DoseReminder.schedule_id == candidate["schedule_id"],
                DoseReminder.scheduled_date == candidate["scheduled_date"],
                DoseReminder.time_of_day == candidate["time_of_day"],
                DoseReminder.channel == REMINDER_CHANNEL_EMAIL,
            )
            .first()
        )
        if reminder is None:
            raise
    else:
        db.refresh(reminder)

    return reminder


def _dose_is_confirmed(db, candidate: dict) -> bool:
    return (
        db.query(DoseConfirmation.id)
        .filter(
            DoseConfirmation.user_id == candidate["user_id"],
            DoseConfirmation.schedule_id == candidate["schedule_id"],
            DoseConfirmation.scheduled_date == candidate["scheduled_date"],
            DoseConfirmation.time_of_day == candidate["time_of_day"],
        )
        .first()
        is not None
    )


def process_missed_dose_reminders() -> None:
    global _smtp_warning_logged

    if not email_notifications_enabled():
        if not _smtp_warning_logged:
            logger.warning("Missed dose reminder worker is enabled, but SMTP settings are incomplete.")
            _smtp_warning_logged = True
        return

    now = datetime.now().astimezone()
    db = SessionLocal()
    try:
        candidates = _build_due_candidates(db, now)
        for candidate in candidates:
            reminder = _get_or_create_reminder(db, candidate)
            if reminder.sent_at is not None:
                continue
            if _dose_is_confirmed(db, candidate):
                continue

            reminder.last_attempt_at = now
            db.add(reminder)
            db.commit()

            try:
                send_missed_dose_email(
                    user_email=candidate["user_email"],
                    user_name=candidate["user_name"],
                    medication_name=candidate["medication_name"],
                    medication_dosage=candidate["medication_dosage"],
                    due_at=candidate["due_at"],
                )
            except Exception as exc:
                db.refresh(reminder)
                reminder.error_message = str(exc)[:500]
                db.add(reminder)
                db.commit()
                logger.exception(
                    "Failed to send missed dose reminder for user_id=%s schedule_id=%s",
                    candidate["user_id"],
                    candidate["schedule_id"],
                )
                continue

            db.refresh(reminder)
            reminder.sent_at = datetime.now().astimezone()
            reminder.error_message = None
            db.add(reminder)
            db.commit()
    finally:
        db.close()


def _worker_loop() -> None:
    while not _stop_event.is_set():
        try:
            process_missed_dose_reminders()
        except Exception:
            logger.exception("Missed dose reminder worker crashed during a processing pass.")
        _stop_event.wait(REMINDER_CHECK_INTERVAL_SECONDS)


def start_reminder_worker() -> None:
    global _worker_thread

    if _worker_thread and _worker_thread.is_alive():
        return

    _stop_event.clear()
    _worker_thread = threading.Thread(target=_worker_loop, name="missed-dose-reminder-worker", daemon=True)
    _worker_thread.start()


def stop_reminder_worker() -> None:
    _stop_event.set()
    if _worker_thread and _worker_thread.is_alive():
        _worker_thread.join(timeout=5)
