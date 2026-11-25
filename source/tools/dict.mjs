import fs from 'fs';
const src = process.argv[2], outDir = process.argv[3];
const norm = s => s.replace(/[ً-ْٰـ]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ؤ/g,'و').replace(/ئ/g,'ي');
const lines = fs.readFileSync(src,'utf8').split('\n');
const words = new Map(); let rank=0;
for (const ln of lines) {
  const [w, c] = ln.trim().split(/\s+/); if (!w) continue; rank++;
  if (!/^[ء-ي]+$/.test(w)) continue;
  const n = norm(w); if (n.length < 2 || n.length > 14) continue;
  if (/(.)\1\1/.test(n)) continue; // aaa junk
  if (!words.has(n)) words.set(n, rank);
}
const list = [...words.keys()];
fs.writeFileSync(outDir + '/dict-ar.txt', list.join('\n'));
// bigram prompts from common words
const common = list.filter(w => words.get(w) < 25000 && w.length >= 3);
const cnt = new Map();
for (const w of common) { const seen = new Set(); for (let i=0;i<w.length-1;i++){ const b=w.slice(i,i+2); if(seen.has(b)) continue; seen.add(b); cnt.set(b,(cnt.get(b)||0)+1);} }
const bad = new Set(['ال','لل']);
const arr = [...cnt.entries()].filter(([b])=>!bad.has(b) && !/ء/.test(b));
const easy = arr.filter(([,c])=>c>=220).map(([b])=>b), med = arr.filter(([,c])=>c>=90&&c<220).map(([b])=>b), hard = arr.filter(([,c])=>c>=40&&c<90).map(([b])=>b);
fs.writeFileSync('/home/claude/felha/src/data/bomb-prompts.js', `export const BOMB = ${JSON.stringify({easy, med, hard})};\n`);
console.log('words', list.length, 'bytes', fs.statSync(outDir+'/dict-ar.txt').size, 'easy', easy.length, 'med', med.length, 'hard', hard.length);
console.log(easy.slice(0,30).join(' '), '|', hard.slice(0,20).join(' '));
