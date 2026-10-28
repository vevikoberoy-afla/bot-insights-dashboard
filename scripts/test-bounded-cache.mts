import assert from 'node:assert/strict'
import {BoundedCache} from '../src/lib/boundedCache.ts'

const evicted:string[]=[]
const cache=new BoundedCache<string,string>({maxEntries:2,maxBytes:8,ttlMs:60_000,sizeOf:value=>value.length,onEvict:(_value,key)=>evicted.push(key)})
cache.set('a','1111').set('b','22')
assert.equal(cache.get('a'),'1111')
cache.set('c','3333')
assert.equal(cache.get('b'),undefined,'least recently used entry should be evicted')
assert.equal(cache.get('a'),'1111')
assert.equal(cache.get('c'),'3333')
assert.ok(cache.byteSize<=8)
cache.set('oversized','123456789')
assert.equal(cache.get('oversized'),undefined,'oversized values must never enter the cache')
assert.ok(evicted.includes('b')&&evicted.includes('oversized'))
console.log('PASS: bounded cache enforces LRU entry and byte ceilings')
