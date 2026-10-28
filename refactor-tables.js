const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, 'src/app/admin');
const filesToRefactor = [
  'contacts/page.tsx',
  'campaigns/page.tsx',
  'tickets/page.tsx',
  'inbox/page.tsx',
  'conversations/page.tsx',
  'knowledge/page.tsx',
  'analytics/page.tsx',
  'templates/page.tsx',
  'channels/page.tsx',
  'settings/page.tsx'
];

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
  { regex: /<div className="min-h-screen bg-surface-muted text-ink p-8">/g, replace: '<div className="animate-in fade-in duration-500 pb-12">' },
  { regex: /<div className="min-h-screen bg-surface-muted text-ink">/g, replace: '<div className="animate-in fade-in duration-500 pb-12">' },
  { regex: /<div className="max-w-7xl mx-auto px-6 py-8">/g, replace: '<div className="w-full">' },
];

filesToRefactor.forEach(file => {
  const filePath = path.join(baseDir, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modifiedContent = content;
    replacements.forEach(({ regex, replace }) => {
      modifiedContent = modifiedContent.replace(regex, replace);
    });
    fs.writeFileSync(filePath, modifiedContent);
    console.log('Refactored:', file);
  } else {
    console.log('Skipped (not found):', file);
  }
});
