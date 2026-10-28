# Appointment booking industry upgrade

## Research baseline

The implementation was compared with current official guidance from:

- Google Calendar appointment schedules: https://support.google.com/calendar/answer/10729749
- Google availability controls: https://support.google.com/calendar/answer/11423292
- Square Appointments capabilities: https://squareup.com/us/en/appointments
- Square appointment waitlists: https://squareup.com/help/us/en/article/7923/waitlist-with-square-appointments
- Square cancellation and prepayment policies: https://squareup.com/help/us/en/article/5493/manage-booking-cancellations-and-prepayment-policies

The product already supported service duration, weekly hours, timezone-aware slots, minimum notice, buffers, concurrent capacity, restaurant tables, locations, staff preference, intake questions, add-ons, discounts, payments, reminders, cancellation, rescheduling, calendar adapters, customer profiles, notes and receipts.

## Added launch-level controls

Each service now supports:

- maximum advance booking window from 1–730 days;
- maximum confirmed reservations per local service day, with zero meaning unlimited;
- date-specific closures or reduced operating hours;
- independent customer self-service cancellation and rescheduling switches;
- customer-visible cancellation and no-show policies.

The dashboard exposes these controls in the service Scheduling and Messaging tabs. The chatbot restricts the calendar range, removes closed dates, calculates slots from adjusted hours, hides disabled management actions, and includes policy terms in both review and confirmation cards.

## Enforcement and concurrency

`supabase/103_appointment_booking_policies.sql` installs a `BEFORE INSERT OR UPDATE` trigger on `feature_bookings`. The trigger locks the scoped service row and enforces the booking horizon, local-day cap, closures and adjusted hours inside the booking transaction. It covers dashboard bookings, chatbot bookings, reschedules and restaurant reservations without adding another request to the chatbot hot path.

Application-side slot generation applies the same rules early for responsive UI. Database enforcement remains authoritative and prevents races between simultaneous customers.

## Existing complementary capabilities

- Atomic capacity and idempotency prevent overselling and duplicate confirmation.
- Reminders and confirmations use the booking notification queue.
- Cancellation deadlines are enforced by the booking mutation RPC.
- Payments, deposits, offers and coupons remain handled by the existing payment/promotion flow.
- External calendars are checked before slots are presented and updated after confirmation.

## Deployment

Apply migrations through `103_appointment_booking_policies.sql`, then refresh the Supabase schema cache. Existing services default to a 90-day booking window, unlimited daily bookings, enabled customer cancel/reschedule, and no special-date overrides.
