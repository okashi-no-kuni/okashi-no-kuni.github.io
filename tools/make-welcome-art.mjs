/* 導入の 画面（ようこそ）の 上の 絵を、支給された **1まいの 見本から** 切り出す。
 *
 *   node tools/make-welcome-art.mjs
 *
 * もとは これ 1つ だけ。**原画は 1バイトも さわりません。**
 *
 *   art/screens/welcome_castle_source.png   1024x1536・RGB
 *
 * 出るもの
 *   art/screens/welcome_castle.webp         お城の ところ だけ（品質 0.92）
 *
 * ---- なぜ 切るのか ----
 *
 * 支給された 絵は **画面ぜんたいの 見本**で、題・説明・📕の 文・
 * 「ゲームをはじめる」まで 焼きこまれています。
 * **これを そのまま 1まいで 貼っては いけません。**端末の たてよこ比が
 * ちがうので、そのまま 出すと 文字が 切れるか 絵が つぶれるかの
 * どちらかに なります。文は HTML の 文字で 出すのが きまりです。
 *
 * ---- どこで 切るか（原画の 画素で 実測）----
 *
 *   金の ふち   左 x=46..52 ／ 右 x=972..980 ／ 上 y=66..74 ／ 下 y=718..735
 *   絵の 中み   その すぐ 内がわ
 *
 * **金の ふちは 入れないこと。**CSS がわ（`#weArtWrap`）が 自分で
 * 金の ふちを 描くので、焼きこみと 二重に なります
 * （アプリアイコンの 角丸で やった 失敗と 同じ形）。
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { launch } from './_pw.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = 'art/screens/welcome_castle_source.png';
const OUT  = 'art/screens/welcome_castle.webp';

/* 焼きこまれた 金の ふちの **内がわ**。原画の 画素で 実測した 値 */
const CROP = { x:60, y:82, w:906, h:635 };

const b64 = readFileSync(resolve(root, SRC)).toString('base64');
const b = await launch();
const pg = await b.newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));

const out = await pg.evaluate(async ({ b64, CROP }) => {
  const im = new Image();
  await new Promise((ok, ng) => { im.onload = ok; im.onerror = ng; im.src = 'data:image/png;base64,' + b64; });
  if (im.naturalWidth !== 1024 || im.naturalHeight !== 1536)
    return { err: '原画の 大きさが ちがいます: ' + im.naturalWidth + 'x' + im.naturalHeight };

  const c = document.createElement('canvas');
  c.width = CROP.w; c.height = CROP.h;
  const g = c.getContext('2d', { willReadFrequently: true });
  /* **ちぢめない。**原画の 画素を そのまま 1:1 で うつす */
  g.drawImage(im, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, CROP.w, CROP.h);

  /* 焼きこまれた **金の ふち**が のこって いないか。のこると 絵の まわりに
     細い 金の すじが 出て、CSS の ふちと 二重に なります。

     しらべるのは **まっすぐな ところ だけ**（四すみの 30px は のぞく）。
     すみは 元の 絵が 角丸なので 金の 弧が すこし 入りますが、
     そこは CSS の `border-radius`（表示で 19px ＝ 絵の 幅の 5%）が
     かならず おおいます（弧は 2.7% ぶんしか ありません）。

     **「クリームか どうか」で しらべては いけません** ——空の 白い雲も
     道の うすい ピンクも クリームに 近いので、絵の 中みを ひろって
     「はみ出し 31画素」のように 出ます（じっさいに そうなりました）*/
  const d = g.getImageData(0, 0, CROP.w, CROP.h).data;
  const px = (x, y) => { const i = (y * CROP.w + x) * 4; return [d[i], d[i+1], d[i+2]]; };
  const gold = (x, y) => { const [r, gg, bb] = px(x, y);
    return r > 228 && gg > 150 && gg < 235 && bb < 170 && (r - bb) > 80; };
  /* ものさしは **数では なく「いちばん 長い つらなり」**。
     絵の 中にも 金いろの もの（クラウン・お菓子の家・キャンディ）が あるので、
     数で 見ると 内がわへ 寄せる ほど ふえて しまいます（じっさい
     47→55→68 と ふえました）。**焼きこまれた ふちは 一本の 線**なので、
     のこって いれば 何百画素も つらなります */
  const M = 30;
  const run = a => { let m = 0, c = 0; for (const v of a){ c = v ? c + 1 : 0; if (c > m) m = c; } return m; };
  const top = [], bot = [], lf = [], rt = [];
  for (let x = M; x < CROP.w - M; x++){ top.push(gold(x, 0)); bot.push(gold(x, CROP.h - 1)); }
  for (let y = M; y < CROP.h - M; y++){ lf.push(gold(0, y)); rt.push(gold(CROP.w - 1, y)); }
  const edge = { 上:run(top), 下:run(bot), 左:run(lf), 右:run(rt) };

  return { edge, webp: c.toDataURL('image/webp', 0.92).slice(23) };
}, { b64, CROP });

await b.close();
if (out.err){ console.error('✗ ' + out.err); process.exit(1); }
if (errs.length){ console.error('JSエラー:\n' + errs.join('\n')); process.exit(1); }

const buf = Buffer.from(out.webp, 'base64');
writeFileSync(resolve(root, OUT), buf);

console.log('もと ' + SRC + '（1024x1536・さわっていません）');
console.log('切りぬき x=' + CROP.x + ' y=' + CROP.y + ' ' + CROP.w + 'x' + CROP.h
          + '（比 ' + (CROP.w / CROP.h).toFixed(4) + '）');
const worst = Math.max(...Object.values(out.edge));
console.log('ふちに つらなる 金（長い ほど あぶない）: '
          + Object.entries(out.edge).map(([k, v]) => k + v).join(' ')
          + (worst > 40 ? '   ✗ ふちが のこっています' : '   ✅ ふちの のこりなし'));
console.log(OUT + ' … ' + (buf.length / 1024).toFixed(0) + 'KB');
console.log('\n**CSS の 2か所を あわせること**');
console.log('  #weArtWrap の --weAR : ' + CROP.w + ' / ' + CROP.h);
console.log('  #weArt     の src    : ' + OUT);
if (worst > 40) process.exit(1);
