/* Gemini に キャラの 絵を 描いてもらう。
 *
 * 絵を 手で 作らないのは アイコン（tools/make-icons.mjs）と おなじ考えで、
 * 色や 作りを 変えたときに いつでも 出しなおせるようにするため。
 * だから **プロンプトは この ファイルの 中に 置く**。チャットで 打った
 * プロンプトは のこらないので、二度と 同じ絵に たどりつけなくなる。
 *
 * つかいかた:
 *   node tools/gen-art.mjs --models        つかえる モデルを しらべる
 *   node tools/gen-art.mjs ウサギ           1体 出す（art/rabbit.jpg）
 *   node tools/gen-art.mjs --all           ART に ある子を ぜんぶ
 *
 * 出てくるのは 白い 背景の JPEG で、**透過は ない**。
 * スプライトとして つかうには 白を ぬく ひと手間が いる。
 * いまは 絵がらを 見くらべる ための 絵なので、そこは まだ やっていない。
 *
 * キーは 環境変数 GEMINI_API_KEY から とる。
 * **リポジトリには ぜったいに 置かない。**GitHub Pages は 中みを だれでも
 * ダウンロードできるので、コミットした 時点で だれでも つかえてしまう。
 */
import { writeFileSync, mkdirSync } from 'fs';
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
   だから ふちどり・かざり・彩度は 禁止の形で 書ききる */
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
  const name = `${a.key}.${EXT[mime] || 'bin'}`;
  writeFileSync(resolve(root, `art/${name}`), buf);
  console.log(`art/${name} (${(buf.length/1024).toFixed(0)}KB) ✅`);
}
