const fs = require('fs');
const path = require('path');

const ROUTES = [
  { path: 'campaigns/analytics', title: 'Campaigns Analytics', desc: 'Detailed performance metrics for all campaigns.' },
  { path: 'campaigns/whatsapp', title: 'WhatsApp Settings', desc: 'Configure WhatsApp templates and numbers.' },
  { path: 'campaigns/sms', title: 'SMS Settings', desc: 'Configure SMS outreach settings.' },
  { path: 'campaigns/email', title: 'Email Settings', desc: 'Configure Email marketing settings.' },
  { path: 'campaigns/web', title: 'Web Chat Settings', desc: 'Configure proactive web chat campaigns.' },
  { path: 'campaigns/settings', title: 'Campaign Settings', desc: 'Global settings for outreach.' },
  { path: 'bots/analytics', title: 'Bots Analytics', desc: 'Performance and deflection rates for AI agents.' },
  { path: 'knowledge/analytics', title: 'Knowledge Analytics', desc: 'See what knowledge chunks are being queried most.' },
  { path: 'knowledge/all', title: 'All Knowledge Chunks', desc: 'Manage your entire knowledge base.' },
  { path: 'databases/analytics', title: 'Database Analytics', desc: 'Metrics on structured data queries.' },
  { path: 'databases/all', title: 'All Databases', desc: 'Manage connected SQL databases and APIs.' },
  { path: 'tickets/new', title: 'New Ticket', desc: 'Manually create a support ticket.' },
  { path: 'tickets/analytics', title: 'Ticket Analytics', desc: 'Resolution times and ticket volume.' },
  { path: 'messages/all', title: 'All Messages', desc: 'Search through the entire conversation history.' },
  { path: 'templates/create', title: 'Create Template', desc: 'Build reusable message templates.' },
  { path: 'templates/all', title: 'My Templates', desc: 'Manage your saved templates.' },
  { path: 'notepad', title: 'Notepad', desc: 'Internal notes and scratchpad.' },
  { path: 'channels', title: 'Channels', desc: 'Manage connected communication channels.' },
  { path: 'api-keys', title: 'API Keys', desc: 'Manage developer API keys.' },
  { path: 'webhooks', title: 'Webhooks', desc: 'Configure incoming and outgoing webhooks.' }
];

const BASE_DIR = path.join(__dirname, 'src/app/(dashboard)');

ROUTES.forEach(route => {
  const dirPath = path.join(BASE_DIR, route.path);
  const filePath = path.join(dirPath, 'page.tsx');

  // Create directory if it doesn't exist
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  // Create file
  const content = `import { ComingSoon } from '@/components/shared/coming-soon'

export default function Page() {
  return <ComingSoon title="${route.title}" description="${route.desc}" />
}
`;
  
  fs.writeFileSync(filePath, content);
  console.log(`Created: ${route.path}`);
});
