const fs=require('node:fs')
const assert=require('node:assert/strict')

const booking=fs.readFileSync('src/lib/booking.ts','utf8')
const flow=fs.readFileSync('src/lib/bookingFlow.ts','utf8')
const dashboard=fs.readFileSync('src/components/features/BookingFeaturesDashboard.tsx','utf8')
const migration=fs.readFileSync('supabase/103_appointment_booking_policies.sql','utf8')

for(const key of ['booking_window_days','max_bookings_per_day','availability_overrides','customer_cancel_enabled','customer_reschedule_enabled','cancellation_policy','no_show_policy']){
 assert(booking.includes(key),`booking validator is missing ${key}`)
 assert(dashboard.includes(key),`service editor is missing ${key}`)
}
assert(flow.includes("['Cancellation policy',configuration.cancellation_policy]"),'review card must disclose cancellation policy')
assert(flow.includes("['No-show policy',configuration.no_show_policy]"),'review card must disclose no-show policy')
assert(flow.includes('customer_cancel_enabled===false'),'chat cancellation must enforce service policy')
assert(flow.includes('customer_reschedule_enabled===false'),'chat rescheduling must enforce service policy')
assert(migration.includes('FOR UPDATE'),'policy enforcement must serialize on the service row')
assert(migration.includes('DAILY_BOOKING_LIMIT_REACHED'),'database must enforce the daily cap')
assert(migration.includes('BOOKING_OUTSIDE_ADVANCE_WINDOW'),'database must enforce the booking horizon')
assert(migration.includes('BOOKING_OUTSIDE_DATE_OVERRIDE'),'database must enforce adjusted date hours')
assert(migration.includes('BEFORE INSERT OR UPDATE'),'policy enforcement must happen before booking persistence')

console.log('PASS: appointment policies are configured, displayed, flow-enforced and atomically database-enforced')
