type Options<K,V>={maxEntries:number;maxBytes:number;ttlMs:number;sizeOf?:(value:V,key:K)=>number;onEvict?:(value:V,key:K)=>void}
type Entry<V>={value:V;expiresAt:number;bytes:number}

/** Small dependency-free LRU with both entry and byte ceilings. */
export class BoundedCache<K,V>{
 private readonly entries=new Map<K,Entry<V>>()
 private bytes=0
 private readonly options:Options<K,V>
 constructor(options:Options<K,V>){this.options=options}

 get size(){return this.entries.size}
 get byteSize(){return this.bytes}

 get(key:K){
  const entry=this.entries.get(key)
  if(!entry)return undefined
  if(entry.expiresAt<=Date.now()){this.remove(key,entry);return undefined}
  this.entries.delete(key);this.entries.set(key,entry)
  return entry.value
 }

 peek(key:K){
  const entry=this.entries.get(key)
  if(!entry)return undefined
  if(entry.expiresAt<=Date.now()){this.remove(key,entry);return undefined}
  return entry.value
 }

 set(key:K,value:V){
  const previous=this.entries.get(key);if(previous)this.remove(key,previous)
  const bytes=Math.max(1,this.options.sizeOf?.(value,key)??estimateValueBytes(value))
  if(bytes>this.options.maxBytes){this.options.onEvict?.(value,key);return this}
  this.entries.set(key,{value,bytes,expiresAt:Date.now()+this.options.ttlMs});this.bytes+=bytes;this.prune();return this
 }

 delete(key:K){const entry=this.entries.get(key);if(!entry)return false;this.remove(key,entry);return true}
 clear(){for(const[key,entry]of this.entries)this.options.onEvict?.(entry.value,key);this.entries.clear();this.bytes=0}
 keys(){this.pruneExpired();return this.entries.keys()}

 private remove(key:K,entry:Entry<V>){this.entries.delete(key);this.bytes=Math.max(0,this.bytes-entry.bytes);this.options.onEvict?.(entry.value,key)}
 private pruneExpired(){const now=Date.now();for(const[key,entry]of this.entries)if(entry.expiresAt<=now)this.remove(key,entry)}
 private prune(){this.pruneExpired();while(this.entries.size>this.options.maxEntries||this.bytes>this.options.maxBytes){const first=this.entries.entries().next().value as [K,Entry<V>]|undefined;if(!first)break;this.remove(first[0],first[1])}}
}

export function estimateValueBytes(value:unknown){
 const seen=new WeakSet<object>();let nodes=0
 const visit=(item:unknown):number=>{if(++nodes>10000)return 0;if(item==null)return 4;if(typeof item==='string')return item.length*2;if(typeof item==='number'||typeof item==='bigint')return 8;if(typeof item==='boolean')return 4;if(typeof item!=='object')return 16;if(seen.has(item as object))return 0;seen.add(item as object);if(ArrayBuffer.isView(item))return item.byteLength;if(item instanceof ArrayBuffer)return item.byteLength;if(Array.isArray(item))return 24+item.reduce((sum,entry)=>sum+visit(entry),0);let size=32;for(const[key,entry]of Object.entries(item as Record<string,unknown>))size+=key.length*2+visit(entry);return size}
 return visit(value)
}
