/* 進化の 絵（`<base>_e1`）を 原画から 作りなおす。
 *
 *   node tools/make-evo-art.mjs            # ぜんぶ
 *   node tools/make-evo-art.mjs c_purin    # その子だけ
 *
 * **手で 作らないこと。**絵を 差しかえた ときに 作りなおせなく なります
 * （CLAUDE.md の きまり。`make-icons` / `make-ui-icons` と 同じ 考えかた）。
 *
 * ─────────────────────────────────────────────────────────────
 * いちばん 大事な きまり（Phase 7-7-3-8-1 で 決めた）
 *
 *   **base と 同じ「キャラクター本体」の 見た目の 大きさを たもつ。**
 *   王冠・さくらんぼ・つの・つばさ の ような **足された かざりは
 *   すきとおる 余白の がわに 収める。**
 *
 * だから 原画ぜんたいを ただ 縮めては いけません ——上に のびた かざりに
 * 引っぱられて **本体が base より ずっと 小さく なります**
 * （じっさい 1回 やって、胴が 155 → 101px に なりました）。
 *
 * ここでは **本体は 1ミリも 縮めず、かざりだけ**を
 * たて `kv` 倍・よこ `hx` 倍（`smoothstep` で なめらかに）に して
 * 256 の わくへ 収めます。切り貼りでは なく **1回の リサンプリング**なので、
 * 本体と かざりの つなぎめに 段差が 出ません。
 * ─────────────────────────────────────────────────────────────
 *
 * 作りかたは 2つ あります（`kind`）。**どちらも 上の きまりは 同じ**です。
 *
 *   `warp` … 進化ぜんたいを えがいた **原画**が ある とき。
 *            本体を 等倍の まま、かざりだけ ちぢめて 256 に 収める
 *   `deco` … 原画が ない とき。**base の 絵を 1:1 で そのまま おいて**、
 *            すきとおる 余白に かざりだけを コードで えがき、**うしろに 敷く**
 *
 * `deco` は 本体の 画素を 1つも さわらないので、きまりの ①③⑤
 * （大きさ・中心・同じ子に 見える）が **作りから して 保証されます**。
 * 検査も それを そのまま 見ます ——base の 不とうめいな 画素と
 * 出た 絵が **1つも ちがわない**こと。
 *
 * かざりは CLAUDE.md の「絵は コードで えがく」の とおり、
 * グラデ＋つや＋4方向の きらめきで えがきます。**base の 画像は
 * 読むだけで、1バイトも 書きかえません。**
 */
import sharp from 'sharp';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ── かざりを えがく（`deco`）──────────────────────────────
   **`const` は 巻きあがらない**ので、PLAN より 先に 置くこと */

/* ✨ 4方向に とがった 星（この シリーズの きらめき）*/
const spark = (cx, cy, r, col, o = .9) =>
  `<path transform="translate(${cx},${cy})" opacity="${o}" fill="${col}" d="M0,${-r} Q${r*.17},${-r*.17} ${r},0 Q${r*.17},${r*.17} 0,${r} Q${-r*.17},${r*.17} ${-r},0 Q${-r*.17},${-r*.17} 0,${-r} Z"/>`;

/* ⚡ 冠の 一本（tip が 上・根もとが 下・まん中で きざむ）*/
const prong = (cx, ry, h, w) => {
  const p = (x, y) => (cx + x).toFixed(1) + ',' + (ry - y).toFixed(1);
  return `M${p(0,h)} L${p(-0.50*w,0.40*h)} L${p(-0.17*w,0.33*h)} L${p(-0.36*w,0)} L${p(0.36*w,0)} L${p(0.17*w,0.33*h)} L${p(0.50*w,0.40*h)} Z`;
};
/* 一本ごとの つや（左の 面だけ 明るく）*/
const prongGloss = (cx, ry, h, w) => {
  const p = (x, y) => (cx + x).toFixed(1) + ',' + (ry - y).toFixed(1);
  return `<path opacity=".62" fill="#fffdf2" d="M${p(-0.04*w,0.88*h)} L${p(-0.30*w,0.44*h)} L${p(-0.17*w,0.42*h)} L${p(-0.02*w,0.72*h)} Z"/>`;
};
/* ⚡ 帯電モチーフ（かたむいた いなずま。base が 持って いる 形に そろえる）*/
const bolt = (cx, cy, s, rot) => {
  const pt = [[0,-1],[-0.62,0.12],[-0.16,0.10],[-0.34,1],[0.62,-0.16],[0.14,-0.14]];
  const d = 'M' + pt.map(([x,y]) => (x*s).toFixed(1) + ',' + (y*s).toFixed(1)).join(' L') + ' Z';
  return `<g transform="translate(${cx},${cy}) rotate(${rot})">`
    + `<path d="${d}" fill="url(#gold)" stroke="#c9994b" stroke-width="2.7" stroke-linejoin="round"/>`
    + `<path d="M${(-0.10*s).toFixed(1)},${(-0.78*s).toFixed(1)} L${(-0.42*s).toFixed(1)},${(0.02*s).toFixed(1)} L${(-0.26*s).toFixed(1)},${(0.02*s).toFixed(1)} L${(0).toFixed(1)},${(-0.62*s).toFixed(1)} Z" fill="#fffdf2" opacity=".6"/></g>`;
};

/* ── 砂の 粒（`grain`）──────────────────────────────
   **弧を 太い 帯に しないこと。**すなどけいの わく（`#f0c090`）と
   一体に 見えて しまいます。粒の つらなりで えがき、色は わくより
   **明るく 黄色に 寄せ**、1粒ずつ 白い つやを 入れて 分けます */
const rnd = seed => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
/* ベジエ（3点＝2次・4点＝3次）。**S字は 3次で ないと 引けません** */
const bez = (P, t) => {
  const u = 1 - t;
  if (P.length === 4) return [
    u*u*u*P[0][0] + 3*u*u*t*P[1][0] + 3*u*t*t*P[2][0] + t*t*t*P[3][0],
    u*u*u*P[0][1] + 3*u*u*t*P[1][1] + 3*u*t*t*P[2][1] + t*t*t*P[3][1]];
  return [ u*u*P[0][0] + 2*u*t*P[1][0] + t*t*P[2][0],
           u*u*P[0][1] + 2*u*t*P[1][1] + t*t*P[2][1] ];
};

/* 曲線に そって、**となりと ぜったいに くっつかない** 間かくで 粒を ならべる。
   `gap` は （r1+r2）の 何倍 はなすか。1.0 で ちょうど 接するので 1.2 以上。
   大きさを ばらつかせないと **真珠の ネックレス**に 見えます（1回 やりました）*/
function grainChain(P4, r0, r1, gap, seed, jit, vary = 0, off = 0, rs = 1){
  const N = 600, P = [];
  for (let i = 0; i <= N; i++) P.push(bez(P4, i/N));
  const rAt = t => r0 + (r1 - r0) * Math.pow(t, 0.8);
  const R = rnd(seed), out = [];
  let i = 0;
  while (i <= N){
    const t = i/N, r = rAt(t) * rs * (1 + (R() - .5) * 2 * vary);
    const nx = P[Math.min(N,i+1)][0] - P[i][0], ny = P[Math.min(N,i+1)][1] - P[i][1];
    const L = Math.hypot(nx, ny) || 1;              // 法線（外がわへ 少し ずらす）
    const j = off + (R() - .5) * jit;
    out.push({ x: P[i][0] + (-ny/L) * j, y: P[i][1] + (nx/L) * j, r, a: R() * 180 });
    let d = 0, k = i;                                // つぎの 粒まで 弧長で 進む
    const want = (r + rAt(Math.min(1,(i+1)/N))) * gap;
    while (k < N && d < want){ d += Math.hypot(P[k+1][0]-P[k][0], P[k+1][1]-P[k][1]); k++; }
    if (k === i) break;
    i = k;
  }
  return out;
}
/* こまかい 砂ぼこり。**これが 無いと 玉の ならびに 見えます** */
function grainDust(P4, n, seed, spread, r0, r1){
  const R = rnd(seed), out = [];
  for (let i = 0; i < n; i++){
    const t = R();
    const [x, y] = bez(P4, t);
    const [x2, y2] = bez(P4, Math.min(1, t + .01));
    const nx = x2 - x, ny = y2 - y, L = Math.hypot(nx, ny) || 1;
    const j = (R() - .5) * 2 * spread;
    out.push({ x: x + (-ny/L) * j, y: y + (nx/L) * j,
               r: r0 + (r1 - r0) * R(), a: R() * 180 });
  }
  return out;
}
/* 粒 1つ。まん丸に しないで すこし つぶす（砂に 見せる ため）*/
const grain = g => `<g transform="translate(${g.x.toFixed(1)},${g.y.toFixed(1)}) rotate(${(g.a||0).toFixed(0)})">`
  + `<ellipse rx="${g.r.toFixed(1)}" ry="${(g.r*.84).toFixed(1)}"`
  + ` fill="url(#sand)" stroke="#e8b45e" stroke-width="${Math.max(.8, g.r*.14).toFixed(2)}"/>`
  + (g.r > 3.2 ? `<ellipse cx="${(-g.r*.26).toFixed(1)}" cy="${(-g.r*.28).toFixed(1)}"`
      + ` rx="${(g.r*.24).toFixed(1)}" ry="${(g.r*.19).toFixed(1)}" fill="#fffdf2" opacity=".62"/>` : '')
  + `</g>`;
/* 金の きらめき（4方向の 星。ふちを つけて 小さくても 形が のこる ように）*/
const goldSpark = (cx, cy, r) =>
  `<g transform="translate(${cx},${cy})">`
  + `<path d="M0,${-r} Q${(r*.17).toFixed(1)},${(-r*.17).toFixed(1)} ${r},0 Q${(r*.17).toFixed(1)},${(r*.17).toFixed(1)} 0,${r} Q${(-r*.17).toFixed(1)},${(r*.17).toFixed(1)} ${-r},0 Q${(-r*.17).toFixed(1)},${(-r*.17).toFixed(1)} 0,${-r} Z"`
  + ` fill="#ffdf98" stroke="#e0a94e" stroke-width="1.6" stroke-linejoin="round"/>`
  + `<path d="M0,${(-r*.46).toFixed(1)} Q${(r*.08).toFixed(1)},${(-r*.08).toFixed(1)} ${(r*.46).toFixed(1)},0 Q${(r*.08).toFixed(1)},${(r*.08).toFixed(1)} 0,${(r*.46).toFixed(1)} Q${(-r*.08).toFixed(1)},${(r*.08).toFixed(1)} ${(-r*.46).toFixed(1)},0 Q${(-r*.08).toFixed(1)},${(-r*.08).toFixed(1)} 0,${(-r*.46).toFixed(1)} Z"`
  + ` fill="#fffdf2" opacity=".92"/></g>`;

/* ── 水（`ribbon` / `waterDrop`）──────────────────────────
   すなどけいは **粒**、こちらは **まとまった 流れ**。
   `tw_ice` の 結晶と ぶつからない よう、**角を 1つも 作りません** */

/* 中心線に そって はばの 変わる 帯。尾・水しぶき・虹の 帯に つかう */
function ribbon(P4, w0, w1, wMid = (w0 + w1) / 2, N = 56){
  const A = [], B = [];
  for (let i = 0; i <= N; i++){
    const t = i/N, [x, y] = bez(P4, t);
    const [x2, y2] = bez(P4, Math.min(1, t + .004));
    const nx = x2 - x, ny = y2 - y, L = Math.hypot(nx, ny) || 1;
    /* はばも ベジエ。**`wMid` は 通過点では なく 制御点**なので、
       まん中の 実の はばは およそ (w0 + 2*wMid + w1) / 4 に なります
       （ここを まちがえて「思ったより 半分 細い」を 1回 やりました）*/
    const u = 1 - t;
    const w = (u*u*w0 + 2*u*t*wMid + t*t*w1) / 2;
    A.push([x + (-ny/L)*w, y + (nx/L)*w]);
    B.push([x - (-ny/L)*w, y - (nx/L)*w]);
  }
  const f = p => p[0].toFixed(1) + ',' + p[1].toFixed(1);
  return 'M' + A.map(f).join(' L') + ' L' + B.reverse().map(f).join(' L') + ' Z';
}
/* まるい 水のつぶ（**とがらせない**）*/
const waterDrop = (cx, cy, r, o = 1) =>
  `<g transform="translate(${cx},${cy})" opacity="${o}">`
  + `<circle r="${r}" fill="url(#aqua)" stroke="#4fa9a0" stroke-width="${Math.max(1, r*.14).toFixed(2)}"/>`
  + (r > 3.4 ? `<ellipse cx="${(-r*.30).toFixed(1)}" cy="${(-r*.32).toFixed(1)}"`
      + ` rx="${(r*.28).toFixed(1)}" ry="${(r*.22).toFixed(1)}" fill="#ffffff" opacity=".78"/>` : '')
  + `</g>`;

/* いずみのしずく：左右へ **はねあがる 水の しぶき**＋足もとの **広い 波紋**。
   本体の 形は 実測（y150 で x55・y120 で x60・y90 で x77・てっぺん y32）。
   **粒を ばらまかない** ——すなどけいと 逆に、ひとつづきの 流れで シルエットを 作る */
/* ── 葉と 四つ葉（`leaf` / `clover`）─────────────────────────
   すなどけい＝粒、しずく＝ひとつづきの 流れ、こちらは
   **同じ かたちの くりかえし**。シルエットの ことばを 1体ずつ 変える */

/* ハートの 葉。**先が クローバーの まん中、くぼみが 外がわ** */
const leaf = (s, rot, fill = 'url(#mint)', ink = '#5eaf92') => {
  const k = s / 1.5, p = (x, y) => (x*k).toFixed(1) + ',' + (y*k).toFixed(1);
  return `<g transform="rotate(${rot})"><path d="M${p(0,0)}`
    + ` C${p(-0.30,-0.42)} ${p(-0.86,-0.52)} ${p(-0.86,-1.02)}`
    + ` C${p(-0.86,-1.42)} ${p(-0.40,-1.52)} ${p(0,-1.16)}`
    + ` C${p(0.40,-1.52)} ${p(0.86,-1.42)} ${p(0.86,-1.02)}`
    + ` C${p(0.86,-0.52)} ${p(0.30,-0.42)} ${p(0,0)} Z"`
    + ` fill="${fill}" stroke="${ink}" stroke-width="${Math.max(1.4, s*.075).toFixed(2)}"`
    + ` stroke-linejoin="round"/>`
    + `<ellipse cx="${(-0.42*k).toFixed(1)}" cy="${(-0.92*k).toFixed(1)}"`
    + ` rx="${(0.20*k).toFixed(1)}" ry="${(0.30*k).toFixed(1)}"`
    + ` transform="rotate(-18 ${(-0.42*k).toFixed(1)} ${(-0.92*k).toFixed(1)})"`
    + ` fill="#ffffff" opacity=".5"/></g>`;
};
/* 四つ葉。**葉を ばらまかない** ——1つの かたまりとして 読める ように */
const clover = (cx, cy, s, rot, stem = 0, fill = 'url(#mint)', ink = '#5eaf92') =>
  `<g transform="translate(${cx},${cy}) rotate(${rot})">`
  + (stem ? `<path d="M0,0 q${(s*.14).toFixed(1)},${(s*.52).toFixed(1)}`
      + ` ${(-s*.10).toFixed(1)},${(s*.95).toFixed(1)}" fill="none" stroke="${ink}"`
      + ` stroke-width="${Math.max(2, s*.10).toFixed(1)}" stroke-linecap="round"/>` : '')
  + [-45, 45, 135, 225].map(a => leaf(s, a, fill, ink)).join('')
  + `<circle r="${(s*.10).toFixed(1)}" fill="#66b497"/></g>`;

/* つる（`ribbon` の 帯に ふちを つけた だけ）*/
const vine = (P4, w0, w1, fill = 'url(#leafG)', ink = '#84c3a7') =>
  `<path d="${ribbon(P4, w0, w1)}" fill="${fill}" stroke="${ink}"`
  + ` stroke-width="2" stroke-linejoin="round"/>`;

/* つぼみ（まだ ひらいて いない。先だけ 花の 色が のぞく）*/
const bud = (cx, cy, s, rot, fill = 'url(#leafG)', ink = '#84c3a7') =>
  `<g transform="translate(${cx},${cy}) rotate(${rot})">`
  + `<ellipse cy="${(-s*.10).toFixed(1)}" rx="${(s*.52).toFixed(1)}" ry="${(s*.82).toFixed(1)}"`
  + ` fill="url(#petal)" stroke="#e79ab6" stroke-width="1.6"/>`
  + `<path d="M${(-s*.52).toFixed(1)},${(s*.10).toFixed(1)}`
  + ` Q0,${(s*.66).toFixed(1)} ${(s*.52).toFixed(1)},${(s*.10).toFixed(1)}`
  + ` Q0,${(-s*.44).toFixed(1)} ${(-s*.52).toFixed(1)},${(s*.10).toFixed(1)} Z"`
  + ` fill="${fill}" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/></g>`;

/* 花（まるい 花びら n枚＋まん中）。**小花を ばらまく ためでは なく、
   1輪を 主役に する ため**の 部品 */
const flower = (cx, cy, s, n = 5, rot = 0) => {
  const P = [];
  for (let i = 0; i < n; i++){
    const a = rot + i * 360 / n, r = a * Math.PI / 180;
    const px = Math.cos(r - Math.PI/2) * s * .54, py = Math.sin(r - Math.PI/2) * s * .54;
    P.push(`<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}"`
      + ` rx="${(s*.40).toFixed(1)}" ry="${(s*.50).toFixed(1)}"`
      + ` transform="rotate(${a.toFixed(0)} ${px.toFixed(1)} ${py.toFixed(1)})"`
      + ` fill="url(#petal)" stroke="#e79ab6" stroke-width="1.8"/>`);
  }
  return `<g transform="translate(${cx},${cy})">${P.join('')}`
    + `<circle r="${(s*.27).toFixed(1)}" fill="#ffeeb4" stroke="#e6b96a" stroke-width="1.4"/>`
    + `<circle cx="${(-s*.09).toFixed(1)}" cy="${(-s*.09).toFixed(1)}" r="${(s*.09).toFixed(1)}"`
    + ` fill="#fff8dc"/></g>`;
};

/* ふたばのこ：**双葉 → つる → つぼみ → 花**の ひとつづきの 流れ。
   本体の 形は 実測（双葉は x76..180 / y25..77、茎は y73 で x123..132、
   顔は y78 から 下）。**花だけを 浮かせない** ——つるは 右の葉の
   すぐ うしろから 出て、目で 追える こと。
   `ch_prince`（同じ 形の くりかえし）とは 逆に、**1本の 成長の 流れ**で 見せる */
const AVINE = [[126,64], [152,76], [180,62], [202,48]];
const appleSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}">
<defs>
 <linearGradient id="leafG" x1="0" y1="0" x2=".6" y2="1">
  <stop offset="0" stop-color="#caf0d5"/><stop offset=".55" stop-color="#a9e7c8"/>
  <stop offset="1" stop-color="#8bc4a8"/></linearGradient>
 <radialGradient id="petal" cx=".38" cy=".32" r=".8">
  <stop offset="0" stop-color="#fff4f8"/><stop offset=".45" stop-color="#ffcbe0"/>
  <stop offset="1" stop-color="#ffb0cc"/></radialGradient>
 <filter id="fg" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4.5"/></filter>
</defs>
<g filter="url(#fg)" opacity=".22"><circle cx="210" cy="42" r="17" fill="#ffd7e6"/></g>
${vine(AVINE, 10, 4.5)}
<path d="M186,70 q11,7 4,15 q-8,7 -13,-2" fill="none" stroke="#84c3a7"
 stroke-width="3" stroke-linecap="round"/>
<g transform="translate(157,71)">${leaf(19, 128, 'url(#leafG)', '#84c3a7')}</g>
${bud(176, 54, 13, 36)}
${flower(210, 42, 26, 5, 12)}
</svg>`;

/* よつばのこ：**大きな 四つ葉を 2枚**（左上・右下）＋小さいのを 3枚。
   本体の 形は 実測（y88..176 で x42..219 と いちばん 広く、
   上 y32 は x91..170・下 y200 は x89..172 と せまい）。
   **葉の 輪で ぐるりと 囲まないこと** ——オーラに 見えます。
   **花・つぼみは 1つも 使わない**（`ch_apple` と 役割を 分ける）*/
const princeSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}">
<defs>
 <linearGradient id="mint" x1="0" y1="0" x2=".6" y2="1">
  <stop offset="0" stop-color="#d6f7dc"/><stop offset=".55" stop-color="#94e1c0"/>
  <stop offset="1" stop-color="#66b497"/></linearGradient>
 <filter id="lg" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<g filter="url(#lg)" opacity=".20" fill="#bdeed4">
 <circle cx="54" cy="70" r="34"/><circle cx="204" cy="196" r="32"/></g>
${clover(54, 70, 38, -22, 1)}
${clover(204, 196, 35, 24, 1)}
${clover(30, 118, 13, 26)}
${clover(230, 158, 11, -16)}
</svg>`;

/* 水は **ひとつづきの うねり**（両はしが 細く まん中が ふくらむ swoosh）。
   先ぼそりの 帯は「タコの あし」に、細い 棒＋玉は「綿棒」に 見えました（2回 やりました）*/
const DSPL  = [[102,214], [28,208], [4,158], [54,98]];    // 大きい うねり（左）
const DSPL2 = [[106,222], [60,224], [24,212], [16,190]];  // 低い うねり（左）
const donutSvg = () => {
  /* はしは **まるく 止める**（とがらせると 氷の 結晶に 見える）*/
  const sheet = (P, w0, w1, wm) => `<path d="${ribbon(P, w0, w1, wm)}" fill="url(#aqua)"`
    + ` stroke="#4fa9a0" stroke-width="2.6" stroke-linejoin="round"/>`;
  const lobe = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#aqua)"`
    + ` stroke="#4fa9a0" stroke-width="2.6"/>`;
  const gloss = (P, w) => `<path d="${ribbon(P, 2, 2, w)}" fill="#ffffff" opacity=".38"/>`;
  const mirG = `translate(255,0) scale(-1,1)`;
  const side = sheet(DSPL, 8, 10, 58) + lobe(54, 98, 5.5) + gloss(DSPL, 22)
             + sheet(DSPL2, 5, 6, 27) + lobe(16, 190, 3.4)
             + waterDrop(62, 72, 8.4) + waterDrop(40, 50, 5.4);
  /* 足もとの 波紋 ——**下へ のばさず よこへ 広げる**（下の 余白は 26px しか ない）*/
  const ring = (rx, ry, w, o) => `<ellipse cx="127.5" cy="235" rx="${rx}" ry="${ry}"`
    + ` fill="none" stroke="#7fdccd" stroke-width="${w}" opacity="${o}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}">
<defs>
 <linearGradient id="aqua" x1="0" y1="0" x2=".7" y2="1">
  <stop offset="0" stop-color="#f2fffc"/><stop offset=".5" stop-color="#a9eddf"/>
  <stop offset="1" stop-color="#6fd0c6"/></linearGradient>
 <filter id="wg" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<g filter="url(#wg)" opacity=".22" fill="#bff3e8">
 <path d="${ribbon(DSPL, 16, 18, 76)}"/><g transform="${mirG}"><path d="${ribbon(DSPL, 16, 18, 76)}"/></g></g>
${ring(95, 9, 5.0, .9)}${ring(69, 6.4, 3.6, .75)}${ring(45, 4.4, 2.8, .6)}
${side}<g transform="${mirG}">${side}</g>
</svg>`;
};

/* すなどけい：左右に **S字に うねる 砂の 流れ**。
   本体の 形は 実測（うで y160..168 が いちばん 太く x58..198・
   ふた y32..56 と y176..208 が x67..189）。
   **まっすぐな 柱に しないこと** ——うねりが 無いと「湧いて いる あわ」に 見えます。
   **上で 輪を とじないこと** ——とじると「玉の 首かざり」に 見えます */
const QL = [[[78,224],[10,206],[16,150],[58,126]],     // 左・下半分：外へ ふくらむ
            [[58,126],[92,106],[16,86],[46,38]]];      // 左・上半分：内へ 入って また 外へ
const QR = [[[76,222],[16,200],[12,146],[54,122]],     // 右：すこし ちがう うねり
            [[54,122],[88,100],[14,80],[40,34]]];
const mir = g => ({ ...g, x: 255 - g.x });
const queenSvg = () => {
  /* **1本の 線に しないこと。**すじを 3本 かさねて「砂の 流れ」に する
     ——1本だと 玉の ネックレスに、太い 帯だと オーラに 見えます。
     下半分は 太く、上半分へ 行くほど 細く（のぼって 消えて いく）*/
  const RR = [[8.0, 5.0], [5.0, 2.4]];
  const lane = (Q, seed, off, rs) => Q.flatMap((P, i) =>
    grainChain(P, RR[i][0], RR[i][1], 1.20, seed + i * 7717, 3.4, .30, off, rs));
  const L  = [...lane(QL, 20260904, 0, 1), ...lane(QL, 41337711, -8.5, .78),
              ...lane(QL, 90211077, 8.0, .86)];
  const Rg = [...lane(QR, 33115577, 0, 1), ...lane(QR, 60422199, -8.0, .80),
              ...lane(QR, 12907733, 8.5, .84)].map(mir);
  const dust = (Q, seed) => Q.flatMap((P, i) =>
    grainDust(P, i ? 20 : 26, seed + i * 331, 15, 1.3, i ? 2.2 : 2.8));
  const dL = dust(QL, 5150321), dR = dust(QR, 9903117).map(mir);
  /* 大つぶ（流れの 中に ときどき まざる。つやが 強い）*/
  const beads = [{x:31,y:190,r:9.0,a:15},{x:36,y:154,r:7.4,a:60},{x:60,y:112,r:6.2,a:30},
                 {x:42,y:66,r:5.0,a:75}];
  /* はぐれた 粒 */
  const stray = [{x:18,y:168,r:3.6,a:20},{x:24,y:96,r:3.0,a:70},{x:36,y:230,r:3.4,a:40},
                 {x:50,y:22,r:2.6,a:10},{x:16,y:196,r:2.4,a:60}];
  /* 足もとに たまった 砂の 山 ——**小さくしたとき ここだけは 消えない** */
  const heap = [{x:62,y:226,r:7.2,a:12},{x:50,y:232,r:6.0,a:40},{x:74,y:233,r:5.0,a:70},
                {x:38,y:236,r:4.4,a:25},{x:60,y:240,r:4.0,a:55},{x:86,y:237,r:3.2,a:35},
                {x:28,y:241,r:2.8,a:65},{x:46,y:222,r:4.0,a:20}];
  const big  = [...L, ...Rg];
  const all  = [...dL, ...dR, ...big, ...beads, ...beads.map(mir),
                ...stray, ...stray.map(mir), ...heap, ...heap.map(mir)];
  const SPK = [[34,72,11],[16,146,8],[34,216,7],[54,30,6]];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}">
<defs>
 <radialGradient id="sand" cx=".36" cy=".30" r=".78">
  <stop offset="0" stop-color="#fffbe4"/><stop offset=".55" stop-color="#ffe4a6"/>
  <stop offset="1" stop-color="#ffd27e"/></radialGradient>
 <filter id="sg" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4"/></filter>
</defs>
<g filter="url(#sg)" opacity=".18" fill="#ffe9b8">
 ${[...big].map(g => `<circle cx="${g.x.toFixed(1)}" cy="${g.y.toFixed(1)}" r="${(g.r*1.2).toFixed(1)}"/>`).join('')}</g>
${all.map(grain).join('')}
${SPK.map(([x,y,r]) => goldSpark(x,y,r)).join('')}
${SPK.map(([x,y,r]) => goldSpark(255-x,y-8,r*.92)).join('')}
</svg>`;
};

/* かみなりのこ：頭上の 電光の 冠 ＋ 左右に 大きめの いなずま 2つ。
   いちは base の 雲の 上ばし（実測 y=42・x=124..132 が てっぺん）に
   そって ならべる */
const CROWN = [[128,72,60,46],[90,84,44,36],[166,84,44,36],[60,100,30,28],[196,100,30,28]];
const chocoSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}">
<defs>
 <linearGradient id="gold" x1="0" y1="0" x2=".9" y2=".6">
  <stop offset="0" stop-color="#fffdf0"/><stop offset=".45" stop-color="#f8e0a2"/><stop offset="1" stop-color="#e0af53"/></linearGradient>
 <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7"/></filter>
</defs>
<g filter="url(#glow)" opacity=".5" fill="#ffe9a8">
 ${CROWN.map(a => `<path d="${prong(...a)}"/>`).join('')}</g>
<g fill="url(#gold)" stroke="#c9994b" stroke-width="2.9" stroke-linejoin="round">
 ${CROWN.map(a => `<path d="${prong(...a)}"/>`).join('')}</g>
${CROWN.map(a => prongGloss(...a)).join('')}
${bolt(34,104,26,-18)}${bolt(222,104,26,18)}
${spark(70,60,9,'#ffe9a8')}${spark(188,58,7,'#ffe9a8')}${spark(128,20,6,'#fffdf2',.8)}
</svg>`;

/* 氷の けっしょう（たて長の 六角＋すじ＋つや）*/
const shard = (cx, cy, s, rot, o = 1) => `<g transform="translate(${cx},${cy}) rotate(${rot}) scale(${s})" opacity="${o}">
 <path d="M0,-1 L0.46,-0.42 L0.34,0.52 L0,1 L-0.34,0.52 L-0.46,-0.42 Z" fill="url(#ice)" stroke="#5fa8c4" stroke-width="${(2.8/s).toFixed(3)}" stroke-linejoin="round"/>
 <path d="M0,-1 L0,1" stroke="#7fc0d8" stroke-width="${(1.4/s).toFixed(3)}" opacity=".45" fill="none"/>
 <path d="M-0.46,-0.42 L0.46,-0.42" stroke="#7fc0d8" stroke-width="${(1.4/s).toFixed(3)}" opacity=".35" fill="none"/>
 <path d="M-0.15,-0.62 L0.05,-0.76 L0.09,0.28 L-0.11,0.42 Z" fill="#ffffff" opacity=".78"/></g>`;

/* アイス：左右の すきとおる 余白（58px ずつ）に 大きめの けっしょうを 2つ、
   その下に 小さい かけらを 1つずつ。**上下へは のばさない** */
const iceSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}">
<defs>
 <linearGradient id="ice" x1="0" y1="0" x2=".8" y2="1">
  <stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#d6f1fa"/><stop offset="1" stop-color="#93cfe6"/></linearGradient>
 <filter id="ig" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>
</defs>
<g filter="url(#ig)" opacity=".45" fill="#bfe9f8">
 <circle cx="46" cy="146" r="30"/><circle cx="209" cy="146" r="30"/></g>
${shard(46,142,44,-16)}${shard(80,190,23,15,.95)}
${shard(209,142,44,16)}${shard(175,190,23,-15,.95)}
${spark(38,88,9,'#eafaff')}${spark(218,90,8,'#eafaff')}${spark(128,236,7,'#eafaff',.75)}
</svg>`;

/* 1件ずつ 原画を 実測して 書く。**目分量で 書かないこと** ——
   `--measure` で その場で はかれます */
export const PLAN = {
  /* キーは **種の ID**（`dexList` の id）。base の 画像キー（`purin`）とは
     別ものです ——`candy` / `star` / `icecream` / `choco` は GEN と
     お菓子タワーが base を 分けあって いるので、進化の 絵は
     種の ID で 分けます（Phase 7-7-3-8-2）*/
  c_purin: {
    src:   'art/purin_e1.png',          // 原画（1254x1254・さわらない）
    out:   'art/sprites/c_purin_e1.png',  // ゲームが 読む もの（**<種のID>_<evo>**）
    base:  'art/sprites/purin.png',     // 大きさを そろえる 相手
    /* 原画の 実測 */
    body:  { x0:172, x1:1098, y0:380, y1:1196, cx:635 },  // プリン本体
    bodyW: 200,   // 出力での 本体の はば（base 205 の 98%）
    kv:    0.88,  // かざりの たて（1 で そのまま）
    hx:    0.80,  // かざりの よこ（上へ 行くほど 効く）
  },
  ch_choco: {
    kind:  'deco',
    base:  'art/sprites/kaminari.png',     // かみなりのこ（**読むだけ**）
    out:   'art/sprites/ch_choco_e1.png',
    dy:    16,     // 本体を 下へ ずらして、冠の 場所を 作る（大きさは 等倍）
    svg:   chocoSvg,
  },
  ch_apple: {
    kind:  'deco',
    base:  'art/sprites/futaba.png',         // ふたばのこ（**読むだけ**）
    out:   'art/sprites/ch_apple_e1.png',
    dy:    0,      // 右上の 余白（NE 117px）を つかう
    asym:  true,   // つる → つぼみ → 花 を **右上だけ**へ のばす（成長の 向き）
    svg:   appleSvg,
  },
  ch_prince: {
    kind:  'deco',
    base:  'art/sprites/yotsuba.png',        // よつばのこ（**読むだけ**）
    out:   'art/sprites/ch_prince_e1.png',
    dy:    0,      // 対角（NE101 / NW97 / SW80 / SE76）を つかう
    svg:   princeSvg,
  },
  ch_donut: {
    kind:  'deco',
    base:  'art/sprites/shizuku.png',       // いずみのしずく（**読むだけ**）
    out:   'art/sprites/ch_donut_e1.png',
    dy:    0,      // よこの 余白（左右 40px ずつ）と 対角を つかう
    svg:   donutSvg,
  },
  ch_queen: {
    kind:  'deco',
    base:  'art/sprites/sunadokei.png',     // すなどけい（**読むだけ**）
    out:   'art/sprites/ch_queen_e1.png',
    dy:    0,      // よこの 余白（左右 57px ずつ）を つかうので ずらさない
    svg:   queenSvg,
  },
  tw_ice: {
    kind:  'deco',
    base:  'art/sprites/icecream.png',     // お菓子タワーの アイス（**読むだけ**）
    out:   'art/sprites/tw_ice_e1.png',
    dy:    0,      // よこの 余白（58px ずつ）を つかうので、ずらさない
    svg:   iceSvg,
  },
};

const ss = t => t * t * (3 - 2 * t);
const N = 256, SUP = 4;   // SVG は 4倍で えがいてから 縮める（細い 線の ため）

async function build(key, plan){
  const { data, info } = await sharp(resolve(ROOT, plan.src)).ensureAlpha()
    .raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, B = plan.body;
  const at = (x,y,c) => (x<0||y<0||x>=W||y>=H) ? 0 : data[(y*W+x)*4+c];
  const bil = (fx,fy,c) => { const x0=Math.floor(fx), y0=Math.floor(fy), ax=fx-x0, ay=fy-y0;
    return at(x0,y0,c)*(1-ax)*(1-ay) + at(x0+1,y0,c)*ax*(1-ay)
         + at(x0,y0+1,c)*(1-ax)*ay   + at(x0+1,y0+1,c)*ax*ay; };

  /* かざりの 上ばしは **実測する**。`y=0` から 数えると、原画の 上の
     からっぽな 行まで かざりに 数えて しまい、絵が 下へ ずれます */
  let ty = 0;
  for (let y=0; y<H && ty===0; y++) for (let x=0; x<W; x++)
    if (data[(y*W+x)*4+3] > 24){ ty = y; break; }

  const S  = (B.x1 - B.x0 + 1) / plan.bodyW;      // 原画px ÷ 出力px
  const bodyH = (B.y1 - B.y0 + 1) / S;            // 本体は **等倍**
  const topH  = (B.y0 - ty) * plan.kv / S;        // かざりだけ ちぢめる
  const total = bodyH + topH;
  if (total > N) throw new Error(key + ': 256 に 収まりません（' + Math.round(total) + 'px）。kv/hx を 下げてください');
  const top = (N - total) / 2, YJ = top + topH, X0 = N / 2;

  const out = Buffer.alloc(N*N*4), SUB = 3;
  for (let Y=0; Y<N; Y++) for (let X=0; X<N; X++){
    let r=0,g=0,b=0,a=0;
    for (let sy=0; sy<SUB; sy++) for (let sx=0; sx<SUB; sx++){
      const fx = X + (sx+.5)/SUB, fy = Y + (sy+.5)/SUB;
      let my, hs = 1;
      if (fy >= YJ) my = B.y0 + (fy - YJ) * S;                    // 本体：等倍
      else { my = B.y0 - (YJ - fy) * S / plan.kv;                 // かざり：たてを ちぢめる
             const t = Math.min(1, (YJ - fy) / topH);
             hs = 1 - (1 - plan.hx) * ss(t); }                    // よこは 上へ 行くほど
      const mx = B.cx + (fx - X0) * S / hs;
      if (mx < 0 || my < 0 || mx >= W-1 || my >= H-1) continue;
      const al = bil(mx,my,3);
      r += bil(mx,my,0)*al; g += bil(mx,my,1)*al; b += bil(mx,my,2)*al; a += al;
    }
    const i = (Y*N+X)*4;
    if (a > 0){ out[i]=Math.round(r/a); out[i+1]=Math.round(g/a); out[i+2]=Math.round(b/a);
                out[i+3]=Math.round(a/(SUB*SUB)); }
  }
  await sharp(out, { raw:{ width:N, height:N, channels:4 } })
    .png({ compressionLevel:9 }).toFile(resolve(ROOT, plan.out));
  return { bodyW: plan.bodyW, bodyH: Math.round(bodyH), topH: Math.round(topH), total: Math.round(total) };
}

/* `deco`：base の 絵を **1:1 で そのまま** おいて、かざりだけ
   コードで えがいて **うしろに 敷く**。`dy` は 本体を 下へ ずらす ぶんで、
   **大きさは 変えません**（冠の 場所を 作る ため）。
   **base の 画像は 読むだけ。1バイトも 書きかえません。** */
async function buildDeco(key, plan){
  const dy = plan.dy | 0;
  const deco = await sharp(Buffer.from(plan.svg()), { density: 72 * SUP })
    .resize(N, N, { kernel:'lanczos3' }).png().toBuffer();
  let body = sharp(resolve(ROOT, plan.base));
  if (dy) body = body.extract({ left:0, top:0, width:N, height:N - dy })
    .extend({ top:dy, background:{ r:0, g:0, b:0, alpha:0 } });
  await sharp(deco).composite([{ input: await body.png().toBuffer() }])
    .png({ compressionLevel:9 }).toFile(resolve(ROOT, plan.out));

  /* 本体が ほんとうに さわられて いないかを 数える ——かざりは うしろなので、
     base が 不とうめいな ところは 出た 絵と **1画素も ちがわない**はず */
  const B = await sharp(resolve(ROOT, plan.base)).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
  const E = await sharp(resolve(ROOT, plan.out)).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
  let same = 0, diff = 0;
  for (let y = 0; y < N - dy; y++) for (let x = 0; x < N; x++){
    const i = (y*N+x)*4, j = ((y+dy)*N+x)*4;
    if (B.data[i+3] !== 255) continue;
    same++;
    if (B.data[i] !== E.data[j] || B.data[i+1] !== E.data[j+1]
     || B.data[i+2] !== E.data[j+2] || E.data[j+3] !== 255) diff++;
  }
  const m = await measure(plan.base);
  return { bodyW:m.w, bodyH:m.h, same, diff, dy, deco:true };
}

/* 出た 絵と base を くらべる。**本体の 大きさ**が いちばんの ものさし */
async function measure(f){
  const { data, info } = await sharp(resolve(ROOT, f)).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
  const W=info.width, H=info.height;
  let x0=W,y0=H,x1=-1,y1=-1;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) if (data[(y*W+x)*4+3] > 24){
    if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  return { x0, x1, y0, y1, W, H, w:x1-x0+1, h:y1-y0+1, cx:(x0+x1)/2/W-0.5, cy:(y0+y1)/2/H-0.5 };
}

const only = process.argv[2];
let ng = 0;
for (const [key, plan] of Object.entries(PLAN)){
  if (only && only !== key) continue;
  const r = plan.kind === 'deco' ? await buildDeco(key, plan) : await build(key, plan);
  const b = await measure(plan.base), e = await measure(plan.out);
  const wp = r.bodyW / b.w * 100, hp = r.bodyH / b.h * 100;
  console.log(`${key}_e1 … ${plan.out}`);
  console.log(`  本体 ${r.bodyW}x${r.bodyH}（base ${b.w}x${b.h} の ${wp.toFixed(0)}% / ${hp.toFixed(0)}%）`);
  console.log(r.deco
    ? `  base を 1:1（${r.dy ? 'たてに ' + r.dy + 'px ずらす' : 'ずらさない'}）／ ぜんたい ${e.w}x${e.h} ／ 中心ずれ ${e.cx.toFixed(3)},${e.cy.toFixed(3)}`
    : `  かざり ${r.topH}px ／ ぜんたい ${e.w}x${e.h} ／ 中心ずれ ${e.cx.toFixed(3)},${e.cy.toFixed(3)}`);
  /* `deco` は 本体の 画素を 1つも さわらない ことが きまり① そのもの */
  if (r.deco){
    console.log(`  本体の 画素 ${r.same}件 … ちがい ${r.diff}件`);
    if (r.diff){ console.log(`  ✗ 本体の 画素が ${r.diff}件 変わって いる`); ng++; }
  }
  /* ① 本体の 見た目の 大きさが base と そろって いるか（いちばん 大事）*/
  if (wp < 90 || wp > 100){ console.log(`  ✗ 本体の はばが ${wp.toFixed(0)}%（90〜100% の はず）`); ng++; }
  if (hp < 85 || hp > 100){ console.log(`  ✗ 本体の たかさが ${hp.toFixed(0)}%（85〜100% の はず）`); ng++; }
  /* ② ぜんたいは 256 に 収まる（長辺206 は **目安**であって 絶対では ない）*/
  if (e.w > 256 || e.h > 256){ console.log('  ✗ 256 に 収まって いない'); ng++; }
  /* わくの ふちに 当たって いたら、ぼかしの すそが 切れて 四角い 跡に なる */
  if (e.x0 === 0 || e.y0 === 0 || e.x1 === e.W-1 || e.y1 === e.H-1){
    console.log(`  ✗ わくの ふちに 当たって いる（${e.x0}..${e.x1} / ${e.y0}..${e.y1}）`); ng++; }
  /* ③ 中心は **本体の 重心**。細い 茎や かざりに 引っぱられて いないか。
     `deco` は 本体が 1:1 の まま なので 本体の 中心は 定義上 base と 同じ。
     わざと 片がわだけに かざりを 置く ときは PLAN に `asym:true` と 書く
     ——**書かない かぎり 落とす**（うっかりの かたよりを 見のがさない ため）*/
  if (!plan.asym && Math.abs(e.cx) > 0.02){ console.log(`  ✗ よこの 中心ずれ ${e.cx.toFixed(3)}`); ng++; }
  else if (plan.asym) console.log(`  （わざと 非対称：よこの 中心ずれ ${e.cx.toFixed(3)}）`);
}
console.log(ng ? '\n✗ ' + ng + '件' : '\n合格 ✅');
process.exit(ng ? 1 : 0);
