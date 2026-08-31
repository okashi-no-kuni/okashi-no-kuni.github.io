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
  'Plain solid white background, no shadow on the ground, no text, no watermark, no border.',
].join(' ');

/* たちかたは STYLE から 切りはなす。ふだんは まえ向きで そろえたいが、
   「おかえりなさい」の まじょだけは ほうきで とんでいる ところが ほしい。
   STYLE に 書きこんだ ままだと、あとの 文で「ななめに とんで」と 書いても
   まえ向きの 指示と けんかして、立った 絵が かえって くる（実際 そうなった）。
   だから ART の エントリが `pose` を 持っていたら そちらを つかう */
const POSE_FRONT = 'Front facing, whole body visible, centered, generous margin on all sides.';

/* 画面の 絵。キャラでは ないので わくに そろえたり 切りぬいたり しない
   （まわりの 景色まで ふくめて 1まいの 絵なので、切ると こわれる）。
   出しかた: node tools/gen-art.mjs --scene welcome
   出しさきは art/screens/。art/sprites/ に 入れると check-chars が
   「ART_KEYS に 無い」と おこる */
const SCENES = {
  welcome: {
    file: 'welcome',
    aspect: '4:3',
    /* 手本に 王さま・王妃さま・おうじさま・おひめさま・タフィを 入れる。
       この5人は 図鑑にも 出るので、**別人に なると 気づかれる**。
       まじょのときと 同じで、おなじ子を 出すなら 本人を 手本に 入れること */
    refs: ['king', 'queen', 'prince', 'princess', 'taffy'],
    p:'A wide storybook illustration for the opening screen of a cute pastel '
    + 'tower-defense game, in the same art style as the attached characters.\n\n'
    + 'SETTING: a sunny candy kingdom. In the background stands a big gingerbread and '
    + 'biscuit castle with cream-swirled towers and little flags, gingerbread houses, '
    + 'cotton-candy trees, lollipops and rolling pastel hills under a soft blue sky '
    + 'with fluffy clouds.\n\n'
    + 'FOREGROUND: all the characters stand together in one friendly row on the path in '
    + 'front of the castle, facing the viewer, smiling and waving, as if posing for a '
    + 'group photo. From left to right:\n'
    + '1. The rainbow twisted taffy character in a small black top hat, playing a flute.\n'
    + '2. A small round layered shortcake character with a cherry on top, waving.\n'
    + '3. The KING - the tall character in the tall crown and the long fur-trimmed royal '
    + 'robe covered in fruit and cream, with a big brown beard - shown here laughing '
    + 'with his mouth open and one arm raised in a big welcoming wave.\n'
    + '4. The QUEEN - the elegant lady with the tiara, curled brown hair and the pale '
    + 'gown - shown here with her eyes closed in a warm smile, both hands clasped '
    + 'together in front of her.\n'
    + '5. The PRINCESS in the apple-red and cream gown with a flower crown.\n'
    + '6. The PRINCE in the strawberry-green outfit with a small crown and a shield.\n'
    + '7. A round donut character with sprinkles, wearing an apron.\n'
    + '8. Standing right beside them as friends, not fighting: a big soft chocolate '
    + 'golem, a pale green slime, a small spiky dark creature, and a little bat, all '
    + 'smiling shyly and waving too.\n\n'
    + 'Everyone is roughly the same height in the row so no one is hidden. Warm, '
    + 'peaceful and welcoming - nobody is fighting. No text, no letters, no captions, '
    + 'no logo, no watermark, no frame or border.' },
  /* 伝説との 1対1の 背景。**キャラは 入れない**（あとから canvas で
     まじょや 伝説を 上に えがくため）。まん中が すいている 構図に して、
     左右に 2体 立てる 場所を あける。
     色は THEMES の その国の 値を そのまま 文に して、盤面と つながって
     見えるように する（ちがう 色で 出すと 別の 国に 見える）*/
  /* --- 12の国 ぜんぶ ぶん。**その国だと ひとめで わかる 目じるしを
     1つ 決めて、それを 主役に する。**「砂漠」だけでは どこも 同じ
     すな色に なるので、さばくのくには **ピラミッドと スフィンクス**、
     キャラメルのさばくは **あめ色の 岩と サバンナの 木** で 分ける
     （CLAUDE.md の「同じあめ色にすると 見わけられない」と 同じ考え）*/
  duel_sugar: { file:'duel_sugar', aspect:'3:2', p: duelBg(
    'シュガーガーデン', 'a bright sugar garden',
    'A wide mint-green meadow (#d9f7e6) with rows of candy flowers and lollipop stems. '
    + 'A cream-coloured brick path (#f0c9a0) winds through it, low hedges of green jelly, '
    + 'and round topiary made of pastel gumdrops. Sunny and gentle.') },
  duel_berry: { file:'duel_berry', aspect:'3:2', p: duelBg(
    'いちごのおかしばたけ', 'a strawberry sweets field',
    'Wide fields of pink strawberry cream (#ffe4ef) laid out in neat rows like farmland, '
    + 'with giant ripe strawberries growing out of them and little white cream blossoms. '
    + 'A biscuit-brown farm track (#c98a5e) runs between the rows. A small barn made of '
    + 'shortcake stands in the distance.') },
  duel_forest: { file:'duel_forest', aspect:'3:2', p: duelBg(
    'マカロンのもり', 'a soft green macaron forest',
    'Rolling pastel-green hills (#c8e6c0) with tall trees whose canopies are giant '
    + 'pastel macarons in pink, cream and lavender. A winding cocoa-brown path (#8a5a34) '
    + 'runs across the middle distance. Toadstools made of cream and berries dot the grass.') },
  duel_snow: { file:'duel_snow', aspect:'3:2', p: duelBg(
    'ゆきのケーキやま', 'a snowy cake mountain',
    'A pale blue-white snowfield (#f2f4fa) under a soft winter sky. Behind it rise '
    + 'mountains shaped like tiered cakes with thick white cream snow on top and pale '
    + 'blue icing (#a8c4e6) running down the sides. Sugar snowflakes drift in the air, '
    + 'and little snowdrifts of whipped cream sit in the foreground.') },
  duel_choco: { file:'duel_choco', aspect:'3:2', p: duelBg(
    'チョコレートのたに', 'a chocolate valley',
    'A deep valley whose walls are layered chocolate cliffs in milk and cocoa brown '
    + '(#8a5a34, #b07d4e), with rivers of melted chocolate running along the bottom and '
    + 'waterfalls of chocolate pouring from ledges. Beige biscuit ground (#eed9c2) in '
    + 'front, and wafer bridges crossing high above.') },
  duel_ice: { file:'duel_ice', aspect:'3:2', p: duelBg(
    'こおりのくに', 'a land of ice',
    'A pale blue frozen land (#e2f3fc) of clear ice. Tall translucent ice crystals and '
    + 'pillars like sugar candy rise out of a frozen mirror-smooth lake, and a palace of '
    + 'blue ice glitters far in the distance. Everything sparkles faintly.') },
  duel_sea: { file:'duel_sea', aspect:'3:2', p: duelBg(
    'ソーダのうみべ', 'a soda seaside',
    'A pale cream sand beach (#e8c49a) in the foreground meeting a bright aqua soda sea '
    + '(#d3f2f5) full of rising bubbles, with soft foam like whipped cream at the water '
    + 'line. Beach umbrellas made of striped candy and a few shells lie on the sand.') },
  duel_caramel: { file:'duel_caramel', aspect:'3:2', p: duelBg(
    'キャラメルのさばく', 'a caramel desert savanna',
    'A warm amber caramel desert (#f5dfb0) of rolling dunes that look like poured '
    + 'caramel, with tall flat-topped savanna trees whose canopies are golden brittle, '
    + 'and big rounded caramel rocks (#b5722f). Warm afternoon light.') },
  duel_egypt: { file:'duel_egypt', aspect:'3:2', p: duelBg(
    'さばくのくに', 'an ancient desert kingdom',
    'A pale cookie-coloured desert (#f9ead6) of fine sand. **Behind it stand three great '
    + 'PYRAMIDS built of stacked biscuit blocks**, and beside them a big stone SPHINX '
    + 'carved out of sandy-beige nougat. Rows of sandstone pillars carved with simple '
    + 'shapes, a tall obelisk, and a few date palms with candy fronds. Clearly ancient '
    + 'Egypt, but made of sweets and drawn in a soft cute pastel style, never realistic '
    + 'or dusty.') },
  duel_fire: { file:'duel_fire', aspect:'3:2', p: duelBg(
    'ひのくに', 'a warm land of fire',
    'A warm coral-pink ground (#f6dcd8) with rivers of glowing caramel lava in soft '
    + 'coral and apricot (#c96a4a, #ffb07a) - **warm and glowing, never harsh red**. '
    + 'Behind it stand gentle volcano hills topped with cream, and floating embers that '
    + 'look like tiny golden sugar sparks drift up through the air.') },
  duel_night: { file:'duel_night', aspect:'3:2', p: duelBg(
    'よぞらのくに', 'a night-sky land',
    'A soft lavender night land (#ded4f6) under a deep starry sky. Hills of dark violet '
    + 'jelly, glowing golden stars scattered across the ground like dropped candy, a big '
    + 'pale crescent moon low on the horizon, and a path of gold sugar (#d9b96a) leading '
    + 'towards it. Dreamy, calm and sparkling - never gloomy or dark.') },
  duel_rainbow: { file:'duel_rainbow', aspect:'3:2', p: duelBg(
    'にじのてんくう', 'a rainbow sky kingdom',
    'Floating islands of pastel cloud and cotton candy high in a bright sky, joined by '
    + 'wide rainbow bridges. Golden sugar railings (#d9a54e), drifting clouds like '
    + 'whipped cream, and a soft lilac-to-pink gradient sky (#eadcf8, #f6d9ee) with '
    + 'sunbeams. Airy and magical.') },
};

/* 対戦の 背景は どれも 同じ 作りに する。ちがうのは 景色だけ。
   1つ1つ 文を 書くと 構図が バラバラに なって、同じ ゲームの
   画面に 見えなく なる */
function duelBg(jp, what, scene){
  return 'A wide background illustration for a one-on-one boss battle screen in a cute '
    + 'pastel candy tower-defense game. This is ' + what + ' called "' + jp + '".\n\n'
    + scene + '\n\n'
    + 'IMPORTANT: this is scenery only. **Draw no characters, no creatures, no people, '
    + 'no faces and no eyes anywhere.** Leave the middle and lower half of the picture '
    + 'open and uncluttered, because two characters will be drawn on top of it later - '
    + 'one on the left and one on the right. Keep the detail in the upper half and the '
    + 'far distance; keep the foreground simple.\n'
    + 'Soft pastel palette mixed with white, never neon. Rounded shapes only, no sharp '
    + 'corners. Simple flat vector style with soft gradient shading, the same storybook '
    + 'look as a cute mobile game. Slightly dreamy and magical, as if something special '
    + 'is about to happen. No text, no letters, no logo, no watermark, no frame.';
}

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

   **さかな・鳥も 顔は こちらに むける。**目は2つ、口（鳥は くちばし）を つける。
   はじめは よこ顔（目1つ・口なし）だったが、顔が 見えない ぶん
   そっけなく 見えるので やめた。

   **フクロウだけ からだごと まっすぐ 正面。**ふくろうは もともと
   両目が 前を むいている 鳥なので、これが しぜん。

   よこ顔の きまり（GSIDE）は drawGen の 中の 話で、絵に さしかえた子は
   そこを とおらないので かからない。index.html の GFX が 正の 数
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
  カクレクマノミ:    { key:'clownfish', p:'An orange clownfish, its body turned to the side and its face turned to the viewer, two round eyes with white highlights, a small smiling mouth, white bands edged with soft charcoal, and small rounded fins.' },
  ヤドカリ:       { key:'hermit', p:'A hermit crab, its body turned to the side and its face turned to the viewer, two round eyes with white highlights, a small smiling mouth, a sandy beige spiral shell, and small coral pink claws.' },
  タツノオトシゴ:    { key:'seahorse', p:'A golden yellow seahorse, its body turned to the side and its face turned to the viewer, two round eyes with white highlights, a small smiling mouth, a curled tail and a small dorsal fin.' },
  カニ:         { key:'crab', p:'A red-orange crab seen from the front, wide flat shell, two rounded claws held up, small legs.' },
  タコ:         { key:'octopus', p:'A rose pink octopus seen from the front, round head, eight short curling arms.' },
  イルカ:        { key:'dolphin', p:'A soft periwinkle blue dolphin, its body turned to the side and its face turned to the viewer, two round eyes with white highlights, a small smiling mouth, a cream belly and a curved dorsal fin.' },
  シャチ:        { key:'orca', p:'An orca, its body turned to the side and its face turned to the viewer, two round eyes with white highlights, a small smiling mouth, a soft charcoal back and white belly, and a tall rounded dorsal fin.' },
  アザラシ:       { key:'seal', p:'A soft pale blue seal, its body turned to the side and its face turned to the viewer, two round eyes with white highlights, a small smiling mouth, a plump body, cream belly and small front flippers.' },
  サメ:         { key:'shark', p:'A blue-grey shark, its body turned to the side and its face turned to the viewer, two big round eyes with white highlights, an open smiling mouth showing a row of small white triangular teeth, a pale cream belly, a rounded snout and a tall dorsal fin.' },
  マンタ:        { key:'manta', p:'A manta ray seen from the front, wide triangular wings in soft periwinkle blue with a cream belly, two small head fins, gentle face.' },
  クジラ:        { key:'whale', p:'A blue whale, its body turned to the side and its face turned to the viewer, two round eyes with white highlights, a small smiling mouth, a very pale blue belly, and a small spout of water above the head.' },
  カメ:         { key:'turtle', p:'A green turtle, its body turned to the side and its face turned to the viewer, two round eyes with white highlights, a small smiling mouth, a tan domed shell and four short legs.' },
  ユニコーン:      { key:'unicorn', p:'A white unicorn seen mostly from the side, with its head turned only slightly toward the viewer - just far enough that both eyes and a small smiling mouth can be seen. A long flowing pastel rainbow mane and tail in pink, lavender, mint and sky blue, and a small pale gold spiral horn.' },
  ようせい:       { key:'fairy', p:'A tiny fairy girl standing on two legs, pink dress, translucent rounded wings, small pale gold wand.' },
  ちょうちょ:      { key:'butterfly', p:'A butterfly seen from the front, two large rounded wings in soft tan and cream, thin antennae, small body.' },
  だんご:        { key:'dango', p:'Three round dumplings on a wooden stick, cream, pale green and pink, stacked in a vertical row, the face on the middle one.' },
  だいふく:       { key:'daifuku', p:'A round white mochi daifuku dusted with pale pink, sitting, soft and plump.' },
  ようかん:       { key:'youkan', p:'A block of youkan jelly with rounded corners, soft plum purple, glossy top.' },
  カモメ: { key:'gull', p:'A white seagull, its body turned to the side and its face turned to the viewer, two round eyes with white highlights, a small orange beak, a pale blue-grey wing and small orange feet.' },
  ハクチョウ: { key:'swan', p:'A white swan, its body turned to the side and its face turned to the viewer, two round eyes with white highlights, a small orange beak with a dark knob, a long curved neck, a folded wing and a fanned tail.' },
  フクロウ: { key:'owl', p:'A tawny brown owl sitting and facing the viewer straight on, its body and face both square to the front the way an owl naturally sits, two big round eyes with white highlights, a small hooked beak, a cream belly and small ear tufts.' },
  ワシ: { key:'eagle', p:'A soft cocoa brown eagle, its body turned to the side and its face turned to the viewer, two round eyes with white highlights, a pale gold hooked beak, a cream white head, pale gold feet and a fanned tail.' },
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
  ほしクッキー: { key:'star', p:'A plump five-pointed star character facing the viewer, a bright warm golden yellow. Its surface is smooth and glossy like glass or a gummy sweet: a soft gradient across the body, one large soft highlight sweeping over the upper half, a few small bright white specular glints near the points, and a gentle glow inside. A few pale blue four-pointed sparkles float around it. Rounded and puffy, with no hard edges.' },
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
  /* にじいろの ねじりあめ。おかしの国の 楽しい がわを 見せる 子なので、
     笛を ふいている ところに する（立っているだけだと ただの あめに 見える）*/
  タフィ: { key:'taffy',
    p:'A cheerful taffy candy character standing on two legs. Its body is a long soft '
    + 'twisted stick of taffy in rainbow stripes - pink, peach, yellow, mint and pale '
    + 'blue - spiralling around the body. It has short rounded arms and legs in the same '
    + 'rainbow candy, a small black top hat sitting on its head, and it is holding a '
    + 'slim pale gold flute up to its mouth with both hands, playing it happily with its '
    + 'eyes closed in two happy curves.' },
  /* --- 伝説（特別ウェーブの ボス）。国ごとに 1体。
     **ふつうの子より 少し 大きく・かざりを 多めに。**ならべたとき
     「この子は 特別だ」と ひとめで わかる ように する。
     すでに いる子と かぶらない シルエットを えらぶこと
     （ユニコーン・りゅう・くじゃく・スフィンクス・ひのとり・にんぎょ・
      てんし・ゆきおんな・ゆきのじょおう は もう いる）--- */
  あめのきのせい: { key:'candytree',
    p:'A grand legendary tree spirit shaped like a small candy tree standing on two '
    + 'root-like legs. Its trunk is a swirled stick of pastel candy, its round canopy is '
    + 'made of clustered pink, mint and lavender gumdrops, and lollipops hang from it '
    + 'like fruit. A small gentle face on the trunk, and a thin gold circlet of sugar '
    + 'resting on the canopy.' },
  いちごのじょおう: { key:'berryqueen',
    p:'A legendary strawberry queen: a girl with soft pink hair wearing a wide gown whose '
    + 'skirt is a giant ripe strawberry with cream frills at the hem, a tall gold crown '
    + 'set with a strawberry, a short cream cape, and a slender gold sceptre topped with '
    + 'a strawberry. Calm and noble.' },
  ショコラのきし: { key:'chocoknight',
    p:'A legendary chocolate knight standing tall in rounded armour moulded from glossy '
    + 'milk chocolate, with cream trim at the shoulders and a wafer shield held at its '
    + 'side. A plume of whipped cream rises from its helmet, and a friendly face shows '
    + 'through the open visor. Sturdy and heroic, still soft and rounded.' },
  ひょうがのマンモス: { key:'mammoth',
    p:'A legendary mammoth made of ice and cream: a big rounded body covered in pale '
    + 'blue-white shaggy fur like whipped cream, two long curved tusks of clear sugar '
    + 'ice, a short trunk, small ears, and a crown of frost crystals over its brow. '
    + 'Gentle eyes. Stands facing the viewer.' },
  あわのクラーケン: { key:'kraken',
    p:'A legendary soda kraken: a large rounded head like a translucent aqua soda bubble '
    + 'with a friendly face, and eight thick rounded tentacles curling outward below it, '
    + 'each tipped with pale foam. Small bubbles float around it and a little crown of '
    + 'sea-glass sits on its head. Bright and bubbly, not scary.' },
  キャラメルのぞう: { key:'elephant',
    p:'A legendary desert elephant made of caramel: a big rounded body in warm amber '
    + 'caramel, large soft ears, a raised curling trunk, short tusks of pale nougat, and '
    + 'a decorated saddle blanket of striped candy on its back with small gold bells. '
    + 'Calm and kind, standing facing the viewer.' },
  ほむらのきゅうび: { key:'kyubi',
    p:'A legendary nine-tailed fox of flame: a rounded fox with coral and apricot fur, '
    + 'big ears with cream inner fur, and NINE long fluffy tails fanned out behind it '
    + 'like soft flames in coral, apricot and gold. A small gold flame mark on its brow. '
    + 'Warm and glowing, never harsh red. Sitting and facing the viewer.' },
  つきのうさぎ: { key:'moonrabbit',
    p:'A legendary moon rabbit: a plump pale-cream rabbit with long upright ears edged in '
    + 'pale gold, standing beside a small round mortar of pale stone with a wooden '
    + 'pestle, pounding mochi. A soft crescent moon glows behind its shoulders and tiny '
    + 'gold stars float around it.' },
  にじのペガサス: { key:'pegasus',
    p:'A legendary winged horse with a pastel cream coat, a flowing rainbow mane and '
    + 'tail, and two large feathered wings spread wide. **It has no horn on its head.** '
    + 'Small gold hoof cuffs and a soft rainbow arc of light behind it. Standing facing '
    + 'the viewer, noble and gentle.' },
  まじょ: { key:'witch', p:'A small chibi witch girl standing, purple dress and a wide pointed purple hat, holding a wooden broom.' },
  /* 「おかえりなさい」の 画面 だけの 1体。盤面の まじょ（witch）は 立って いて
     表情も 変えられない ので、あの 画面に そのまま 貼ると 同じ絵が 2か所に
     出て お祝いに 見えない。だから 向きも 表情も ちがう 絵を 別に 出す。
     ゲームの 中には 出さない ので CREATURES には いない */
  とぶまじょ: { key:'witch_fly', refs:['witch'], sprite:512,
    pose:'Seen from the side and slightly above, her whole body and the whole broom visible, '
       + 'centered in the frame with a generous margin on all sides.',
    p:'The attached image is this exact character. Draw HER, the same girl, keeping every '
    + 'detail of her design: straight WHITE hair cut in a blunt fringe under the hat, '
    + 'a light purple pointed hat with a wide brim and a BLACK band with a square buckle '
    + 'on the front, a light purple dress, and a wooden broom with DARK CHARCOAL bristles. '
    + 'Do not change her hair colour, her hat band or her broom. '
    + 'The only thing that changes is what she is doing: she is now flying, sitting '
    + 'side-saddle on the broom which is tilted diagonally upward to the right, her hair '
    + 'and the brim of her hat streaming behind her. She is facing the viewer, winking '
    + 'with one eye closed in a happy curve while the other stays wide open, her mouth '
    + 'open in a cheerful smile, and one hand raised to wave hello.' },
  おひめさま: { key:'princess', p:'A small chibi princess girl standing, pink ball gown, long hair, a small pale gold crown.' },
  おうじさま: { key:'prince', p:'A young prince standing and facing the viewer, drawn with the same chibi proportions as the other characters: a big round head about as tall as the whole body below it, and short little arms and legs. He wears a smart royal blue jacket with pale gold epaulettes and a row of gold buttons, a rose pink sash across the chest, a short cape hanging from one shoulder, white trousers and small boots. Neat light brown hair swept to one side, a small pale gold crown, and a short sword in a pale gold scabbard at his hip, with one hand resting on the hilt. Calm and confident, with a small gentle smile.' },
  プリンアラモード: { key:'purinala', p:'A pudding a la mode on an oval plate, arranged the way a real one is: a custard pudding with caramel sauce running down it in the middle, a scoop of vanilla ice cream beside it, a swirl of whipped cream, two orange segments, a strawberry and a cherry arranged around the pudding. The face is on the custard pudding itself.' },
  よくばりパフェ: { key:'bigparfait', p:'A tall parfait in a footed sundae glass with a fluted scalloped rim. Through the glass you can clearly see stacked horizontal layers, from the bottom up: golden peach jelly, pink strawberry sauce, white cream, cornflakes, and a band of chocolate sauce. Heaped high above the rim and spilling generously over both sides is a big pile of fruit and cream: a scoop of vanilla ice cream, a tall swirl of whipped cream, a whole strawberry on the very top, a slice of kiwi, an orange segment, two banana slices, a wedge of green melon and a red cherry. Two thin wafer sticks poke out at angles from the pile. The pile above the rim is at least as tall as the glass itself. The face is on the glass, below the rim.' },
  プリンパフェ: { key:'purinpafe', p:'A deluxe pudding parfait in a wide footed glass bowl. A ring of soft whipped cream fills the bowl, and standing in it are a custard pudding with caramel sauce, a scoop of vanilla ice cream drizzled with chocolate and coloured sprinkles, and a second scoop of pink strawberry ice cream with sprinkles. Arranged around them are an orange slice, a whole strawberry, three blueberries, a slice of kiwi, a wedge of yellow melon and a slice of banana. Two thin wafer sticks stand up at angles at the back and a red cherry sits on the very top. The face is on the custard pudding.' },
  王さま: { key:'king', p:'A small chibi king standing and facing the viewer, a deep lavender purple robe trimmed with white fur, a soft red sash across the chest, a pale gold crown, a short white beard, and a small pale gold sceptre held in one hand.' },
  王妃さま: { key:'queen', p:'A small chibi queen standing and facing the viewer, a soft orchid pink gown with white fur trim at the shoulders, a pale gold crown, long wavy hair, and a small pale gold necklace.' },
  /* ==== ワザを もつ なかま（12）と でんせつ（3）====
     もとは お菓子の キャラだったが、コレクションの おかしと かぶるので
     しぜんと そらの 精霊に 置きかえた。
     **絵の キーは 新しく とる。**でんせつの whale は コレクションの
     クジラと キーが かぶるため（ART_SPRITE['whale'] は クジラの 絵）*/
  こおりのつぶ: { key:'koori', p:'A snow crystal spirit facing the viewer. Its body is a six-armed snowflake with softly rounded arms and tips, pale icy white-blue with a faint lavender sheen, a small face in the middle, and tiny arms. Small frost sparkles around it. The six-armed snowflake silhouette must read clearly - it is not a round blob and not a droplet.' },
  かみなりのこ: { key:'kaminari', p:'A small thunder spirit facing the viewer, a rounded soft grey storm cloud for a body, holding a pale gold lightning bolt in both arms, with small gold sparks flickering around it.' },
  わたぐも: { key:'watagumo', p:'A small cloud spirit facing the viewer, a soft fluffy white cloud body with rounded lobes, tiny arms and legs, and a faint pale blue mist trailing softly beneath it.' },
  いずみのしずく: { key:'shizuku', p:'A spring water spirit facing the viewer. Its body is a clear teardrop - narrow and pointed at the top, round and full at the bottom - in a fresh aqua turquoise, translucent with a bright glossy highlight. A small face in the lower half, tiny arms, and small ripples and droplets around its feet. The teardrop silhouette must read clearly.' },
  つむじかぜ: { key:'tsumuji', p:'A small whirlwind spirit facing the viewer, a rounded pale mint body with a swirling spiral of wind curling up behind it, tiny arms, and soft curved wind lines around it.' },
  はなびのこ: { key:'hanabi', p:'A small firework spirit facing the viewer, a rounded deep periwinkle body, with bright pastel sparks bursting outward all around it like a firework.' },
  ひかりのわ: { key:'hikari', p:'A light spirit whose body is a glowing ring, not a rounded creature: a broad shining pale gold hoop standing upright, with a small face on the lower part of the ring itself and tiny arms at its sides. The centre of the ring is filled with a soft warm cream glow, never empty white. Soft rays of light radiate outward from the hoop, and a few small sparkles float around it. The ring silhouette must read clearly - it must not look like a rounded blob or a ghost.' },
  よつばのこ: { key:'yotsuba', p:'A small clover spirit facing the viewer, its body made of four soft mint green heart-shaped leaves, tiny arms and legs, with small pale gold sparkles around it.' },
  ふたばのこ: { key:'futaba', p:'A small sprout spirit facing the viewer, a rounded cream body with two soft green sprout leaves growing from its head, tiny arms and legs.' },
  すなどけい: { key:'sunadokei', p:'A small hourglass spirit facing the viewer, a rounded glass hourglass for a body with pale gold sand inside and soft pale wooden frames top and bottom, tiny arms and legs.' },
  たいようのこ: { key:'taiyou', p:'A small sun spirit facing the viewer, a rounded warm golden body with soft rounded rays all around it, glowing gently.' },
  ながれぼし: { key:'nagareboshi', p:'A small shooting star spirit facing the viewer, a rounded pale gold star for a body with a soft pastel tail streaming out behind it, and small sparkles around.' },
  ぎんがのくじゃく: { key:'kujaku', p:'A grand and special peacock facing the viewer with its tail fanned wide behind it. The tail feathers are patterned like a starry night sky in deep periwinkle and lavender with small gold stars scattered over them. Soft pastel body, calm noble expression. More elaborate and impressive than an ordinary character.' },
  ようがんのりゅう: { key:'ryu', p:'A grand and special small dragon facing the viewer, a rounded soft coral and warm orange body with small wings and a row of pale gold spines, gentle flames curling around it. More elaborate and impressive than an ordinary character.' },
  えいえんのスフィンクス: { key:'sphinx', p:'A grand and special small sphinx facing the viewer, a rounded pale sand coloured body with a soft blue striped headdress, small folded wings and pale gold ornaments, a calm timeless expression. More elaborate and impressive than an ordinary character.' },
  // --- さばくのくに。キャラメルのさばくの サバンナの子と かぶらないように、
  //     砂の中の 小さい子と は虫るいで そろえる ---
  サボテン: { key:'cactus', p:'A small cactus character standing upright facing the viewer, a rounded mint green barrel-shaped body with two short rounded arms, soft blunt pale spines, and one small pink flower on top of its head.' },
  スナネコ: { key:'sandcat', p:'A sand cat sitting upright on its haunches facing the viewer, its tail curled around its front paws. A cool greyish sand coat - a soft dove grey warmed only slightly, clearly COOLER and greyer than the warm pink-brown of a teddy bear and cooler than the warm cream sand it sits on - with a white chest, pale pink ear insides, a round flat cat face, small low triangular ears, short whiskers and a small pink nose. Outline the whole character with a clear warm grey-brown line. It must still read clearly when placed on a pale warm sand background and shrunk very small. It is a small round sitting cat - it must not have large upright ears and must not stand on all four legs.' },
  トカゲ: { key:'lizard', p:'A small lizard standing on four short legs, its body turned to the side and its head turned to face the viewer, a soft mint green back, a pale cream belly, a long curling tail and rounded toes.' },
  ミーアキャット: { key:'meerkat', p:'A meerkat standing upright on two hind legs facing the viewer, a sandy beige body with a cream front, small round ears on the sides of its head, a small dark nose and a long thin tail behind it.' },
  サソリ: { key:'scorpion', p:'A small scorpion seen from the front, a rounded apricot orange body, two small rounded pincers held up, short legs, and a tail curling up over its back with a soft blunt rounded tip.' },
  フェネック: { key:'fennec', p:'A fennec fox standing on all four short legs, its body turned to the side and its head turned to face the viewer, a pale cream sand coat, very large rounded ears, a cream belly and a fluffy tail.' },
  ダチョウ: { key:'ostrich', p:'An ostrich standing on two long legs facing the viewer, a rounded tan body with a fluffy cream tail, a long slender neck, a small head with a short rounded beak, and big round eyes.' },
  アルマジロ: { key:'armadillo', p:'An armadillo standing on four short legs, its body turned to the side and its head turned to face the viewer. Its back is a high domed shell of rounded overlapping bands in warm sandy beige, with a pale cream underside, a small pointed snout, small rounded ears and a tapering banded tail. The banded domed shell must read clearly - it is not a smooth lizard.' },
  ラクダ: { key:'camel', p:'A camel standing on four legs, its body turned to the side and its head turned to face the viewer, a warm sandy tan coat, one rounded hump on its back, a long neck and a small tufted tail.' },
  コブラ: { key:'cobra', p:'A cobra rising upright facing the viewer, a soft golden sand body coiled below it, a wide rounded hood spread behind its head, a pale cream belly and a gentle friendly face with no fangs.' },
  /* ゆきおんな。ゆきのじょおうと どちらも「白い服＋長い水色の髪」なので、
     形で 引きはなす。じょおうは かんむり＋広がるドレス、
     こちらは まっすぐ細い 着物で、すそは 霧に とけて 足が ない */
  ゆきおんな: { key:'yukionna', p:'A small cute chibi yuki-onna, a Japanese snow spirit girl, facing the viewer. CHIBI PROPORTIONS: her head is large and round and takes up about one third of her whole height, with big round eyes, soft pink cheeks and a gentle closed smile - the face must stay clearly readable when the picture is shrunk very small. Long straight periwinkle blue hair - a definite medium blue, deep enough to stand out against a pale icy background, never near-white - falling to her hem, with a straight blunt fringe across her forehead and a small white snowflake ornament in it. She wears a plain white kimono with wide hanging sleeves and a periwinkle blue obi sash. Her body below the head is a narrow straight column, never a wide flared gown, and she wears no crown, tiara or headpiece. The hem of her kimono fades into a soft wisp of pale mist instead of feet, so she floats. A few small blue snowflakes drift close around her. Outline the whole character with a clear medium blue-grey line so the white kimono stays visible on a pale background. Gentle and cute, never scary - no red eyes and no sharp teeth.' },
  /* アイテム。キャラでは ないので 顔は つけない。
     ワザバーで 38px、図鑑で 64px に なるので、
     ひとめで 何か わかる 形と 色に する */
  にじいろボール: { key:'it_ball', p:'A game power-up icon, not a character: a glossy crystal ball swirling with soft pastel rainbow light - pink, apricot, gold, mint, sky blue and lavender spiralling inside it - with a bright white highlight and small sparkles around it. No face, no eyes, no mouth. Simple and bold so it still reads clearly at a very small size.' },
  いなずま: { key:'it_bolt', p:'A game power-up icon, not a character: a single bold lightning bolt in warm pastel gold with a paler cream core and a soft amber outline, tilted diagonally, with a few small sparkles around it. No face, no eyes, no mouth. Simple and bold so it still reads clearly at a very small size.' },
  ハンマー: { key:'it_hammer', p:'A game power-up icon, not a character: a chunky rounded toy hammer seen from the side, a soft pink head with a pale cream band around it and a short rounded wooden handle in warm tan, with a few small sparkles around it. No face, no eyes, no mouth. Simple and bold so it still reads clearly at a very small size.' },
  にじいろの秘薬: { key:'it_elixir', p:'A game power-up icon, not a character: a rounded glass potion bottle with a short neck and a small cork stopper, filled with softly glowing mint and pastel rainbow liquid with tiny bubbles rising inside, and a few small sparkles around it. No face, no eyes, no mouth. Simple and bold so it still reads clearly at a very small size.' },
  こおりのつぼ: { key:'it_freeze', p:'A game power-up icon, not a character: a rounded pale ice-blue jar with a wide mouth and a soft frosted lid, frost and small snowflakes drifting out of it, with a bright white highlight. No face, no eyes, no mouth. Simple and bold so it still reads clearly at a very small size.' },
  おほしさまの雨: { key:'it_rain', p:'A game power-up icon, not a character: a cluster of three plump rounded five-pointed stars in warm pastel gold, one large in front and two smaller behind, with small sparkles and a few tiny falling star trails around them. No face, no eyes, no mouth. Simple and bold so it still reads clearly at a very small size.' },
  // --- さばくのくにの 王家（エジプト風）。金は やまぶきに、青は うすい
  //     ターコイズに して パステルから 浮かないように ---
  のろわれたミイラ: { key:'mummy', p:'A small cute mummy standing on two legs facing the viewer. Its rounded body is wrapped in cool white linen bandages, almost white with a faint lavender-grey shading and no warm gold or beige at all. Several long loose bandage ends come untucked and trail outward and downward around it, so its outline is loose and ragged rather than a neat smooth body. Big round friendly eyes with white highlights peek out from a gap between the wraps, and it has small bandaged arms held out at its sides. Give it a thin soft tan outline so the pale bandages stay visible against a pale background. Gentle and cheerful, never scary and never decayed.' },
  クレオパトラ: { key:'cleopatra', p:'A small cute Egyptian queen standing on two legs facing the viewer. Long straight glossy dark plum hair falling well past her waist, with a straight blunt fringe across her forehead and the ends turning gently inward, and a slim pale gold circlet across her forehead, a wide flat collar of pale gold and soft turquoise around her shoulders, and a simple long cream linen dress. Calm gentle expression.' },
  ファラオ: { key:'pharaoh', p:'A small cute Egyptian pharaoh standing on two legs facing the viewer. He wears a nemes headcloth striped in warm gold and soft turquoise that falls straight down in two neat panels to his shoulders without flaring out, a wide flat collar of warm gold and turquoise, and a simple cream linen kilt. He holds a single small rounded gold crook at his side. Warm gold and turquoise should read clearly against the cream of the kilt. Calm kind expression.' },
  ツタンカーメン: { key:'tutankhamun', p:'A small character shaped like a standing golden Egyptian sarcophagus, facing the viewer. Its silhouette is TALL and NARROW - clearly about twice as tall as it is wide - a rounded upright case that is widest at the shoulders and tapers gently to a rounded foot. At the top is a small pale gold face with big round friendly eyes with white highlights and a small smiling mouth, under a narrow striped headcloth in pale gold and soft turquoise. Below the face, two small arms are folded across the chest holding a tiny crook and flail, and the rest of the case is covered in soft pale gold bands with faint turquoise patterns. Mostly warm pale gold overall. It must read as a tall narrow upright coffin - never as a wide round mask, never as a lion or sphinx, and it has no legs.' },
  // --- ひのくに。赤ではなく さんごいろで、パステルから 浮かないように ---
  ひのたま: { key:'hinotama', p:'A small fireball spirit facing the viewer, its body a rounded teardrop of soft coral and apricot flame with a few soft rounded flame tips at the top, glowing gently, with tiny arms.' },
  コウモリ: { key:'bat', p:'A small bat facing the viewer, a rounded soft lavender body, two large rounded wings spread open at its sides, big rounded ears and small feet.' },
  おにび: { key:'onibi', p:'A small will-o-the-wisp spirit facing the viewer. Its body is a cool ghostly flame in pale periwinkle blue and lavender with a white glowing core, wide and round at the bottom and narrowing to two or three soft rounded tips at the top, with a few small blue sparks floating around it. It is a cold blue flame - it must not be orange, coral or warm, and must not look like a ghost with a flowing tail.' },
  サラマンダー: { key:'salamander', p:'A salamander standing on four short legs, its body turned to the side and its head turned to face the viewer, a soft coral orange back with pale cream spots, a long curling tail, and a row of small soft flame-shaped tips along its spine.' },
  カブトムシ: { key:'beetle', p:'A rhinoceros beetle seen from the front, a rounded glossy coral red shell, one single smooth pale gold horn curving up from its head, and six short warm brown legs. Keep every part in warm pastel coral, gold and soft brown - no charcoal, no dark maroon, nothing muddy.' },
  ようがんまいまい: { key:'lavasnail', p:'A snail seen from the side with its face turned to the viewer, two round eyes with white highlights and a small smiling mouth. Its soft body is warm apricot with a long trailing foot and two rounded eye stalks standing up on top of its head. On its back it carries a tall spiral shell of lava rock in soft dusty rose and warm mauve - clearly pastel, never black or near-black - with a few soft glowing coral orange cracks across it. The tall spiral shell and the long low soft body must read clearly - it is a snail, never a turtle, and it has no legs.' },
  ようがんゴーレム: { key:'lavagolem', p:'A small lava spirit made of floating rocks facing the viewer. Its body is a few chunky rounded lava rocks that hover slightly apart from one another rather than being joined into a body: one large round rock for its torso with a small round rock head floating above it and two round rock fists floating at its sides, with nothing between them. Each rock is dusty rose with soft glowing coral orange cracks, and a warm glow fills the gaps between them. It must not look like a solid blocky stone robot with joined arms and legs.' },
  ひのとり: { key:'firebird', p:'A firebird standing on two legs facing the viewer, a rounded soft coral and apricot body, small rounded wings, and a long fanned tail of soft flame-shaped feathers in coral, apricot and pale gold.' },
  オニ: { key:'oni', p:'A small friendly oni, a Japanese ogre child, standing on two legs facing the viewer. A plump rounded coral red body, two short rounded pale gold horns on top of its head, messy dark plum hair, big round friendly eyes, and a small tiger-striped cloth wrapped around its waist. It holds a short rounded pale wooden club at its side. Cute and cheerful, never scary, no fangs and no claws.' },
  // --- さばくのくにの なかま ---
  かげろう: { key:'kagero', p:'A small heat-haze spirit facing the viewer. Its body is a soft rounded column of shimmering hot air rising from the sand: wide at the bottom and narrowing as it rises, its edges rippling in gentle wavy curves, very pale apricot and cream and clearly translucent so the background shows faintly through it. A small face in the lower half, tiny arms at its sides, a few loose wavy shimmer lines rising above it and a small scatter of sand grains at its base. It must read as see-through rippling air, not as a solid object, not a flame, and not something made of stacked ribbons or food.' },
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
async function generate(model, prompt, refs = [], pose = '', aspect = '1:1'){
  /* 手本を さきに 置いて、そのあと 文。あとに 置くと 文の ほうが 弱まる */
  const reqParts = [];
  for (const k of refs){
    reqParts.push({ inlineData: { mimeType:'image/png',
      data: readFileSync(resolve(root, `art/${k}.png`)).toString('base64') } });
  }
  reqParts.push({ text: STYLE + ' ' + (pose || POSE_FRONT)
    + (refs.length ? '\n\n' + REF_LINE : '') + '\n\n' + prompt });
  const body = {
    contents: [{ role:'user', parts: reqParts }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } },
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
if (args[0] === '--scene'){
  const sc = SCENES[args[1]];
  if (!sc) die('--scene の あとに ' + Object.keys(SCENES).join(' / ') + ' のどれかを');
  if (!GEN_MODEL) die('GEMINI_IMAGE_MODEL が きまっていません');
  const { buf, mime } = await generate(GEN_MODEL, sc.p, sc.refs || [], ' ', sc.aspect);
  if (!EXT[mime]) die(`知らない 形式 ${mime}`);
  const out = resolve(root, 'art/screens');
  mkdirSync(out, { recursive: true });
  const f = `${sc.file}_source.${EXT[mime]}`;
  writeFileSync(resolve(out, f), buf);
  console.log(`art/screens/${f} (${(buf.length/1024).toFixed(0)}KB) ✅`);
  /* ゲームが 読むのは WebP。**大きさは 変えない**（表紙と 同じ考え。
     ちぢめると 顔が つぶれる）。原画は のこす —— 出しなおすと
     別の絵に なるので、あとから 品質だけ 変えたく なったとき 要る */
  const webp = await withPage(page => page.evaluate(async src => {
    const im = new Image(); im.src = src; await im.decode();
    const c = document.createElement('canvas');
    c.width = im.width; c.height = im.height;
    c.getContext('2d').drawImage(im, 0, 0);
    return c.toDataURL('image/webp', 0.92).split(',')[1];
  }, 'data:' + mime + ';base64,' + buf.toString('base64')));
  const wb = Buffer.from(webp, 'base64');
  writeFileSync(resolve(out, `${sc.file}.webp`), wb);
  console.log(`art/screens/${sc.file}.webp (${(wb.length/1024).toFixed(0)}KB) ✅`);
  process.exit(0);
}
if (args[0] === '--sprites'){
  const dir = resolve(root, 'art'), out = resolve(root, 'art/sprites');
  mkdirSync(out, { recursive: true });
  /* 名前を わたすと その子だけ。ぜんぶ 切りなおすと 時間が かかるので、
     足した子だけを 切りたいときに つかう */
  const only = args.slice(1).map(n => (ART[n] ? ART[n].key : n) + '.png');
  const files = readdirSync(dir)
    .filter(n => /\.png$/i.test(n))
    .filter(n => !only.length || only.includes(n));
  if (!files.length) die('art/ に 絵が ありません');
  await withPage(async page => {
    for (const n of files){
      /* ふだんは 256 で 足りる（盤面では せいぜい 128px）。
         「おかえりなさい」の まじょだけは カードの 中で 360px ほどに
         なるので、その子だけ 大きく 切る（`sprite` を 持たせる）*/
      const ent = Object.values(ART).find(a => a.key + '.png' === n);
      const png = await cutout(page, readFileSync(resolve(dir, n)), ent?.sprite || SPRITE);
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
    /* おなじ子の 別ポーズを 出すときは、**その子 じしんを 手本に 入れる**。
       ふつうは 自分を 見せると 寄せすぎる ので のぞくが、ここは
       「同じ子だと 分かる」ほうが 大事。入れないと 髪の色も
       ぼうしの かざりも 変わって 別人に なった（実際 そうなった）*/
    const refs = a.refs || REF_KEYS.filter(k => k !== a.key);
    const { buf, mime } = await generate(GEN_MODEL, a.p, refs, a.pose);
    if (!EXT[mime]) die(`知らない 形式 ${mime}。EXT に 足してください`);
    /* そろえたあとは かならず PNG。名前と 中みが 合う */
    const png = await fit(page, buf, mime);
    writeFileSync(resolve(root, `art/${a.key}.png`), png);
    console.log(`art/${a.key}.png (${(png.length/1024).toFixed(0)}KB) ✅`);
  }
});
