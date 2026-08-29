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
 *   形   … 32x32 に 縮めた すきとおり具合の かさなり（IoU）
 *   色差 … 中みの 平均色の へだたり（0〜441）
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

const N = 32;          // これ以上 細かくすると 線の ゆらぎを ひろってしまう
const IOU = 0.86;      // これ未満は 丸い子どうしの ただの かさなり
const COL = 40;        // 色が これより はなれていれば 小さくても 見わけられる

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
    out.push({ m, col: cnt ? [r/cnt|0, gg/cnt|0, bb/cnt|0] : [0,0,0] });
  }
  return out;
}, { data, N });
await b.close();

const iou = (a, b2) => {
  let i = 0, u = 0;
  for (let k = 0; k < a.length; k++){ if (a[k] && b2[k]) i++; if (a[k] || b2[k]) u++; }
  return u ? i/u : 0;
};
const dCol = (a, b2) => Math.round(Math.hypot(a[0]-b2[0], a[1]-b2[1], a[2]-b2[2]));

const key = n => n.replace(/\.png$/i, '');
const rows = [];
for (let i = 0; i < files.length; i++) for (let j = i+1; j < files.length; j++){
  const sh = iou(masks[i].m, masks[j].m);
  if (sh < IOU) continue;
  const co = dCol(masks[i].col, masks[j].col);
  if (co > COL) continue;
  rows.push({ a: key(files[i]), b: key(files[j]), iou: +sh.toFixed(3), col: co });
}
rows.sort((x, y) => y.iou - x.iou);

const only = process.argv.slice(2);
const show = only.length ? rows.filter(r => only.includes(r.a) || only.includes(r.b)) : rows;
console.log(`絵 ${files.length}枚。形も色も近い組: ${rows.length}`
          + (only.length ? `（うち ${only.join(' ')} が からむ組: ${show.length}）` : ''));
for (const r of show) console.log(`  形 ${r.iou}  色差 ${String(r.col).padStart(3)}   ${r.a} ↔ ${r.b}`);
if (!show.length) console.log('  なし ✅');
