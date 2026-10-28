fetch('http://localhost:3000/api/bots', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_id: '43eb2581-c309-4c12-9c9f-34a81e9f1a23',
    type: 'support',
    name: 'Test Bot',
    channel: 'web',
    knowledgeBases: [],
    databases: []
  })
}).then(r => r.text()).then(console.log).catch(console.error)
