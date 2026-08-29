/* シルエットが かさなる組を さがす。
 *
 * 「カメがいるから マグマガメは 被らない？」と 指摘されて 作りました。
 * 実際 目で 20体 見て「そろった」と 報告したあと、この検査を かけたら
 * 亀・トカゲ・ゴーレム・ドラゴンの 4組が 被っていました。
 * 目では かならず 見おとします。
 *
 * つかいかた:
 *   node tools/check-dup.mjs                  … 形も色も近い組を ぜんぶ
 *   node tools/check-dup.mjs camel oni …      … その子が からむ組だけ
 *
 * **これは 合否を 出しません。**丸い おかしは もともと 似ていて
 * （クッキーとドーナツなど）、直しようが ないためです。
 * キャラを 足したら 走らせて、**足した子が からむ組だけ** 見てください。
 *
 * ものさしは 2つ。どちらも 近いときだけ ほんとうに 見わけられません。
 *   形 … 32x32 に 縮めた すきとおり具合の かさなり（IoU）
 *   色 … 中みの 平均色を 色あい・あざやかさ・明るさ に 分けて くらべる
 *
 * **平均RGBの へだたりだけでは だめでした。**灰いろの ネコと うすい茶いろの
 * クマは RGBでは 近いのに、見れば ひとめで ちがいます。あざやかさが
 * ちがうためです。だから 色あい(H)・あざやかさ(S)・明るさ(L)の 3つで 見ます。
 *
 * 平均だけでも まだ だめでした。パンダは 白と すみいろなので、
 * ならすと 灰いろに なって 灰いろの ネコと 同じに 見えます。
 * だから **明るさの ばらつき** も くらべます。
 * ばらつきが ちがう＝ もようの ある子と 無い子で、見わけられます。
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

const N = 32;          // これ以上 細かくすると 線の ゆらぎを ひろってしまう
const IOU = 0.86;      // これ未満は 丸い子どうしの ただの かさなり
/* 色が 近い、と 言えるのは この ぜんぶを みたすとき */
const dH = 30;         // 色あいの ちがい（度）。これ以上 はなれれば 別の色に 見える
const dS = 0.12;       // あざやかさの ちがい。灰いろ と 色つき は ここで 分かれる
const dL = 0.12;       // 明るさの ちがい
const dV = 0.06;       // 明るさの ばらつきの ちがい（パンダのような もようの子を 分ける）

const dir = resolve('art/sprites');
const files = readdirSync(dir).filter(n => /\.png$/i.test(n));
if (!files.length){ console.error('✗ art/sprites/ に 絵が ありません'); process.exit(1); }

const b = await chromium.launch();
const pg = await b.newPage();
const data = files.map(n => 'data:image/png;base64,' + readFileSync(resolve(dir, n)).toString('base64'));
const masks = await pg.evaluate(async ({ data, N }) => {
  const out = [];
  for (const d of data){
    const im = new Image(); im.src = d; await im.decode();
    const c = document.createElement('canvas'); c.width = N; c.height = N;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0, N, N);
    const p = g.getImageData(0, 0, N, N).data;
    const m = []; let r = 0, gg = 0, bb = 0, cnt = 0;
    for (let i = 0; i < N*N; i++){
      const a = p[i*4+3] > 40;
      m.push(a ? 1 : 0);
      if (a){ r += p[i*4]; gg += p[i*4+1]; bb += p[i*4+2]; cnt++; }
    }
    const col = cnt ? [r/cnt|0, gg/cnt|0, bb/cnt|0] : [0,0,0];
    /* 明るさの ばらつき。まっ白と まっ黒の子は 大きく、一色の子は 小さい */
    const ml = (col[0]*0.30 + col[1]*0.59 + col[2]*0.11) / 255;
    let dev = 0;
    for (let i = 0; i < N*N; i++){
      if (p[i*4+3] <= 40) continue;
      dev += Math.abs((p[i*4]*0.30 + p[i*4+1]*0.59 + p[i*4+2]*0.11)/255 - ml);
    }
    out.push({ m, col, dev: cnt ? dev/cnt : 0 });

  }
  return out;
}, { data, N });
await b.close();

const iou = (a, b2) => {
  let i = 0, u = 0;
  for (let k = 0; k < a.length; k++){ if (a[k] && b2[k]) i++; if (a[k] || b2[k]) u++; }
  return u ? i/u : 0;
};
/* 平均色を 色あい(0〜360)・あざやかさ(0〜1)・明るさ(0〜1) に なおす */
function toHsl([r, g, b]){
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2*l - 1));
  let h = 0;
  if (d !== 0){
    if (mx === r)      h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else               h = 60 * ((r - g) / d + 4);
  }
  return [(h + 360) % 360, s, l];
}
const hueGap = (a, b2) => { const d = Math.abs(a - b2); return d > 180 ? 360 - d : d; };

const key = n => n.replace(/\.png$/i, '');
const rows = [];
for (let i = 0; i < files.length; i++) for (let j = i+1; j < files.length; j++){
  const sh = iou(masks[i].m, masks[j].m);
  if (sh < IOU) continue;
  const A = toHsl(masks[i].col), B = toHsl(masks[j].col);
  const gs = Math.abs(A[1] - B[1]), gl = Math.abs(A[2] - B[2]);
  /* あざやかさが うすい どうしは 色あいが あてに ならない（灰色に 色あいは ない）ので、
     どちらも うすいときだけ 色あいの ちがいを 見のがす */
  const bothDull = A[1] < 0.15 && B[1] < 0.15;
  const gh = bothDull ? 0 : hueGap(A[0], B[0]);
  const gv = Math.abs(masks[i].dev - masks[j].dev);
  if (gh > dH || gs > dS || gl > dL || gv > dV) continue;
  rows.push({ a: key(files[i]), b: key(files[j]), iou: +sh.toFixed(3),
              h: Math.round(gh), s: gs.toFixed(2), l: gl.toFixed(2), v: gv.toFixed(2) });
}
rows.sort((x, y) => y.iou - x.iou);

const only = process.argv.slice(2);
const show = only.length ? rows.filter(r => only.includes(r.a) || only.includes(r.b)) : rows;
console.log(`絵 ${files.length}枚。形も色も近い組: ${rows.length}`
          + (only.length ? `（うち ${only.join(' ')} が からむ組: ${show.length}）` : ''));
for (const r of show)
  console.log(`  形 ${String(r.iou).padEnd(5)}  色あい${String(r.h).padStart(3)}°  あざやかさ${r.s}  明るさ${r.l}  ばらつき${r.v}   ${r.a} ↔ ${r.b}`);
if (!show.length) console.log('  なし ✅');
