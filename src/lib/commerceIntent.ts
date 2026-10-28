export type CatalogueProduct = { id: string; name?: string | null; sku?: string | null }

const managementPattern = /\b(?:cancel|change|modify|edit|update|manage)\s+(?:(?:the|this|my|an?)\s+)?order\b|\border\s+(?:change|cancellation|cancel)\b/i
const cataloguePattern = /\b(?:shop|menu|catalog(?:ue)?|products?|items?|merchandise|deals?|product\s+offers?|campaign\s+offers?|what\s+do\s+you\s+sell|what\s+can\s+i\s+(?:buy|order)|show\s+me\s+(?:the\s+)?(?:menu|catalog(?:ue)?|products?|items?))\b/i
const buyingPattern = /\b(?:buy|purchase|checkout|add\s+(?:it|this|\w+)\s+to\s+(?:my\s+)?cart|place\s+(?:an?\s+)?order|order\s+(?!status\b|tracking\b|details\b|update\b|information\b)\w+|i(?:'d|\s+would)?\s+like|i\s+want|can\s+i\s+get|give\s+me|get\s+me)\b/i
const informationPattern = /\b(?:do\s+you\s+have|how\s+much(?:\s+is|\s+are)?|price\s+(?:of|for)|cost\s+(?:of|for)|in\s+stock|stock|available|availability)\b/i
const recommendationPattern = /\b(?:recommend|recommendation|suggest|suggestion|ideas?|gift|surprise|something\s+special|best\s+(?:option|choice|product)|what\s+would\s+you\s+(?:pick|choose))\b/i

const normalize = (value: unknown) => String(value || '').toLocaleLowerCase().replace(/[-_/.,()[\]{}'"!?…:;]+/g, ' ').replace(/\s+/g, ' ').trim()
const stopWords = new Set(['a','an','the','i','me','my','want','need','buy','order','get','some','please','show','do','you','have','is','available'])
const tokens = (value: unknown) => normalize(value).split(' ').filter(token => token.length > 1 && !stopWords.has(token))
const editDistance = (a:string,b:string) => {const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let diagonal=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,diagonal+(a[i-1]===b[j-1]?0:1));diagonal=old}}return row[b.length]}
const fuzzyScore = (text:string, product:CatalogueProduct) => {
  const query=tokens(text), names=tokens(product.name), sku=normalize(product.sku)
  if(!query.length||!names.length)return 0
  if(sku&&normalize(text).includes(sku))return 1
  const matched=names.filter(name=>query.some(q=>q===name||(q.length>=4&&name.length>=4&&editDistance(q,name)<=1))).length
  return matched/names.length
}

export function isPotentialCommerceRequest(text: string) {
  return managementPattern.test(text) || cataloguePattern.test(text) || buyingPattern.test(text) || informationPattern.test(text) || recommendationPattern.test(text)
}

export function isOrderManagementRequest(text: string) {
  return managementPattern.test(text)
}

export function isCatalogueRequest(text: string) {
  return cataloguePattern.test(text)
}

export function findMentionedProduct(text: string, products: CatalogueProduct[]) {
  const haystack = ` ${normalize(text)} `
  const matches = products.filter(product => {
    const names = [product.name, product.sku].map(normalize).filter(value => value.length >= 2)
    return names.some(value => haystack.includes(` ${value} `))
  })
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) return null
  const ranked=products.map(product=>({product,score:fuzzyScore(text,product)})).filter(item=>item.score>=0.55).sort((a,b)=>b.score-a.score)
  return ranked.length&&(!ranked[1]||ranked[0].score>ranked[1].score)?ranked[0].product:null
}

export function isPurchaseRequest(text: string) {
  return buyingPattern.test(text)
}

export function isProductInformationRequest(text:string){
  return informationPattern.test(text)
}
