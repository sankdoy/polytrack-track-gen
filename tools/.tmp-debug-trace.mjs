import zlib from "node:zlib";
if (!globalThis.pako) globalThis.pako = { deflate: d => zlib.deflateSync(Buffer.from(d)), inflate: d => zlib.inflateSync(Buffer.from(d)) };

import {
  imageDataToBinaryMask, keepLargestComponent, extractOuterBoundary,
  thinMaskZhangSuen, trimEndpoints, traceMainPathFromMask,
  simplifyPath, resamplePath, pathToGrid,
} from "../docs/image-track-core.mjs";

// Recreate the image
const W = 640, H = 416;
const data = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) { const p=i*4; data[p]=235; data[p+1]=235; data[p+2]=235; data[p+3]=255; }

function drawLine(img, x0, y0, x1, y1, thickness=5, rgb=[220,20,20]) {
  let x=x0,y=y0,dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,err=dx+dy;
  while(true) {
    for(let py=Math.max(0,y-2);py<=Math.min(img.height-1,y+2);py++)
    for(let px=Math.max(0,x-2);px<=Math.min(img.width-1,x+2);px++) {
      const p=(py*img.width+px)*4; img.data[p]=rgb[0]; img.data[p+1]=rgb[1]; img.data[p+2]=rgb[2]; img.data[p+3]=255;
    }
    if(x===x1&&y===y1) break;
    const e2=2*err; if(e2>=dy){err+=dy;x+=sx;} if(e2<=dx){err+=dx;y+=sy;}
  }
}
drawLine({width:W,height:H,data}, 12, 402, 612, 14, 5, [220,20,20]);

const imageData = { width: W, height: H, data };
const { mask } = imageDataToBinaryMask(imageData, { threshold: 140 });
const largest = keepLargestComponent(mask, W, H);
const boundary = extractOuterBoundary(largest, W, H);
const thinned = thinMaskZhangSuen(boundary, W, H, { maxIterations: 80 });
const trimmed = trimEndpoints(thinned, W, H, { passes: 1 });
const traced = traceMainPathFromMask(trimmed, W, H);
const simplified = simplifyPath(traced, { epsilon: 1.1, closed: false });
const sampled = resamplePath(simplified, { spacing: 2.4, closed: false, minPoints: 72 });

const polyLen = sampled.slice(1).reduce((s,p,i) => s + Math.hypot(p.x-sampled[i].x, p.y-sampled[i].y), 0);
const baseScale = 50 / polyLen;

console.log("traced.length:", traced.length);
console.log("simplified.length:", simplified.length);
console.log("sampled.length:", sampled.length, "polyLen:", polyLen.toFixed(1), "baseScale:", baseScale.toFixed(5));

let scale = baseScale;
for (let i = 0; i < 4; i++) {
  const grid = pathToGrid(sampled, { scale, closed: false });
  const segs = Math.max(0, grid.length - 1);
  const factor = segs > 0 ? 50 / segs : 1;
  console.log(`  iter ${i}: scale=${scale.toFixed(5)} grid.length=${grid.length} segs=${segs}`);
  if (Math.abs(1 - factor) < 0.015) break;
  scale *= factor;
}
