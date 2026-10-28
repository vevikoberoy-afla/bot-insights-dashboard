const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/app/admin/client/[id]/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const replacements = [
  // Backgrounds
  { regex: /bg-\[#0a0a0a\]/g, replace: 'bg-surface-muted' },
  { regex: /bg-\[#111\]/g, replace: 'bg-surface' },
  { regex: /bg-\[#1a1a1a\]/g, replace: 'bg-surface' },
  { regex: /bg-\[#222\]/g, replace: 'bg-surface-subtle' },
  { regex: /bg-\[#222222\]/g, replace: 'bg-surface-subtle' },
  { regex: /bg-white\/5/g, replace: 'bg-surface-muted' },
  { regex: /bg-white\/10/g, replace: 'bg-surface-subtle' },
  { regex: /hover:bg-white\/10/g, replace: 'hover:bg-surface-subtle' },
  { regex: /hover:bg-white\/5/g, replace: 'hover:bg-surface-muted' },

  // Borders
  { regex: /border-white\/\[0\.06\]/g, replace: 'border-surface-border' },
  { regex: /border-white\/\[0\.08\]/g, replace: 'border-surface-border' },
  { regex: /border-white\/\[0\.1\]/g, replace: 'border-surface-border' },
  { regex: /border-white\/10/g, replace: 'border-surface-border' },
  { regex: /border-white\/20/g, replace: 'border-surface-border' },
  
  // Text
  { regex: /text-white/g, replace: 'text-ink' },
  { regex: /text-gray-300/g, replace: 'text-ink' },
  { regex: /text-gray-400/g, replace: 'text-ink-secondary' },
  { regex: /text-gray-500/g, replace: 'text-ink-muted' },
  { regex: /text-gray-600/g, replace: 'text-ink-muted' },
  { regex: /hover:text-gray-300/g, replace: 'hover:text-ink' },
  { regex: /hover:text-white/g, replace: 'hover:text-ink' },

  // Accents (Purple -> Accent)
  { regex: /purple-500/g, replace: 'accent' },
  { regex: /purple-400/g, replace: 'accent' },
  { regex: /purple-600/g, replace: 'accent-hover' },
  
  // Specific fix for the top level layout
  { regex: /<div className="min-h-screen bg-surface-muted text-ink flex items-center justify-center">/g, replace: '<div className="h-full w-full bg-surface text-ink flex items-center justify-center">' },
  { regex: /<div className="min-h-screen bg-surface-muted text-ink">/g, replace: '<div className="animate-in fade-in duration-500 pb-12">' },
  
  // Header removal/replacement since we are inside layout now
  { regex: /<header className="sticky top-0 z-40 bg-surface-muted\/80 backdrop-blur-xl border-b border-surface-border">([\s\S]*?)<\/header>/, replace: `
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/admin')} className="text-ink-muted hover:text-ink transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-ink truncate">{client.name}</h1>
              <span className={\`text-[11px] font-medium px-2.5 py-1 rounded-full border \${pill.cls} flex-shrink-0\`}>{pill.text}</span>
            </div>
            {client.website_url && <p className="text-sm text-ink-secondary truncate mt-1">{client.website_url}</p>}
          </div>
        </div>
        <button onClick={() => setEditing(!editing)} className="text-sm font-medium px-4 py-2 bg-surface hover:bg-surface-muted border border-surface-border rounded-xl text-ink transition-colors shadow-sm">
          {editing ? 'Cancel' : 'Edit Settings'}
        </button>
      </div>` },

  // Fix max-w-4xl wrapper to take full width
  { regex: /<main className="max-w-4xl mx-auto px-6 py-8 space-y-6">/g, replace: '<main className="w-full space-y-6">' },
  
  // Fix tabs wrapper to wrap correctly and use shadcn styling
  { regex: /<div className="flex gap-2 bg-surface border border-surface-border rounded-xl p-1\.5 shadow-sm mb-6 w-fit">/g, replace: '<div className="flex flex-wrap gap-2 bg-surface-muted border border-surface-border rounded-xl p-1.5 shadow-sm mb-6 w-fit">' },
];

let modifiedContent = content;
replacements.forEach(({ regex, replace }) => {
  modifiedContent = modifiedContent.replace(regex, replace);
});

fs.writeFileSync(filePath, modifiedContent);
console.log('Successfully refactored client detail view colors!');
