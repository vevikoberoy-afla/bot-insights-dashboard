fetch('http://localhost:3000/api/webhooks/telegram', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    update_id: 12345,
    message: {
      message_id: 1,
      from: { id: 1111111, is_bot: false, first_name: 'Test' },
      chat: { id: 1111111, type: 'private' },
      date: 1700000000,
      text: 'Hello, what can you do?'
    }
  })
}).then(r => r.json()).then(console.log).catch(console.error)
