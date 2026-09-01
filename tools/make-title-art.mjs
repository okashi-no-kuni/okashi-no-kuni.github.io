/* 表紙の 原画から、ゲームが 読む WebP を 作る。
 *
 *   node tools/make-title-art.mjs                 # v2（いまの 候補）
 *   node tools/make-title-art.mjs --q 0.90        # 品質を 変える
 *
 * **原画は 1バイトも さわりません。**読むだけで、出すのは 別の ファイルです。
 *
 *   art/title/title_v2_source.png   853x1844・RGB（支給された もの）
 *      ↓
 *   art/title/title_v2.webp         おなじ 853x1844・品質 0.92
 *
 * ---- ここで まちがえやすい ところ ----
 *
 * **大きさを 変えないこと。**ちぢめると 題字（魔法の おかしの国）の
 * 金の ふちが つぶれます。原画と 同じ 画素数の まま、圧縮だけ かけます。
 *
 * **品質を 下げすぎないこと。**空の グラデーションに 帯（バンディング）が
 * 出ます。0.92 で 2.4MB → 300KB 前後に なるので それで じゅうぶんです。
 *
 * さいごに **原画と 見くらべて、色が ずれていないか**を 数字で 出します
 * （チャンネルごとの 平均の ちがい）。3 を こえたら 品質を 上げること。
 */
import { readFileSync, writeFileSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { launch } from './_pw.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'art/title/title_v2_source.png';
const OUT = 'art/title/title_v2.webp';
const qi = process.argv.indexOf('--q');
const Q = qi > 0 ? parseFloat(process.argv[qi + 1]) : 0.92;

const b64 = readFileSync(resolve(root, SRC)).toString('base64');
const b = await launch();
const pg = await b.newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));

const out = await pg.evaluate(async ({ b64, Q }) => {
  const load = src => new Promise((ok, ng) => {
    const im = new Image(); im.onload = () => ok(im); im.onerror = ng; im.src = src;
  });
  const im = await load('data:image/png;base64,' + b64);
  const W = im.naturalWidth, H = im.naturalHeight;

  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0);                       // **1:1。ちぢめない**
  const url = c.toDataURL('image/webp', Q);

  /* 出した webp を 読みなおして 原画と くらべる。
     見た目で「だいじょうぶ そう」では 分からないので 数字で 見る */
  const im2 = await load(url);
  const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
  const g2 = c2.getContext('2d', { willReadFrequently: true });
  g2.drawImage(im2, 0, 0);
  const a = g.getImageData(0, 0, W, H).data, b2 = g2.getImageData(0, 0, W, H).data;
  let sum = 0, worst = 0, n = 0;
  for (let i = 0; i < a.length; i += 4 * 7){       // 7画素に 1つで じゅうぶん
    for (let k = 0; k < 3; k++){
      const dv = Math.abs(a[i + k] - b2[i + k]);
      sum += dv; if (dv > worst) worst = dv; n++;
    }
  }
  return { W, H, w2: im2.naturalWidth, h2: im2.naturalHeight,
           diff: sum / n, worst, webp: url.slice(23) };
}, { b64, Q });

await b.close();
if (errs.length){ console.error('JSエラー:\n' + errs.join('\n')); process.exit(1); }

if (out.w2 !== out.W || out.h2 !== out.H){
  console.error('✗ 大きさが 変わりました: ' + out.W + 'x' + out.H + ' → ' + out.w2 + 'x' + out.h2);
  process.exit(1);
}
writeFileSync(resolve(root, OUT), Buffer.from(out.webp, 'base64'));

const kb = p => (statSync(resolve(root, p)).size / 1024).toFixed(0) + 'KB';
console.log('もと ' + SRC + '  ' + out.W + 'x' + out.H + '  ' + kb(SRC) + '（さわっていません）');
console.log('出力 ' + OUT + '  ' + out.w2 + 'x' + out.h2 + '  ' + kb(OUT) + '  品質 ' + Q);
console.log('色の ちがい  平均 ' + out.diff.toFixed(2) + ' / いちばん大きいところ ' + out.worst
          + (out.diff > 3 ? '   ✗ 品質を 上げること' : '   ✅'));
console.log('\n**CSS の 2か所を あわせること**');
console.log('  #titleArt2 の aspect-ratio / わりざん : ' + out.W + ' / ' + out.H
          + '（= ' + (out.H / out.W).toFixed(6) + ' 倍）');
if (out.diff > 3) process.exit(1);
