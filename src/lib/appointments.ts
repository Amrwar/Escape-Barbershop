/**
 * How an appointment's state is shown. Safe to import from the browser, and
 * shared by the shop screens and (later) the customer app.
 */

/** Translation key for a status, so every screen words it the same way. */
export function appointmentStatusKey(status: string) {
  switch (status) {
    case "PENDING":
      return "appointments.statusPending";
    case "CHECKED_IN":
      return "appointments.statusCheckedIn";
    case "IN_PROGRESS":
      return "appointments.statusInProgress";
    case "COMPLETED":
      return "appointments.statusCompleted";
    case "CANCELLED":
      return "appointments.statusCancelled";
    case "NO_SHOW":
      return "appointments.statusNoShow";
    default:
      return "appointments.statusConfirmed";
  }
}

export const APPOINTMENT_BADGE: Record<string, "green" | "blue" | "yellow" | "gray" | "red" | "purple" | "ink"> = {
  PENDING: "yellow",
  CONFIRMED: "blue",
  CHECKED_IN: "purple",
  IN_PROGRESS: "ink",
  COMPLETED: "green",
  CANCELLED: "gray",
  NO_SHOW: "red",
};

/** Statuses a booking can still be moved or checked in from. */
export function isOpenAppointment(status: string): boolean {
  return ["PENDING", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"].includes(status);
}
