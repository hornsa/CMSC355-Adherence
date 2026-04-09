from datetime import datetime

class ReminderManager:
    def __init__(self):
        pass

    def get_due_reminders(self, medications):
        current_time = datetime.now().strftime("%H:%M")
        due_medications = []

        for medication in medications:
            if medication["time"] == current_time:
                due_medications.append(medication)

        return due_medications