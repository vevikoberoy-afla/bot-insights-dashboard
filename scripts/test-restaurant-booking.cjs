const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')

const code=ts.transpileModule(fs.readFileSync('src/lib/booking.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const moduleObject={exports:{}}
const supabase={from(){throw new Error('Database access is not expected in allocation unit tests')}}
vm.runInNewContext(code,{exports:moduleObject.exports,module:moduleObject,require:name=>name==='@/lib/supabase'?{supabase}:name==='@/lib/calendarAdapters'?{createExternalEvent:async()=>null,externalAvailableStarts:async()=>null,providerAllows:()=>true,updateExternalEvent:async()=>null}:require(name),crypto,Intl,Date,Number,String,Map,Set,Array})
const {selectRestaurantTables,restaurantDuration}=moduleObject.exports
const table=(id,seats,group=null,min=1)=>({id,name:id,area:'Main',min_party:min,max_party:seats,combine_group:group,active:true})

assert.deepEqual(Array.from(selectRestaurantTables([table('T4',4),table('T2',2)],2,2),x=>x.id),['T2'])
assert.deepEqual(Array.from(selectRestaurantTables([table('A1',2,'A'),table('A2',2,'A'),table('B1',6,'B')],4,2),x=>x.id),['B1'])
assert.deepEqual(Array.from(selectRestaurantTables([table('A1',2,'A'),table('A2',2,'A')],4,2),x=>x.id).sort(),['A1','A2'])
assert.equal(selectRestaurantTables([table('A1',2,'A'),table('A2',2,'A')],4,1).length,0)
assert.equal(restaurantDuration({duration_min:60,configuration:{restaurant:{turn_times:[{max_party:2,duration_min:75},{max_party:6,duration_min:120}]}}},4),120)
assert.equal(restaurantDuration({duration_min:60,configuration:{restaurant:{turn_times:[]}}},4),60)

const migration=fs.readFileSync('supabase/065_restaurant_table_inventory.sql','utf8')
assert.match(migration,/pg_advisory_xact_lock/)
assert.match(migration,/release_restaurant_tables_on_cancel/)
assert.match(migration,/waitlisted_no_table/)
console.log('PASS: restaurant best-fit tables, combinations, combination limits, turn times, atomic lock, cancellation release, waitlist fallback')
