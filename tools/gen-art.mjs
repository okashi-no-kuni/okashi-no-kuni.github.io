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
 *   node tools/gen-art.mjs --fit           art/ に ある絵の 大きさを そろえなおす
 *
 * モデルが かえすのは 白い 背景の JPEG。それを 大きさを そろえながら
 * 描きなおして PNG で 出す（fit）。**それでも 透過は ない。**背景は 白のまま。
 * スプライトとして つかうには 白を ぬく ひと手間が いる。
 * いまは 絵がらを 見くらべる ための 絵なので、そこは まだ やっていない。
 *
 * キーは 環境変数 GEMINI_API_KEY から とる。
 * **リポジトリには ぜったいに 置かない。**GitHub Pages は 中みを だれでも
 * ダウンロードできるので、コミットした 時点で だれでも つかえてしまう。
 */
import { writeFileSync, readFileSync, readdirSync, unlinkSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

const KEY = process.env.GEMINI_API_KEY;
const API = 'https://generativelanguage.googleapis.com/v1beta';
const root = resolve(dirname(new URL(import.meta.url).pathname), '..');

/* もらった 画像の 形式 → 拡張子。
   gemini-3-pro-image が かえすのは いまのところ **かならず JPEG**。
   generationConfig.imageConfig に outputMimeType は 無く（400 が かえる）、
   PNG を たのむ 手だては 無い。だから 名前を .png に 決めうちすると
   中みと 名前が くいちがう。実際 それで 1回 はまった */
const EXT = { 'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp' };

/* 絵がらの きまり。CLAUDE.md の アートディレクションを そのまま 文にしたもの。
   ここを 変えると ぜんぶの子の 絵がらが そろって 変わる。

   3体（クマ・おばけ・ヒツジ）を 並べて 分かったのは、**書いていないことは
   モデルが 埋める**ということ。クマにだけ 太い 白ふちと リボンと ハートが
   ついて、彩度も 1体だけ パステルの 外に 出た。指示が ないと 1体ごとに
   ちがう 埋めかたを するので、並べたとき そこが そのまま バラつきになる。
   だから ふちどり・かざり・彩度は 禁止の形で 書ききる。

   目の 大きさは **わざと 書いていない**。おばけに そろえようと
   「頭の はばの 1/6」と 数で 書いてみたが、出しなおすと 6.7〜24.2% と
   かえって 広がった。1回ごとの ばらつきが 指示より 大きいため。
   generationConfig.seed も 効かない（同じ seed で ちがう 絵が かえる）。
   つまり **出しなおしの 再現性は ない**。
   細かい ところは 出てきた 絵を 見て その つど 直す ほうが 早い。

   大きさだけは プロンプトに たよらず、出したあとに 機械で そろえる
   （fit）。ここが ばらつくと 並べたとき いちばん 目立つため */
const STYLE = [
  'A cute kawaii mascot character for a pastel tower-defense mobile game.',
  'Soft pastel palette: pink #ff8fc4, lavender #c9a7ff, mint #8fe3c4, cream #fff6e9.',
  'Every colour must be a pale pastel mixed with white. No dark, deep or saturated',
  'colours anywhere, including the fur, the horns and the outline.',
  'Rounded shapes only, no sharp corners. Simple flat vector sticker style with',
  'soft gradient shading and a glossy highlight.',
  'Outline the character with one thin line in a darker shade of its own colour.',
  'Do NOT draw a thick white die-cut sticker border around it.',
  'The face must have two eyes with a white highlight, round pink translucent cheeks,',
  'and a small simple mouth.',
  'Draw exactly the body described and nothing else: no bows, ribbons, collars,',
  'hearts, stars, patterns, badges or any other accessory unless it is described.',
  'Front facing, whole body visible, centered, generous margin on all sides.',
  'Plain solid white background, no shadow on the ground, no text, no watermark, no border.',
].join(' ');

/* わくの 中での 大きさ。長辺で そろえる。
   高さで そろえると、しっぽが 横に 流れる おばけが 横に はみ出す。
   長辺なら どの 形でも わくに おさまり、まわりの あきも そろう */
const FIT = { size: 1024, long: 0.80 };

/* 出したあとに 大きさを そろえる。
   プロンプトで 頼んでも ばらつきに 巻きこまれるので、ここは 機械で やる。
   実測（そろえる前）は 長辺で クマ 80.0% / おばけ 86.8% / ヒツジ 81.3%、
   高さだと 80.0 / 69.4 / 81.3 で、おばけだけ 背が ひくく 横に 広かった。

   JPEG を いったん canvas に のせて 描きなおすので、出るのは PNG。
   これで 名前と 中みも ようやく 合う（透過は まだ ない。白は 白のまま）*/
async function fit(page, buf, mime){
  return Buffer.from(await page.evaluate(async ({ src, F }) => {
    const img = new Image(); img.src = src; await img.decode();
    const W = img.width, H = img.height;
    const c0 = document.createElement('canvas'); c0.width = W; c0.height = H;
    const x0 = c0.getContext('2d'); x0.drawImage(img, 0, 0);
    const d = x0.getImageData(0, 0, W, H).data;
    const lum = k => .299*d[k*4] + .587*d[k*4+1] + .114*d[k*4+2];

    /* 白でない ところの 外わく。JPEG の にじみが あるので しきい値は ゆるめ */
    let a=1e9, z=-1, u=1e9, v=-1;
    for (let j=0;j<H;j++) for (let i=0;i<W;i++)
      if (lum(j*W+i) < 242){ if(i<a)a=i; if(i>z)z=i; if(j<u)u=j; if(j>v)v=j; }
    if (z < 0) throw new Error('絵が 見つからない（まっ白）');

    const w = z-a, h = v-u;
    const k = (F.size * F.long) / Math.max(w, h);
    const c1 = document.createElement('canvas'); c1.width = F.size; c1.height = F.size;
    const x1 = c1.getContext('2d');
    x1.fillStyle = '#fff'; x1.fillRect(0, 0, F.size, F.size);
    x1.imageSmoothingQuality = 'high';
    x1.drawImage(img, a, u, w, h,
      (F.size - w*k)/2, (F.size - h*k)/2, w*k, h*k);
    return c1.toDataURL('image/png').split(',')[1];
  }, { src: 'data:' + mime + ';base64,' + buf.toString('base64'), F: FIT }), 'base64');
}

/* 出す子。キーは index.html の CREATURES の opt.key と そろえる
   （そろえておくと、あとで 絵と キャラを つきあわせるのが 1行ですむ）*/
const ART = {
  ウサギ:  { key:'rabbit', p:'A pink bunny standing on two legs, long upright ears with darker pink inner ears, small brown nose.' },
  ヒツジ:  { key:'sheep',  p:'A cream sheep standing upright on two short legs like a plush toy, fluffy scalloped wool, floppy ears, pale gold curled spiral horns drawn on top of the wool.' },
  おばけ:  { key:'ghost',  p:'A white round ghost with a flowing wavy tail streaming to one side, tiny stubby arms.' },
  クマ:    { key:'bear',   p:'A light brown teddy bear standing on two legs, round ears with pink inner ears, cream muzzle.' },
  パンダ:  { key:'panda',  p:'A panda standing on two legs, black ears and black eye patches, white face and belly.' },
};

const die = m => { console.error('✗ ' + m); process.exit(1); };
if (!KEY) die('環境変数 GEMINI_API_KEY が ありません。\n'
  + '  claude.ai/code の 環境設定 → Environment variables に 入れて、\n'
  + '  そのあと あたらしい セッションを ひらいてください\n'
  + '  （環境変数は コンテナが 起動するときに 読まれるため）');

/* キーは URL では なく ヘッダで おくる。2026年から AI Studio が 出すのは
   `AQ.` で はじまる あたらしい形式（認証キー）で、こちらは ヘッダを 前提に
   している。`?key=` の 書きかたは 古い `AIza` キー むけで、新しい キーだと
   401 に なる ことが ある。ヘッダなら どちらの 形式でも とおる。
   ついでに URL に キーが のらないので、ログにも のこらない */
async function call(path, init = {}){
  const r = await fetch(`${API}/${path}`, {
    ...init,
    headers: { ...(init.headers || {}), 'x-goog-api-key': KEY },
  });
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
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
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
           mime: img.inlineData.mimeType || '' };
}

/* つかう モデル。--models で しらべて ここに 書く */
const GEN_MODEL = process.env.GEMINI_IMAGE_MODEL || '';

/* Chromium は 大きさを そろえる ためだけに つかう（canvas が ほしい）。
   check-chars.mjs と 同じ 置き場所。--models では 立ちあげない */
async function withPage(fn){
  const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
  const b = await chromium.launch();
  try { return await fn(await b.newPage()); } finally { await b.close(); }
}

const args = process.argv.slice(2);
if (!args.length || args[0] === '--models'){ await listModels(); process.exit(0); }
/* すでに 出した 絵を そろえなおす。気に入った 絵を そのまま つかいたいので、
   大きさを 直すために 出しなおしたく ない（出しなおすと 別の絵に なる）*/
if (args[0] === '--fit'){
  const dir = resolve(root, 'art');
  const files = readdirSync(dir).filter(n => /\.(jpe?g|png)$/i.test(n));
  if (!files.length) die('art/ に 絵が ありません');
  await withPage(async page => {
    for (const n of files){
      const mime = /\.png$/i.test(n) ? 'image/png' : 'image/jpeg';
      const png = await fit(page, readFileSync(resolve(dir, n)), mime);
      const out = n.replace(/\.(jpe?g|png)$/i, '.png');
      writeFileSync(resolve(dir, out), png);
      if (out !== n) unlinkSync(resolve(dir, n));
      console.log(`art/${out} (${(png.length/1024).toFixed(0)}KB) ✅`);
    }
  });
  process.exit(0);
}

if (!GEN_MODEL) die('つかう モデルが きまっていません。\n'
  + '  node tools/gen-art.mjs --models で しらべて、GEN_MODEL に 書いてください');

const names = args[0] === '--all' ? Object.keys(ART) : args;
mkdirSync(resolve(root, 'art'), { recursive: true });
await withPage(async page => {
  for (const n of names){
    const a = ART[n];
    if (!a){ console.error(`✗ ${n} は ART に ありません`); continue; }
    process.stdout.write(`${n} … `);
    const { buf, mime } = await generate(GEN_MODEL, a.p);
    if (!EXT[mime]) die(`知らない 形式 ${mime}。EXT に 足してください`);
    /* そろえたあとは かならず PNG。名前と 中みが 合う */
    const png = await fit(page, buf, mime);
    writeFileSync(resolve(root, `art/${a.key}.png`), png);
    console.log(`art/${a.key}.png (${(png.length/1024).toFixed(0)}KB) ✅`);
  }
});
