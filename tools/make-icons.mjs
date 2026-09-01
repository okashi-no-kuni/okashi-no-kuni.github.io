/* ホーム画面の アイコンを 作る。
 *
 * 絵は コードで 描く（CLAUDE.md）。画像を 手で 作ると、色を 変えたときに
 * 作りなおせなくなる。ここを 走らせれば いつでも 出しなおせる。
 *
 * つかいかた:
 *   node tools/make-icons.mjs            （ICON で えらんだ 1案を 出す）
 *   node tools/make-icons.mjs --all      （見くらべ用に 全案を out/ へ）
 *
 * 出すもの（リポジトリの いちばん上）:
 *   apple-touch-icon.png     180  iPhone の ホーム画面
 *   icon-192.png             192  Android・PWA
 *   icon-512.png             512  ストアや スプラッシュ
 *   icon-maskable-512.png    512  まわりを 切られても だいじょうぶな 版
 *   icon-1024.png           1024  App Store（アルファ なし・角丸なし）
 *   assets/icon.png         1024  Capacitor が iOS の アイコンを 切り出す もと
 *   assets/splash.png       2732  おなじく 起動画面の もと
 *
 * **4〜5分 かかります。**2732x2732 は 750万画素 あって、GPUの ない
 * この環境では えがくのにも PNGに するのにも 時間が かかります。
 * 止まったように 見えても 待つこと（実測 約5分）。
 *
 * maskable は Android が すきな形に 切りぬくので、まん中の 8割の 円に
 * おさまるように 中身を 小さく している。ふつうの 版と 同じ 絵で 出すと
 * みみや ぼうが 切られる。
 */
import { launch } from './_pw.mjs';
import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';
import { resolve, dirname } from 'path';

/* どの案を 本番に つかうか。'swirl' か 'star' */
const ICON = 'swirl';

const ALL = process.argv.includes('--all');
const root = resolve(dirname(new URL(import.meta.url).pathname), '..');

const b = await launch();
const pg = await b.newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto('file://' + resolve(root, 'index.html'));
await pg.waitForTimeout(700);

const shots = await pg.evaluate(({ ALL, ICON }) => {
  const api = window.__chk;
  if (!api) return { err: 'window.__chk が 見つからない' };

  /* キラキラ。ゲーム本体の gspark と 同じ形（4方向に とがった 星） */
  const spark = (g, x, y, r, rot, col) => {
    g.save(); g.translate(x, y); g.rotate(rot || 0); g.fillStyle = col || '#fff';
    g.beginPath();
    for (let i = 0; i < 4; i++){
      const a = i * Math.PI / 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      g.quadraticCurveTo(0, 0, Math.cos(a + Math.PI/4) * r * 0.22, Math.sin(a + Math.PI/4) * r * 0.22);
    }
    g.closePath(); g.fill(); g.restore();
  };

  /* 下じき。ふちまで 色を 塗る。角を まるめないのは、
     iOS も Android も じぶんで 切りぬくから。こちらで まるめると 二重になる */
  const ground = (g, S, c1, c2, c3) => {
    const lg = g.createLinearGradient(0, 0, 0, S);
    lg.addColorStop(0, c1); lg.addColorStop(0.55, c2); lg.addColorStop(1, c3);
    g.fillStyle = lg; g.fillRect(0, 0, S, S);
    const rg = g.createRadialGradient(S*0.28, S*0.2, S*0.05, S*0.28, S*0.2, S*0.8);
    rg.addColorStop(0, 'rgba(255,255,255,.75)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, S, S);
  };
  const dust = (g, S, k) => {
    for (const [x, y, r, a] of [[0.13,0.17,0.052,0.3],[0.87,0.19,0.043,0.6],
                                [0.17,0.85,0.041,0.2],[0.85,0.83,0.049,0.5]])
      spark(g, S*x, S*y, S*r*k, a, 'rgba(255,255,255,.95)');
  };

  /* --- 案C：うずまきキャンディ（描きおろし）---
     まるいので iOS の 角丸と 相性が よく、うずまきが 小さくても のこる */
  const swirl = (g, S, k) => {
    ground(g, S, '#ffe4f2', '#ffcfe6', '#cfc0ff');
    dust(g, S, 1);
    const cx = S*0.5, cy = S*0.46, r = S*0.31*k;
    g.fillStyle = 'rgba(120,90,120,.16)';
    g.beginPath(); g.ellipse(cx, cy + r*0.98, r*0.8, r*0.16, 0, 0, Math.PI*2); g.fill();
    g.fillStyle = '#fff6e9'; g.strokeStyle = 'rgba(120,90,120,.2)'; g.lineWidth = S*0.008;
    g.beginPath(); g.roundRect(cx - r*0.09, cy, r*0.18, r*1.35, r*0.09); g.fill(); g.stroke();
    const rg = g.createRadialGradient(cx - r*0.35, cy - r*0.4, r*0.1, cx, cy, r*1.15);
    rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.5, '#ff9ec9'); rg.addColorStop(1, '#e05f9e');
    g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI*2); g.fill();
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI*2); g.clip();
    g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = r*0.2; g.lineCap = 'round';
    g.beginPath();
    for (let a = 0; a < Math.PI*5; a += 0.06){
      const rr = r*0.1 + a*r*0.058, x = cx + Math.cos(a)*rr, y = cy + Math.sin(a)*rr;
      a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke(); g.restore();
    g.fillStyle = '#4a3a4a';                       // 目
    for (const s of [-1,1]){ g.beginPath(); g.ellipse(cx + s*r*0.3, cy + r*0.02, r*0.085, r*0.115, 0, 0, Math.PI*2); g.fill(); }
    g.fillStyle = '#fff';                          // 目の ひかり
    for (const s of [-1,1]){ g.beginPath(); g.arc(cx + s*r*0.3 - r*0.03, cy - r*0.03, r*0.032, 0, Math.PI*2); g.fill(); }
    g.fillStyle = 'rgba(255,140,180,.5)';          // ほっぺ
    for (const s of [-1,1]){ g.beginPath(); g.ellipse(cx + s*r*0.52, cy + r*0.2, r*0.11, r*0.075, 0, 0, Math.PI*2); g.fill(); }
    g.strokeStyle = '#4a3a4a'; g.lineWidth = r*0.055; g.lineCap = 'round';
    g.beginPath(); g.arc(cx, cy + r*0.12, r*0.14, 0.25, Math.PI - 0.25); g.stroke();
  };

  /* --- 案B：ほしクッキー（ゲーム本体の 絵を そのまま つかう）--- */
  const star = (g, S, k) => {
    ground(g, S, '#e2d6fb', '#d4c4f5', '#ffd2e8');
    dust(g, S, 1);
    const o = api.buildRoster().find(x => x.name === 'ほしクッキー');
    const t = document.createElement('canvas'); t.width = t.height = S;
    const tg = t.getContext('2d');
    api.drawGen(tg, S, o); api.portraitShade(tg, S);   // ゲーム内と おなじ つや
    const w = S*1.1*k;
    g.drawImage(t, S/2 - w/2, S*0.52 - w/2, w, w);
  };

  const DRAW = { swirl, star };
  const make = (name, S, k) => {
    const c = document.createElement('canvas'); c.width = c.height = S;
    DRAW[name](c.getContext('2d'), S, k);
    return c.toDataURL().slice(22);
  };
  /* 生の画素（RGBA）を ふつうの 配列で かえす。JSONで わたせる形にする */
  const raw = (name, S, k) => {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    DRAW[name](g, S, k === undefined ? 1 : k);
    return Array.from(g.getImageData(0, 0, S, S).data);
  };

  /* k は 中身の 大きさ。maskable だけ 小さくして、切りぬかれても のこるようにする */
  const out = {};
  const names = ALL ? Object.keys(DRAW) : [ICON];
  for (const n of names){
    out[n] = {
      180: make(n, 180, 1), 192: make(n, 192, 1), 512: make(n, 512, 1),
      mask: make(n, 512, 0.72),
      /* App Store の 1024 は **アルファ（すきとおり）を 持てない**。
         toDataURL は かならず RGBA で 出すので、ここでは 生の 画素だけ
         かえして、Node がわで 白と 合成してから RGB の PNG に 焼く */
      raw1024: raw(n, 1024),
      /* 起動画面（スプラッシュ）。Capacitor は 2732x2732 の 1まいから
         ぜんぶの 機種ぶんを 切り出すので、**まん中に 小さく** 置く。
         大きく すると よこ持ちの 端末で はみ出す */
      rawSplash: raw(n, 2732, 0.30),
    };
  }
  return { out };
}, { ALL, ICON });

await b.close();
if (shots.err){ console.error(shots.err); process.exit(1); }
if (errs.length){ console.error('JSエラー:\n' + errs.join('\n')); process.exit(1); }

const save = (p, b64) => writeFileSync(p, Buffer.from(b64, 'base64'));

/* ---- アルファを 持たない PNG を 自分で 焼く ----
   App Store の 1024x1024 は **アルファチャンネルを 持っていると はじかれます**
   （ITMS-90717）。canvas の toDataURL は かならず RGBA で 出すので、
   白と 合成してから カラータイプ2（RGB）で 書きだします。
   ライブラリは いれません ——PNG は IHDR/IDAT/IEND の 3つだけで 作れます */
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
function pngRGB(rgba, S){
  // 白と 合成して アルファを 落とす（すきとおりが あっても 白で うまる）
  const rows = Buffer.alloc(S * (S * 3 + 1));
  for (let y = 0; y < S; y++){
    let o = y * (S * 3 + 1);
    rows[o++] = 0;                       // フィルタ：なし
    for (let x = 0; x < S; x++){
      const i = (y * S + x) * 4, a = rgba[i + 3] / 255;
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
if (ALL){
  mkdirSync(resolve(root, 'tools/out'), { recursive: true });
  for (const [n, s] of Object.entries(shots.out))
    for (const [k, v] of Object.entries(s)) save(resolve(root, `tools/out/${n}-${k}.png`), v);
  console.log('見くらべ用を tools/out/ に出しました');
} else {
  const s = shots.out[ICON];
  save(resolve(root, 'apple-touch-icon.png'), s[180]);
  save(resolve(root, 'icon-192.png'),         s[192]);
  save(resolve(root, 'icon-512.png'),         s[512]);
  save(resolve(root, 'icon-maskable-512.png'), s.mask);
  /* App Store 用。**角を まるめない・アルファを 持たない・ちょうど1024** */
  writeFileSync(resolve(root, 'icon-1024.png'), pngRGB(s.raw1024, 1024));
  /* Capacitor（@capacitor/assets）が 読む ところ。ここに 置いておけば
     iOS の アイコンと 起動画面が ぜんぶ 自動で 切り出される */
  mkdirSync(resolve(root, 'assets'), { recursive: true });
  writeFileSync(resolve(root, 'assets/icon.png'),   pngRGB(s.raw1024, 1024));
  writeFileSync(resolve(root, 'assets/splash.png'), pngRGB(s.rawSplash, 2732));
  console.log(`アイコン（${ICON}）を 出しました ✅`);
  console.log('  icon-1024.png     … App Store 用（アルファ なし・角丸なし）');
  console.log('  assets/icon.png   … アプリの アイコンの もと');
  console.log('  assets/splash.png … 起動画面の もと（2732x2732）');
}
