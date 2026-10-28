// Runs only in a short-lived child process without application credentials.
const { inflateRawSync, inflateSync } = require('node:zlib')
const LIMIT = 20 * 1024 * 1024, MAX_TEXT = 250000
function reject(message) { throw Error(message) }
function signatureCheck(buffer) {
  const text = buffer.toString('latin1')
  if (text.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE') || text.includes('X5O!P%@AP[4\\PZX54(P^)7CC)7}')) reject('The document failed the security check.')
  if (buffer.subarray(0,2).toString() === 'MZ' || buffer.subarray(0,4).equals(Buffer.from([0x7f,0x45,0x4c,0x46]))) reject('Executable files cannot be imported.')
}
function normalizedText(text) {
  text = String(text).replace(/\r\n?/g,'\n').replace(/\u0000/g,'').trim()
  if (!text) reject('No readable text was found. Scanned PDFs need OCR before uploading.')
  if (text.length > MAX_TEXT) reject('The document contains too much text. Split it into smaller documents.')
  return text
}
function textFile(buffer) {
  signatureCheck(buffer)
  let text
  if (buffer[0]===0xff && buffer[1]===0xfe) text = new TextDecoder('utf-16le',{fatal:true}).decode(buffer.subarray(2))
  else if (buffer[0]===0xfe && buffer[1]===0xff) text = new TextDecoder('utf-16be',{fatal:true}).decode(buffer.subarray(2))
  else text = new TextDecoder('utf-8',{fatal:true}).decode(buffer)
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) reject('This file is binary rather than a text document.')
  if (/^\s*(?:<!doctype\s+html|<html\b|<script\b|#!)/i.test(text)) reject('Upload a document rather than HTML or executable content.')
  return normalizedText(text)
}
function pdfCheck(buffer) {
  signatureCheck(buffer)
  if (!buffer.subarray(0,8).toString('ascii').match(/^%PDF-(?:1\.[0-9]|2\.0)/)) reject('The file is not a supported PDF document.')
  if (!/%%EOF\s*$/.test(buffer.subarray(Math.max(0,buffer.length-1024)).toString('latin1'))) reject('The PDF is incomplete or has appended content.')
  const dangerous = /\/(?:JavaScript|JS|Launch|AA|OpenAction|EmbeddedFile|EmbeddedFiles|RichMedia|XFA|Encrypt|AcroForm)\b/i
  const inspect = text => { if(dangerous.test(text.replace(/#([0-9a-f]{2})/gi,(_m,h)=>String.fromCharCode(parseInt(h,16))))) reject('PDF scripts, attachments, forms, and encrypted documents cannot be imported.') }
  const raw=buffer.toString('latin1');inspect(raw)
  if ((raw.match(/\b\d+\s+\d+\s+obj\b/g)||[]).length>6000) reject('This PDF is too complex to process safely.')
  let expanded=0,count=0
  const streams=/<<(.*?)>>\s*stream\r?\n/gms
  let match
  while((match=streams.exec(raw))) {
    if(++count>2000)reject('This PDF has too many streams.')
    const end=raw.indexOf('endstream',streams.lastIndex)
    if(end<0)reject('The PDF contains a malformed stream.')
    if(/\/FlateDecode\b/.test(match[1].replace(/#([0-9a-f]{2})/gi,(_m,h)=>String.fromCharCode(parseInt(h,16))))) {
      const data=buffer.subarray(streams.lastIndex,end)
      let output
      try { output=inflateSync(data,{maxOutputLength:Math.max(1,LIMIT-expanded)}) } catch { reject('A compressed PDF stream failed its security check.') }
      expanded+=output.length
      if(expanded>LIMIT)reject('The PDF expands beyond the safe processing limit.')
      signatureCheck(output);inspect(output.toString('latin1'))
    }
    streams.lastIndex=end+9
  }
}
function docxCheck(buffer) {
  signatureCheck(buffer)
  if(buffer.readUInt32LE(0)!==0x04034b50)reject('The file is not a DOCX document.')
  let end=-1
  for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break}
  if(end<0 || end+22+buffer.readUInt16LE(end+20)!==buffer.length)reject('The document archive is incomplete.')
  const entries=buffer.readUInt16LE(end+10), directory=buffer.readUInt32LE(end+16),directorySize=buffer.readUInt32LE(end+12)
  if(buffer.readUInt16LE(end+4)||buffer.readUInt16LE(end+6)||entries<1||entries>256||buffer.readUInt16LE(end+8)!==entries||directory+directorySize!==end)reject('The document archive is too complex or uses unsupported ZIP features.')
  const names=new Set(),documents=[];let cursor=directory,total=0
  for(let index=0;index<entries;index++){
    if(cursor+46>end||buffer.readUInt32LE(cursor)!==0x02014b50)reject('Invalid document archive directory.')
    const flags=buffer.readUInt16LE(cursor+8),method=buffer.readUInt16LE(cursor+10),compressed=buffer.readUInt32LE(cursor+20),size=buffer.readUInt32LE(cursor+24)
    const nameLength=buffer.readUInt16LE(cursor+28),extra=buffer.readUInt16LE(cursor+30),comment=buffer.readUInt16LE(cursor+32),local=buffer.readUInt32LE(cursor+42)
    const name=buffer.subarray(cursor+46,cursor+46+nameLength).toString('utf8')
    if(cursor+46+nameLength+extra+comment>end||!name||name.includes('..')||/[\x00-\x1f\\:]/.test(name)||name.startsWith('/')||names.has(name))reject('Unsafe document archive paths.')
    names.add(name)
    if(flags&1||![0,8].includes(method)||size>LIMIT||size>Math.max(1024,compressed*200))reject('Encrypted or unusually compressed document archives cannot be imported.')
    total+=size;if(total>LIMIT)reject('The document archive expands beyond the safe processing limit.')
    if(/(?:vba|macros?|activex|embeddings)\b|\.(?:exe|dll|bin|js|vbs|ps1|bat|cmd|html?|zip)$/i.test(name))reject('DOCX macros, embedded files, and active content cannot be imported.')
    if(local+30>directory||buffer.readUInt32LE(local)!==0x04034b50)reject('Invalid document archive entry.')
    const localNameLength=buffer.readUInt16LE(local+26),localExtra=buffer.readUInt16LE(local+28),start=local+30+localNameLength+localExtra
    if(start+compressed>directory||buffer.readUInt16LE(local+6)!==flags||buffer.readUInt16LE(local+8)!==method||buffer.subarray(local+30,local+30+localNameLength).toString('utf8')!==name)reject('Inconsistent document archive entry.')
    let output
    try {output=method===0?buffer.subarray(start,start+compressed):inflateRawSync(buffer.subarray(start,start+compressed),{maxOutputLength:Math.max(1,size)})}catch{reject('A document archive entry could not be safely expanded.')}
    if(output.length!==size)reject('A document archive entry has an invalid size.')
    signatureCheck(output)
    if(/\.(xml|rels)$/i.test(name)){
      const xml=output.toString('utf8')
      if(/<!DOCTYPE|<!ENTITY|DDEAUTO|INCLUDETEXT|INCLUDEPICTURE|macroEnabled|<\w+:object\b/i.test(xml))reject('The document contains unsafe XML or field content.')
      if(name.endsWith('.rels'))for(const relation of xml.match(/<Relationship\b[^>]*>/g)||[]){if(/TargetMode\s*=\s*["']External["']/i.test(relation)&&!/Type\s*=\s*["'][^"']*\/hyperlink["']/i.test(relation))reject('External document resources cannot be imported.')}
      if(/^word\/(?:document|header\d*|footer\d*|footnotes|endnotes)\.xml$/i.test(name))documents.push(xml)
    }
    cursor+=46+nameLength+extra+comment
  }
  if(cursor!==end||!names.has('[Content_Types].xml')||!names.has('word/document.xml'))reject('This archive is not a Word DOCX document.')
  return documents
}
async function parse(buffer,extension){
  if(buffer.length<1)reject('The document is empty.')
  if(extension==='pdf'){
    pdfCheck(buffer)
    const pdf=require('pdf-parse')
    // Legacy PDF.js misreads pooled Node Buffer byte offsets. Supply an owned
    // Uint8Array so offsets in the PDF resolve against the actual file bytes.
    const result=await pdf(Uint8Array.from(buffer),{max:151})
    if(result.numpages>150)reject('PDF documents may contain at most 150 pages.')
    return normalizedText(result.text)
  }
  if(extension==='docx'){
    if(buffer.length<22)reject('The DOCX document is incomplete.')
    const documents=docxCheck(buffer)
    const {DOMParser}=require('@xmldom/xmldom')
    const output=[];let characters=0,nodes=0
    for(const xml of documents){
      const document=new DOMParser({locator:false,onError(){reject('The document contains malformed XML.')}}).parseFromString(xml,'application/xml')
      const visit=(node,depth)=>{
        if(depth>128||++nodes>200000)reject('The document XML is too complex.')
        const word=node.namespaceURI==='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
        if(word&&node.localName==='t'){
          const text=node.textContent||'';characters+=text.length;if(characters>MAX_TEXT)reject('The document contains too much text. Split it into smaller documents.')
          output.push(text);return
        }
        if(word&&(node.localName==='tab'||node.localName==='br'))output.push(node.localName==='tab'?'\t':'\n')
        for(let child=node.firstChild;child;child=child.nextSibling)visit(child,depth+1)
        if(word&&['p','tr'].includes(node.localName))output.push('\n')
      }
      visit(document.documentElement,0)
    }
    return normalizedText(output.join(''))
  }
  if(['txt','md','csv'].includes(extension))return textFile(buffer)
  if(extension==='html'){
    signatureCheck(buffer)
    const html=new TextDecoder('utf-8',{fatal:true}).decode(buffer)
    const text=html.replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|noscript|svg|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<\/(?:p|div|li|h[1-6]|tr)>|<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|amp|lt|gt|quot|apos);/g,entity=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[entity])).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n\n')
    return normalizedText(text)
  }
  reject('Unsupported document format.')
}
module.exports={parse,pdfCheck,docxCheck,textFile}
if(require.main===module){
  process.once('message',async message=>{
    try{
      if(!message||typeof message.data!=='string'||message.data.length>28*1024*1024)reject('Invalid document payload.')
      const text=await parse(Buffer.from(message.data,'base64'),message.extension)
      process.send({ok:true,text},()=>process.exit(0))
    }catch(error){process.send({ok:false,error:typeof error.message==='string'?error.message.slice(0,220):'Document validation failed.'},()=>process.exit(0))}
  })
}
