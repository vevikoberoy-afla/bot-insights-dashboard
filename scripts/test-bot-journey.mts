import assert from 'node:assert/strict'
import { fullServiceJourneyTemplate, journeyPolicyFromFlow, supportJourneyTemplate, validateBotJourney } from '../src/lib/botJourney.ts'

const support = supportJourneyTemplate()
const supportPolicy = journeyPolicyFromFlow(support)
assert.equal(supportPolicy.supportOnly, true)
assert.equal(supportPolicy.requirePhone, true)
assert.equal(supportPolicy.requireOrder, true)
assert.equal(supportPolicy.allowSupport, true)
assert.equal(supportPolicy.allowKnowledge, true)
assert.equal(supportPolicy.allowCommerce, false)
assert.equal(supportPolicy.allowBooking, false)
assert.equal(validateBotJourney(support).errors.length, 0)

const full = fullServiceJourneyTemplate()
const fullPolicy = journeyPolicyFromFlow(full)
assert.equal(fullPolicy.supportOnly, false)
assert.equal(fullPolicy.allowCommerce, true)
assert.equal(fullPolicy.allowBooking, true)
assert.equal(fullPolicy.allowHandoff, true)
assert.equal(validateBotJourney(full).errors.length, 0)

const withoutBooking = { ...full, nodes: full.nodes.filter(node => node.type !== 'booking'), edges: full.edges.filter(edge => edge.source !== 'booking' && edge.target !== 'booking') }
assert.equal(journeyPolicyFromFlow(withoutBooking).allowBooking, false)
assert.equal(journeyPolicyFromFlow(withoutBooking).allowCommerce, true)

const disconnectedCommerce = { ...full, edges: full.edges.filter(edge => edge.source !== 'start' || edge.target !== 'commerce') }
assert.equal(journeyPolicyFromFlow(disconnectedCommerce).allowCommerce, false)

const invalid = { ...support, startNodeId: 'missing' }
assert.match(validateBotJourney(invalid).errors.join(' '), /start node/i)

console.log('Bot journey policy tests passed')
