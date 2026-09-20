// Writing a funscript out to disk. Shared so every tab names and saves files
// the same way.
export function downloadFunscript(script, sourceName) {
  if (!script) return;

  const json = JSON.stringify(script, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const href = URL.createObjectURL(blob);

  // Name it after whatever it came from — the video, or an imported script —
  // else a fallback.
  const baseName = sourceName ? sourceName.replace(/\.[^/.]+$/, '') : 'handyhub-script';

  const link = document.createElement('a');
  link.href = href;
  link.download = `${baseName}.funscript`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(href);
}
