import { deflateSync, inflateSync } from 'node:zlib';
import { mkdir, writeFile, readFile } from 'node:fs/promises';

// User-supplied Local Reader mark, embedded to keep release builds reproducible.
const suppliedIcon = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAADUAAAAzCAYAAAA3v0BtAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAASSSURBVGhD7Zh7TFNXHMc/t7a2COVZWuQxMWwqQ0nwMQVNhhsz6GY0GibZdLCQzWQanewV4tRsji2SsEzNFGcYiwwT3NyMWUSnLjqZGucDjSHOSaYQfEWeYotQ2v3hLPVkw3vLLaOkn6TJvd/fOTf99PT+2nMle7fNyRBDIwZDAb+Ur+CX8hX8Ev5CkNSSvL0D62ts5NjZ37nQPVRLtVdob3jLk6n8ktpNBrMERFMfHoCL83MIHnsOHGIYhRLtXXc5djpU+zYs5s/r/4llvtN2sRJLJm3kJTEJPTDh4tlWSiSut3UxPbvdrL7QJVHqyIXU1g4eVnZvDz7RTSS8jtE9oz7XV2U/VDJnkM/e1UI4E5LM5t3lFH16xGxJAvZUifPn2PXvp+w2+1iyStYO22s3VhMXcM1sfRYZEl1WK1sLi/D4eUVEnE4HFTs3UNXd7dY6hNZUqcu1FBXr/wTU4Pzl2ppuHFdjPtEltTJ8+fczjTodDoCAgIwBgYSYjQSagxEr3UboiJ3Wlqo94ZU/fVG13HCuOnkv/k6xavXUVFUxL5tJVR98T5zkh+ZohpWm5XW9jYx7hNZUlabzXXcabPRoTWTmDCa+JEmjAYtw2RdxTPsPT10K2xOst6Ok94G0XjtNF9uKmTdiQaU3b6eo7Q/yZL6VxxiMHjwXGoQo7rUcL2B1PTZ5L+xgtLC9ewtKaHynRQ00hOseHcDB0u/4kjpRj6ZN4kgcbJKqC4Vmb2Kj3OzeS1zOlMSxxBvDsMcNYuybWtZlBKDOSyE8LAoXpg7j4wkcbY6qC51a+dWPth1mKv3ettIUHgYtT+WU36ltXegJCEN6z1VE9Wl7N2tnL18hZvWXqn2G1Vs2n+U6uO13LI+aM+Xa37jxB9uE1VEdSkAnI+2YUePlfvAxQNbmLX4VZIXLGLJ5v3cvO8+ST28I/U/45fyBhqthfz1Wzn7fSVnvv6UnFgtkjhIIapISWiRJL0Yy2LqK3ksTgpHqwFdaAJLV+UQLw5SiEdSUmgcyREBPOzIOkMk08ZPI9agBa2O0XExWAw61/gQcyrzU55kZKArcuHUgPuuxfnPqz/Ikhrm/vBjchaHSz4jLznCNVmjD2HW3KVUfLiQuKzVVCxbQEJIr5TBksaago/YvjyXFFf6gFPlFXxb24zdAd2tdWz7/Bvct6OSJKFR+H2U9TTpvaJCDh2vFuMBwaDXs+atlcx5dqZY+k9krdT4p8aK0YARagzGYjKJcZ/IkkqfmipGA4bFZCIhbpQY94ksqVHRMSzMnC3GXkcC5j6XQWhwsFjqE1lSALnzsxgTP1qMvcqMyVPInJEuxo9FtlS0JYqVOXlEmy1iySukpkxi7bK3CRwxQiw9Flndz53TFy9QULyBtrvtih+IyMGg1zNlQjIFS5czMtIslmWhWAqgqbWFvb8c5GTNOeqvN9LS3kZXV5dHP5qSJBFgMGAOjyA+No7nU9NIfyaNIA9W6CEeSQH0OBw0t7Zwu7mJjnv3sNvtHkvpdTpCjMFYTJEEB/V/k++x1GBGdqPwJfxSvsKQlPobuNln/GX3nWIAAAAASUVORK5CYII=', 'base64');
function iconPixels(png) { const w=png.readUInt32BE(16),h=png.readUInt32BE(20),parts=[]; let at=8; while(at<png.length){const n=png.readUInt32BE(at),type=png.subarray(at+4,at+8).toString();if(type==='IDAT')parts.push(png.subarray(at+8,at+8+n));at+=n+12;}const bytes=inflateSync(Buffer.concat(parts)),out=Buffer.alloc(w*h*4);let read=0;for(let y=0;y<h;y++){const filter=bytes[read++],row=out.subarray(y*w*4,(y+1)*w*4),prior=y?out.subarray((y-1)*w*4,y*w*4):null;for(let x=0;x<w*4;x++){const left=x>=4?row[x-4]:0,up=prior?.[x]||0,corner=x>=4?(prior?.[x-4]||0):0,value=bytes[read++];if(filter===0)row[x]=value;else if(filter===1)row[x]=(value+left)&255;else if(filter===2)row[x]=(value+up)&255;else if(filter===3)row[x]=(value+Math.floor((left+up)/2))&255;else {const p=left+up-corner,a=Math.abs(p-left),b=Math.abs(p-up),c=Math.abs(p-corner);row[x]=(value+(a<=b&&a<=c?left:b<=c?up:corner))&255;}}}return{w,h,out}; }
const source=iconPixels(await readFile('public/icon-source.png'));
// Remove only the white backdrop connected to the image edge; white lettering stays intact.
const edgePixels=[];for(let x=0;x<source.w;x++)edgePixels.push([x,0],[x,source.h-1]);for(let y=1;y<source.h-1;y++)edgePixels.push([0,y],[source.w-1,y]);const seen=new Set();while(edgePixels.length){const [x,y]=edgePixels.pop(),key=`${x},${y}`,at=(y*source.w+x)*4;if(seen.has(key)||x<0||y<0||x>=source.w||y>=source.h||!source.out[at+3]||Math.min(source.out[at],source.out[at+1],source.out[at+2])<235)continue;seen.add(key);source.out[at+3]=0;edgePixels.push([x-1,y],[x+1,y],[x,y-1],[x,y+1]);}
const bounds=(()=>{let left=source.w,top=source.h,right=-1,bottom=-1;for(let y=0;y<source.h;y++)for(let x=0;x<source.w;x++){const at=(y*source.w+x)*4;if(source.out[at+3]&&Math.min(source.out[at],source.out[at+1],source.out[at+2])<235){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}}return{left,top,width:right-left+1,height:bottom-top+1};})();
function crc(bytes) { let n=0xffffffff; for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);} return (n^0xffffffff)>>>0; }
function chunk(type, data) { const label=Buffer.from(type); const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);label.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([label,data])),data.length+8);return out; }
await mkdir('public/icons', {recursive:true});
for(const size of [16,32,48,128]) {
  const raw=Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const padding=Math.max(1,Math.round(size*.06)),usable=size-padding*2,dx=x-padding,dy=y-padding,at=y*(size*4+1)+1+x*4;
    if(dx>=0&&dy>=0&&dx<usable&&dy<usable){const sx=Math.min(source.w-1,bounds.left+Math.floor(dx*bounds.width/usable)),sy=Math.min(source.h-1,bounds.top+Math.floor(dy*bounds.height/usable)),input=(sy*source.w+sx)*4;for(let c=0;c<4;c++)raw[at+c]=source.out[input+c];}
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
