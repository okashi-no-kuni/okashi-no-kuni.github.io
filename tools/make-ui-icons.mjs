/* UIアイコンを 1まいの 原画から 切り出す。
 *
 *   node tools/make-ui-icons.mjs
 *
 * 原画（art/ui/_reference/phase1_source.png）は **さわらないこと**。
 * 手で 切らないこと ——絵を さしかえた ときに 作りなおせなく なります
 * （make-icons.mjs・make-welcome-art.mjs と 同じ きまり）。
 *
 * 原画は 4つの アイコンが 1まいに ならんだ もので、背景は 完全に 透過です
 * （実測：四すみも まん中も rgba(0,0,0,0)）。だから **抜く 作業は 要りません**。
 * やる ことは「どこに 何が あるか」を 見つけて 切るだけ です。
 *
 * 見つけかたは **連結成分**（つながった 画素の かたまり）。
 * まん中で 4つに 切っては いけません ——王冠の リボンと ベルが
 * たてに かさなって いて、境めを またぎます（実測で 76画素）。
 *
 * 音ON と 音OFF だけは **同じ 大きさの わく**で 切ります。
 * 別々の わくで 切ると ベルの いちが ずれて、押すたびに ガタつきます。
 */
import { launch } from './_pw.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = resolve(root, 'art/ui/_reference/phase1_source.png');
const OUT  = resolve(root, 'art/ui');

/* 原画の 中みが 変わったら すぐ わかるように、大きさを 覚えておく */
const SRC_W = 1536, SRC_H = 1024;

/* 出す もの。どの かたまりを どの 名前に するかは
   **中心の いち**（左上・右上・左下・右下）で 決めます */
const PLAN = [
  { key:'nav_dex',   cell:'LT', name:'図鑑（王冠の 紋章）' },
  { key:'nav_guide', cell:'RT', name:'ガイド（ひらいた 魔法書）' },
  { key:'snd_on',    cell:'LB', name:'音ON（ベル）',  pair:'snd' },
  { key:'snd_off',   cell:'RB', name:'音OFF（ベル＋斜線）', pair:'snd' },
];

const N    = 128;      // 出す 大きさ。**256は 要りません** ——画面で いちばん 大きいのは 38px
const PAD  = 0.955;    // ふちに 3%ほど すき間。0 に すると ブラウザの 拡大で ふちが 欠ける
const Q    = 0.92;     // WebP の 品質（表紙・導入画面と そろえる）
/* 音ON/OFF を 切る 共通の わく。2つの わく（466x412 / 469x415）より
   すこし 大きく とって、どちらも 同じ 倍率に なるように する */
const PAIR_W = 480, PAIR_H = 432;

if (!existsSync(SRC)){ console.error('✗ 原画が ありません: ' + SRC); process.exit(1); }
mkdirSync(OUT, { recursive:true });

const b = await launch();
const pg = await (await b.newContext()).newPage();
await pg.goto('about:blank');
const src = 'data:image/png;base64,' + readFileSync(SRC).toString('base64');

const res = await pg.evaluate(async ([s, PLAN, N, PAD, Q, PAIR_W, PAIR_H, SRC_W, SRC_H]) => {
  const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  if (im.width !== SRC_W || im.height !== SRC_H)
    return { err: '原画の 大きさが ちがいます: ' + im.width + 'x' + im.height };
  const W = im.width, H = im.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently:true }); g.drawImage(im, 0, 0);
  const D = g.getImageData(0, 0, W, H).data;

  /* 背景が ほんとうに 透過か（抜く 処理を 足さなくて よいか）を 毎回 たしかめる */
  for (const [x, y] of [[2,2],[W-3,2],[2,H-3],[W-3,H-3],[W>>1,H>>1]])
    if (D[((y*W+x)<<2)+3] !== 0) return { err:'背景が 透過では ありません（' + x + ',' + y + '）' };

  /* つながった 画素の かたまりを ぜんぶ 拾う */
  const TH = 16, lab = new Int32Array(W*H).fill(-1), st = new Int32Array(W*H), comps = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const p = y*W + x; if (lab[p] >= 0 || D[(p<<2)+3] < TH) continue;
    let sp = 0; st[sp++] = p; lab[p] = comps.length;
    let x0 = x, y0 = y, x1 = x, y1 = y, n = 0;
    while (sp > 0){
      const q = st[--sp], qx = q % W, qy = (q / W) | 0; n++;
      if (qx < x0) x0 = qx; if (qx > x1) x1 = qx;
      if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
        const nx = qx+dx, ny = qy+dy; if (nx<0||ny<0||nx>=W||ny>=H) continue;
        const np = ny*W + nx; if (lab[np] >= 0 || D[(np<<2)+3] < TH) continue;
        lab[np] = lab[p]; st[sp++] = np;
      }
    }
    comps.push({ n, box:[x0,y0,x1,y1] });
  }

  /* かたまりを 4つの ますに ふりわけ、わくを 足しあわせる。
     きらめきや 音の わっかは 本体と つながって いないので、こう しないと 切れる */
  const cell = {};
  for (const cp of comps){
    if (cp.n < 200) continue;                       // ごみ（数画素）は 捨てる
    const cx = (cp.box[0]+cp.box[2])/2, cy = (cp.box[1]+cp.box[3])/2;
    const k = (cx < W/2 ? 'L' : 'R') + (cy < H/2 ? 'T' : 'B');
    if (!cell[k]) cell[k] = cp.box.slice();
    else { cell[k][0] = Math.min(cell[k][0], cp.box[0]); cell[k][1] = Math.min(cell[k][1], cp.box[1]);
           cell[k][2] = Math.max(cell[k][2], cp.box[2]); cell[k][3] = Math.max(cell[k][3], cp.box[3]); }
  }

  const out = [];
  for (const p of PLAN){
    const box = cell[p.cell];
    if (!box) return { err: p.cell + ' に かたまりが ありません' };
    /* 音ON/OFF は 共通の わく。ほかは 自分の わくを そのまま */
    const cw = p.pair ? PAIR_W : box[2]-box[0]+1;
    const ch = p.pair ? PAIR_H : box[3]-box[1]+1;
    const cx = (box[0]+box[2])/2, cy = (box[1]+box[3])/2;
    const o = document.createElement('canvas'); o.width = N; o.height = N;
    const og = o.getContext('2d', { willReadFrequently:true });
    og.imageSmoothingQuality = 'high';
    const k = Math.min(N/cw, N/ch) * PAD;
    og.drawImage(im, cx-cw/2, cy-ch/2, cw, ch, (N-cw*k)/2, (N-ch*k)/2, cw*k, ch*k);

    /* 出したあとに たしかめる：ふちに ついて いないか・中みが 小さすぎないか */
    const Q2 = og.getImageData(0,0,N,N).data;
    let n = 0, bx0 = N, by0 = N, bx1 = -1, by1 = -1, edge = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
      if (Q2[((y*N+x)<<2)+3] < 16) continue;
      n++; if (x<bx0) bx0=x; if (x>bx1) bx1=x; if (y<by0) by0=y; if (y>by1) by1=y;
      if (x===0||y===0||x===N-1||y===N-1) edge++;
    }
    out.push({ key:p.key, name:p.name, src:box, fill:+(n/(N*N)*100).toFixed(1),
               box:[bx0,by0,bx1,by1], w:bx1-bx0+1, h:by1-by0+1, edge,
               data:o.toDataURL('image/webp', Q) });
  }
  return { out };
}, [src, PLAN, N, PAD, Q, PAIR_W, PAIR_H, SRC_W, SRC_H]);

await b.close();
if (res.err){ console.error('✗ ' + res.err); process.exit(1); }

let bad = 0;
console.log('原画 ' + SRC_W + 'x' + SRC_H + '（' + statSync(SRC).size.toLocaleString() + ' バイト・さわらない）\n');
console.log('名前          原画の わく              うめ具合  中みの 大きさ  ふち  重さ');
const pairBox = {};
for (const o of res.out){
  writeFileSync(resolve(OUT, o.key + '.webp'), Buffer.from(o.data.split(',')[1], 'base64'));
  const kb = Math.round(statSync(resolve(OUT, o.key + '.webp')).size / 1024);
  console.log(o.key.padEnd(13) + JSON.stringify(o.src).padEnd(25) +
    String(o.fill + '%').padEnd(10) + (o.w + 'x' + o.h).padEnd(15) +
    String(o.edge).padEnd(6) + kb + 'KB');
  /* ふちに ついて いたら、ブラウザで 拡大した ときに そこが 切れる */
  if (o.edge > 0){ console.log('  ✗ ' + o.key + ' が わくの ふちに ついて います'); bad++; }
  /* 小さすぎると ボタンの 中で ぽつんと 見える */
  if (o.fill < 25){ console.log('  ✗ ' + o.key + ' が 小さすぎます（' + o.fill + '%）'); bad++; }
  if (o.key.startsWith('snd_')) pairBox[o.key] = o.box;
}

/* 音ON/OFF は 同じ いちに 出ないと、押すたびに ベルが 動いて 見える */
if (pairBox.snd_on && pairBox.snd_off){
  const d = pairBox.snd_on.map((v, i) => Math.abs(v - pairBox.snd_off[i]));
  const mx = Math.max(...d);
  console.log('\n音ON と 音OFF の わくの ずれ: ' + JSON.stringify(d) + '（いちばん 大きい ずれ ' + mx + 'px）');
  if (mx > 4){ console.log('  ✗ ずれすぎです。押すと ベルが 動いて 見えます'); bad++; }
}

console.log(bad ? '\n✗ ' + bad + '件 だめでした' : '\n検査 OK ✅');
process.exit(bad ? 1 : 0);
