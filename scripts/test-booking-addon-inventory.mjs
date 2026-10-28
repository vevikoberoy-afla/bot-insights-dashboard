import {readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'

const engine=process.env.BOOKING_TEST_ENGINE||'node_modules/@electric-sql/pglite'
const {PGlite}=await import(pathToFileURL(`${engine}/dist/index.js`).href)
const db=new PGlite()
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
 CREATE TABLE clients(id uuid PRIMARY KEY);
 CREATE TABLE bots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid REFERENCES clients(id),name text);
 CREATE TABLE channel_integrations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,channel text,config jsonb,status text,created_at timestamptz default now(),updated_at timestamptz);
 CREATE TABLE sales_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid REFERENCES clients(id),order_number text UNIQUE,total_amount numeric default 0,status text default 'processing',items jsonb default '[]');`)
for(const file of ['051_booking_features.sql','052_commerce_and_automation.sql','057_features_experience.sql','087_booking_slot_limits.sql','088_booking_addon_inventory.sql'])await db.exec(await readFile(new URL(`../supabase/${file}`,import.meta.url),'utf8'))

const client='00000000-0000-0000-0000-000000000001'
await db.query('INSERT INTO clients VALUES($1)',[client])
const hours=Object.fromEntries(Array.from({length:7},(_,day)=>[day,[['00:00','23:59']]])),configuration={slots_per_interval:2}
const service=(await db.query(`INSERT INTO booking_services(client_id,name,is_active,notice_hours,working_hours,timezone,capacity,configuration) VALUES($1,'Treatment',true,0,$2,'UTC',10,$3) RETURNING id`,[client,JSON.stringify(hours),JSON.stringify(configuration)])).rows[0].id
const product=(await db.query(`INSERT INTO catalog_products(client_id,sku,name,price,stock_quantity,status) VALUES($1,'OIL-1','Massage oil',20,3,'active') RETURNING id`,[client])).rows[0].id
const start=new Date(Date.now()+86400000);start.setUTCHours(10,0,0,0)
const reserve=async(key)=>(await db.query('SELECT reserve_feature_booking($1,$2) result',[client,JSON.stringify({service_id:service,customer_name:'Alex',customer_phone:'+911234567890',quantity:1,slot_start:start.toISOString(),idempotency_key:key})])).rows[0].result
const first=await reserve('addon-one'),second=await reserve('addon-two')
assert.ok(first.id&&second.id)
await assert.rejects(reserve('addon-three'),/Slot is full/)
await db.query('SELECT claim_booking_addon_inventory($1,$2,$3)',[client,first.id,JSON.stringify([{product_id:product,quantity:2}])])
assert.equal((await db.query('SELECT stock_quantity FROM catalog_products WHERE id=$1',[product])).rows[0].stock_quantity,1)
await db.query('SELECT claim_booking_addon_inventory($1,$2,$3)',[client,first.id,JSON.stringify([{product_id:product,quantity:2}])])
assert.equal((await db.query('SELECT stock_quantity FROM catalog_products WHERE id=$1',[product])).rows[0].stock_quantity,1,'claim must be idempotent')
await db.query("UPDATE feature_bookings SET status='cancelled' WHERE id=$1",[first.id])
assert.equal((await db.query('SELECT stock_quantity FROM catalog_products WHERE id=$1',[product])).rows[0].stock_quantity,3)
assert.equal((await db.query('SELECT count(*) n FROM inventory_movements WHERE booking_id=$1',[first.id])).rows[0].n,2)
console.log('PASS: atomic slot-count limit, booking product add-on inventory claim, idempotency and cancellation restore')
await db.close()
