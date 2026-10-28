// Usage: BOOKING_TEST_ENGINE=/path/to/node_modules/@electric-sql/pglite node scripts/test-bot-config-db.mjs
import {readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'

const {PGlite}=await import(pathToFileURL(process.env.BOOKING_TEST_ENGINE+'/dist/index.js').href)
const db=new PGlite()
await db.exec(`
 CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
 CREATE TABLE clients(id uuid PRIMARY KEY);
 CREATE TABLE bots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid NOT NULL REFERENCES clients(id),name text NOT NULL);
 CREATE TABLE booking_services(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid NOT NULL REFERENCES clients(id));
 CREATE TABLE booking_offers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid NOT NULL REFERENCES clients(id));
 CREATE TABLE catalog_products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid NOT NULL REFERENCES clients(id));
 CREATE TABLE datasets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid NOT NULL REFERENCES clients(id),name text,type text,source_url text,crawl_status text,chunk_count integer DEFAULT 0,description text,purpose text,tags text[],status text,source_count integer,created_from text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
 CREATE TABLE bot_datasets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bot_id uuid NOT NULL REFERENCES bots(id),dataset_id uuid NOT NULL REFERENCES datasets(id),UNIQUE(bot_id,dataset_id));
 CREATE TABLE chunks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),dataset_id uuid REFERENCES datasets(id),title text,text text NOT NULL,chunk_hash text NOT NULL,embedding text,source_url text,source_type text,active boolean DEFAULT true);
 CREATE TABLE manual_qa_pairs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid NOT NULL REFERENCES clients(id),bot_id uuid REFERENCES bots(id),question text,answer text,question_embedding text,is_active boolean DEFAULT true);
`)
const client='00000000-0000-0000-0000-000000000001'
await db.query('INSERT INTO clients VALUES($1)',[client])
const bot=(await db.query("INSERT INTO bots(client_id,name) VALUES($1,'Concierge') RETURNING id",[client])).rows[0]
await db.query("INSERT INTO manual_qa_pairs(client_id,bot_id,question,answer) VALUES($1,$2,'When are you open?','Every weekday from nine to five.')",[client,bot.id])
const migration=await readFile(new URL('../supabase/053_bot_booking_commerce.sql',import.meta.url),'utf8')
await db.exec(migration);await db.exec(migration)
const service=(await db.query('INSERT INTO booking_services(client_id) VALUES($1) RETURNING id',[client])).rows[0]
const product=(await db.query('INSERT INTO catalog_products(client_id) VALUES($1) RETURNING id',[client])).rows[0]
await db.query("SELECT save_bot_commerce_config($1,$2,$3::jsonb,ARRAY[$4::uuid],ARRAY[]::uuid[],ARRAY[$5::uuid])",[client,bot.id,JSON.stringify({menu_title:'Concierge menu',booking_enabled:true,ordering_enabled:true}),service.id,product.id])
assert.equal((await db.query('SELECT menu_title FROM bot_commerce_config WHERE bot_id=$1',[bot.id])).rows[0].menu_title,'Concierge menu')
assert.equal((await db.query('SELECT count(*) n FROM bot_booking_services WHERE bot_id=$1',[bot.id])).rows[0].n,1)
await assert.rejects(db.query("SELECT save_bot_commerce_config($1,$2,'{}'::jsonb,ARRAY[$3::uuid],ARRAY[]::uuid[],ARRAY[]::uuid[])",[client,bot.id,'00000000-0000-0000-0000-000000000099']),/Invalid service/)
assert.equal((await db.query('SELECT count(*) n FROM bot_booking_services WHERE bot_id=$1',[bot.id])).rows[0].n,1,'failed save must not partially clear assignments')
const dataset=(await db.query("SELECT * FROM datasets WHERE source_url=$1",[`manual-faq://bot/${bot.id}`])).rows[0]
assert.equal(dataset.status,'ready');assert.equal(dataset.chunk_count,1)
assert.equal((await db.query('SELECT count(*) n FROM bot_datasets WHERE bot_id=$1 AND dataset_id=$2',[bot.id,dataset.id])).rows[0].n,1)
assert.match((await db.query('SELECT text FROM chunks WHERE dataset_id=$1',[dataset.id])).rows[0].text,/Every weekday/)
assert.equal((await db.query("SELECT to_regclass('public.bot_commerce_config') table_name")).rows[0].table_name,'bot_commerce_config')
console.log('PASS: rerunnable per-bot configuration schema, atomic catalogue save, and Manual FAQ to bot-linked Knowledge Base migration')
await db.close()
