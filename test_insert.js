require('dotenv').config({ path: '.env.local' });
const { embed } = require('./src/lib/embeddings.ts');
// Wait, TS can't be required easily in node without ts-node or similar.
// Let's just do a fetch to the local API.
async function test() {
  const res = await fetch('http://localhost:3000/api/chunks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dataset_id: 'e97d12a8-edbe-496a-9365-7500e4d99298',
      title: 'Test Chunk',
      text: 'This is a test chunk to see if insertion works.',
      source_type: 'manual'
    })
  });
  const data = await res.json();
  console.log('Response:', res.status, data);
}
test();
