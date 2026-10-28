require('dotenv').config({ path: '.env.local' });
async function test() {
  const res = await fetch('http://localhost:3000/api/bot-datasets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bot_id: 'd17f90fb-d83e-49fe-9fc1-14d23a43f811',
      dataset_id: 'e97d12a8-edbe-496a-9365-7500e4d99298'
    })
  });
  const text = await res.text();
  console.log('Response:', res.status, text);
}
test();
