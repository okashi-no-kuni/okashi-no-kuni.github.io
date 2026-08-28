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
 *   node tools/gen-art.mjs --sprites       ゲームに はる 透過PNGを 作る
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

   ただし 彩度は 「ぜんぶ うすく」では だめだった。パンダが むらさきに
   なった。白黒で ないと パンダに 見えないので、その子を その子と
   わからせる もようだけは こい ままに する。まっ黒では なく すみ色で。

   ぎゃくに、ほんものが じみな 色（ねずみ色・茶色・こん色）の子は
   そのまま 出すと 並べたとき そこだけ 沈む。47体の 彩度と 明るさを
   測ったら、シャチ 0.65 / ネズミ 0.79 / ようかん 0.79 / マンタ 0.92 と
   下に かたまった（上は ヒツジ 1.67）。だから じみな 色は パステルに
   持ちあげる。**ただし パンダ・シマウマ・ペンギン・シャチは
   こさが その子の しるしなので さわらない。**

   ナマケモノは 持ちあげようと して かえって じみに なった
   （1.11 → 1.02）。写実に よって 丸みが へったため。もとに もどした。
   **持ちあげたら かならず 測りなおして、下がっていたら もどすこと。**

   目の 大きさは **わざと 書いていない**。おばけに そろえようと
   「頭の はばの 1/6」と 数で 書いてみたが、出しなおすと 6.7〜24.2% と
   かえって 広がった。1回ごとの ばらつきが 指示より 大きいため。
   generationConfig.seed も 効かない（同じ seed で ちがう 絵が かえる）。
   つまり **出しなおしの 再現性は ない**。
   細かい ところは 出てきた 絵を 見て その つど 直す ほうが 早い。

   大きさだけは プロンプトに たよらず、出したあとに 機械で そろえる
   （fit）。ここが ばらつくと 並べたとき いちばん 目立つため。

   絵がらを そろえるのは REF_KEYS の 手本。文だけでは そろわない */
const STYLE = [
  'A cute kawaii mascot character for a pastel tower-defense mobile game.',
  'Soft pastel palette: pink #ff8fc4, lavender #c9a7ff, mint #8fe3c4, cream #fff6e9.',
  'Keep the palette soft and pastel: colours are mixed with white, never neon.',
  'The one exception is the marking an animal is known by: the patches of a panda,',
  'the back of a penguin, the black of an orca. Keep those clearly dark so the',
  'animal stays recognisable, but use a soft charcoal, never pure black.',
  'When the real animal is a dull grey or brown, do not copy that literally.',
  'Lift it into a soft pastel version of the same hue so it stays cute.',
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

/* 絵がらの 手本。**これが 98体を そろえる かなめ。**
   おなじ プロンプトでも 1回ごとに 絵が 変わり、seed も 効かないので、
   文だけで そろえるのは むり（3体で ためして だめだった）。
   気に入った 絵を 入力に 入れて「この 絵がらの まま」と 頼む。
   出す子 じしんは 手本から のぞく（自分を 見せると 寄せすぎる）*/
const REF_KEYS = ['bear', 'ghost', 'sheep'];
const REF_LINE = [
  'The attached images show the exact art style to follow: the same outline weight,',
  'the same pastel shading, the same eye and cheek treatment, the same proportions.',
  'Draw the new character as if it came from the same set, but do NOT copy their',
  'body shapes - only the style.',
].join(' ');

/* ゲームに はる ぶんの 大きさ。ばんめんでは せいぜい 128px なので、
   dpr 2 を 見ても 256 で 足りる。1024 の まま はると Web版が 重くなる */
const SPRITE = 256;

/* 白い 背景を ぬいて 透過に する。
   **ただ 白を ぬいては だめ。**おばけも ヒツジも 中みが 白〜クリームなので、
   白さだけで 消すと からだに 穴が あく（実際 おばけは ほとんど 消える）。
   だから ふちから つながっている ところだけを 背景と みなして ぬる。
   中の 白は どこにも つながっていないので のこる */
async function cutout(page, buf, size){
  return Buffer.from(await page.evaluate(async ({ src, S }) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, S, S);
    const im = x.getImageData(0, 0, S, S), d = im.data;
    const lum = k => .299*d[k*4] + .587*d[k*4+1] + .114*d[k*4+2];

    /* ふちから ぬりつぶしで つながりを たどる。しきい値は JPEG の
       にじみを 食べる ぶん すこし 低め */
    const TH = 236;
    const bg = new Uint8Array(S*S), st = [];
    for (let i=0;i<S;i++){
      for (const k of [i, (S-1)*S+i, i*S, i*S+S-1])
        if (!bg[k] && lum(k) >= TH){ bg[k] = 1; st.push(k); }
    }
    while (st.length){
      const k = st.pop(), i = k % S, j = (k - i) / S;
      for (const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const ni = i+di, nj = j+dj;
        if (ni<0||ni>=S||nj<0||nj>=S) continue;
        const t = nj*S + ni;
        if (!bg[t] && lum(t) >= TH){ bg[t] = 1; st.push(t); }
      }
    }
    /* 背景は すきとおらせる。のこった ふちは JPEG の にじみで
       うすく 白いので、背景に せっする ところだけ half に して なじませる */
    for (let k=0;k<S*S;k++) if (bg[k]) d[k*4+3] = 0;
    for (let j=0;j<S;j++) for (let i=0;i<S;i++){
      const k = j*S+i; if (bg[k] || lum(k) < 246) continue;
      let touch = false;
      for (const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]])
        if (bg[(j+dj)*S + (i+di)]) touch = true;
      if (touch) d[k*4+3] = 110;
    }
    x.putImageData(im, 0, 0);
    return c.toDataURL('image/png').split(',')[1];
  }, { src: 'data:image/png;base64,' + buf.toString('base64'), S: size }), 'base64');
}

/* 出す子。キーは index.html の CREATURES の opt.key と そろえる。

   **よこ向きの子は「目は1つ・口なし」と 書くこと。**index.html の
   GSIDE に のっている子（さかな・けもの・カメ・ユニコーンなど）は
   よこ顔で えがく きまりで、よこから 見て 目が2つ 見えることは ない。
   STYLE は「目は2つ」と 書いてあるので、その子の 文で うわがきする。

   **見本を もらった 7体（オオカミ・シカ・トラ・ライオン・ネズミ・
   レッサーパンダ・リス）は すわった 正面むきに した。**
   よこ向きの きまり（GSIDE）は drawGen の 中の 話で、絵に さしかえた子は
   そこを とおらないので かからない。顔が よく 見えるぶん かわいい。
   のこりの よこ向きの子は そのままなので、いまは 2しゅるいが まざっている。

   さらに トラ・シカ・オオカミは 2回目の 見本を もらって、
   **からだは よこ（ななめ）で 顔だけ こちらを むく**形に した。
   まっすぐ 正面より 動きが あって けものらしい。
   トラと オオカミは 四つ足で 立ち、シカは すわる。

   **けものは ぜんぶ「からだは よこ（ななめ）、顔だけ こちら」で そろえる。**
   はじめは よこ顔（目1つ・口なし）だったが、見本を もらって この形に した。
   まっすぐ 正面より 動きが あって、顔も よく 見える。
   歩く子（ウマ・シマウマ・キリン・ブタ・ハリネズミ・トラ・オオカミ）は
   四つ足で 立ち、すわる子（ライオン・ネズミ・リス・コアラ・サル・
   ナマケモノ・レッサーパンダ・シカ）は すわる。
   カンガルーだけ うしろ足で 立つ。
   **リスだけ すわって 正面**（どんぐりは 持たない）。ここは 見くらべて
   えらんだ もので、そろえるより この絵の ほうが よかった。

   よこ顔の きまり（GSIDE）は drawGen の 中の 話で、絵に さしかえた子は
   そこを とおらないので かからない。

   **さかな・鳥は よこ向きの まま**（目1つ・口なし）。
   よこから 見て 目が2つ 見える 生きものでは ないため。
   その子たちは 右を むかせる。index.html の GFX が 正の 数
   （＝かおを 右へ ずらす）なので、ゲームの よこ向きは みんな 右むき。
   書かないと 左むきで 出る（1バッチ目で 6体 そうなった）。
   タツノオトシゴだけ GFX が -0.08 なので 左むき。

   色は CREATURES の パレットに そろえる。ちがう色で 出すと
   ゲームの 中の その子と 別人に 見える。

   人の キャラ（てんし・まじょ・おひめさま など）も まえ向き。
   服・ぼうし・つえまで 書かないと ただの 人形に なる。
   むらさきの こさは あくま・まじょの しるしなので 持ちあげない。

   おかしは ぜんぶ まえ向き（GSIDE に のっていない）。
   焼きがしの こげ茶（プレッツェル・チュロス・ワッフル・バウム・
   カステラ・シュークリーム）と、あんこの こい色（おはぎ・もなか・
   あんみつ）も 持ちあげない。焼き色と あんこは その 食べものの しるし。
   チョコ・せんべい・クッキーの こげ茶は 持ちあげない。
   パステルに すると チョコに 見えなく なるので、パンダと おなじ あつかい
   （そろえておくと、あとで 絵と キャラを つきあわせるのが 1行ですむ）*/
const ART = {
  ウサギ:  { key:'rabbit', p:'A pink bunny standing on two legs, long upright ears with darker pink inner ears, small brown nose.' },
  ヒツジ:  { key:'sheep',  p:'A cream sheep standing upright on two short legs like a plush toy, fluffy scalloped wool, floppy ears, pale gold curled spiral horns drawn on top of the wool.' },
  おばけ:  { key:'ghost',  p:'A white round ghost with a flowing wavy tail streaming to one side, tiny stubby arms.' },
  クラゲ:        { key:'jelly', p:'A round pink jellyfish with a translucent dome and short frilly tentacles hanging below.' },
  ヒトデ:        { key:'starfish', p:'A chubby coral orange starfish with five rounded arms, seen from the front.' },
  カクレクマノミ:    { key:'clownfish', p:'An orange clownfish facing right, seen from the side, one visible eye and no mouth, white bands edged with soft charcoal, small rounded fins.' },
  ヤドカリ:       { key:'hermit', p:'A hermit crab facing right, seen from the side, one visible eye and no mouth, sandy beige spiral shell, small coral pink claws.' },
  タツノオトシゴ:    { key:'seahorse', p:'A golden yellow seahorse seen from the side, one visible eye and no mouth, curled tail, small dorsal fin.' },
  カニ:         { key:'crab', p:'A red-orange crab seen from the front, wide flat shell, two rounded claws held up, small legs.' },
  タコ:         { key:'octopus', p:'A rose pink octopus seen from the front, round head, eight short curling arms.' },
  イルカ:        { key:'dolphin', p:'A soft periwinkle blue dolphin facing right, seen from the side, one visible eye and no mouth, cream belly, curved dorsal fin.' },
  シャチ:        { key:'orca', p:'An orca facing right, seen from the side, one visible eye and no mouth, soft charcoal back and white belly, tall rounded dorsal fin.' },
  アザラシ:       { key:'seal', p:'A soft pale blue seal facing right, seen from the side, one visible eye and no mouth, plump body, cream belly, small front flippers.' },
  サメ:         { key:'shark', p:'A blue-grey shark facing right, seen from the side, one visible eye and no mouth, pale belly, rounded friendly snout, tall dorsal fin.' },
  マンタ:        { key:'manta', p:'A manta ray seen from the front, wide triangular wings in soft periwinkle blue with a cream belly, two small head fins, gentle face.' },
  クジラ:        { key:'whale', p:'A blue whale facing right, seen from the side, one visible eye and no mouth, very pale blue belly, a small spout of water above the head.' },
  カメ:         { key:'turtle', p:'A green turtle facing right, seen from the side, one visible eye and no mouth, tan domed shell, four short legs.' },
  ユニコーン:      { key:'unicorn', p:'A white unicorn facing right, seen from the side, one visible eye and no mouth, lavender mane and tail, a small pale gold spiral horn.' },
  ようせい:       { key:'fairy', p:'A tiny fairy girl standing on two legs, pink dress, translucent rounded wings, small pale gold wand.' },
  ちょうちょ:      { key:'butterfly', p:'A butterfly seen from the front, two large rounded wings in soft tan and cream, thin antennae, small body.' },
  だんご:        { key:'dango', p:'Three round dumplings on a wooden stick, cream, pale green and pink, stacked in a vertical row, the face on the middle one.' },
  だいふく:       { key:'daifuku', p:'A round white mochi daifuku dusted with pale pink, sitting, soft and plump.' },
  ようかん:       { key:'youkan', p:'A block of youkan jelly with rounded corners, soft plum purple, glossy top.' },
  カモメ: { key:'gull', p:'A white seagull facing right, seen from the side, one visible eye and no mouth, pale blue-grey wing, small orange beak and feet.' },
  ハクチョウ: { key:'swan', p:'A white swan facing right, seen from the side, one visible eye and no mouth, long curved neck, orange beak with a small dark knob, folded wing, fanned tail.' },
  フクロウ: { key:'owl', p:'A tawny brown owl facing right, seen from the side, one visible eye and no mouth, cream belly, small ear tufts, short hooked beak.' },
  ワシ: { key:'eagle', p:'A soft cocoa brown eagle facing right, seen from the side, one visible eye and no mouth, cream white head, pale gold hooked beak and pale gold feet, fanned tail.' },
  テントウムシ: { key:'ladybug', p:'A ladybug seen from the front, round domed shell in a warm strawberry red with soft charcoal spots, small charcoal head, tiny legs.' },
  ミツバチ: { key:'bee', p:'A round honeybee seen from the front, golden yellow body with soft charcoal stripes, small translucent wings.' },
  ネズミ: { key:'mouse', p:'A soft lavender-grey mouse sitting up, its body turned to the side and its head turned to face the viewer, very big round ears with pink inner ears, cream muzzle and belly, a small pink nose, fine whiskers, and a long thin tail curving out behind.' },
  リス: { key:'squirrel', p:'An orange-brown squirrel sitting and facing the viewer, tufted ears, cream muzzle and belly, front paws resting together in front of it and holding nothing, and a big bushy tail curving up behind it. No branch, log or ground under it.' },
  ハリネズミ: { key:'hedgehog', p:'A sandy beige hedgehog standing on all four short legs, its body turned to the side and its head turned to face the viewer, a long pointed snout, cream muzzle and belly, and a back covered in soft rounded quills.' },
  コアラ: { key:'koala', p:'A soft lavender-grey koala sitting, its body turned to the side and its head turned to face the viewer, very big round fluffy ears with pink inside, a wide head, a large dark rounded nose, and cream chest.' },
  サル: { key:'monkey', p:'A tan brown monkey sitting, its body turned to the side and its head turned to face the viewer, round ears, a pale cream ring around the face, cream chest, and a long tail curling behind it.' },
  シカ: { key:'deer', p:'A tan fawn sitting with its body turned to the side and its head turned to face the viewer, big round head, large soft ears, two slender antlers, cream muzzle and chest, white spots over its back, slender legs folded under it, a small puff tail.' },
  オオカミ: { key:'wolf', p:'A fluffy wolf cub standing on all four legs, its body turned to the side and its head turned to face the viewer. Its back, head and the outside of its ears are a deep charcoal grey, while its muzzle, cheeks, chest ruff, belly, legs and the tip of its big bushy tail are cream; the boundary between the two is clear and easy to read even when small. Big round dark eyes with white highlights, round pink cheeks, a small closed smiling mouth with one tiny white fang peeking out, and soft rounded ears.' },
  カンガルー: { key:'kangaroo', p:'A tan brown kangaroo standing on its big hind feet, its body turned to the side and its head turned to face the viewer, small rounded ears, a cream belly pouch, short front paws held in front, and a thick tail resting behind.' },
  ウマ: { key:'horse', p:'A caramel brown horse standing on all four legs, its body turned to the side and its head turned to face the viewer, a long head, cream muzzle, a soft cocoa mane, and a tuft tail.' },
  トラ: { key:'tiger', p:'An orange-yellow tiger cub standing on all four legs, its body turned to the side and its head turned to face the viewer, big round head, small rounded ears with cream inner ears, soft brown stripes over the head, back and tail, cream muzzle, chest, belly and paws, tail curving up behind.' },
  ライオン: { key:'lion', p:'A golden lion cub sitting, its body turned to the side and its head turned to face the viewer, big round head framed by a full amber mane, small rounded ears, cream muzzle, and a long tail with an amber tuft at the end curving round beside it.' },
  レッサーパンダ: { key:'redpanda', p:'A rust orange red panda sitting, its body turned to the side and its head turned to face the viewer, white eyebrows, white muzzle and cheeks, round ears edged with white, and a thick tail with pale rings curving round beside it.' },
  ナマケモノ: { key:'sloth', p:'A warm greige sloth sitting, its body turned to the side and its head turned to face the viewer, a flat round face with a cream ring around the eyes, long curved claws resting in front, and a sleepy look.' },
  シマウマ: { key:'zebra', p:'A white zebra standing on all four legs, its body turned to the side and its head turned to face the viewer, soft charcoal stripes over the body and legs, a long head, an upright charcoal mane, and a tuft tail.' },
  キャンディ: { key:'candy', p:'A round pink hard candy inside a twisted clear wrapper, glossy.' },
  クッキー: { key:'cookie', p:'A round golden butter cookie with dark chocolate chips, keep the cocoa brown of the chips.' },
  ドーナツ: { key:'donut', p:'A ring doughnut with pink strawberry icing and tiny colourful sprinkles.' },
  プリン: { key:'purin', p:'A custard pudding with caramel sauce running down the sides, wobbly and glossy.' },
  マカロン: { key:'macaron', p:'A pink macaron, two round shells with a pale cream filling between them.' },
  わたあめ: { key:'watame', p:'A fluffy cloud of cotton candy in pink and lavender on a thin paper stick.' },
  ほしクッキー: { key:'star', p:'A golden star shaped cookie with a lightly sugared surface.' },
  アイス: { key:'icecream', p:'A scoop of pale blue soda ice cream sitting in a golden waffle cone.' },
  ソフトクリーム: { key:'soft', p:'A tall swirl of cream coloured soft serve in a golden cone.' },
  かきごおり: { key:'kakigori', p:'A bowl of shaved ice piled into a fluffy dome with pale blue syrup poured over it.' },
  チョコ: { key:'choco', p:'A bar of milk chocolate with square segments, one corner broken off, keep the warm cocoa brown.' },
  ショートケーキ: { key:'cake', p:'A slice of strawberry shortcake, white cream layers with a strawberry on top.' },
  パフェ: { key:'parfait', p:'A tall parfait in a footed sundae glass, built the way a real parfait is: cornflakes and cubes of jelly at the bottom seen through the glass, a scoop of pale ice cream above them, then a tall swirl of whipped cream rising above the rim, topped with a strawberry, a slice of banana and a small mint leaf, with a thin wafer stick tucked in at an angle.' },
  マカロンタワー: { key:'tower', p:'A pyramid of macarons in exactly four rows, counted from the top: row 1 is a single macaron, row 2 has exactly two macarons, row 3 has exactly three, row 4 at the bottom has exactly four. Exactly ten macarons in total. Do not add any further row and do not repeat a row count. All the same size. Use exactly these four colours: sugar plum pink #ED70B1, sky blue #8FD8F0, mint green #A8EBD3, butter yellow #FFEBAF. All four are soft milky pastel tints, light and gentle, never neon and never deep; the pink stays clearly rosy pink, not mauve and not orange. Colour each macaron exactly as follows, reading each row from left to right. Row 1: sugar plum pink. Row 2: mint green, butter yellow. Row 3: sugar plum pink, sky blue, sugar plum pink. Row 4: sky blue, mint green, butter yellow, sky blue. The face is on the row 1 macaron. Every macaron including the one with the face is a proper macaron with two round shells and a filling between them.' },
  ウエディングケーキ: { key:'wedding', p:'A three tier white wedding cake with pink piping and a small pale gold topper.' },
  こんぺいとう: { key:'konpeito', p:'A single konpeito sugar candy, a small round ball covered in tiny blunt bumps, pale pink.' },
  マシュマロ: { key:'marshmallow', p:'A soft white marshmallow cylinder, plump and rounded.' },
  グミ: { key:'gummy', p:'A bright pink gummy bear, translucent and glossy like jelly.' },
  せんべい: { key:'senbei', p:'A round toasted rice cracker, golden, with a strip of dark seaweed wrapped across it.' },
  わらびもち: { key:'warabi', p:'A cube of warabimochi jelly, pale translucent grey, dusted with soft brown kinako powder.' },
  まんじゅう: { key:'manju', p:'A round steamed manju bun, pale cream dough, with a small red stamp on top.' },
  ゼリー: { key:'jelly2', p:'A cube of pale blue jelly, translucent and glossy, slightly wobbly.' },
  さくらもち: { key:'sakuramochi', p:'A pink sakuramochi rice cake wrapped in a green salted cherry leaf.' },
  もなか: { key:'monaka', p:'A monaka wafer sandwich, two pale cream crisp shells with dark red bean paste between them, keep the bean paste dark.' },
  おはぎ: { key:'ohagi', p:'A round ohagi rice cake fully coated in chunky sweet red bean paste. The paste is a deep plum red-brown #7A4A5E, dark but clearly reddish, never black and never grey. Its surface is grainy with visible whole beans, not smooth and not glossy.' },
  カステラ: { key:'castella', p:'A slice of castella sponge cake, golden yellow with a browned bottom crust, keep the baked brown.' },
  あんみつ: { key:'anmitsu', p:'A small bowl of anmitsu, mint green agar cubes with a scoop of dark red bean paste, keep the bean paste dark.' },
  ポップコーン: { key:'popcorn', p:'A red and white striped carton overflowing with fluffy cream popcorn.' },
  プレッツェル: { key:'pretzel', p:'A twisted pretzel, baked golden brown with a scatter of salt, keep the baked brown.' },
  チュロス: { key:'churro', p:'A ridged churro stick dusted with cinnamon sugar, baked golden brown, keep the baked brown.' },
  ワッフル: { key:'waffle', p:'A square waffle with deep grid pockets, baked golden brown, keep the baked brown.' },
  パンケーキ: { key:'pancake', p:'A stack of two round pancakes with a pat of butter on top and honey running down the side, baked golden.' },
  カップケーキ: { key:'cupcake', p:'A cupcake in a paper case with a tall swirl of pink frosting on top.' },
  シュークリーム: { key:'cream', p:'A round choux cream puff, pale baked golden shell split open with cream showing.' },
  エクレア: { key:'eclair', p:'A long eclair, pale choux pastry topped with a dark chocolate glaze, keep the chocolate dark.' },
  ロールケーキ: { key:'roll', p:'A slice of rolled cake seen end on, showing a pink cream spiral inside a pale sponge.' },
  バウムクーヘン: { key:'baum', p:'A ring of baumkuchen with visible tree rings, baked golden brown, keep the baked brown.' },
  ミルフィーユ: { key:'mille', p:'A mille feuille, layers of pale flaky pastry with pink cream between them and a strawberry on top.' },
  タルト: { key:'tart', p:'A round fruit tart, a golden pastry shell filled with bright pink strawberries.' },
  モンブラン: { key:'mont', p:'A mont blanc cake piled with fine golden tan chestnut cream strands, with a small chestnut on top.' },
  キリン: { key:'giraffe', p:'A golden yellow giraffe standing on all four long legs, its body turned to the side and its head turned to face the viewer, a long neck, two small ossicone horns, soft brown patches over the body, cream muzzle, and a tuft tail.' },
  スライム: { key:'slime', p:'A round mint green slime blob, translucent and jelly like, with a soft wobbly bottom edge.' },
  てんし: { key:'angel', p:'A small chibi angel girl standing, white robe, long golden hair, a gold halo floating above her head, small white feathered wings.' },
  あくま: { key:'devil', p:'A small chibi devil girl standing, plum purple outfit, small bat wings, two little horns, dark hair, a thin pointed tail.' },
  にんぎょ: { key:'mermaid', p:'A small chibi mermaid girl, long golden hair, a pink top, and a sky blue fish tail instead of legs.' },
  ゴーレム: { key:'golem', p:'A chunky golem built from rounded lavender grey stone blocks, thick short arms, a small head, standing on two stubby legs.' },
  まほうつかい: { key:'wizard', p:'A small chibi wizard standing, deep blue robe and a tall pointed blue hat, a long soft white beard, holding a wooden staff topped with a mint green gem.' },
  ゆきのじょおう: { key:'snowqueen', p:'A small chibi snow queen standing, pale ice blue gown, long white blue hair, a crown of pale ice crystals.' },
  まじょ: { key:'witch', p:'A small chibi witch girl standing, purple dress and a wide pointed purple hat, holding a wooden broom.' },
  おひめさま: { key:'princess', p:'A small chibi princess girl standing, pink ball gown, long hair, a small pale gold crown.' },
  おうじさま: { key:'prince', p:'A young prince standing and facing the viewer, a little taller and slimmer than a toddler but still cute and rounded in the same style as the other characters. He wears a smart royal blue jacket with pale gold epaulettes and a row of gold buttons, a rose pink sash across the chest, a short cape hanging from one shoulder, white trousers and boots. Neat light brown hair swept to one side, a small pale gold crown, and a slender sword in a pale gold scabbard at his hip. He stands with one hand resting on the sword hilt, calm and confident, with a small gentle smile.' },
  プリンアラモード: { key:'purinala', p:'A pudding a la mode on an oval plate, arranged the way a real one is: a custard pudding with caramel sauce running down it in the middle, a scoop of vanilla ice cream beside it, a swirl of whipped cream, two orange segments, a strawberry and a cherry arranged around the pudding. The face is on the custard pudding itself.' },
  よくばりパフェ: { key:'bigparfait', p:'A tall parfait in a footed sundae glass with a fluted scalloped rim. Through the glass you can clearly see stacked horizontal layers, from the bottom up: golden peach jelly, pink strawberry sauce, white cream, cornflakes, and a band of chocolate sauce. Heaped high above the rim and spilling generously over both sides is a big pile of fruit and cream: a scoop of vanilla ice cream, a tall swirl of whipped cream, a whole strawberry on the very top, a slice of kiwi, an orange segment, two banana slices, a wedge of green melon and a red cherry. Two thin wafer sticks poke out at angles from the pile. The pile above the rim is at least as tall as the glass itself. The face is on the glass, below the rim.' },
  プリンパフェ: { key:'purinpafe', p:'A deluxe pudding parfait in a wide footed glass bowl. A ring of soft whipped cream fills the bowl, and standing in it are a custard pudding with caramel sauce, a scoop of vanilla ice cream drizzled with chocolate and coloured sprinkles, and a second scoop of pink strawberry ice cream with sprinkles. Arranged around them are an orange slice, a whole strawberry, three blueberries, a slice of kiwi, a wedge of yellow melon and a slice of banana. Two thin wafer sticks stand up at angles at the back and a red cherry sits on the very top. The face is on the custard pudding.' },
  王さま: { key:'king', p:'A small chibi king standing and facing the viewer, a deep lavender purple robe trimmed with white fur, a soft red sash across the chest, a pale gold crown, a short white beard, and a small pale gold sceptre held in one hand.' },
  王妃さま: { key:'queen', p:'A small chibi queen standing and facing the viewer, a soft orchid pink gown with white fur trim at the shoulders, a pale gold crown, long wavy hair, and a small pale gold necklace.' },
  ブタ:    { key:'pig',    p:'A pale pink piggy standing on all four short legs, its body turned to the side and its head turned to face the viewer, a flat round snout, floppy ears, cream belly, and a small curly tail.' },
  ペンギン: { key:'penguin', p:'A small penguin standing on two webbed feet, dark blue-grey back, white front, small orange beak.' },
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
async function generate(model, prompt, refs = []){
  /* 手本を さきに 置いて、そのあと 文。あとに 置くと 文の ほうが 弱まる */
  const reqParts = [];
  for (const k of refs){
    reqParts.push({ inlineData: { mimeType:'image/png',
      data: readFileSync(resolve(root, `art/${k}.png`)).toString('base64') } });
  }
  reqParts.push({ text: STYLE + (refs.length ? '\n\n' + REF_LINE : '') + '\n\n' + prompt });
  const body = {
    contents: [{ role:'user', parts: reqParts }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
  };
  const j = await call(`models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const u = j?.usageMetadata;
  if (u) process.stdout.write(`[in ${u.promptTokenCount||0} / out ${u.candidatesTokenCount||0}] `);
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
/* ゲームに はる ぶんを 出す。art/ の 絵から 作るので、出しなおさない。
   もとの 絵（art/*.png）は 白い 背景の まま のこす。モデルが かえした
   ものに 近い ほうが、あとで 別の 抜きかたを 試せるため */
if (args[0] === '--sprites'){
  const dir = resolve(root, 'art'), out = resolve(root, 'art/sprites');
  mkdirSync(out, { recursive: true });
  const files = readdirSync(dir).filter(n => /\.png$/i.test(n));
  if (!files.length) die('art/ に 絵が ありません');
  await withPage(async page => {
    for (const n of files){
      const png = await cutout(page, readFileSync(resolve(dir, n)), SPRITE);
      writeFileSync(resolve(out, n), png);
      console.log(`art/sprites/${n} (${(png.length/1024).toFixed(0)}KB) ✅`);
    }
  });
  process.exit(0);
}

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
    const refs = REF_KEYS.filter(k => k !== a.key);
    const { buf, mime } = await generate(GEN_MODEL, a.p, refs);
    if (!EXT[mime]) die(`知らない 形式 ${mime}。EXT に 足してください`);
    /* そろえたあとは かならず PNG。名前と 中みが 合う */
    const png = await fit(page, buf, mime);
    writeFileSync(resolve(root, `art/${a.key}.png`), png);
    console.log(`art/${a.key}.png (${(png.length/1024).toFixed(0)}KB) ✅`);
  }
});
