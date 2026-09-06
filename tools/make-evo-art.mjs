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

/* 岩の かけら。**tw_ice の 結晶と ぜったいに ちがう 形に する** ——
   あちらは すきとおる 対称の 六角、こちらは **不とうめいで 不規則**。
   `seed` ごとに 辺の 数も 半径も ばらつかせる */
function rockPts(s, seed){
  const R = rnd(seed), n = R() < .5 ? 6 : 7, P = [];
  for (let i = 0; i < n; i++){
    const a = (i / n) * Math.PI * 2 + (R() - .5) * .55;
    const r = s * (.66 + R() * .48);
    P.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return P;
}
const rock = (cx, cy, s, rot, seed) => {
  const P = rockPts(s, seed), f = p => p[0].toFixed(1) + ',' + p[1].toFixed(1);
  const d = 'M' + P.map(f).join(' L') + ' Z';
  /* 面（うすい ところ）——上ばんぶんだけ 明るく して 立体に 見せる */
  const hi = 'M' + P.slice(0, Math.ceil(P.length/2)).map(f).join(' L')
           + ' L' + (P[0][0]*.2).toFixed(1) + ',' + (P[0][1]*.2).toFixed(1) + ' Z';
  /* 割れ目（**この子の 進化の 印**。浮いた 岩の がわに 光る すじを 持たせる）*/
  const R = rnd(seed + 991);
  const c = [[-s*.55, -s*.16], [-s*.10, s*.10], [s*.18, -s*.14], [s*.60, s*.12]]
    .map(([x, y]) => [x + (R()-.5)*s*.12, y + (R()-.5)*s*.16]);
  const cd = 'M' + c.map(f).join(' L');
  return `<g transform="translate(${cx},${cy}) rotate(${rot})">`
    + `<path d="${d}" fill="url(#rockG)" stroke="#8f5058" stroke-width="${Math.max(1.8, s*.11).toFixed(2)}" stroke-linejoin="round"/>`
    + `<path d="${hi}" fill="#f0e2e3" opacity=".34"/>`
    + `<path d="${cd}" fill="none" stroke="#fc907e" stroke-width="${(s*.17).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<path d="${cd}" fill="none" stroke="#ffdcc0" stroke-width="${(s*.07).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>`
    + `</g>`;
};

/* ようがんゴーレム：**本体から 割れて 浮きあがった 岩の かけら**。
   炎や オーラで つつまない。本体の 形は 実測（頭 y40..88 で x90..166、
   こぶし y120..160 で x25..230、胴 y168..208 で x78..178）。
   四すみが 大きく 空いて いる（NE124 / NW125 / SW105 / SE104）*/
const GROCK = [   // [cx, cy, 大きさ, かたむき, たね]  ——**そろえない**。
                  // 左上に 大小 2つ かためて「板が 割れて はがれた」ように 見せ、
                  // 右上は わざと 空ける（四すみに 等間かくで 置かない）
  [ 48,  68, 26, -16, 7001],
  [ 80,  32, 14,  38, 7002],
  [212,  92, 21,  26, 7003],
  [ 60, 194, 15,  10, 7004],
  [204, 184, 24, -34, 7005],
];
/* **かけらは 5つ まで。**細かい かけらを 足すと `ch_queen` の
   「粒の 連なり」に 近づきます */
const golemSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}">
<defs>
 <linearGradient id="rockG" x1="0" y1="0" x2=".45" y2="1">
  <stop offset="0" stop-color="#ede3e5"/><stop offset=".5" stop-color="#b99a9d"/>
  <stop offset="1" stop-color="#9f575f"/></linearGradient>
 <filter id="lv" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4"/></filter>
</defs>
<g filter="url(#lv)" opacity=".30" fill="#fc9078">
 ${[...GROCK].map(([x,y,s]) => `<circle cx="${x}" cy="${y}" r="${(s*.72).toFixed(1)}"/>`).join('')}</g>
${GROCK.map(a => rock(...a)).join('')}
</svg>`;

/* 放射光。**外へ 行くほど 細く**、ふちは 引かない（光なので）。
   太い うす明かり ＋ 細い 芯 の 2枚で「にじむ 光」に する */
const ray = (deg, r0, r1, w0, w1, col) => {
  const a = deg * Math.PI / 180, dx = Math.cos(a), dy = -Math.sin(a);
  const P = [0, .34, .67, 1].map(t => [ (127.5 + dx*(r0 + (r1-r0)*t)),
                                        (127.5 + dy*(r0 + (r1-r0)*t)) ]);
  return `<path d="${ribbon(P, w0, w1)}" fill="${col}" opacity=".34"/>`
    + `<path d="${ribbon(P, w0*.52, w1*.5)}" fill="${col}" opacity=".78"/>`;
};

/* まっすぐな すじ（雨・速さの 線）。**丸い つぶに しない**
   ——`ch_donut` の しずくと 分ける ため */
const streak = (x1, y1, x2, y2, w, col, o = 1) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}"`
  + ` stroke-width="${w}" stroke-linecap="round" opacity="${o}"/>`;

/* ひかりのわ：**二重の 光の 輪 ＋ 斜めへ のびる 放射光**。
   Batch 1 の 中で **円・halo・放射光は この子の 専用**に する
   （雲の かたまり・雨すじ・虹は つかわない ——`ch_gumgum` と 分ける）。
   本体の 形は 実測（輪じたいは 半径 70〜79、すでに ある すじが 半径 100〜104
   まで のびる。よこの 余白は **19px しか ない**が、**ななめは 91〜97px**）。
   **太い オーラの 円盤に しない** ——外の 輪は 細く、すきとおらせる */
const FRAY = [   // すでに ある すじの **すき間**へ 入れる。長さと 角度を そろえない
  [ 38, 74, 150, 26, 7, '#d5bcfe'],
  [133, 74, 143, 26, 7, '#fcaace'],
  [224, 74, 148, 26, 7, '#aee8d7'],
  [312, 74, 153, 26, 7, '#d5bcfe'],
  [ 86, 74, 113, 22, 6, '#fcaace'],
  [268, 74, 112, 22, 6, '#aee8d7'],
];
const fairySvg = () => `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}">
<defs>
 <radialGradient id="hg" cx=".5" cy=".5" r=".5">
  <stop offset=".72" stop-color="#fff6d8" stop-opacity="0"/>
  <stop offset="1" stop-color="#fff2c8" stop-opacity=".55"/></radialGradient>
 <filter id="hb" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<g filter="url(#hb)" opacity=".55"><ellipse cx="127.5" cy="127.5" rx="94" ry="98" fill="url(#hg)"/></g>
${FRAY.map(r => ray(...r)).join('')}
<ellipse cx="127.5" cy="127.5" rx="97" ry="101" fill="none" stroke="#ffeec8"
 stroke-width="2.8" opacity=".62"/>
<ellipse cx="127.5" cy="127.5" rx="107" ry="111" fill="none" stroke="#fff8e4"
 stroke-width="6" opacity=".92"/>
<ellipse cx="127.5" cy="127.5" rx="107" ry="111" fill="none" stroke="#ffdf9c"
 stroke-width="2.8" opacity=".95"/>
</svg>`;

/* わたぐも：**雲が 天気を 生みだす**。上の 角に わき雲、下に 雨の すだれ、
   左下に 細い 虹。本体の 形は 実測（いちばん 太いのは y118..142 で x25..230、
   上は y38 で x107..148、下の あしは y182..214）。
   **円い 輪に しない**（`ch_fairy` と 分ける）・**大きな 水流に しない**
   （`ch_donut` と 分ける）・**粒の 連なりに しない**（`ch_queen` と 分ける）*/
const gumgumSvg = () => {
  /* わき雲。**1つずつ ふちを 引くと「あわ」に 見えます** ——ふち色の
     大きい 円を 先に 敷いて から 中を 塗ると、かさなりが 1つの 雲に なる */
  const PUFF = [[54,62,25],[32,80,17],[72,46,16],[202,62,24],[224,80,16],[184,46,15]];
  const puff = PUFF.map(([x,y,r]) => `<circle cx="${x}" cy="${y}" r="${(r+2.4).toFixed(1)}" fill="#9db9cc"/>`).join('')
             + PUFF.map(([x,y,r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#cloudG)"/>`).join('');
  /* 雨（少し かたむいた 直線。長さを そろえない）*/
  const RN = [[62,192,48,232],[82,200,70,238],[104,208,94,240],[126,212,118,238],
              [148,208,138,240],[170,200,158,236],[192,190,180,228],
              [46,178,34,210],[208,180,198,214]];
  const rain = RN.map(([a,b,c,d], i) =>
    streak(a, b, c, d, i % 3 === 0 ? 5.2 : 4.2, '#8ec8e6', .95)
    + streak(a + 1.2, b + 2, c + 1.2, d - 5, 1.6, '#e8f7ff', .8)).join('');
  /* 細い 虹（**半円の 記号に しない**。左下だけを 通る みじかい 弧）*/
  const RB = [['#ffd0dc', 0], ['#fbe6b0', 5.5], ['#bfe9d4', 11], ['#d5c8f2', 16.5]];
  const bow = RB.map(([c, o]) =>
    `<path d="M${(88+o*0.55).toFixed(1)},${(196+o*0.83).toFixed(1)}`
    + ` C${(56+o*0.62).toFixed(1)},${(208+o*0.78).toFixed(1)}`
    + ` ${(32+o*0.72).toFixed(1)},${(214+o*0.68).toFixed(1)}`
    + ` ${(16+o*0.86).toFixed(1)},${(208+o*0.5).toFixed(1)}"`
    + ` fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" opacity=".92"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}">
<defs>
 <linearGradient id="cloudG" x1="0" y1="0" x2=".4" y2="1">
  <stop offset="0" stop-color="#fbffff"/><stop offset=".55" stop-color="#eef9fb"/>
  <stop offset="1" stop-color="#d3e7f2"/></linearGradient>
 <filter id="gg" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<g filter="url(#gg)" opacity=".18" fill="#cfe8f6">
 <circle cx="52" cy="62" r="30"/><circle cx="204" cy="62" r="29"/></g>
${bow}
${rain}
${puff}
</svg>`;
};

/* ながれぼし：**尾が のびて 長くなる**。左下へ 3本の 尾が 扇に なって
   流れ、うしろに 速さの すじ。**左右から 本体を つつまない**
   （`ch_donut` の 水流と 分ける）。**粒の 連なりにも しない**
   （`ch_queen` の 砂と 分ける）——ここは **1方向の 帯**が 主役。
   本体の 形は 実測（星＝金 x102..226 / y38..154、尾＝パステル
   x26..139 / y100..223。左上 x12..109 / y12..70 が 空いて いる）*/
const RTAIL = [   // 星の うしろから **左へ 扇に 広がる**。空いて いるのは
                  // 尾の 上がわ（x12..109 / y60..115）——ここが いちばん 長く のばせる
  { P:[[118,72],[72,78],[38,90],[17,102]],   w:[8,30,4], g:'trM' },  // 上：ミント
  { P:[[116,90],[70,98],[34,110],[18,124]],  w:[8,36,4], g:'trL' },  // 中：ラベンダー
  { P:[[114,106],[66,116],[30,128],[19,144]],w:[8,30,4], g:'trP' },  // 下：ピンク
  { P:[[150,198],[104,220],[58,230],[19,222]], w:[8,40,5], g:'trP' },// 尾の さき（左下へ）
];
const RSTREAK = [   // 速さの すじ（尾と 同じ 向き）
  { P:[[104,52],[74,58],[44,68],[20,80]],  w:[4,4,1.4] },
  { P:[[138,42],[108,46],[78,54],[56,64]], w:[3.4,3.4,1.2] },
];
const rpurinSvg = () => {
  const band = t => `<path d="${ribbon(t.P, t.w[0], t.w[2], t.w[1])}" fill="url(#${t.g})"`
    + ` stroke="${{trP:'#e07fa8',trL:'#a97fd0',trM:'#6fc9a6'}[t.g]}" stroke-width="2.2"`
    + ` stroke-linejoin="round"/>`;
  const streak = t => `<path d="${ribbon(t.P, t.w[0], t.w[2], t.w[1])}" fill="#ffffff" opacity=".62"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}">
<defs>
 <linearGradient id="trP" x1="1" y1="0" x2="0" y2=".6">
  <stop offset="0" stop-color="#ffd9ea"/><stop offset=".55" stop-color="#fc9fcb"/>
  <stop offset="1" stop-color="#f9b6d6"/></linearGradient>
 <linearGradient id="trL" x1="1" y1="0" x2="0" y2=".6">
  <stop offset="0" stop-color="#eee2ff"/><stop offset=".55" stop-color="#cfa7f6"/>
  <stop offset="1" stop-color="#dcc4fb"/></linearGradient>
 <linearGradient id="trM" x1="1" y1="0" x2="0" y2=".6">
  <stop offset="0" stop-color="#dcfbec"/><stop offset=".55" stop-color="#a0f0d0"/>
  <stop offset="1" stop-color="#c4f6e0"/></linearGradient>
 <filter id="rg" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6"/></filter>
</defs>
<g filter="url(#rg)" opacity=".20" fill="#f6cfe6">
 <path d="${ribbon(RTAIL[1].P, 18, 12, 52)}"/><path d="${ribbon(RTAIL[3].P, 16, 12, 52)}"/></g>
${RTAIL.map(band).join('')}
${RTAIL.map(t => `<path d="${ribbon(t.P, 2, 1.4, t.w[1] * .28)}" fill="#ffffff" opacity=".38"/>`).join('')}
${RSTREAK.map(streak).join('')}
${spark(30, 168, 7.5, '#ffd9ea')}${spark(20, 62, 6, '#eee2ff')}${spark(74, 236, 5, '#dcfbec', .85)}
</svg>`;
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

/* ---------- c_salamander（サラマンダー）——背中に 沿って 育つ 稜線 ----------
   `c_lavagolem` とは 正反対に します ——あちらは **体から はなれて 浮く 岩**、
   こちらは **体の 輪郭に つながって 生える 稜線**。だから
   **1本ずつ 別の パスに しては いけません** ——かさなった ところに 線が
   のこって「三角を ならべただけ」に 見えます（ぱふそでの ふちと 同じ 失敗）。
   union を 自分で 計算して **1つの パス**に します */

/* 背中の 根の 線（`salamander.png` を 1px きざみで 実測した 上の 輪郭の
   **谷**を なぞって、さらに 下へ 逃がした もの）。ここより 下は 体に かくれます */
const SBACK = [[26,172],[36,155],[46,142],[56,133],[66,129],[76,123],[86,121],
               [96,116],[106,113],[116,108],[126,110],[136,108],[144,110]];
const sRootY = x => {
  if (x <= SBACK[0][0]) return SBACK[0][1];
  for (let i = 1; i < SBACK.length; i++){
    const [x0,y0] = SBACK[i-1], [x1,y1] = SBACK[i];
    if (x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return SBACK[SBACK.length-1][1];
};

/* [根の 中心x, たかさ, 半はば, 先の かたむき]。**そろえない** ——
   等間かくの 同じ 三角に すると「くし」に 見えます。
   いちばん 高い ところでも **頭のてっぺん（y=40）より 下**に とどめて、
   主役が 頭の ままである ように します（実測：てっぺん y=70）*/
const SSPIKE = [[132,18, 9,-3], [115,35,12,-5], [96,46,13,-5], [77,38,12,-5],
                [58,44,13,-6], [42,24,10,-4]];

function crestPath(spikes, scaleH = 1, scaleW = 1, drop = 12, p = 0.85){
  const xL = Math.min(...spikes.map(s => s[0] - s[2] * scaleW));
  const xR = Math.max(...spikes.map(s => s[0] + s[2] * scaleW));
  const topAt = x => {
    let y = sRootY(x) + 3;              // 棘の 外は 背中の すぐ下（＝かくれる）
    for (const [cx, h, hw0, t] of spikes){
      const hw = hw0 * scaleW, u = (x - cx) / hw;
      if (u <= -1 || u >= 1) continue;
      const u0 = Math.max(-0.85, Math.min(0.85, t / hw));
      const f = u <= u0 ? Math.pow((u + 1) / (u0 + 1), p)
                        : Math.pow((1 - u) / (1 - u0), p);
      y = Math.min(y, sRootY(x) - h * scaleH * f);
    }
    return y;
  };
  /* 先を すこし まるめる ——base の 板は まるい ので、とがった まま だと
     この子だけ するどく なります。**上の 線を ならして** まるめる こと
     （`stroke-linejoin` の まるめは 1px ほどしか 効かない）*/
  const xs = [], ys = [];
  for (let x = xL; x <= xR; x += 0.5){ xs.push(x); ys.push(topAt(x)); }
  const sm = ys.map((_, i) => {
    let w = 0, v = 0;
    for (let k = -6; k <= 6; k++){
      const j = i + k; if (j < 0 || j >= ys.length) continue;
      const g = Math.exp(-(k * k) / (2 * 2.4 * 2.4)); w += g; v += ys[j] * g;
    }
    return v / w;
  });
  let d = '';
  for (let i = 0; i < xs.length; i++) d += (d ? 'L' : 'M') + xs[i].toFixed(2) + ',' + sm[i].toFixed(2);
  for (let x = xR; x >= xL; x -= 3)   d += 'L' + x.toFixed(2) + ',' + (sRootY(x) + drop).toFixed(2);
  return d + 'Z';
}

const salamanderSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}">
<defs>
 <linearGradient id="salC" x1="0" y1="0" x2=".15" y2="1">
  <stop offset="0" stop-color="#fdcc91"/><stop offset=".55" stop-color="#fcb078"/>
  <stop offset="1" stop-color="#f19673"/></linearGradient>
</defs>
<path d="${crestPath(SSPIKE)}" fill="url(#salC)" stroke="#d5775a"
      stroke-width="2.6" stroke-linejoin="round"/>
<path d="${crestPath(SSPIKE, .60, .52, 4)}" fill="#fdcc91" opacity=".9"/>
</svg>`;

/* ---------- c_onibi（おにび）——**小さな 分身が 漂う** ----------
   Batch 2 の 3つめの 進化言語です。1つめ（`c_lavagolem`）は
   **体から はなれた 大きな 岩**、2つめ（`c_salamander`）は
   **体に つながって 育つ 輪郭**、ここは
   **小さくて じりつした 火が 何個も 漂う**。

   だから 次と かならず 分けます。
     ch_queen   … 大量の 細かい 粒の **連なり**（1つ1つは 読めない）
     ch_prince  … 大きな **同じ形**の くりかえし
     c_lavagolem… 大きく **角ばった** 浮遊岩
     ch_fairy   … 同心の **輪**と 放射
     c_hinotama … **本体そのもの**が 上へ のびる 炎（あとで 作る）

   ものさしは「**1つ1つが 小さな 鬼火に 読める**」こと ——だから
   ただの 丸い 粒には しません（頭＋細い 尾）。
   ただし **顔は 描きません**（ミニキャラを ならべる 方向に しない）*/

/* 子の 鬼火。**頭と 尾を 1つの パスで**えがきます ——別々に すると
   「頭に ひもを つけた」＝おたまじゃくしに 見えました（1回 やりました）。
   上は base と おなじ「大きな 舌＋左に 小さな 舌」、下は そのまま
   細く のびて 尾に なる。原点は **ふくらみの まん中** */
const KID = 'M0,-0.88 C0.06,-0.60 0.20,-0.56 0.27,-0.44'   // まん中の 舌
  + ' C0.32,-0.58 0.42,-0.64 0.48,-0.70'        // 右の 舌
  + ' C0.54,-0.48 0.62,-0.30 0.64,-0.04'
  + ' C0.66,0.32 0.44,0.64 0.18,0.72'           // まるい 下
  + ' C0.12,0.84 0.06,0.94 0.03,1.02'           // **細い 尾**
  + ' C-0.06,0.90 -0.18,0.80 -0.30,0.68'
  + ' C-0.52,0.52 -0.66,0.26 -0.64,-0.04'
  + ' C-0.62,-0.34 -0.48,-0.52 -0.38,-0.66'     // 左の 舌
  + ' C-0.32,-0.48 -0.21,-0.46 -0.15,-0.58'     // くぼみ
  + ' C-0.09,-0.72 -0.04,-0.82 0,-0.88 Z';

/* w＝ふくらみの はば（px）。尾の 向きは かたむけて 決める */
function onibiKid(cx, cy, w, rot){
  const s = w / 1.30;
  return `<g transform="translate(${cx},${cy}) rotate(${rot}) scale(${s.toFixed(3)})">
 <path d="${KID}" fill="url(#oniG)" stroke="#8995c7"
   stroke-width="${(3.2 / s).toFixed(4)}" stroke-linejoin="round"/>
 <ellipse cx="-0.06" cy="0.20" rx="0.26" ry="0.30" fill="#f7fcfd" opacity=".68"/>
</g>`;
}

/* [x, y, ふくらみの はば, かたむき]
   **円にも 左右対称にも 等間かくにも しない。**中心から 見た 角は
   137° / 220° / 313° で、313→137 の あいだ（180°）は まるごと 空けて
   「左と 下を ながれて いく 群れ」に します。大きさも 44 / 34 / 28 */
const OKID = [[ 48, 50, 44, -26],    // NW ……いちばん 大きい
              [ 40,212, 34, -14],    // SW ……中くらい
              [214,212, 28,  18]];   // SE ……小さい

const onibiSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}">
<defs>
 <radialGradient id="oniG" cx=".46" cy=".70" r=".78">
  <stop offset="0" stop-color="#f7fcfd"/><stop offset=".52" stop-color="#c7d0fb"/>
  <stop offset="1" stop-color="#9fabe4"/></radialGradient>
</defs>
${OKID.map(k => onibiKid(...k)).join('\n')}
</svg>`;

/* ---------- c_lavasnail（ようがんカタツムリ）——**殻の うずが 外へ のびる** ----------
   Batch 2 の 4つめの 進化言語は **うず（回転・巻きこみ）**です。
     c_lavagolem  … はなれた 大きな 岩
     c_salamander … 体に つながって 育つ 輪郭
     c_onibi      … 3つの 小さな 独立した 炎
     c_lavasnail  … **1本の 帯が 巻いて もどる**

   だから 次と かならず 分けます。
     ch_fairy   … **同心の 輪**（中心が まん中・左右対称）
       → こちらは **中心を 殻がわ（右下）に 寄せた 非対称**の うず
     sp_rpurin  … **1方向の 尾**（まっすぐ）
       → こちらは **巻いて もどる**（さいごに 330°の ロール）
     c_lavagolem / ch_queen … 浮いた もの・粒
       → こちらは **ひとつづきの 帯**。粒は 火の粉 3つ だけ

   base の あきは **右に 30〜46px・上に 32px** しか ないので、帯は
   その わっかを 通します。ただの わっか（halo）に 見せない ために
     ① はばを 20 → 2px に **強く すぼめる**（halo は はばが 一定）
     ② さいごに **330°の ロール**（`c_lavasnail` の いちばん だいじな 形）
     ③ ロールは 頭と 殻の あいだの **くさび**（y58 で x99..151 が あく）に 入れる
   の 3つを かならず 入れます */

/* 中心線に そって はばの 変わる 帯。`ribbon()` は ベジエ 4点 用なので、
   うずのように 折れまがる 線には こちらを つかいます */
function flowPath(pts, wf){
  const A = [], B = [], n = pts.length;
  for (let i = 0; i < n; i++){
    const [x, y] = pts[i], [x2, y2] = pts[Math.min(n-1, i+1)], [x0, y0] = pts[Math.max(0, i-1)];
    const tx = x2 - x0, ty = y2 - y0, L = Math.hypot(tx, ty) || 1;
    const w = wf(i / (n-1)) / 2;
    A.push([x - ty/L*w, y + tx/L*w]);
    B.push([x + ty/L*w, y - tx/L*w]);
  }
  const f = p => p[0].toFixed(1) + ',' + p[1].toFixed(1);
  return 'M' + A.map(f).join(' L') + ' L' + B.reverse().map(f).join(' L') + ' Z';
}

/* Catmull-Rom（制御点を **通る**）。ベジエだと 通らないので、
   実測した あきの まん中を なぞる ときは こちら */
function catmull(P, per = 14){
  const out = [], Q = [P[0], ...P, P[P.length-1]];
  for (let i = 1; i < Q.length - 2; i++){
    const [p0,p1,p2,p3] = [Q[i-1], Q[i], Q[i+1], Q[i+2]];
    for (let k = 0; k < per; k++){
      const t = k/per, t2 = t*t, t3 = t2*t;
      out.push([
        .5*((2*p1[0]) + (-p0[0]+p2[0])*t + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),
        .5*((2*p1[1]) + (-p0[1]+p2[1])*t + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3)]);
    }
  }
  out.push(P[P.length-1]);
  return out;
}

/* 帯の 通り道。殻の 中（かくれる）→ 殻の 上の あき（y<44）→ ロールへ */
const LSW = [[186,88],[178,74],[171,60],[164,44],[156,26]];

/* さいごの ロールが **この子の いちばん だいじな 形**です。
   中心 (132,50)＝**頭と 殻の あいだの くさび**（y58 で x99..151 が あく）。
   45° → 405°（**ちょうど 1周**）・半けい 34 → 13。1周ぶんの 間かくは 21px で
   帯の はば（6px）より 広いので、**うずの みぞが 36px でも 見えます**。
   1.25周・1.8周も 作りましたが、間かくが せまくなって
   **とじた わっか（handle）**に 見えました（2回 やりました）。
   まきの 向きは base の みぞと そろえる こと ——base は
   **外へ 行くほど 右まわり**なので、内へ 行くのは 左まわり */
const lsRoll = () => {
  const C = [132, 50], out = [];
  for (let d = 45; d <= 405; d += 3){
    const t = (d - 45) / 360, r = 34 + (13 - 34) * t, a = d * Math.PI / 180;
    out.push([C[0] + Math.cos(a) * r, C[1] - Math.sin(a) * r]);
  }
  return out;
};

const LS_PTS = [...catmull(LSW), ...lsRoll()];
/* はばは 22 → 1.5px。**halo は はばが 一定**なので、ここを ゆるめると
   ただの わっかに 見えます */
const lsW = t => t < .30 ? 22 - 11*(t/.30)               // 22 → 11
           : 11 - 9.5*((t-.30)/.70);                     // 11 →  1.5

const lavasnailSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}">
<defs>
 <linearGradient id="lsSh" x1="0" y1="0" x2=".3" y2="1">
  <stop offset="0" stop-color="#c78d94"/><stop offset=".55" stop-color="#be8088"/>
  <stop offset="1" stop-color="#a46b72"/></linearGradient>
</defs>
<path d="${flowPath(LS_PTS, lsW)}" fill="url(#lsSh)" stroke="#986369"
      stroke-width="2.6" stroke-linejoin="round"/>
<path d="${flowPath(LS_PTS, t => lsW(t) * 0.38)}" fill="#f7ad7f" opacity=".92"/>
<path d="${flowPath(LS_PTS, t => lsW(t) * 0.16)}" fill="#fcc78e"/>
${[[178,24,3.4],[102,26,2.8],[152,80,2.4]].map(([x,y,r]) =>
  `<g transform="translate(${x},${y})"><path d="M0,${-r*2.2} Q${r*.34},${-r*.34} ${r*2.2},0`
  + ` Q${r*.34},${r*.34} 0,${r*2.2} Q${-r*.34},${r*.34} ${-r*2.2},0`
  + ` Q${-r*.34},${-r*.34} 0,${-r*2.2} Z" fill="#fcc78e" opacity=".85"/></g>`).join('')}
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
  c_lavagolem: {
    kind:  'deco',
    base:  'art/sprites/lavagolem.png',       // ようがんゴーレム（**読むだけ**）
    out:   'art/sprites/c_lavagolem_e1.png',
    dy:    0,      // 四すみが 大きく 空いて いる ので ずらさない
    svg:   golemSvg,
  },
  ch_fairy: {
    kind:  'deco',
    base:  'art/sprites/hikari.png',          // ひかりのわ（**読むだけ**）
    out:   'art/sprites/ch_fairy_e1.png',
    dy:    0,      // よこは 19px しか ない。**ななめ（91〜97px）**で 外周を 広げる
    svg:   fairySvg,
  },
  ch_gumgum: {
    kind:  'deco',
    base:  'art/sprites/watagumo.png',        // わたぐも（**読むだけ**）
    out:   'art/sprites/ch_gumgum_e1.png',
    dy:    0,      // 上下の 角（NE/NW 77・SW/SE 84〜87）を つかう
    svg:   gumgumSvg,
  },
  sp_rpurin: {
    kind:  'deco',
    base:  'art/sprites/nagareboshi.png',     // ながれぼし（**読むだけ**）
    out:   'art/sprites/sp_rpurin_e1.png',
    dy:    0,      // 左下へ のばす（**`sp_` prefix の 実証**も かねる）
    asym:  true,   // 尾は **1方向**。左右対称に すると 流れが 消える
    svg:   rpurinSvg,
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
  c_salamander: {
    kind:  'deco',
    base:  'art/sprites/salamander.png',    // サラマンダー（**読むだけ**）
    out:   'art/sprites/c_salamander_e1.png',
    dy:    0,      // 背中の 上（N 99px）に のばす。本体は 1ミリも 動かさない
    asym:  true,   // よこ向きの子。稜線は 背中がわ だけ に 生える
    svg:   salamanderSvg,
  },
  c_onibi: {
    kind:  'deco',
    base:  'art/sprites/onibi.png',          // おにび（**読むだけ**）
    out:   'art/sprites/c_onibi_e1.png',
    dy:    0,      // 四すみ（NW32 / NE30 / SW18 / SE24px）に 子を 置く
    asym:  true,   // 群れは **左と 下**へ 寄せる（円に しない）
    svg:   onibiSvg,
  },
  c_lavasnail: {
    kind:  'deco',
    base:  'art/sprites/lavasnail.png',       // ようがんカタツムリ（**読むだけ**）
    out:   'art/sprites/c_lavasnail_e1.png',
    dy:    0,      // あきは 右 30〜46px・上 32px。そこを 帯が 通る
    asym:  true,   // うずの 中心は **殻がわ**へ 寄せる（ch_fairy の 同心円と 分ける）
    svg:   lavasnailSvg,
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
