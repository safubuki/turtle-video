import fs from 'fs';

const files = [
  'src/flavors/standard/preview/usePreviewEngine.ts',
  'src/flavors/apple-safari/preview/usePreviewEngine.ts',
];

for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  let n = 0;

  s = s.replace(
    /const trimStart = activeItem\.trimStart \|\| 0;\r?\n\s*const targetTime = trimStart \+ localTime;/g,
    () => {
      n++;
      return `const trimStart = activeItem.trimStart || 0;\n              const targetTime = resolveVideoSourceTime({ trimStart, localTime, playbackSpeed: activeItem.playbackSpeed });`;
    },
  );

  s = s.replace(
    /const safeEndTime = trimStart \+ Math\.max\(0, activeItem\.duration - 0\.001\);/g,
    () => {
      n++;
      return `const safeEndTime = resolveVideoSafeEndSourceTime({ trimStart, timelineDuration: activeItem.duration, playbackSpeed: activeItem.playbackSpeed, trimEnd: activeItem.trimEnd });`;
    },
  );

  s = s.replace(
    /const safeEndTime = \(activeItem\.trimStart \|\| 0\) \+ Math\.max\(0, activeItem\.duration - 0\.001\);/g,
    () => {
      n++;
      return `const safeEndTime = resolveVideoSafeEndSourceTime({ trimStart: activeItem.trimStart || 0, timelineDuration: activeItem.duration, playbackSpeed: activeItem.playbackSpeed, trimEnd: activeItem.trimEnd });`;
    },
  );

  s = s.replace(
    /const trimStart = currentItem\.trimStart \|\| 0;\r?\n\s*const targetTime = trimStart \+ resolvedSegment\.localTime;/g,
    () => {
      n++;
      return `const trimStart = currentItem.trimStart || 0;\n            const targetTime = resolveVideoSourceTime({ trimStart, localTime: resolvedSegment.localTime, playbackSpeed: currentItem.playbackSpeed });`;
    },
  );

  s = s.replace(
    /const targetTime = trimStart \+ resolvedSegment\.localTime;/g,
    () => {
      n++;
      return `const targetTime = resolveVideoSourceTime({ trimStart, localTime: resolvedSegment.localTime, playbackSpeed: currentItem?.playbackSpeed });`;
    },
  );

  // remaining: const targetTime = trimStart + localTime (generic)
  s = s.replace(
    /const targetTime = trimStart \+ localTime;/g,
    () => {
      n++;
      return `const targetTime = resolveVideoSourceTime({ trimStart, localTime, playbackSpeed: activeItem?.playbackSpeed ?? conf?.playbackSpeed });`;
    },
  );

  fs.writeFileSync(f, s);
  console.log(f, 'replacements', n);

  const remaining = s.match(/trimStart \+ [a-zA-Z.]| \|\| 0\) \+ localTime/g);
  console.log(f, 'remaining', remaining ? remaining.length : 0, remaining?.slice(0, 15));
}
