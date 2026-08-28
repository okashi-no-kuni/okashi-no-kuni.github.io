/* Gemini に キャラの 絵を 描いてもらう。
 *
 * 絵を 手で 作らないのは アイコン（tools/make-icons.mjs）と おなじ考えで、
 * 色や 作りを 変えたときに いつでも 出しなおせるようにするため。
 * だから **プロンプトは この ファイルの 中に 置く**。チャットで 打った
 * プロンプトは のこらないので、二度と 同じ絵に たどりつけなくなる。
 *
 * つかいかた:
 *   node tools/gen-art.mjs --models        つかえる モデルを しらべる
 *   node tools/gen-art.mjs ウサギ           1体 出す（art/rabbit.png）
 *   node tools/gen-art.mjs --all           ART に ある子を ぜんぶ
 *
 * キーは 環境変数 GEMINI_API_KEY から とる。
 * **リポジトリには ぜったいに 置かない。**GitHub Pages は 中みを だれでも
 * ダウンロードできるので、コミットした 時点で だれでも つかえてしまう。
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

const KEY = process.env.GEMINI_API_KEY;
const API = 'https://generativelanguage.googleapis.com/v1beta';
const root = resolve(dirname(new URL(import.meta.url).pathname), '..');

/* 絵がらの きまり。CLAUDE.md の アートディレクションを そのまま 文にしたもの。
   ここを 変えると ぜんぶの子の 絵がらが そろって 変わる */
const STYLE = [
  'A cute kawaii mascot character for a pastel tower-defense mobile game.',
  'Soft pastel palette: pink #ff8fc4, lavender #c9a7ff, mint #8fe3c4, cream #fff6e9.',
  'Rounded shapes only, no sharp corners. Simple flat vector sticker style with',
  'soft gradient shading and a glossy highlight.',
  'The face must have two eyes with a white highlight, round pink translucent cheeks,',
  'and a small simple mouth.',
  'Front facing, whole body visible, centered, generous margin on all sides.',
  'Plain solid white background, no shadow on the ground, no text, no watermark, no border.',
].join(' ');

/* 出す子。キーは index.html の CREATURES の opt.key と そろえる
   （そろえておくと、あとで 絵と キャラを つきあわせるのが 1行ですむ）*/
const ART = {
  ウサギ:  { key:'rabbit', p:'A pink bunny standing on two legs, long upright ears with darker pink inner ears, small brown nose.' },
  ヒツジ:  { key:'sheep',  p:'A cream sheep standing on two legs, fluffy scalloped wool, floppy ears, curled golden spiral horns.' },
  おばけ:  { key:'ghost',  p:'A white round ghost with a flowing wavy tail streaming to one side, tiny stubby arms.' },
  クマ:    { key:'bear',   p:'A light brown teddy bear standing on two legs, round ears with pink inner ears, cream muzzle.' },
  パンダ:  { key:'panda',  p:'A panda standing on two legs, black ears and black eye patches, white face and belly.' },
};

const die = m => { console.error('✗ ' + m); process.exit(1); };
if (!KEY) die('環境変数 GEMINI_API_KEY が ありません。\n'
  + '  claude.ai/code の 環境設定 → Environment variables に 入れて、\n'
  + '  そのあと あたらしい セッションを ひらいてください\n'
  + '  （環境変数は コンテナが 起動するときに 読まれるため）');

async function call(path, init){
  const r = await fetch(`${API}/${path}${path.includes('?') ? '&' : '?'}key=${KEY}`, init);
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch (e) { /* JSON でないときは 生のまま 見せる */ }
  if (!r.ok) die(`HTTP ${r.status}\n${t.slice(0, 1500)}`);
  return j ?? t;
}

/* どの モデルが つかえるかは 記憶では なく API に きく。
   モデル名は 変わるので、書きこんで しまうと ある日 とつぜん 動かなくなる */
async function listModels(){
  const j = await call('models?pageSize=200');
  const ms = j.models || [];
  console.log(`モデル ${ms.length} 件\n`);
  const img = ms.filter(m => /image/i.test(m.name) || /image/i.test(m.description || ''));
  const show = (title, arr) => {
    console.log(title);
    if (!arr.length) return console.log('  （なし）\n');
    for (const m of arr)
      console.log('  ' + m.name.replace('models/', '').padEnd(42)
        + (m.supportedGenerationMethods || []).join(','));
    console.log('');
  };
  show('■ 絵を 出せそうな モデル', img);
  show('■ ぜんぶ', ms);
  console.log('つかう モデルが きまったら、GEN_MODEL に 書きます。');
}

/* 画像を 1枚 もらう。返事の どこに 画像が 入るかは モデルで ちがうので、
   inlineData を もつ part を さがす形にしてある */
async function generate(model, prompt){
  const body = {
    contents: [{ role:'user', parts: [{ text: STYLE + '\n\n' + prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'] },
  };
  const j = await call(`models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parts = j?.candidates?.[0]?.content?.parts || [];
  const img = parts.find(p => p.inlineData?.data);
  if (!img){
    const txt = parts.map(p => p.text).filter(Boolean).join('\n');
    die('画像が かえって きませんでした。\n'
      + (txt ? 'モデルの こたえ: ' + txt + '\n' : '')
      + JSON.stringify(j).slice(0, 1200));
  }
  return { buf: Buffer.from(img.inlineData.data, 'base64'),
           mime: img.inlineData.mimeType || 'image/png' };
}

/* もらった絵は **ゲームには そのまま つかえない**。3つ 直す。
     ① よこ長で 出てくる → キャラの まわりで 正方形に 切る
     ② JPEG で 返るので 背景が すきとおらない → 白を ぬく
     ③ 1枚 200KB 超 → 小さくして PNG にする
   白を ぬくのは **ふちから つながっている 白だけ**（ぬりつぶし）。
   色で いっせいに 消すと、おなかの クリーム色まで 穴が あく */
async function fitSprite(buf, mime, size){
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const pg = await b.newPage();
  const png = await pg.evaluate(async ({ url, size }) => {
    const im = new Image();
    await new Promise((ok, ng) => { im.onload = ok; im.onerror = ng; im.src = url; });
    const W = im.naturalWidth, H = im.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, W, H), p = d.data;
    const white = i => p[i] > 240 && p[i+1] > 240 && p[i+2] > 240;

    // ふちから ぬりつぶして、外がわの 白だけ けす
    const seen = new Uint8Array(W*H);
    const st = [];
    for (let x = 0; x < W; x++){ st.push(x, x + (H-1)*W); }
    for (let y = 0; y < H; y++){ st.push(y*W, y*W + W-1); }
    while (st.length){
      const k = st.pop();
      if (seen[k]) continue;
      if (!white(k*4)) continue;
      seen[k] = 1;
      const x = k % W, y = (k / W) | 0;
      if (x > 0)   st.push(k-1);
      if (x < W-1) st.push(k+1);
      if (y > 0)   st.push(k-W);
      if (y < H-1) st.push(k+W);
    }
    for (let k = 0; k < W*H; k++) if (seen[k]) p[k*4+3] = 0;
    g.putImageData(d, 0, 0);

    // のこった ところの わく
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (p[(y*W+x)*4+3] > 8){
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    if (x1 < 0) return null;
    // 正方形に そろえる（長いほうに あわせて、まわりに 4% あける）
    const w = x1-x0+1, h = y1-y0+1, side = Math.max(w, h) * 1.08;
    const cx = (x0+x1)/2, cy = (y0+y1)/2;

    const o = document.createElement('canvas'); o.width = o.height = size;
    const og = o.getContext('2d');
    og.imageSmoothingQuality = 'high';
    og.drawImage(c, cx - side/2, cy - side/2, side, side, 0, 0, size, size);
    return o.toDataURL('image/png').slice(22);
  }, { url: `data:${mime};base64,${buf.toString('base64')}`, size });
  await b.close();
  if (!png) die('絵が まっしろでした');
  return Buffer.from(png, 'base64');
}

/* つかう モデル。--models で しらべて ここに 書く */
const GEN_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
/* 出す 大きさ。ばんめんでは 1マス（さいだい 125 デバイスpx）なので
   256 あれば じゅうぶん。図鑑の 大きい カードでも つぶれない */
const SIZE = +(process.env.GEMINI_ART_SIZE || 256);

const args = process.argv.slice(2);
if (!args.length || args[0] === '--models'){ await listModels(); process.exit(0); }
if (!GEN_MODEL) die('つかう モデルが きまっていません。\n'
  + '  node tools/gen-art.mjs --models で しらべて、GEN_MODEL に 書いてください');

const names = args[0] === '--all' ? Object.keys(ART) : args;
mkdirSync(resolve(root, 'art'), { recursive: true });
for (const n of names){
  const a = ART[n];
  if (!a){ console.error(`✗ ${n} は ART に ありません`); continue; }
  process.stdout.write(`${n} … `);
  const { buf, mime } = await generate(GEN_MODEL, a.p);
  const png = await fitSprite(buf, mime, SIZE);
  const out = resolve(root, `art/${a.key}.png`);
  writeFileSync(out, png);
  console.log(`art/${a.key}.png ${SIZE}px (${(buf.length/1024).toFixed(0)}KB ${mime}`
    + ` → ${(png.length/1024).toFixed(0)}KB png) ✅`);
}
