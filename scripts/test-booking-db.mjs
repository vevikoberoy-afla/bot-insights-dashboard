// Usage: BOOKING_TEST_ENGINE=/path/to/node_modules/@electric-sql/pglite node scripts/test-booking-db.mjs
// This runs only in an isolated in-memory PostgreSQL instance, never the hosted database.
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.env.BOOKING_TEST_ENGINE + '/dist/index.js').href)
const db = new PGlite()
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid'; CREATE TABLE clients(id uuid PRIMARY KEY);`)
const bookingMigration=await readFile(new URL('../supabase/051_booking_features.sql',import.meta.url),'utf8')
await db.exec(bookingMigration);await db.exec(bookingMigration)
const client='00000000-0000-0000-0000-000000000001', stranger='00000000-0000-0000-0000-000000000002'
await db.query('INSERT INTO clients VALUES ($1),($2)',[client,stranger])
const hours=Object.fromEntries(Array.from({length:7},(_,i)=>[i,[['00:00','23:59']]]))
const service=(await db.query(`INSERT INTO booking_services(client_id,name,is_active,notice_hours,cancellation_hours,working_hours,timezone,confirmation_email) VALUES($1,'Demo',true,0,0,$2,'UTC',true) RETURNING id`,[client,JSON.stringify(hours)])).rows[0].id
const offer=(await db.query(`INSERT INTO booking_offers(client_id,name,quantity,max_per_customer,start_at,end_at,status) VALUES($1,'Lunch',2,1,now()-interval '1 day',now()+interval '5 days','active') RETURNING id`,[client])).rows[0].id
const reserve=async(data)=> (await db.query('SELECT reserve_feature_booking($1,$2) AS result',[client,JSON.stringify({customer_name:'Test',customer_email:'test@example.com',quantity:1,...data})])).rows[0].result
const start=new Date(Date.now()+86400000);start.setUTCHours(10,0,0,0)
const first=await reserve({service_id:service,slot_start:start.toISOString(),idempotency_key:'first'})
assert.equal(first.status,'confirmed')
assert.equal((await reserve({service_id:service,slot_start:start.toISOString(),idempotency_key:'first'})).id,first.id,'retry must return same booking')
await assert.rejects(reserve({service_id:service,slot_start:start.toISOString(),idempotency_key:'other'}),/full/)
await assert.rejects(db.query('SELECT reserve_feature_booking($1,$2)',[stranger,JSON.stringify({service_id:service,slot_start:start.toISOString(),idempotency_key:'tenant',customer_name:'Test',customer_email:'test@example.com',quantity:1})]),/not active/)
const newStart=new Date(start.getTime()+3600000).toISOString()
const moved=(await db.query('SELECT change_feature_booking($1,$2,$3,$4) AS b',[client,first.id,'confirmed',newStart])).rows[0].b
assert.equal(moved.reference,first.reference)
assert.equal(new Date(moved.slot_start).toISOString(),newStart)
await reserve({service_id:service,slot_start:start.toISOString(),idempotency_key:'released'})
await db.query('SELECT change_feature_booking($1,$2,$3)',[client,first.id,'cancelled'])
await reserve({service_id:service,slot_start:newStart,idempotency_key:'cancelled-released'})
const a=await reserve({offer_id:offer,idempotency_key:'offer-a'})
await assert.rejects(reserve({offer_id:offer,idempotency_key:'offer-duplicate'}),/limit/)
await reserve({offer_id:offer,idempotency_key:'offer-b',customer_email:'second@example.com'})
await assert.rejects(reserve({offer_id:offer,idempotency_key:'offer-c',customer_email:'third@example.com'}),/exhausted/)
const wait=await reserve({offer_id:offer,idempotency_key:'offer-wait',customer_email:'third@example.com',waitlist:true})
assert.equal(wait.status,'waitlisted')
await db.query('SELECT change_feature_booking($1,$2,$3)',[client,a.id,'cancelled'])
assert.equal((await reserve({offer_id:offer,idempotency_key:'offer-d',customer_email:'fourth@example.com'})).status,'confirmed')
assert.equal(Number((await db.query("SELECT sum(quantity) AS n FROM feature_bookings WHERE offer_id=$1 AND status='confirmed'",[offer])).rows[0].n),2)
await assert.rejects(db.query('UPDATE booking_offers SET quantity=1 WHERE id=$1',[offer]),/Stock cannot/)
await db.query('UPDATE booking_offers SET displayed_claimed_override=200 WHERE id=$1',[offer])
const stats=(await db.query('SELECT claimed,remaining FROM booking_offer_stats WHERE id=$1',[offer])).rows[0]
assert.equal(stats.claimed,2);assert.equal(stats.remaining,0)
await assert.rejects(reserve({service_id:service,slot_start:'2020-01-01T10:00:00Z',idempotency_key:'past'}),/too soon/)
await db.query('UPDATE booking_services SET blackout_dates=$1 WHERE id=$2',[JSON.stringify([start.toISOString().slice(0,10)]),service])
await assert.rejects(reserve({service_id:service,slot_start:new Date(start.getTime()+7200000).toISOString(),idempotency_key:'blackout'}),/outside working/)
assert.ok((await db.query("SELECT count(*) AS n FROM booking_events WHERE action='booking_offers_update'")).rows[0].n>0)
console.log('PASS: rerunnable migration, booking, retry, tenant boundary, slot capacity, reschedule, cancellation, customer limit, stock, waitlist, released stock')
await db.close()
