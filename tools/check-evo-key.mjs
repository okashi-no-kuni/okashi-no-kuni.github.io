/* 進化の 絵の 名前が **`<種のID>_<evo>`** に なって いるかを しらべる。
 *
 *   node tools/check-evo-key.mjs      # 終了コード 0 で 合格
 *
 * base の 画像キーは **4つが 分けあって います**。
 *
 *   candy    ← GEN c_candy（キャンディ★1）／ TOWER tw_candy（🍬）
 *   star     ← GEN c_star（ほしクッキー★2）／ TOWER tw_star（⭐）
 *   icecream ← GEN c_icecream（アイス★3）／ TOWER tw_ice（🍧）
 *   choco    ← GEN c_choco（チョコ★3）／ TOWER tw_choco（🍫）
 *
 * むかしの `<base>_<evo>` だと、この 4つは **1枚の `candy_e1` を
 * 取りあいます**。種の ID は セーブでも 個体でも もともと 別ものなので、
 * **resolver に それを わたす**だけで 分かれます（Phase 7-7-3-8-2）。
 *
 * 架空の 絵は 検査の 中だけで 登録し、**`finally` で かならず もどします**
 * （本物の `c_purin_e1` を こわさない ため）。
 */
import { launch } from './_pw.mjs';
import { resolve } from 'path';

const target = resolve(process.argv[2] || 'index.html');
const bad = [], errs = [];
const b = await launch({ args: ['--allow-file-access-from-files'] });
const pg = await b.newPage();
pg.on('pageerror', e => errs.push(e.message));
pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto('file://' + target + '?dbg=1');
await pg.waitForTimeout(1600);

const r = await pg.evaluate(() => {
  const k = window.__chk, R = k.buildRoster();
  const gen = id => R.find(o => o.id === id);
  const mk = c => { const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0,0,64,64); return cv; };
  const set = (key, col) => { const A = k.artSprite();
    const had = Object.prototype.hasOwnProperty.call(A, key), prev = A[key];
    A[key] = mk(col);
    return () => { if (had) A[key] = prev; else delete A[key]; }; };

  /* 共有の 4つを ならべる。TOWER の 画像キーは `TOWERS[k].art` */
  const PAIR = [
    { art:'candy',    g:'c_candy',    t:'tw_candy', tk:'candy' },
    { art:'star',     g:'c_star',     t:'tw_star',  tk:'star'  },
    { art:'icecream', g:'c_icecream', t:'tw_ice',   tk:'ice'   },
    { art:'choco',    g:'c_choco',    t:'tw_choco', tk:'choco' },
  ];
  const out = { pairs: [], old: null, base: [] };

  /* ---- ① evo なしは base の まま（1枚も 名前を 変えて いない）---- */
  for (const p of PAIR)
    out.base.push({ art:p.art, gen:k.artKeyFor(gen(p.g), null),
                    tw:k.evoArtKey(k.towerArt(p.tk), null, p.t) });

  /* ---- ② `<種のID>_e1` を **両方** 登録して、別々に 解決する か ---- */
  for (const p of PAIR){
    const un1 = set(p.g + '_e1', '#ff00ff'), un2 = set(p.t + '_e1', '#00ffff');
    try {
      out.pairs.push({ art:p.art,
        gen: k.artKeyFor(gen(p.g), 'e1'),
        tw:  k.evoArtKey(k.towerArt(p.tk), 'e1', p.t),
        genWant: p.g + '_e1', twWant: p.t + '_e1' });
    } finally { un2(); un1(); }
  }

  /* ---- ③ 古い `<base>_e1` だけ 登録しても **どちらも 拾わない** ---- */
  {
    const un = set('candy_e1', '#ffff00');
    try {
      out.old = { gen: k.artKeyFor(gen('c_candy'), 'e1'),
                  tw:  k.evoArtKey(k.towerArt('candy'), 'e1', 'tw_candy'),
                  has: k.artHas('candy_e1') };
    } finally { un(); }
    out.oldGone = !k.artHas('candy_e1');
  }
  /* ---- ④ 本物の c_purin_e1 は のこって いる ---- */
  out.purin = { base: k.artKeyFor(gen('c_purin'), null),
                e1:   k.artKeyFor(gen('c_purin'), 'e1'),
                real: k.artHas('c_purin_e1'), oldName: k.artHas('purin_e1') };
  return out;
});
await b.close();

const eqs = (n,a,c) => { if (a !== c) bad.push(n + ' が ' + JSON.stringify(a) + '（' + JSON.stringify(c) + ' の はず）'); };

/* ① evo なしは base */
for (const o of r.base){
  eqs('evo なし GEN（' + o.art + '）', o.gen, o.art);
  eqs('evo なし TOWER（' + o.art + '）', o.tw, o.art);
}
/* ② 共有キーでも 別々に 解決する */
for (const p of r.pairs){
  eqs('GEN（' + p.art + '）', p.gen, p.genWant);
  eqs('TOWER（' + p.art + '）', p.tw, p.twWant);
  if (p.gen === p.tw) bad.push(p.art + '：GEN と TOWER が 同じ 絵を 取りあって いる（' + p.gen + '）');
  if (p.gen === p.art + '_e1' || p.tw === p.art + '_e1')
    bad.push(p.art + '：古い <base>_<evo> の 名前を 拾って いる');
}
/* ③ 古い きまりは のこって いない */
if (!r.old.has) bad.push('架空の candy_e1 を 登録できて いない（検査の 前提が くずれて いる）');
eqs('candy_e1 だけ ある とき GEN', r.old.gen, 'candy');
eqs('candy_e1 だけ ある とき TOWER', r.old.tw, 'candy');
if (!r.oldGone) bad.push('架空の candy_e1 が のこって いる');
/* ④ 本物 */
eqs('プリン base', r.purin.base, 'purin');
eqs('プリン e1',   r.purin.e1,   'c_purin_e1');
if (!r.purin.real)   bad.push('本物の c_purin_e1 が 読めて いない');
if (r.purin.oldName) bad.push('古い 名前の purin_e1 が のこって いる');

const out = (t,a) => console.log('  ' + t.padEnd(16,' ') + (a.length ? '✗\n    ' + a.join('\n    ') : 'なし ✅'));
console.log('進化の 絵の 名前（<種のID>_<evo>）');
for (const p of r.pairs) console.log(`  ${p.art.padEnd(9)} GEN → ${p.gen.padEnd(16)} TOWER → ${p.tw}`);
console.log(`  古い candy_e1 だけ … GEN → ${r.old.gen} ／ TOWER → ${r.old.tw}（どちらも 拾わない）`);
console.log(`  プリン … base ${r.purin.base} ／ e1 ${r.purin.e1}`);
out('JSエラー', errs);
out('canary', bad);
const ng = errs.length + bad.length;
console.log(ng ? '\n検査 NG（' + ng + '件）' : '\n検査 OK ✅');
process.exit(ng ? 1 : 0);
