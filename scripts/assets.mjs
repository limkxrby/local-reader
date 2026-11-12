import { deflateSync } from 'node:zlib';
import { mkdir, writeFile, readFile } from 'node:fs/promises';

// Code-drawn book icon: no external artwork or fonts.
function crc(bytes) { let n=0xffffffff; for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);} return (n^0xffffffff)>>>0; }
function chunk(type, data) { const label=Buffer.from(type); const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);label.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([label,data])),data.length+8);return out; }
await mkdir('public/icons', {recursive:true});
for(const size of [16,32,48,128]) {
  const raw=Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const X=x/size,Y=y/size; let color=[0,0,0,0];
    if(X>=.125&&X<.875&&Y>=.125&&Y<.875)color=[45,75,64,255];
    if(X>=.27&&X<.73&&Y>=.31&&Y<.7)color=[249,247,230,255];
    if(X>=.48&&X<.52&&Y>=.31&&Y<.75)color=[45,75,64,255];
    if(X>=.59&&X<.65&&Y>=.29&&Y<.51)color=[190,111,67,255];
    const at=y*(size*4+1)+1+x*4; for(let c=0;c<4;c++)raw[at+c]=color[c];
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  await writeFile(`public/icons/icon-${size}.png`,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}
let notices='Third-party software distributed with Local Reader\n\n';
for(const name of ['react','react-dom','scheduler','@mozilla/readability','dompurify','idb']) {
  const pkg=JSON.parse(await readFile(`node_modules/${name}/package.json`,'utf8'));
  notices+=`\n=== ${name} ${pkg.version} (${pkg.license}) ===\n`;
  let found=false;
  for(const filename of ['LICENSE','LICENSE.md','LICENSE.txt','LICENSE-MIT','LICENSE-MPL']) {
    try { notices+=await readFile(`node_modules/${name}/${filename}`,'utf8');notices+='\n';found=true; } catch {}
  }
  if(!found)throw new Error(`Missing license text for ${name}`);
}
await writeFile('public/THIRD_PARTY_NOTICES.txt',notices);
