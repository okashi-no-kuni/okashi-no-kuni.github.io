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
  /* ③ 中心は 本体の 重心。細い 茎に 引っぱられて いないか */
  if (Math.abs(e.cx) > 0.02){ console.log(`  ✗ よこの 中心ずれ ${e.cx.toFixed(3)}`); ng++; }
}
console.log(ng ? '\n✗ ' + ng + '件' : '\n合格 ✅');
process.exit(ng ? 1 : 0);
