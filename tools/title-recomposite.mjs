/* アウトペイントの 候補画像に、**原本を 最後に 機械で 上書きしなおす**。
 *
 * AIに「まん中を さわるな」と 期待する のは やめる、という 方針。
 * 外がわだけ 作らせて、まん中 941x1672 は こちらで 貼りなおす。
 * こうすれば AIが 勝手に 描きなおしても、最終ファイルでは 原本が 100% もどる。
 *
 * つかいかた:
 *   node tools/title-recomposite.mjs <候補png> [出力png]
 *   node tools/title-recomposite.mjs --self-test     # 仕組みの 動作確認
 *
 * やること:
 *   ① 候補（1250x2100）を 読む
 *   ② そのうえに 原本 941x1672 を (155,420) に **等倍で** 上書き
 *   ③ 出力を 読みなおして、まん中を 原本と 画素比較
 *      different pixels = 0 / max channel difference = 0 で 合格
 *
 * 合成は Chromium の canvas（sharp が 無いため）。
 * **imageSmoothingEnabled=false**。等倍なので 補間させない。
 * 貼る前に clearRect する。原本に αが あっても 完全に 置きかわる ように。
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, existsSync, copyFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

const MW = 1250, MH = 2100, ML = 155, MT = 420, IW = 941, IH = 1672;
const ORIG = resolve('art/title/title_full.webp');
const args = process.argv.slice(2);
const selfTest = args.includes('--self-test');
const outPath = resolve(args[1] || 'art/title/_work/title_outpaint_final_1250x2100.png');
let candPath = args[0] && !args[0].startsWith('--') ? resolve(args[0]) : null;

if (!existsSync(ORIG)) { console.log('✗ 原本が ない:', ORIG); process.exit(1); }

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium',
                                  args:['--allow-file-access-from-files'] });
const page = await b.newPage();
await page.goto('file://' + resolve('index.html').replace(/index\.html$/, ''));

/* --- 自己テスト用: まん中を わざと 塗りつぶした 候補を つくる --- */
if (selfTest){
  const tmp = resolve('art/title/_work/_selftest_candidate.png');
  mkdirSync(dirname(tmp), { recursive:true });
  const png = await page.evaluate(async (K) => {
    const c = document.createElement('canvas'); c.width = K.MW; c.height = K.MH;
    const g = c.getContext('2d');
    g.fillStyle = '#3366ff'; g.fillRect(0, 0, K.MW, K.MH);          // 外がわ
    g.fillStyle = '#ff0000'; g.fillRect(K.ML, K.MT, K.IW, K.IH);    // まん中を こわす
    return c.toDataURL('image/png');
  }, { MW, MH, ML, MT, IW, IH });
  writeFileSync(tmp, Buffer.from(png.split(',')[1], 'base64'));
  candPath = tmp;
  console.log('自己テスト: まん中を まっ赤に 塗った 候補を つくって 通します\n');
}

if (!candPath){
  console.log('つかいかた: node tools/title-recomposite.mjs <候補png> [出力png]');
  console.log('            node tools/title-recomposite.mjs --self-test');
  await b.close(); process.exit(2);
}
if (!existsSync(candPath)){ console.log('✗ 候補が ない:', candPath); await b.close(); process.exit(1); }

/* --- ① ② 合成 --- */
const made = await page.evaluate(async (K) => {
  const load = async src => { const i = new Image(); i.src = src; await i.decode(); return i; };
  const cand = await load('file://' + K.cand);
  const org  = await load('file://' + K.orig);
  if (org.naturalWidth !== K.IW || org.naturalHeight !== K.IH)
    return { err:`原本の 大きさが ちがう: ${org.naturalWidth}x${org.naturalHeight}` };
  if (cand.naturalWidth !== K.MW || cand.naturalHeight !== K.MH)
    return { err:`候補の 大きさが ちがう: ${cand.naturalWidth}x${cand.naturalHeight}（${K.MW}x${K.MH} が 必要）` };

  const c = document.createElement('canvas'); c.width = K.MW; c.height = K.MH;
  const g = c.getContext('2d', { willReadFrequently:true });
  g.imageSmoothingEnabled = false;              // 等倍。補間させない
  g.drawImage(cand, 0, 0);                      // 候補を そのまま
  g.clearRect(K.ML, K.MT, K.IW, K.IH);          // まん中を 消してから
  g.drawImage(org, K.ML, K.MT);                 // 原本を 等倍で 上書き
  return { png: c.toDataURL('image/png') };
}, { cand: candPath, orig: ORIG, MW, MH, ML, MT, IW, IH });

if (made.err){ console.log('✗', made.err); await b.close(); process.exit(1); }
mkdirSync(dirname(outPath), { recursive:true });
writeFileSync(outPath, Buffer.from(made.png.split(',')[1], 'base64'));

/* --- ③ 出力ファイルを 読みなおして 照合 --- */
const v = await page.evaluate(async (K) => {
  const load = async src => { const i = new Image(); i.src = src; await i.decode(); return i; };
  const fin = await load('file://' + K.out);
  const org = await load('file://' + K.orig);
  const cut = (img, sx, sy, w, h) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently:true });
    g.imageSmoothingEnabled = false; g.drawImage(img, sx, sy, w, h, 0, 0, w, h);
    return g.getImageData(0, 0, w, h).data;
  };
  const A = cut(org, 0, 0, K.IW, K.IH);
  const B = cut(fin, K.ML, K.MT, K.IW, K.IH);
  let maxd = 0, npx = 0;
  for (let i = 0; i < A.length; i += 4){
    let d = 0; for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(A[i+k] - B[i+k]));
    if (d){ npx++; if (d > maxd) maxd = d; }
  }
  return { w: fin.naturalWidth, h: fin.naturalHeight, maxd, npx };
}, { out: outPath, orig: ORIG, ML, MT, IW, IH });
await b.close();

const { createHash } = await import('crypto');
const { readFileSync, statSync } = await import('fs');
const sha = createHash('sha256').update(readFileSync(outPath)).digest('hex');

console.log('出力            :', outPath);
console.log('サイズ          :', `${v.w} x ${v.h}`);
console.log('バイト数        :', statSync(outPath).size.toLocaleString());
console.log('SHA-256         :', sha);
console.log('different pixels:', v.npx);
console.log('max channel difference:', v.maxd);
console.log('原本 開始/終了  :', `(${ML}, ${MT}) / (${ML+IW-1}, ${MT+IH-1})`);
console.log('TITLE_BTN       :', `{ x:${ML+180}, y:${MT+1420}, w:585, h:152 }`);
console.log('');
if (v.w !== MW || v.h !== MH || v.npx !== 0 || v.maxd !== 0){ console.log('検査 NG'); process.exit(1); }
console.log('検査 OK ✅  まん中 941x1672 は 原本と 完全一致');
