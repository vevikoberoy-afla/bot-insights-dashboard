const {PGlite}=require('@electric-sql/pglite')
const fs=require('node:fs')
const assert=require('node:assert/strict')
const {randomUUID}=require('node:crypto')

const db=new PGlite()
const query=async(sql,args=[])=>(await db.query(sql,args)).rows

async function main(){
 const workspace=randomUUID(),outsiderWorkspace=randomUUID(),owner=randomUUID(),agent=randomUUID(),outsider=randomUUID(),ticket=randomUUID(),booking=randomUUID(),order=randomUUID(),session=randomUUID(),message=randomUUID()
 await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  CREATE TABLE clients(id uuid PRIMARY KEY);
  CREATE TABLE workspace_memberships(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,user_id uuid,role_key text,status text,permissions jsonb);
  CREATE TABLE tickets(id uuid PRIMARY KEY,client_id uuid,ticket_number text,subject text,priority text,status text,assignee_id uuid,sla_breached_at timestamptz);
  CREATE TABLE feature_bookings(id uuid PRIMARY KEY,client_id uuid,reference text,customer_name text,quantity integer,slot_start timestamptz,status text);
  CREATE TABLE commerce_orders(id uuid PRIMARY KEY,client_id uuid,reference text,customer_name text,currency text,total numeric,status text);
  CREATE TABLE sessions(id uuid PRIMARY KEY,session_id text,client_id uuid,assigned_agent_id uuid);
  CREATE TABLE messages(id uuid PRIMARY KEY,session_id text,role text,content text);
  CREATE PUBLICATION supabase_realtime;
  GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
  GRANT SELECT,UPDATE ON ALL TABLES IN SCHEMA public TO authenticated,service_role;
 `)
 for(const id of [owner,agent,outsider])await query('INSERT INTO auth.users VALUES($1)',[id])
 await query('INSERT INTO clients VALUES($1),($2)',[workspace,outsiderWorkspace])
 await query("INSERT INTO workspace_memberships(client_id,user_id,role_key,status,permissions) VALUES($1,$2,'owner','active',null),($1,$3,'agent','active',$4),($5,$6,'owner','active',null)",[workspace,owner,agent,JSON.stringify({tickets:'write',bookings:'read',orders:'read'}),outsiderWorkspace,outsider])
 const migration=fs.readFileSync('supabase/086_in_app_notifications.sql','utf8')
 await db.exec(migration);await db.exec(migration)
 await query("INSERT INTO tickets(id,client_id,ticket_number,subject,priority,status) VALUES($1,$2,'TKT-1','Broken checkout','high','open')",[ticket,workspace])
 assert.equal((await query("SELECT count(*)::int n FROM in_app_notifications WHERE category='tickets' AND client_id=$1",[workspace]))[0].n,2)
 assert.equal((await query('SELECT count(*)::int n FROM in_app_notifications WHERE recipient_id=$1',[outsider]))[0].n,0)
 await query('UPDATE tickets SET assignee_id=$1 WHERE id=$2',[agent,ticket])
 assert.equal((await query("SELECT count(*)::int n FROM in_app_notifications WHERE recipient_id=$1 AND category='mine'",[agent]))[0].n,1)
 await query("SELECT emit_in_app_notification($1,$2,'mine','message.received','Message one','One','message',$3,'/inbox','{}','chat:1',null)",[workspace,agent,message])
 await query("SELECT emit_in_app_notification($1,$2,'mine','message.received','Message two','Two','message',$3,'/inbox','{}','chat:1',null)",[workspace,agent,message])
 assert.equal((await query("SELECT rollup_count FROM in_app_notifications WHERE group_key='chat:1'"))[0].rollup_count,2)
 await query("INSERT INTO feature_bookings(id,client_id,reference,customer_name,quantity,status) VALUES($1,$2,'BKG-1','Alex',4,'confirmed')",[booking,workspace])
 await query("INSERT INTO commerce_orders(id,client_id,reference,customer_name,currency,total,status) VALUES($1,$2,'ORD-1','Alex','INR',500,'placed')",[order,workspace])
 assert.equal((await query("SELECT count(*)::int n FROM in_app_notifications WHERE category='orders' AND recipient_id=$1",[agent]))[0].n,2)
 await query("INSERT INTO sessions(id,session_id,client_id,assigned_agent_id) VALUES($1,'chat-session',$2,$3)",[session,workspace,agent])
 await query("INSERT INTO messages(id,session_id,role,content) VALUES($1,'chat-session','user','Can someone help?')",[message])
 assert.equal((await query("SELECT count(*)::int n FROM in_app_notifications WHERE event_type='message.received' AND recipient_id=$1",[agent]))[0].n,2)
 await query("SELECT set_config('request.jwt.claim.sub',$1,false)",[agent]);await db.exec('SET ROLE authenticated')
 assert.ok((await query('SELECT * FROM in_app_notifications')).every(row=>row.recipient_id===agent))
 await db.exec('RESET ROLE')
 console.log('PASS: tenant-scoped notification fan-out, assignment, rollups, domain triggers and recipient RLS')
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>db.close())
