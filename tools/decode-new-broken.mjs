import zlib from "node:zlib";
globalThis.pako = { deflate: d => zlib.deflateSync(Buffer.from(d)), inflate: d => zlib.inflateSync(Buffer.from(d)) };
import { decodePolyTrack1 } from "./polytrack1/lib.mjs";

const NEW_BROKEN = "PolyTrack14pdVUdssrqDE8XCMhDsUkz58ODIEZMgxC4rfj7y3iuUpRl6p10q6c7aLPVxotGbTT4NVjSwtqYqYxHLhAFdfIQgSCaRUeu8VoSSsQHckckcgckYfzmJb5frm56SnpPCN0CEElfvb9fvcax8tBWfwT8bD5fYgfDChVwoGyGeZw5merfC9aueTrB2Ee93zmXUQnzGXpnzkao48iCFS7er5Dh54AM5zo05FHvWL9fC3EhposBz7lfMfNGZeqbL43sEncpRR8IEuQwqDbBU3phqlef7vhXynlSVS9z2v6gHprqdZK0hqeKinhHefuU2zDXYDHCkWddwn2adz4Lx9e70HElBoCbXeT3uS7z75RsOOY5peQ3ua1lx98SWHXsefrwQtaemru6FKBB1rrQ16PUgPQf7NAe5WG9QLG4NKhQ40lbDYHlWpzft2ix9weGCHAlpl76wdg6AtARZ2rCgdWalNf3yLu3Bf9tYWQvs4sfS2XQ55D9Rf8eNY7mWfhwfsx2FnMEbvRmPiNtfjUa3pPJKJBW3VElKvKQRDKeGh0f1bNkKG4z4vXZD6ujgRpx0jjeiJxhlqveNV2ujBghDsCvtIFIGbEJyWVyRxRYBOTceP1goxXuFWZSVmbKVuGKVCPQZWuypQqy6BavE4AfIwpfB2qacqQLatTb26ZFer9bQRPNuh7QYcyjP1NSpbERhDGf7lKyq29eD54C3DW5PsoensImQHwtuHqfwLF7WfiuD6SqGki2xrO5ICoAfBW9mosCF5Lvtf485W5myn4gQATfzur5JyJe35FRXfeKdyae9ZMTcb9Vgy9oEUJgsTUjjRBaNnQL79FXysIqRao423bxx7ujbLjb5vEUcTks290ippJeDXsk1eOgSUD5qEYbtfuML3iaFneoolnFaunR9FPVNLWeSFFRfCFZ8Bdf0FZpjRb4eotzTUpBF6PdVkmeYk24KAabowZyoyNRch8GMlShfZ8xrvBevg5faqfTOiPeeea9OQ4Js5gebKZKIZb0hNHpSrlnFHHVEeZAkjnwx6iNI4aWnUuaJ2CrfzLUb4fkU1fYsRrWLSNK5Nh8Cfu4sY4puvRIgqzlQfW0AIHVleqrH8CFJmm92M3hTYR8QcvjQEfKPxvwfVe2KP7jUSVPPqYfJfrhpurZzhxH92VlZLyOWafwebdn3emn23en07f5PGFnx4xtVJdlCvXqh7c0ciGdMk3qXUD8j1ADnSL3wXDVh1dS7ukwWXKm0s87Pb7JkkhbSHkwfOufJwTPRgbpfCcXaHueZkR9MygWNegkzcfgzNwaEGMa7VXRfe9127vDUNkRwAK7i5YrimV4gTZfhI8hh22kxM5LEckFweqR4bgOTunNDy1kZxxlx2xgJ22poByN4w1F6af2kBB1xp2glDiWUNdKaKUC8nFpERfbR1LDheDvFmwjC35q4zwSJXJJwh8Da7BHzelgyQBalPJgfsSU5aJCDZ3eo7kCfkhIvzTjsEX2xNIMHgNj5V9huGlsJwLw20ecF8tAMmLEfdMfl4EskAGlMcyGXPToiKl8VXN7deh99nvgMFUejW71ASlQShZNabocxuTys4CbOrgbrgIheizagFQ3VKAz90xDDrDtcTwphuorpKg4JmJFdCk1a1px5AffbQhSryH1e0SoeybUcmfGB2zohAvVW2GzN8vYtmGGPeP5dglvUehPREM8vsw4n8I9ie4x70poJJMC0HmyhHkcTTIfNh81JAdaY5K88vN9heaBkTg10ZIoEDEmm2pt9TAdJel3fYA5wBlMQqCieluYqhKoq6qbGk2ZKbplgYeEVDrshfMy1OFfKlFHe1RfH7zRee54G0rwah6xXaEUiPPitQ3THLGweSjfRqOyxuJ5OCkcpKzy8fkJZqFU7kNtWWvQULbuCR1jQ9T06shKiCfE14lnLLsb9fOemEeb";

const FIXED = "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";

function count(parts) {
  const c = {};
  for (const p of parts) c[p.blockType] = (c[p.blockType]||0)+1;
  return c;
}

const nb = decodePolyTrack1(NEW_BROKEN);
const f = decodePolyTrack1(FIXED);

console.log("=== NEW BROKEN ===");
const bc = count(nb.parts);
for (const [t,n] of Object.entries(bc).sort((a,b)=>+a[0]-+b[0])) console.log(`  type ${t}: ${n}`);
console.log(`Total: ${nb.parts.length}`);

// Road bounding box
const roadNB = nb.parts.filter(p => p.blockType === 25).map(p => ({gx:p.x/4, gy:p.z/4}));
let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
for (const {gx,gy} of roadNB) { minX=Math.min(minX,gx);maxX=Math.max(maxX,gx);minY=Math.min(minY,gy);maxY=Math.max(maxY,gy); }
console.log(`Road bbox: x=[${minX},${maxX}] y=[${minY},${maxY}]`);

// Connectivity
const roadSet = new Set(roadNB.map(p => p.gx+','+p.gy));
const vis = new Set();
const comps = [];
for (const k of roadSet) {
  if (vis.has(k)) continue;
  const q=[k]; vis.add(k); let sz=0;
  while(q.length) {
    const c=q.shift(); sz++;
    const [x,y]=c.split(',').map(Number);
    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) { const nk=(x+dx)+','+(y+dy); if(roadSet.has(nk)&&!vis.has(nk)){vis.add(nk);q.push(nk);} }
  }
  comps.push(sz);
}
console.log(`Road connected components: ${comps.length}, sizes: ${comps.join(',')}`);

console.log("\n=== FIXED ===");
const fc = count(f.parts);
for (const [t,n] of Object.entries(fc).sort((a,b)=>+a[0]-+b[0])) console.log(`  type ${t}: ${n}`);
console.log(`Total: ${f.parts.length}`);

// ASCII map of new broken mid-section
const allPartsNB = new Map(nb.parts.map(p => [p.x/4+','+(p.z/4), p.blockType]));
const midY = Math.round((minY+maxY)/2);
console.log(`\nNew broken - mid-track slice (y=${midY-5}..${midY+5}, x=${minX-1}..${maxX+1}):`);
for (let gy=midY-5; gy<=midY+5; gy++) {
  let row = `y=${String(gy).padStart(4)}: `;
  for (let gx=minX-1; gx<=maxX+1; gx++) {
    const t = allPartsNB.get(gx+','+gy);
    if (t===25) row+='R'; else if(t===10) row+='b'; else if(t===11) row+='L'; else if(t===12) row+='r'; else row+='.';
  }
  console.log(row);
}
