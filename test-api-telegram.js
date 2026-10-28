const botToken = 'dummy-token' // I don't have their real token, I'll just use a fake one to see if it parses
fetch('http://localhost:3000/api/integrations/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ channel: 'telegram', config: { bot_token: '12345:ABCDE' } })
}).then(r => r.json()).then(console.log).catch(console.error)
