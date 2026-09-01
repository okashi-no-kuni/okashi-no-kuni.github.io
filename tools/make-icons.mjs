/* アプリと web の アイコンを、支給された **1まいの 原画から** 切り出す。
 *
 *   node tools/make-icons.mjs
 *
 * もとは これ 1つ だけ。**ここを 差しかえれば ぜんぶ 変わります。**
 *
 *   art/icon/app_icon_source.png    1254x1254・RGB（アルファなし）
 *
 * 出るもの
 *   icon-1024.png           1024  App Store（アルファなし・角丸なし）
 *   assets/icon.png         1024  Capacitor が iOS の アイコンを 切り出す もと
 *   assets/splash.png       2732  おなじく 起動画面の もと
 *   apple-touch-icon.png     180  iPhone の ホーム画面
 *   icon-192.png / icon-512.png   Android・PWA
 *   icon-maskable-512.png    512  Android が すきな形に 切りぬく版
 *
 * ---- ここで まちがえやすい ところ ----
 *
 * **角を 自分で まるめないこと。**iOS も Android も 自分で 切りぬくので、
 * 二重に なって すみに かけらが のこります。実際、はじめに もらった 原画は
 * 角丸が 焼きこまれていて、iOS の マスクを かけると すみの 8.2% が
 * 黒く のこりました（`art/icon/app_icon_source_rounded_v1.png`）。
 * いまの 原画は **ふちまで 絵が つづいて いて 黒が 0** です。
 *
 * **App Store の 1024 は アルファを 持てません**（ITMS-90717）。
 * canvas の `toDataURL()` は かならず RGBA で 出すので、生の 画素を
 * もらって **カラータイプ2（RGB）の PNG を 自分で 焼いて**います。
 *
 * **生の画素を 配列で わたさないこと。**1024x1024 は 420万個の 数に なり、
 * ブラウザから Node へ うつすだけで 2分 以上 かかりました。base64 の
 * 文字列なら 一瞬です。
 *
 * **2732 の 起動画面は 4〜5分 かかります**（GPUの ない 環境なので）。
 * 止まったように 見えても 待つこと。`--no-splash` で とばせます。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { launch } from './_pw.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = resolve(root, 'art/icon/app_icon_source.png');
const noSplash = process.argv.includes('--no-splash');

const srcB64 = readFileSync(SRC).toString('base64');
console.log('もと: art/icon/app_icon_source.png');

const b = await launch();
const pg = await b.newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));

const out = await pg.evaluate(async ({ b64, noSplash }) => {
  const im = new Image();
  await new Promise((ok, ng) => { im.onload = ok; im.onerror = ng; im.src = 'data:image/png;base64,' + b64; });
  const S0 = im.naturalWidth;
  if (S0 !== im.naturalHeight) return { err: '原画が 正方形では ありません: ' + S0 + 'x' + im.naturalHeight };

  const cv = S => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };

  /* そのまま ちぢめる。**切らない・角を まるめない・色を 変えない** */
  const plain = S => {
    const c = cv(S), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(im, 0, 0, S, S);
    return c;
  };

  /* Android の maskable。まわりを 切りぬかれても のこるよう 中みを 少し 小さくする。
     あいた ところは **同じ絵を ぼかして** 敷く ——表紙（#titleBg）と 同じ手。
     1色で うめると、絵の どの色を えらんでも どこかで うきます。

     **小さくしすぎないこと。**むかしの コードで えがいた アイコンは
     0.72 まで ちぢめていましたが、あれは ぼうや みみが 細くて 切れる
     ためでした。いまの 原画は **お城が まん中に あって、大事な ところは
     ぜんぶ 内がわ**なので、そこまで 縮める 必要が ありません。
     縮めるほど 内がわの 四角い ふちが 目立って、額に 入れた 絵に 見えます */
  const maskable = (S, k) => {
    const c = cv(S), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.filter = 'blur(' + Math.round(S * 0.05) + 'px) saturate(1.1)';
    g.drawImage(im, -S * 0.06, -S * 0.06, S * 1.12, S * 1.12);   // ぼかしの ふちを 外へ 逃がす
    g.filter = 'none';
    const w = S * k, o = (S - w) / 2;
    g.drawImage(im, o, o, w, w);
    return c;
  };

  /* 起動画面。**まん中に 小さく**。大きくすると よこ持ちの 端末で はみ出す */
  const splash = S => {
    const c = cv(S), g = c.getContext('2d');
    const t = document.createElement('canvas'); t.width = t.height = 8;
    const tg = t.getContext('2d', { willReadFrequently: true });
    tg.drawImage(im, 0, 0, 8, 8);
    const d = tg.getImageData(0, 0, 8, 8).data;
    const at = (x, y) => { const i = (y*8+x)*4; return `rgb(${d[i]},${d[i+1]},${d[i+2]})`; };
    const lg = g.createLinearGradient(0, 0, 0, S);       // 原画の 上と 下の 色で つなぐ
    lg.addColorStop(0, at(4, 0)); lg.addColorStop(1, at(4, 7));
    g.fillStyle = lg; g.fillRect(0, 0, S, S);
    g.imageSmoothingQuality = 'high';
    const w = S * 0.30, o = (S - w) / 2;
    g.drawImage(im, o, o, w, w);
    return c;
  };

  /* 生の画素を base64 で。配列に すると ブラウザ→Node の うけわたしで 何分も かかる */
  const raw = c => {
    const d = c.getContext('2d', { willReadFrequently: true })
               .getImageData(0, 0, c.width, c.height).data;
    let s = '';
    for (let i = 0; i < d.length; i += 0x8000)
      s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const png = c => c.toDataURL().slice(22);

  const r = {
    srcSize: S0,
    raw1024: raw(plain(1024)),
    180: png(plain(180)),
    192: png(plain(192)),
    512: png(plain(512)),
    mask: png(maskable(512, 0.88)),
  };
  if (!noSplash) r.rawSplash = raw(splash(2732));
  return r;
}, { b64: srcB64, noSplash });

await b.close();
if (out.err){ console.error('✗ ' + out.err); process.exit(1); }
if (errs.length){ console.error('JSエラー:\n' + errs.join('\n')); process.exit(1); }

/* ---- アルファを 持たない PNG を 自分で 焼く ----
   App Store の 1024x1024 は アルファチャンネルが あると はじかれます
   （ITMS-90717）。ライブラリは いれません ——PNG は IHDR/IDAT/IEND の
   3つだけで 作れます */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++){
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return buf => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}
function pngRGB(b64, S){
  const rgba = Buffer.from(b64, 'base64');
  const rows = Buffer.alloc(S * (S * 3 + 1));
  for (let y = 0; y < S; y++){
    let o = y * (S * 3 + 1);
    rows[o++] = 0;                       // フィルタ：なし
    for (let x = 0; x < S; x++){
      const i = (y * S + x) * 4, a = rgba[i + 3] / 255;   // 白と 合成して アルファを 落とす
      rows[o++] = Math.round(rgba[i]     * a + 255 * (1 - a));
      rows[o++] = Math.round(rgba[i + 1] * a + 255 * (1 - a));
      rows[o++] = Math.round(rgba[i + 2] * a + 255 * (1 - a));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8;    // 8ビット
  ihdr[9] = 2;    // カラータイプ2＝RGB（アルファ なし）
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const save   = (p, b64) => writeFileSync(resolve(root, p), Buffer.from(b64, 'base64'));
const saveRGB = (p, b64, S) => writeFileSync(resolve(root, p), pngRGB(b64, S));

mkdirSync(resolve(root, 'assets'), { recursive: true });
save('apple-touch-icon.png',    out[180]);
save('icon-192.png',            out[192]);
save('icon-512.png',            out[512]);
save('icon-maskable-512.png',   out.mask);
saveRGB('icon-1024.png',   out.raw1024, 1024);
saveRGB('assets/icon.png', out.raw1024, 1024);
if (out.rawSplash) saveRGB('assets/splash.png', out.rawSplash, 2732);

console.log('原画 ' + out.srcSize + 'x' + out.srcSize + ' から 切り出しました ✅');
console.log('  icon-1024.png / assets/icon.png … App Store（アルファなし・角丸なし）');
console.log('  apple-touch-icon.png / icon-192 / icon-512 / icon-maskable-512');
console.log(out.rawSplash ? '  assets/splash.png … 起動画面（2732）'
                          : '  （起動画面は --no-splash で とばしました）');
