import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'

const db=new PGlite()
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
  CREATE TABLE clients(id uuid PRIMARY KEY,context_id text);
  CREATE TABLE bots(id uuid PRIMARY KEY,client_id uuid REFERENCES clients(id));
  CREATE TABLE booking_services(id uuid PRIMARY KEY,client_id uuid REFERENCES clients(id),is_active boolean);
  CREATE TABLE feature_bookings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,service_id uuid,status text,slot_start timestamptz,slot_end timestamptz,quantity integer);
  CREATE TABLE booking_table_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,service_id uuid,table_id text,occupied_start timestamptz,occupied_end timestamptz,released_at timestamptz);
  CREATE TABLE sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,bot_id uuid,session_id text UNIQUE,last_message_at timestamptz,mode text);
  CREATE TABLE messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),context_id text,session_id text,bot_id uuid,channel text,role text,content text,mode text DEFAULT 'ai',source_url text,media_url text,media_type text,message_type text,metadata jsonb DEFAULT '{}'::jsonb,created_at timestamptz DEFAULT now());`)
 await db.exec(await readFile(new URL('../supabase/098_booking_range_occupancy.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../supabase/099_atomic_flow_turn_persistence.sql',import.meta.url),'utf8'))
 const client='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222',bot='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',service='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
 await db.query('INSERT INTO clients VALUES($1,$2),($3,$4)',[client,'ctx-1',foreign,'ctx-2'])
 await db.query('INSERT INTO bots VALUES($1,$2)',[bot,client])
 await db.query('INSERT INTO booking_services VALUES($1,$2,true)',[service,client])
 await db.query(`INSERT INTO feature_bookings(client_id,service_id,status,slot_start,slot_end,quantity) VALUES($1,$2,'confirmed','2030-01-01T10:00:00Z','2030-01-01T11:00:00Z',3),($3,$2,'confirmed','2030-01-01T10:00:00Z','2030-01-01T11:00:00Z',99)`,[client,service,foreign])
 await db.query(`INSERT INTO booking_table_assignments(client_id,service_id,table_id,occupied_start,occupied_end) VALUES($1,$2,'T1','2030-01-01T10:00:00Z','2030-01-01T11:00:00Z'),($3,$2,'FOREIGN','2030-01-01T10:00:00Z','2030-01-01T11:00:00Z')`,[client,service,foreign])
 const occupancy=(await db.query(`SELECT get_booking_range_occupancy($1,$2,'2030-01-01','2030-01-04') result`,[client,service])).rows[0].result
 assert.equal(occupancy.bookings.length,1);assert.equal(occupancy.bookings[0].quantity,3)
 assert.equal(occupancy.table_assignments.length,1);assert.equal(occupancy.table_assignments[0].table_id,'T1')
 await assert.rejects(()=>db.query(`SELECT get_booking_range_occupancy($1,$2,'2030-01-01','2030-01-20')`,[client,service]),/INVALID_OCCUPANCY_WINDOW/)

 await db.query(`INSERT INTO sessions(client_id,bot_id,session_id,mode) VALUES($1,$2,'session-123','human')`,[client,bot])
 await db.query(`INSERT INTO messages(context_id,session_id,bot_id,channel,role,content,message_type,metadata) VALUES('ctx-1','session-123',$1,'website','assistant','Old card','branch_picker',$2)`,[bot,JSON.stringify({flowId:'booking-one',stepId:'branch-one',payload:{title:'Choose'}})])
 const rows=[{role:'assistant',channel:'website',content:'Calendar',message_type:'slot_picker',metadata:{flowId:'booking-one',stepId:'slot-one',payload:{slots:[{value:'2030-01-01T10:00:00Z'}]}}},{role:'assistant',channel:'website',content:'Offer',message_type:'offer_card',metadata:{flowId:'booking-one',stepId:'offer-one'}}]
 const inserted=(await db.query('SELECT persist_flow_turn_atomic($1,$2,$3,$4,$5,$6,$7,$8) result',[client,'ctx-1',bot,'session-123','booking-one','branch-one',JSON.stringify({locked:true,selectedValue:'main'}),JSON.stringify(rows)])).rows[0].result
 assert.equal(inserted.length,2)
 const old=(await db.query("SELECT metadata FROM messages WHERE content='Old card'")).rows[0].metadata
 assert.equal(old.locked,true);assert.equal(old.selectedValue,'main')
 assert.equal((await db.query("SELECT mode FROM sessions WHERE session_id='session-123'")).rows[0].mode,'human','persistence must never reset handoff mode')
 await assert.rejects(()=>db.query('SELECT persist_flow_turn_atomic($1,$2,$3,$4,$5,$6,$7,$8)',[client,'ctx-2',bot,'session-123',null,null,null,JSON.stringify(rows)]),/FLOW_CONTEXT_SCOPE_MISMATCH/)
 await db.exec('SET ROLE anon')
 await assert.rejects(()=>db.query(`SELECT get_booking_range_occupancy($1,$2,'2030-01-01','2030-01-04')`,[client,service]),/permission denied/)
 await assert.rejects(()=>db.query('SELECT persist_flow_turn_atomic($1,$2,$3,$4,$5,$6,$7,$8)',[client,'ctx-1',bot,'session-123',null,null,null,JSON.stringify(rows)]),/permission denied/)
 console.log('PASS: range occupancy tenant scope/window bound and atomic multi-card persistence/locking/handoff/role boundaries')
}finally{await db.close()}
