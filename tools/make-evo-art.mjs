/* 進化の 絵（`<base>_e1`）を 原画から 作りなおす。
 *
 *   node tools/make-evo-art.mjs            # ぜんぶ
 *   node tools/make-evo-art.mjs purin      # その子だけ
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
 */
import sharp from 'sharp';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
};

const ss = t => t * t * (3 - 2 * t);

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

  const N = 256;
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

/* 出た 絵と base を くらべる。**本体の 大きさ**が いちばんの ものさし */
async function measure(f){
  const { data, info } = await sharp(resolve(ROOT, f)).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
  const W=info.width, H=info.height;
  let x0=W,y0=H,x1=-1,y1=-1;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) if (data[(y*W+x)*4+3] > 24){
    if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  return { w:x1-x0+1, h:y1-y0+1, cx:(x0+x1)/2/W-0.5, cy:(y0+y1)/2/H-0.5 };
}

const only = process.argv[2];
let ng = 0;
for (const [key, plan] of Object.entries(PLAN)){
  if (only && only !== key) continue;
  const r = await build(key, plan);
  const b = await measure(plan.base), e = await measure(plan.out);
  const wp = r.bodyW / b.w * 100, hp = r.bodyH / b.h * 100;
  console.log(`${key}_e1 … ${plan.out}`);
  console.log(`  本体 ${r.bodyW}x${r.bodyH}（base ${b.w}x${b.h} の ${wp.toFixed(0)}% / ${hp.toFixed(0)}%）`);
  console.log(`  かざり ${r.topH}px ／ ぜんたい ${e.w}x${e.h} ／ 中心ずれ ${e.cx.toFixed(3)},${e.cy.toFixed(3)}`);
  /* ① 本体の 見た目の 大きさが base と そろって いるか（いちばん 大事）*/
  if (wp < 90 || wp > 100){ console.log(`  ✗ 本体の はばが ${wp.toFixed(0)}%（90〜100% の はず）`); ng++; }
  if (hp < 85 || hp > 100){ console.log(`  ✗ 本体の たかさが ${hp.toFixed(0)}%（85〜100% の はず）`); ng++; }
  /* ② ぜんたいは 256 に 収まる（長辺206 は **目安**であって 絶対では ない）*/
  if (e.w > 256 || e.h > 256){ console.log('  ✗ 256 に 収まって いない'); ng++; }
  /* ③ 中心は 本体の 重心。細い 茎に 引っぱられて いないか */
  if (Math.abs(e.cx) > 0.02){ console.log(`  ✗ よこの 中心ずれ ${e.cx.toFixed(3)}`); ng++; }
}
console.log(ng ? '\n✗ ' + ng + '件' : '\n合格 ✅');
process.exit(ng ? 1 : 0);
