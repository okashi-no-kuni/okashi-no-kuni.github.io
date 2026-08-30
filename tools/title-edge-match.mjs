/* アウトペイントの 外周だけを、原本の ふちの 色に 合わせる。
 *
 * 画像モデルは まん中も 描きなおすので、外周は「モデルが 描いた まん中」に
 * 合わせて 塗られている。そこへ 原本を 貼りなおすと 色が ずれ、
 * 額縁のような 継ぎ目に なる（実測で 外が 一様に 明るかった）。
 *
 * **まん中 941x1672 には 1pxも さわらない。**外がわだけ 直す。
 * ふちの 各点で「モデルの 外がわ」と「原本の ふち」の さを はかり、
 * その ぶんを 引く。境めで いちばん 強く、外へ いくほど 弱く。
 *
 *   node tools/title-edge-match.mjs <入力png> <出力png>
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
const SRC = resolve(process.argv[2]), OUT = resolve(process.argv[3]);
const ORIG = resolve('art/title/title_full.webp');
const MW=1250, MH=2100, ML=155, MT=420, IW=941, IH=1672, FADE=420, BAND=8;

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--allow-file-access-from-files'] });
const p = await b.newPage();
await p.goto('file:///home/user/okashi-no-kuni.github.io/');
const png = await p.evaluate(async (K) => {
  const load = async s => { const i=new Image(); i.src='file://'+s; await i.decode(); return i; };
  const src = await load(K.SRC), org = await load(K.ORIG);
  const c=document.createElement('canvas'); c.width=K.MW; c.height=K.MH;
  const g=c.getContext('2d',{willReadFrequently:true}); g.imageSmoothingEnabled=false; g.drawImage(src,0,0);
  const oc=document.createElement('canvas'); oc.width=K.IW; oc.height=K.IH;
  const og=oc.getContext('2d',{willReadFrequently:true}); og.imageSmoothingEnabled=false; og.drawImage(org,0,0);
  const IM=g.getImageData(0,0,K.MW,K.MH), D=IM.data, O=og.getImageData(0,0,K.IW,K.IH).data;
  const at=(d,w,x,y)=>((y*w+x)<<2);

  /* ふちに そって「外 − 原本」の さを はかる。BAND px ぶん ならす */
  const diffTop=[], diffL=[], diffR=[];
  for (let x=0; x<K.IW; x++){
    const s=[0,0,0];
    for (let k=0;k<K.BAND;k++){ const i=at(D,K.MW, K.ML+x, K.MT-1-k);
      s[0]+=D[i]; s[1]+=D[i+1]; s[2]+=D[i+2]; }
    const j=at(O,K.IW,x,0);
    diffTop.push([s[0]/K.BAND-O[j], s[1]/K.BAND-O[j+1], s[2]/K.BAND-O[j+2]]);
  }
  for (let y=0; y<K.IH; y++){
    const sl=[0,0,0], sr=[0,0,0];
    for (let k=0;k<K.BAND;k++){
      const il=at(D,K.MW, K.ML-1-k, K.MT+y); sl[0]+=D[il]; sl[1]+=D[il+1]; sl[2]+=D[il+2];
      const ir=at(D,K.MW, K.ML+K.IW+k, K.MT+y); sr[0]+=D[ir]; sr[1]+=D[ir+1]; sr[2]+=D[ir+2];
    }
    const jl=at(O,K.IW,0,y), jr=at(O,K.IW,K.IW-1,y);
    diffL.push([sl[0]/K.BAND-O[jl], sl[1]/K.BAND-O[jl+1], sl[2]/K.BAND-O[jl+2]]);
    diffR.push([sr[0]/K.BAND-O[jr], sr[1]/K.BAND-O[jr+1], sr[2]/K.BAND-O[jr+2]]);
  }
  /* ふちに そって なめらかに（±24px の 移動平均）。局所の ノイズを 拾わない */
  const smooth = (a, r) => a.map((_, i) => {
    const s=[0,0,0]; let n=0;
    for (let k=-r;k<=r;k++){ const j=i+k; if(j<0||j>=a.length) continue;
      s[0]+=a[j][0]; s[1]+=a[j][1]; s[2]+=a[j][2]; n++; }
    return [s[0]/n, s[1]/n, s[2]/n];
  });
  const dT=smooth(diffTop,24), dL=smooth(diffL,24), dR=smooth(diffR,24);
  const ss = u => u*u*(3-2*u);

  for (let y=0; y<K.MH; y++){
    for (let x=0; x<K.MW; x++){
      const inside = x>=K.ML && x<K.ML+K.IW && y>=K.MT && y<K.MT+K.IH;
      if (inside) continue;                                  // **まん中は さわらない**
      const cx=Math.min(K.ML+K.IW-1, Math.max(K.ML,x)), cy=Math.min(K.MT+K.IH-1, Math.max(K.MT,y));
      const dist=Math.hypot(x-cx, y-cy);
      if (dist>=K.FADE) continue;
      const w = 1 - ss(dist/K.FADE);
      let d0;
      if (cy===K.MT && y<K.MT)            d0 = dT[cx-K.ML];   // 上
      else if (cx===K.ML && x<K.ML)       d0 = dL[cy-K.MT];   // 左
      else if (cx===K.ML+K.IW-1)          d0 = dR[cy-K.MT];   // 右
      else                                d0 = dT[cx-K.ML];
      const i=at(D,K.MW,x,y);
      for (let k=0;k<3;k++) D[i+k] = Math.max(0, Math.min(255, Math.round(D[i+k] - d0[k]*w)));
    }
  }
  g.putImageData(IM,0,0);
  return c.toDataURL('image/png');
}, { SRC, ORIG, MW, MH, ML, MT, IW, IH, FADE, BAND });
writeFileSync(OUT, Buffer.from(png.split(',')[1],'base64'));
console.log('外周の 色合わせ ずみ:', OUT);
await b.close();
