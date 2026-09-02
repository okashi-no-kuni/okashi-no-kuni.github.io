/* UIアイコンを 原画から 切り出す。
 *
 *   node tools/make-ui-icons.mjs
 *
 * 原画（art/ui/_reference/*_source.png）は **さわらないこと**。
 * 手で 切らないこと ——絵を さしかえた ときに 作りなおせなく なります
 * （make-icons.mjs・make-welcome-art.mjs と 同じ きまり）。
 *
 * 原画は「1まいに いくつか ならんだ シート」です。ならびは SHEETS に 書きます。
 *
 * **まん中で ます目に 切っては いけません。**Phase 1 では 王冠の リボンと
 * ベルが たてに かさなって 境めを またいで いました（実測 76画素）。
 * つながった 画素の かたまりを 拾って、中心の いちで ふりわけます。
 *
 * 音ON と 音OFF だけは **同じ 大きさの わく**で 切ります。
 * 別々の わくで 切ると ベルの いちが ずれて、押すたびに ガタつきます。
 */
import { launch } from './_pw.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REF  = resolve(root, 'art/ui/_reference');
const OUT  = resolve(root, 'art/ui');

const N   = 128;    // 出す 大きさ。**256は 要りません** ——画面で いちばん 大きいのは 38px
const PAD = 0.955;  // ふちに 3%ほど すき間。0 に すると ブラウザの 拡大で ふちが 欠ける
const Q   = 0.92;   // WebP の 品質（表紙・導入画面と そろえる）

const SHEETS = [
  {
    /* Phase 1 ——**はじめから 透過**で 届いた シート。抜く 処理は 要らない */
    file:'phase1_source.png', w:1536, h:1024, cols:2, rows:2, mode:'alpha',
    /* 音ON/OFF を 切る 共通の わく。2つの わく（466x412 / 469x415）より
       すこし 大きく とって、どちらも 同じ 倍率に なるように する */
    pair:{ w:480, h:432 },
    plan:[
      { cell:'0,0', key:'nav_dex',   name:'図鑑（王冠の 紋章）' },
      { cell:'1,0', key:'nav_guide', name:'ガイド（ひらいた 魔法書）' },
      { cell:'0,1', key:'snd_on',    name:'音ON（ベル）',        pair:true },
      { cell:'1,1', key:'snd_off',   name:'音OFF（ベル＋斜線）', pair:true },
    ],
  },
  {
    /* Phase 2 ——**背景つき**で 届いた シート（ピンク〜ラベンダーの グラデ＋
       ますごとの かざり枠）。下の keyOut() で 抜く */
    file:'phase2_source.png', w:1536, h:1024, cols:3, rows:2, mode:'key',
    plan:[
      { cell:'0,0', key:'nav_shop',   name:'ショップ（おかしの 屋台）' },
      { cell:'1,0', key:'nav_week',   name:'今週のおだい（チェックの 紙）' },
      { cell:'2,0', key:'nav_avatar', name:'アバター（ドレッサー）' },
      { cell:'0,1', key:'nav_code',   name:'合言葉（魔法の 鍵）' },
      { cell:'1,1', key:'nav_share',  name:'シェア（翼の ついた わく）' },
      /* 2,1 は 空。書かなければ 切り出しません */
    ],
  },
  {
    /* Phase 3 ——Phase 2 と おなじ 背景つきの シート */
    file:'phase3_source.png', w:1536, h:1024, cols:3, rows:2, mode:'key',
    plan:[
      { cell:'0,0', key:'nav_pin',   name:'ピン留め（宝石の ペン）' },
      { cell:'1,0', key:'nav_close', name:'閉じる（翼の ついた ✕）' },
      { cell:'2,0', key:'nav_egg',   name:'たまご（王冠と 翼）' },
      { cell:'0,1', key:'nav_guard', name:'まもり神（王さまの けもの）' },
      /* 1,1 と 2,1 は 空 */
    ],
  },
  {
    /* Phase 5 ——通貨・状態の 記号。Phase 2/3 と おなじ 背景つきの シート。
       かけら（右はし）は **大きい 結晶と 小さい かけら の 2つ**なので、
       いちばん 大きい かたまり だけ では 小さい ほうが 落ちます。
       だから この シートだけ keep で「大きい ほうの 8%以上」を のこす */
    file:'phase5_source.png', w:1536, h:1024, cols:4, rows:2, mode:'key', keep:0.08,
    plan:[
      { cell:'0,0', key:'cur_star',  name:'⭐ おほしさま（通貨）' },
      { cell:'1,0', key:'cur_gem',   name:'💎 ジュエル' },
      { cell:'2,0', key:'cur_heart', name:'💗 ハート（あそべる 回数）' },
      { cell:'3,0', key:'cur_shard', name:'🩷 かけら' },
      /* 1,1 と 2,1 は 空 */
    ],
  },
  {
    /* Phase 5D-2-0 ——こだいの秘薬（⚗️）だけの 1まい。**はじめから 透過**。
       にじいろの秘薬（🧪・it_elixir.png）と 同じ絵に なっていたのを 直す ため。
       つばさが 胴から はなれた かたまりに なる ことが あるので、
       alpha の 切りかたは かたまりの わくを 足しあわせます（もとから そう）*/
    file:'phase5d20_source.png', w:1098, h:1432, cols:1, rows:1, mode:'alpha',
    plan:[
      /* **わざと たてに 細い**（たてよこ比 0.48）。にじいろの秘薬は 0.85 の
         まるい フラスコなので、14pxでも 形で 見わけられる ように している。
         そのぶん 四角い わくの うめ具合は 25%を 下まわるので、
         この 絵だけ しきい値を さげる */
      { cell:'0,0', key:'it_elixir3', name:'⚗️ こだいの秘薬（王冠つきの 瓶）', minFill:20 },
    ],
  },
  {
    /* Phase 5D-2-A ——ショップの 26px の 行（7つ）。**3x3 で 7素材＋空き2マス**。
       ますが 等分なので 切り出しの ぐあいが そろいます。
       Phase 2・3 と おなじ 背景つきなので keyOut で 抜きます */
    file:'phase5d2a_source.png', w:1278, h:1231, cols:3, rows:3, mode:'key',
    plan:[
      { cell:'0,0', key:'shop_start',       name:'🎁 はじめてパック（リボンの 箱）' },
      { cell:'1,0', key:'shop_pass',        name:'🎫 30日パスポート（王冠と 時計の 券）' },
      { cell:'2,0', key:'shop_help',        name:'🎒 おたすけセット（もちもの入りの かばん）' },
      { cell:'0,1', key:'shop_rainbow_set', name:'🌈 にじいろセット（宝箱）' },
      { cell:'1,1', key:'theme_dream',      name:'🌈 ゆめいろパステル（にじと 雲）' },
      { cell:'2,1', key:'theme_lemon',      name:'🍋 レモンのおかやま（レモンと おうち）' },
      { cell:'0,2', key:'theme_mermaid',    name:'🐚 にんぎょのうみ（真珠の 貝）' },
      /* 1,2 と 2,2 は 空 */
    ],
  },
  {
    /* Phase 5D-2-B ——アイテム 6種。**3x2・空きマスなし**。
       ますの 境めに 点線が 引いて ありますが、keyOut は ますの
       内がわ 5.5% から 切るので 入りません。

       キーは `item_*` に します。`art/sprites/it_*.png` と おなじ 名前に
       すると、1つの レコードに `icKey:'it_ball'` と `art:'it_ball'` が
       ならんで 読みにくく なるためです */
    file:'phase5d2b_source.png', w:1563, h:1006, cols:3, rows:2, mode:'key',
    plan:[
      { cell:'0,0', key:'item_ball',   name:'🌈 にじいろボール（4方向の 衝撃光つき オーブ）' },
      { cell:'1,0', key:'item_bolt',   name:'⚡ いなずま（よこ方向の 電撃波）' },
      { cell:'2,0', key:'item_hammer', name:'🔨 ハンマー（一点衝撃の 星）' },
      { cell:'0,1', key:'item_elixir', name:'🧪 にじいろの秘薬（まるい胴の フラスコ）' },
      { cell:'1,1', key:'item_freeze', name:'🧊 こおりのつぼ（ふたつき＋雪のけっしょう）' },
      { cell:'2,1', key:'item_rain',   name:'⭐ おほしさまの雨（雲から 星が 降る）' },
    ],
  },
  {
    /* Phase 5D-2-C ——ボーナスウェーブの 🍓 と 🍭。**はじめから 透過**。
       ならぶ 相手は `art/ui/` の アイコンでは なく **盤面の スプライト**
       （candy / donut / cookie / cupcake / cake / purin）なので、
       画風も 大きさも そちらに 合わせます。

       **pad:0.78 が いのちです。**盤面の スプライトは 256pxの わくの 中で
       中みが よこ0.76・たて0.78 しか ありません。`CELL*0.95` の 1つの 倍率で
       8種 ぜんぶを えがくので、ここを わくいっぱい（0.955）で 切ると
       この 2枚だけ 22% 大きく 見えます */
    file:'phase5d2c_source.png', w:1808, h:870, cols:2, rows:1, mode:'alpha',
    plan:[
      { cell:'0,0', key:'bonus_ichigo', name:'🍓 いちご',            pad:0.78, minFill:20 },
      { cell:'1,0', key:'bonus_ame',    name:'🍭 ぺろぺろキャンディ', pad:0.78, minFill:20 },
    ],
  },
  {
    /* Phase 5D-2-D ——「仲間を選ぶ」の タイル。**はじめから 透過**。
       よこに 長い（たてよこ比 1.68）ので、うめ具合は 25%を 大きく 下まわります */
    file:'phase5d2d_source.png', w:1453, h:1082, cols:1, rows:1, mode:'alpha',
    plan:[
      { cell:'0,0', key:'nav_pick', name:'🧸 仲間を選ぶ（3体の クマ）', minFill:12 },
    ],
  },
];

if (!existsSync(REF)){ console.error('✗ 原画の ありかが ありません: ' + REF); process.exit(1); }
mkdirSync(OUT, { recursive:true });

const b = await launch();
const pg = await (await b.newContext()).newPage();
await pg.goto('about:blank');

let bad = 0;
const pairBox = {};
for (const sh of SHEETS){
  const p = resolve(REF, sh.file);
  if (!existsSync(p)){ console.error('✗ 原画が ありません: ' + p); process.exit(1); }
  const src = 'data:image/png;base64,' + readFileSync(p).toString('base64');
  const res = await pg.evaluate(async ([s, sh, N, PAD, Q]) => {
    const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
    if (im.width !== sh.w || im.height !== sh.h)
      return { err:'原画の 大きさが ちがいます: ' + im.width + 'x' + im.height };
    const W = im.width, H = im.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently:true }); g.drawImage(im, 0, 0);
    const D = g.getImageData(0, 0, W, H).data;
    const at = (x, y) => { const i = (y*W + x) << 2; return [D[i], D[i+1], D[i+2]]; };
    const alphaAt = (x, y) => D[((y*W + x) << 2) + 3];

    /* ---------- ① 透過つきの シート ----------
       つながった 画素の かたまりを 拾って、中心の いちで ますに ふりわける */
    const byCell = {};
    if (sh.mode === 'alpha'){
      for (const [x, y] of [[2,2],[W-3,2],[2,H-3],[W-3,H-3]])
        if (alphaAt(x, y) !== 0) return { err:'背景が 透過では ありません（' + x + ',' + y + '）' };
      const TH = 16, lab = new Int32Array(W*H).fill(-1), st = new Int32Array(W*H), comps = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
        const p0 = y*W + x; if (lab[p0] >= 0 || alphaAt(x, y) < TH) continue;
        let sp = 0; st[sp++] = p0; lab[p0] = comps.length;
        let x0 = x, y0 = y, x1 = x, y1 = y, n = 0;
        while (sp > 0){
          const q = st[--sp], qx = q % W, qy = (q / W) | 0; n++;
          if (qx < x0) x0 = qx; if (qx > x1) x1 = qx;
          if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
            const nx = qx+dx, ny = qy+dy; if (nx<0||ny<0||nx>=W||ny>=H) continue;
            const np = ny*W + nx; if (lab[np] >= 0 || alphaAt(nx, ny) < TH) continue;
            lab[np] = lab[p0]; st[sp++] = np;
          }
        }
        comps.push({ n, box:[x0,y0,x1,y1] });
      }
      for (const cp of comps){
        if (cp.n < 200) continue;                       // ごみ（数画素）は 捨てる
        const cx = (cp.box[0]+cp.box[2])/2, cy = (cp.box[1]+cp.box[3])/2;
        const k = Math.min(sh.cols-1, (cx / (W/sh.cols)) | 0) + ',' +
                  Math.min(sh.rows-1, (cy / (H/sh.rows)) | 0);
        if (!byCell[k]) byCell[k] = cp.box.slice();
        else { const b2 = byCell[k];
          b2[0] = Math.min(b2[0], cp.box[0]); b2[1] = Math.min(b2[1], cp.box[1]);
          b2[2] = Math.max(b2[2], cp.box[2]); b2[3] = Math.max(b2[3], cp.box[3]); }
      }
    }

    /* ---------- ② 背景つきの シートを 抜く ----------
       背景は なめらかな グラデ。**ますごとに** 二次曲面で 当てる。
       シート全体で 当てると ずれが 21ほど 出て、絵の うすい 白
       （背景との へだたりが 22〜26 しか ない）と 見わけが つかなく なる。
       ますごとなら ずれは 3〜6 に 下がる（実測）*/
    const basis = (u, v) => [1, u, v, u*u, u*v, v*v];
    const solve = (A, bb) => {
      const n = 6, M = A.map((r, i) => r.concat([bb[i]]));
      for (let i = 0; i < n; i++){
        let p2 = i; for (let k = i+1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p2][i])) p2 = k;
        [M[i], M[p2]] = [M[p2], M[i]]; const d = M[i][i] || 1e-9;
        for (let k = i+1; k < n; k++){ const f = M[k][i]/d; for (let j = i; j <= n; j++) M[k][j] -= f*M[i][j]; }
      }
      const x2 = new Array(n).fill(0);
      for (let i = n-1; i >= 0; i--){ let s2 = M[i][n];
        for (let j = i+1; j < n; j++) s2 -= M[i][j]*x2[j]; x2[i] = s2/(M[i][i] || 1e-9); }
      return x2;
    };
    const keyOut = (ax, ay, w, h) => {
      /* なめらかな 点だけ 集めて、はずれ値を すてながら 5回 当てなおす */
      let samp = [];
      for (let y = 2; y < h-2; y += 3) for (let x = 2; x < w-2; x += 3){
        const p2 = at(ax+x, ay+y); let v = 0;
        for (const [dx, dy] of [[-2,0],[2,0],[0,-2],[0,2]]){
          const q = at(ax+x+dx, ay+y+dy);
          v = Math.max(v, Math.abs(p2[0]-q[0]) + Math.abs(p2[1]-q[1]) + Math.abs(p2[2]-q[2]));
        }
        if (v <= 5) samp.push([x/(w-1), y/(h-1), p2]);
      }
      let use = samp, coef = [null,null,null], p90 = 999;
      for (let pass = 0; pass < 5; pass++){
        for (let ch = 0; ch < 3; ch++){
          const A = Array.from({length:6}, () => new Array(6).fill(0)), B = new Array(6).fill(0);
          for (const [u, v, p2] of use){ const f = basis(u, v);
            for (let i = 0; i < 6; i++){ B[i] += f[i]*p2[ch];
              for (let j = 0; j < 6; j++) A[i][j] += f[i]*f[j]; } }
          coef[ch] = solve(A, B);
        }
        const bg0 = (u, v) => { const f = basis(u, v);
          return coef.map(cf => f.reduce((s2, t, i) => s2 + t*cf[i], 0)); };
        const errs = use.map(([u, v, p2]) => { const q = bg0(u, v);
          return Math.abs(p2[0]-q[0]) + Math.abs(p2[1]-q[1]) + Math.abs(p2[2]-q[2]); });
        const srt = [...errs].sort((a, b2) => a - b2);
        p90 = srt[Math.floor(srt.length*0.9)] || 0;
        const lim = Math.max(4, srt[Math.floor(srt.length*0.7)]);
        const nx = use.filter((_, i) => errs[i] <= lim);
        if (nx.length > 200) use = nx;
      }
      const o = document.createElement('canvas'); o.width = w; o.height = h;
      const og = o.getContext('2d', { willReadFrequently:true });
      og.drawImage(im, ax, ay, w, h, 0, 0, w, h);
      const P = og.getImageData(0, 0, w, h), QD = P.data;
      const dif = (x, y) => { const i = (y*w + x) << 2, f = basis(x/(w-1), y/(h-1));
        const q = coef.map(cf => f.reduce((s2, t, k) => s2 + t*cf[k], 0));
        return Math.abs(QD[i]-q[0]) + Math.abs(QD[i+1]-q[1]) + Math.abs(QD[i+2]-q[2]); };
      /* ふちから つながった 背景を ぬる */
      const T = 13, bgm = new Uint8Array(w*h), st = [];
      const push = (x, y) => { const i = y*w + x; if (!bgm[i] && dif(x, y) <= T){ bgm[i] = 1; st.push(i); } };
      for (let x = 0; x < w; x++){ push(x, 0); push(x, h-1); }
      for (let y = 0; y < h; y++){ push(0, y); push(w-1, y); }
      while (st.length){ const i = st.pop(), x = i % w, y = (i / w) | 0;
        if (x > 0) push(x-1, y); if (x < w-1) push(x+1, y);
        if (y > 0) push(x, y-1); if (y < h-1) push(x, y+1); }
      /* いちばん 大きい かたまり だけ のこす（ますの かざり枠・きらめきを 捨てる）*/
      const lab = new Int32Array(w*h).fill(-1); let best = -1, bestN = 0, nc = 0;
      const size = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
        const p0 = y*w + x; if (bgm[p0] || lab[p0] >= 0) continue;
        const id = nc++; const s2 = [p0]; lab[p0] = id; let n = 0;
        while (s2.length){ const q = s2.pop(), qx = q % w, qy = (q / w) | 0; n++;
          for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
            const nx = qx+dx, ny = qy+dy; if (nx<0||ny<0||nx>=w||ny>=h) continue;
            const np = ny*w + nx; if (bgm[np] || lab[np] >= 0) continue;
            lab[np] = id; s2.push(np); } }
        size[id] = n;
        if (n > bestN){ bestN = n; best = id; }
      }
      if (bestN < 4000) return { empty:true, p90 };
      /* ふつうは いちばん 大きい かたまり だけ。keep を 書いた シートでは
         その 何割か より 大きい かたまりも のこす（かけらの 小さい ほう）*/
      const ok = id => id === best || (sh.keep > 0 && id >= 0 && size[id] >= bestN*sh.keep);
      /* 外がわの うすい モヤ（絵に 焼きこまれた ひかり）を もう一段 落とす。
         **外がわからしか たどらない**ので、輪郭に かこまれた 中の うすい ところ
         （屋根の 白いしま など）は のこる */
      const H2 = 42, st2 = [];
      const push2 = (x, y) => { const i = y*w + x;
        if (bgm[i] || !ok(lab[i]) || dif(x, y) > H2) return;
        bgm[i] = 1; st2.push(i); };
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
        if (!bgm[y*w + x]) continue;
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
          const nx = x+dx, ny = y+dy; if (nx<0||ny<0||nx>=w||ny>=h) continue; push2(nx, ny); } }
      while (st2.length){ const i = st2.pop(), x = i % w, y = (i / w) | 0;
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
          const nx = x+dx, ny = y+dy; if (nx<0||ny<0||nx>=w||ny>=h) continue; push2(nx, ny); } }
      /* 中は 255 のまま。**ふちに 接する 画素だけ** やわらかくする。
         ここを 中まで かけると、うすい クリームの 面が すけて 穴に なる */
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
        const i = y*w + x, j = i << 2;
        if (!ok(lab[i]) || bgm[i]){ QD[j+3] = 0; continue; }
        let touch = false;
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]]){
          const nx = x+dx, ny = y+dy; if (nx<0||ny<0||nx>=w||ny>=h) continue;
          if (bgm[ny*w + nx]){ touch = true; break; } }
        QD[j+3] = touch ? Math.round(255*Math.min(1, Math.max(.3, (dif(x, y) - H2*0.5)/(H2*1.2)))) : 255;
      }
      og.putImageData(P, 0, 0);
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
        if (QD[((y*w + x) << 2) + 3] > 16){ if (x<x0)x0=x; if (x>x1)x1=x; if (y<y0)y0=y; if (y>y1)y1=y; }
      return { cv:o, box:[x0, y0, x1, y1], p90 };
    };

    /* ---------- 出す ---------- */
    const CW = W/sh.cols, CH = H/sh.rows, out = [];
    for (const p of sh.plan){
      const [cx0, cy0] = p.cell.split(',').map(Number);
      let srcCv = im, sx, sy, sw, sh2, p90 = null;
      if (sh.mode === 'alpha'){
        const box = byCell[p.cell];
        if (!box) return { err:'ます ' + p.cell + ' に かたまりが ありません' };
        sw = p.pair ? sh.pair.w : box[2]-box[0]+1;
        sh2 = p.pair ? sh.pair.h : box[3]-box[1]+1;
        sx = (box[0]+box[2])/2 - sw/2; sy = (box[1]+box[3])/2 - sh2/2;
      } else {
        const IN = 0.055;
        const ax = Math.round((cx0+IN)*CW), ay = Math.round((cy0+IN)*CH);
        const bx = Math.round((cx0+1-IN)*CW), by = Math.round((cy0+1-IN)*CH);
        const k = keyOut(ax, ay, bx-ax+1, by-ay+1);
        if (k.empty) return { err:'ます ' + p.cell + ' に 絵が ありません' };
        srcCv = k.cv; p90 = k.p90;
        sx = k.box[0]; sy = k.box[1]; sw = k.box[2]-k.box[0]+1; sh2 = k.box[3]-k.box[1]+1;
      }
      const o = document.createElement('canvas'); o.width = N; o.height = N;
      const og = o.getContext('2d', { willReadFrequently:true });
      og.imageSmoothingQuality = 'high';
      /* ふだんは わくいっぱい（PAD）。`pad` を 書いた ときは その わりあい。
         **ボーナスの お菓子だけ 0.78 に します** ——盤面の スプライトは
         256pxの わくの 中で 中みが 0.76x0.78 しか なく、そこに 合わせた
         `CELL*0.95` の 1つの 倍率で 8種 ぜんぶを えがくためです。
         わくいっぱいで 切ると、この 2枚だけ 22% 大きく 見えます */
      const k2 = Math.min(N/sw, N/sh2)*(p.pad || PAD);
      og.drawImage(srcCv, sx, sy, sw, sh2, (N-sw*k2)/2, (N-sh2*k2)/2, sw*k2, sh2*k2);
      /* 出したあとに たしかめる：ふちに ついて いないか・小さすぎないか */
      const QD = og.getImageData(0, 0, N, N).data;
      let n = 0, bx0 = N, by0 = N, bx1 = -1, by1 = -1, edge = 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
        if (QD[((y*N + x) << 2) + 3] < 16) continue;
        n++; if (x<bx0)bx0=x; if (x>bx1)bx1=x; if (y<by0)by0=y; if (y>by1)by1=y;
        if (x===0||y===0||x===N-1||y===N-1) edge++;
      }
      out.push({ key:p.key, name:p.name, minFill:p.minFill, pad:p.pad, fill:+(n/(N*N)*100).toFixed(1),
                 box:[bx0,by0,bx1,by1], w:bx1-bx0+1, h:by1-by0+1, edge, p90,
                 data:o.toDataURL('image/webp', Q) });
    }
    return { out };
  }, [src, sh, N, PAD, Q]);

  if (res.err){ console.error('✗ ' + sh.file + ': ' + res.err); process.exit(1); }
  console.log(sh.file + '（' + sh.w + 'x' + sh.h + '・' +
    statSync(p).size.toLocaleString() + ' バイト・さわらない）' +
    (sh.mode === 'key' ? ' ——背景を 抜いて 切り出す' : ' ——はじめから 透過'));
  console.log('  名前           うめ具合  中みの 大きさ  ふち  背景モデルの ずれ  重さ');
  for (const o of res.out){
    writeFileSync(resolve(OUT, o.key + '.webp'), Buffer.from(o.data.split(',')[1], 'base64'));
    const kb = Math.round(statSync(resolve(OUT, o.key + '.webp')).size / 1024);
    console.log('  ' + o.key.padEnd(14) + String(o.fill + '%').padEnd(10) +
      (o.w + 'x' + o.h).padEnd(15) + String(o.edge).padEnd(6) +
      String(o.p90 === null ? '—' : o.p90.toFixed(1)).padEnd(19) + kb + 'KB');
    if (o.edge > 0){ console.log('    ✗ ' + o.key + ' が わくの ふちに ついて います'); bad++; }
    if (o.fill < (o.minFill || 25)){
      console.log('    ✗ ' + o.key + ' が 小さすぎます（' + o.fill + '%）'); bad++; }
    /* 背景モデルの ずれが 大きいと、うすい 白（背景との へだたり 22〜26）と
       見わけが つかなく なる。ますごとに 当てれば 3〜6 に 収まる */
    if (o.p90 !== null && o.p90 > 12){
      console.log('    ✗ ' + o.key + ' の 背景モデルが 甘い（' + o.p90.toFixed(1) + '）'); bad++; }
    if (o.key.startsWith('snd_')) pairBox[o.key] = o.box;
  }
  console.log('');
}
await b.close();

/* 音ON/OFF は 同じ いちに 出ないと、押すと ベルが 動いて 見える */
if (pairBox.snd_on && pairBox.snd_off){
  const d = pairBox.snd_on.map((v, i) => Math.abs(v - pairBox.snd_off[i]));
  const mx = Math.max(...d);
  console.log('音ON と 音OFF の わくの ずれ: ' + JSON.stringify(d) + '（いちばん 大きい ずれ ' + mx + 'px）');
  if (mx > 4){ console.log('  ✗ ずれすぎです。押すと ベルが 動いて 見えます'); bad++; }
}

console.log(bad ? '\n✗ ' + bad + '件 だめでした' : '\n検査 OK ✅');
process.exit(bad ? 1 : 0);
