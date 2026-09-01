/* 新しい 表紙（v2・853x1844）を 8つの 画面幅で しらべる。
 *
 *   node tools/check-title2.mjs        # 終了コード 0 で 合格
 *   node tools/check-title2.mjs --shot # スクリーンショットも 出す
 *
 * v2 の いちばん こわい ところは **当たり判定の ずれ**です。
 * 「はじめる」は 絵に 焼きこまれて いて、その上に すきとおった ボタンを
 * 置いて いるだけ なので、ずれても **目では 気づけません**
 * （押しても 反応しない ところが できるだけ）。
 *
 * だから ここでは、**じっさいに 出た 画面を 撮って 画素を 読み**、
 * 絵の 中の ピンクの カプセルを 見つけて、DOM の ボタンと
 * 重なって いるかを 数字で くらべます。計算どうしを くらべても、
 * 同じ 式を 2回 書くだけで 検査に なりません。
 *
 * ほかに 見るのは この7つ。
 *
 *   たてよこ比   原画（0.462581）から ずれて いないか＝ゆがみ
 *   はみ出し     絵が 画面の 外に 出て 切れて いないか
 *   よこスクロール
 *   黒い すみ    四すみに 黒が 出て いないか
 *   セーフエリア ボタンと ホームバーの あき
 *   継ぎめ       絵と うしろの ぼかしの 境めに 線が 出て いないか
 *   JSエラー
 */
import { launch } from './_pw.mjs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shot = process.argv.includes('--shot');

const SIZES = [
  [320, 568], [320, 690], [375, 667], [393, 852],
  [402, 874], [430, 932], [360, 800], [412, 915],
];
const AR = 853 / 1844;            // 原画の たてよこ比
const INSET_B = 34;               // ホームバー（いちばん 大きい 端末）

const b = await launch();
let bad = 0;

console.log('画面        絵の いち          比      判定の中がボタン/外がボタン  黒すみ  あまり');
console.log('─'.repeat(86));

for (const [w, h] of SIZES){
  const ctx = await b.newContext({ viewport:{ width:w, height:h }, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  const pg  = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + root + '/index.html');
  await pg.waitForTimeout(900);

  const dom = await pg.evaluate(() => {
    const q = s => document.querySelector(s);
    const r = s => { const e = q(s); if (!e) return null; const b = e.getBoundingClientRect();
      return { l:b.left, t:b.top, w:b.width, h:b.height, r:b.right, b:b.bottom }; };
    return { v2: q('#titleOv').classList.contains('v2'),
             art: r('#titleArt2'), go: r('#titleGo'),
             parent: q('#titleGo').parentElement.id,
             /* **`#titleOv` の scrollWidth では しらべられません。**
                うしろの ぼかした 1まい（#titleBg2）は わざと 30px ずつ
                外へ 出して あるので、いつでも +44px と 出ます
                （#titleOv は overflow:hidden なので じっさいには
                スクロールしません。v1 も まったく 同じ 作り）。
                だから 見るのは **ページ全体**。320px の 2px は
                うしろの ワザバー（横スクロールする）で、前から そう */
             docW: document.documentElement.scrollWidth,
             clip: getComputedStyle(q('#titleOv')).overflow,
             W: innerWidth, H: innerHeight };
  });

  /* ---- 当たり判定が 絵の ボタンの 上に 乗っているか ----
     **出た 画面の 画素を 読んで しらべます。**計算どうしを くらべても
     同じ 式を 2回 書くだけで 検査に なりません。

     カプセルの 形を 画素から 切り出す やりかたは やめました ——
     まん中の 白い「はじめる」で つらなりが 切れ、下には 大きな ピンクの
     お菓子が ならんで いるので、**どう しきいを 決めても どこかで
     まちがえます**（じっさい「70px ずれている」「50px 大きすぎる」と
     交互に 出ました）。

     しらべたい ことは 形では なく これ 3つ です。

       ① 当たり判定の 中は ボタンか          … 中の 点が ボタンの 色か
       ② 当たり判定の すぐ外は ボタンでないか … はみ出して いないか
       ③ 押したら ボタンに 当たるか           … 何かが かぶって いないか  */
  const png = (await pg.screenshot()).toString('base64');
  const seen = await pg.evaluate(async ({ png, dpr, go }) => {
    const im = new Image();
    await new Promise(ok => { im.onload = ok; im.src = 'data:image/png;base64,' + png; });
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const at = (x, y) => { const i = (Math.round(y) * c.width + Math.round(x)) * 4; return [d[i], d[i+1], d[i+2]]; };
    /* ボタンの 上に ある もの＝ピンクの 地・白い 字・金の ふち */
    const isBtn = (x, y) => {
      const [r, gg, bb] = at(x * dpr, y * dpr);
      const pink  = r > 195 && (r - gg) > 60 && gg < 190;
      const white = r > 230 && gg > 215 && bb > 205;
      const gold  = r > 190 && gg > 130 && gg < 225 && bb < 165;
      return pink || white || gold;
    };
    /* ① 中みの 点（ふちの 丸みを さけて 内がわ 10%）*/
    let inHit = 0, inAll = 0;
    for (let i = 1; i <= 9; i++) for (let j = 1; j <= 5; j++){
      const x = go.l + go.w * (0.10 + 0.80 * (i - 1) / 8);
      const y = go.t + go.h * (0.20 + 0.60 * (j - 1) / 4);
      inAll++; if (isBtn(x, y)) inHit++;
    }
    /* ② すぐ外の 点（12px 外がわ。上下左右）*/
    const O = 12;
    let outHit = 0, outAll = 0;
    for (let i = 0; i <= 8; i++){
      const x = go.l + go.w * i / 8;
      for (const y of [go.t - O, go.b + O]){ outAll++; if (isBtn(x, y)) outHit++; }
    }
    for (let j = 0; j <= 4; j++){
      const y = go.t + go.h * j / 4;
      for (const x of [go.l - O, go.r + O]){ outAll++; if (isBtn(x, y)) outHit++; }
    }
    /* 四すみの 黒（絵の 外に 黒が 出て いないか）*/
    const dark = (x, y) => { const [r, gg, bb] = at(x, y); return r < 40 && gg < 40 && bb < 40; };
    let corner = 0;
    for (const [cx, cy] of [[0,0],[c.width-8,0],[0,c.height-8],[c.width-8,c.height-8]])
      for (let x = cx; x < cx + 8; x++) for (let y = cy; y < cy + 8; y++) if (dark(x, y)) corner++;
    return { inside: inHit / inAll, outside: outHit / outAll, corner };
  }, { png, dpr: 2, go: dom.go });

  /* ③ ほんとうに 押せるか */
  const hit = await pg.evaluate(([x, y]) => {
    const e = document.elementFromPoint(x, y);
    return e ? (e.id || e.tagName) : 'なし';
  }, [dom.go.l + dom.go.w / 2, dom.go.t + dom.go.h / 2]);

  const problems = [];
  if (errs.length)           problems.push('JSエラー: ' + errs[0]);
  if (!dom.v2)               problems.push('v2 に なっていない');
  if (dom.parent !== 'titleArt2') problems.push('ボタンが v2 の 絵の 中に いない（' + dom.parent + '）');
  if (dom.clip !== 'hidden') problems.push('#titleOv が 切りぬいていない（' + dom.clip + '）');
  /* 2px は うしろの ワザバー。表紙が ふえていないかを 見る */
  if (dom.docW > dom.W + 2.5) problems.push('よこスクロール ' + (dom.docW - dom.W).toFixed(1) + 'px');
  if (dom.art.t < -0.5 || dom.art.b > dom.H + 0.5) problems.push('絵が たてに はみ出す');
  if (dom.art.l < -0.5 || dom.art.r > dom.W + 0.5) problems.push('絵が よこに はみ出す');
  if (seen.corner > 0)     problems.push('四すみに 黒 ' + seen.corner + '画素');
  if (seen.inside < 0.92)  problems.push('当たり判定の 中に ボタンで ない ところが ある（' + (seen.inside*100).toFixed(0) + '%）');
  if (seen.outside > 0.30) problems.push('当たり判定が ボタンより 大きい（外の ' + (seen.outside*100).toFixed(0) + '% が まだ ボタン）');
  if (hit !== 'titleGo')   problems.push('まん中を おすと ' + hit + '（何かが かぶっている）');

  const ratio = dom.art.w / dom.art.h;
  if (Math.abs(ratio - AR) > 0.002) problems.push('比が ずれた ' + ratio.toFixed(4) + '（原画 ' + AR.toFixed(4) + '）');

  const gap = (seen.inside * 100).toFixed(0) + '% / ' + (seen.outside * 100).toFixed(0) + '%';

  /* ホームバーとの あき（いちばん 大きい 端末の 34px を 当てはめた ばあい）*/
  const home = dom.H - INSET_B - dom.go.b;
  if (home < 10) problems.push('ホームバーと ' + home.toFixed(0) + 'px しか あかない');


  console.log(
    String(w + 'x' + h).padEnd(11) +
    (dom.art.l.toFixed(0) + ',' + dom.art.t.toFixed(0) + ' ' +
     dom.art.w.toFixed(0) + 'x' + dom.art.h.toFixed(0)).padEnd(18) +
    ratio.toFixed(4).padStart(7) + '   ' +
    gap.padEnd(20) +
    String(seen.corner).padStart(5) + '   ' +
    ('上' + dom.art.t.toFixed(0) + ' 下' + (dom.H - dom.art.b).toFixed(0) +
     ' 横' + dom.art.l.toFixed(0)).padStart(14)
  );
  if (problems.length){ bad++; problems.forEach(p => console.log('    ✗ ' + p)); }

  if (shot) await pg.screenshot({ path: resolve(root, 'shots/t2_' + w + 'x' + h + '.png') }).catch(()=>{});
  await ctx.close();
}

await b.close();
console.log('─'.repeat(86));
console.log('中は 92%以上・外は 30%以下 が 合格。中＝当たり判定が ボタンに 乗っている');
console.log('                          外＝12px 外が まだ ボタン なら 当たり判定が 小さすぎる');
if (bad){ console.error('✗ ' + bad + '画面で 問題が ありました'); process.exit(1); }
console.log('8画面 ぜんぶ 合格 ✅');
