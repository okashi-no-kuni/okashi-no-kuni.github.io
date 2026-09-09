/* 進化の 絵を **盤面の 自分がわの タワー**に 出す（Phase 7-7-3-8-4-C2）を しらべる。
 *
 *   node tools/check-evo-board.mjs      # 終了コード 0 で 合格
 *
 * 見るのは 8つ。
 *   ① なかまの 道（drawTower の T.gen）が **evo を 受けとる**
 *   ② お菓子タワーの 道が **generic な resolver（evoArtKey）を とおる**
 *   ③ **てきの 道は evo を 見ない**（盤面の てきは 世界の てき）
 *   ④ `ART_SPRITE[T.art]` の **生読みが drawTower から 消えて いる**
 *   ⑤ **`base + '_e1'` の fallback を 作って いない**（共有base が こわれる）
 *   ⑥ **盤面の えがきものから `ensureInst()` を 呼ばない**
 *   ⑦ **tower と run の セーブに iid / evo を 足して いない**
 *   ⑧ **EVO_LOCK が 1件も 変わって いない**
 *
 * ソースだけでは 足りません ——`evo` と 書いて あっても いつも `null` を
 * わたして いれば 見た目は base の ままです。だから **base を あか・
 * e1 を みどりに 差しかえて、盤面の 画素で どちらを 拾うか**を 見ます。
 *
 * **`file://` では 見られません。**キャラの 絵で canvas が よごれて
 * `getImageData` が 例外に なるので、その場で HTTP に 出して ひらきます。
 */
import { launch } from './_pw.mjs';
import { resolve, dirname, join, extname } from 'path';
import { readFileSync, existsSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import http from 'http';

const ROOT   = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(process.argv[2] || resolve(ROOT, 'index.html'));
const bad = [], errs = [];
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
                    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' ');
const raw = readFileSync(target, 'utf8');
const src = strip(raw);
const span = (a, z) => { const i = src.indexOf(a); if (i < 0) return '';
  const j = src.indexOf(z, i); return j < 0 ? '' : src.slice(i, j + z.length); };

/* ---------- ⑧ EVO_LOCK は 1件も 変わって いない ---------- */
{
  const lock = readFileSync(resolve(ROOT, 'tools/check-chars.mjs'), 'utf8');
  const blk = (lock.match(/const EVO_LOCK = \[([\s\S]*?)\n\];/) || [])[1] || '';
  const pairs = [...blk.matchAll(/\['([^']+)',\s*'([0-9a-f]{64})'\]/g)];
  if (!pairs.length) bad.push('EVO_LOCK が 読めない');
  for (const [, k, want] of pairs){
    const f = resolve(ROOT, 'art/sprites/' + k + '.png');
    if (!existsSync(f)){ bad.push('EVO_LOCK の 絵が ない：' + k); continue; }
    if (createHash('sha256').update(readFileSync(f)).digest('hex') !== want)
      bad.push('EVO_LOCK の SHA が 変わった：' + k);
  }
  console.log('  EVO_LOCK ' + pairs.length + '件 照合');
}

/* ---------- ①②④ drawTower の 中み ---------- */
const dt = span('function drawTower(t){', '\n}');
if (!dt) bad.push('drawTower が 見つからない');
else {
  /* 種の ID は **明示して わたす**。なかまは t.k その もの、
     お菓子タワーは 'tw_' + t.k（candy は GEN の キャンディと base を 分けあう）*/
  if (!/const tSp\s*=\s*T\.gen \? t\.k : 'tw_' \+ t\.k;/.test(dt))
    bad.push('① 種の ID（tSp）を 明示して いない');
  if (!/const tEvo\s*=\s*evoOfSpecies\(tSp\);/.test(dt))
    bad.push('① evo を evoOfSpecies から とって いない');
  if (!/genSprite\(T\.gen, px, tEvo\)/.test(dt))
    bad.push('① なかまの genSprite が evo を 受けとって いない');
  if (!/rbSprite\(sp, px, 'g_'\+T\.gen\.id, tEvo\)/.test(dt))
    bad.push('① にじいろの なかまの rbSprite が evo を 受けとって いない（base と 同じ キャッシュに なる）');
  if (!/const tArt\s*=\s*T\.gen \? T\.art : evoArtKey\(T\.art, tEvo, tSp\);/.test(dt))
    bad.push('② お菓子タワーが generic な resolver（evoArtKey）を とおって いない');
  if (!/rbSprite\(sp, px, 'a_'\+tArt\)/.test(dt))
    bad.push('② にじいろの お菓子タワーの キャッシュキーが 解決ずみの 絵の キーで ない');
  /* ④ 生読みが のこって いると、はね・だいの ガードと 絵で ずれる */
  if (/ART_SPRITE\[T\.art\]/.test(dt))
    bad.push('④ drawTower に ART_SPRITE[T.art] の 生読みが のこって いる');
  if ((dt.match(/ART_SPRITE\[tArt\]/g) || []).length < 3)
    bad.push('④ 解決ずみの キー（tArt）で 見て いない ところが ある');
  if (/ensureInst|mintInst|evolveInst/.test(dt))
    bad.push('⑥ drawTower が 個体を 作って いる');
  if (/detailIid/.test(dt))
    bad.push('drawTower が 詳細画面の 個体えらびを つかって いる（一覧は 種から）');
}
/* 生読みが よそに 移って いないか（drawPortrait は 前から resolver ずみ）*/
for (const m of src.matchAll(/ART_SPRITE\[T\.art\]/g))
  bad.push('④ ART_SPRITE[T.art] の 生読みが のこって いる（index.html:' +
           (src.slice(0, m.index).split('\n').length) + '）');

/* ---------- ⑤ base + '_e1' の fallback を 作って いない ---------- */
{
  const fn = span('function evoArtKey(base, evo, sp){', '\n}');
  if (!fn) bad.push('evoArtKey が ない');
  else {
    if (/base\s*\+\s*'_'\s*\+\s*evo/.test(fn))
      bad.push("⑤ base + '_' + evo の fallback が 復活して いる（共有base が こわれる）");
    if (!/sp\s*\+\s*'_'\s*\+\s*evo/.test(fn))
      bad.push('⑤ 種の ID から 絵の キーを 作って いない');
    if (/\binst\b|\bdex\b/.test(fn)) bad.push('evoArtKey が 個体・図鑑を のぞいて いる');
  }
  if (/['"`]_e1['"`]/.test(dt)) bad.push('⑤ drawTower が 絵の 名前を 手で 組みたてて いる');
}

/* ---------- ③ てきの 道 ---------- */
{
  const fn = span('function drawEnemy(e){', '\n}');
  if (!fn) bad.push('drawEnemy が 見つからない');
  else {
    if (/evoOfSpecies|instEvoOf|instOfSpecies|evoArtKey|tEvo|tArt/.test(fn))
      bad.push('③ drawEnemy が 個体の 進化を のぞいて いる');
    for (const c of (fn.match(/genSprite\([^)]*\)/g) || []))
      if ((c.match(/,/g) || []).length >= 2)
        bad.push('③ drawEnemy の genSprite に 3つめ（evo）が ついて いる：' + c);
  }
}

/* ---------- ⑦ セーブの かたちを 変えて いない ---------- */
{
  if (!/towers\.push\(\{ k:selTool, c, r, lv:1, cd:0, ang:-Math\.PI\/2, pulse:1, ph:/.test(src))
    bad.push('⑦ 盤面に おく ときの tower の かたちが 変わって いる');
  const tw = span('tw: towers.map(t => {', '}),');
  if (!tw) bad.push('⑦ saveRun の tw が 読めない');
  else if (!/\{ k:t\.k, c:t\.c, r:t\.r, lv:t\.lv, rb:1, rbx:\(t\.rbx \|\| 2\) \}[\s\S]*?\{ k:t\.k, c:t\.c, r:t\.r, lv:t\.lv \}/.test(tw))
    bad.push('⑦ saveRun の tw の かたちが 変わって いる：' + tw.replace(/\s+/g, ' '));
  for (const m of src.matchAll(/towers\.push\(\{[^}]*\}/g))
    if (/\biid\b|\bevo\b/.test(m[0])) bad.push('⑦ tower に iid / evo を 足して いる：' + m[0].replace(/\s+/g,' '));
}

/* ---------- 実行 ---------- */
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript',
  '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.json':'application/json',
  '.webmanifest':'application/json', '.mp3':'audio/mpeg', '.css':'text/css' };
const srv = http.createServer((q, s) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = u === '/' || u === '/index.html' ? target : join(ROOT, u);
  if (!f.startsWith(ROOT) || !existsSync(f) || statSync(f).isDirectory()){ s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' });
  s.end(readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const URL0 = 'http://127.0.0.1:' + srv.address().port + '/index.html?dbg=1';

const browser = await launch();
const ctx  = await browser.newContext({ viewport:{ width:393, height:852 }, deviceScaleFactor:2 });
const page = await ctx.newPage();
page.on('pageerror', e => errs.push(e.message));
await page.addInitScript(() => {
  const dex = {}, items = {};
  /* 進化ずみ ／ 未進化 ／ **共有base の 相手**（icecream は tw_ice と c_icecream）*/
  const EVO  = ['c_purin', 'tw_ice'];
  const BASE = ['c_witch', 'c_icecream', 'tw_candy'];
  for (const s of [...EVO, ...BASE]) dex[s] = { w:10, d:'2026-01-01', origin:'egg' };
  EVO.forEach((s, i)  => items['zb' + i + '.1'] = { sp:s, origin:'egg', evo:'e1' });
  BASE.forEach((s, i) => items['zc' + i + '.1'] = { sp:s, origin:'egg' });
  localStorage.setItem('sweetTD.dex', JSON.stringify(dex));
  localStorage.setItem('sweetTD.inst', JSON.stringify({ v:1, pfx:'zzzzzz', seq:99, items }));
  localStorage.setItem('sweetTD.starter','1'); localStorage.setItem('sweetTD.welcomed','1');
  localStorage.setItem('sweetTD.guided','1');
});
await page.goto(URL0, { waitUntil:'load' });
await page.waitForFunction(() => window.__chk && window.__dbg, null, { timeout:30000 });
await page.evaluate(() => { const b = document.getElementById('titleGo'); if (b) b.click(); });
await page.waitForTimeout(600);
/* 表紙の あとに 出る 画面（今日のプレゼント など）を 閉じて 盤面を むきだしに する */
for (let i = 0; i < 8; i++){
  await page.evaluate(() => {
    const b = document.getElementById('ovBtn');
    if (b && !b.disabled && document.getElementById('ov').classList.contains('on')) b.click();
    document.querySelectorAll('.ov.on,.ov2.on').forEach(e => e.classList.remove('on'));
  });
  await page.waitForTimeout(150);
  const clear = await page.evaluate(() => { const c = document.querySelector('#cv canvas').getBoundingClientRect();
    const e = document.elementFromPoint(c.x + 8, c.y + 8); return !!e && e.tagName === 'CANVAS'; });
  if (clear) break;
}

/* 仮色に さしかえて 4体 ならべる。あか＝base ／ みどり＝e1 */
const put = await page.evaluate(() => {
  const AS = __chk.artSprite(), roster = __chk.buildRoster();
  const solid = c => { const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0,0,256,256); return cv; };
  const baseKeyOf = sp => { const rc = roster.find(o => o.id === sp);
    return rc ? __chk.artKeyOf(rc) : __chk.towerArt(sp.slice(3)); };
  window.__keep = {};
  const swap = (k, v) => { if (!(k in window.__keep)) window.__keep[k] = AS[k]; AS[k] = v; };
  for (const sp of ['c_purin','c_witch','c_icecream','tw_ice','tw_candy']){
    swap(baseKeyOf(sp), solid('#ff0000'));
    if (AS[sp + '_e1']) swap(sp + '_e1', solid('#00ff00'));
  }
  const place = k => { for (let r = 0; r < 12; r++) for (let c = 0; c < 9; c++)
    if (__dbg.place(c, r, k, 3)) return { k, c, r }; return null; };
  const before = __chk.instCount(), beforeSave = localStorage.getItem('sweetTD.inst');
  return { at: ['c_purin','c_witch','c_icecream','ice','candy'].map(place),
           before, beforeSave, cell: __dbg.cellPx() };
});
await page.waitForTimeout(700);

const seen = await page.evaluate(([at, cell]) => {
  const cv = document.querySelector('#cv canvas');
  const g = cv.getContext('2d'), n = cv.width / (cv.getBoundingClientRect().width);
  const read = t => { const x = (t.c + 0.5) * cell * n, y = (t.r + 0.5) * cell * n, R = cell * n * 0.42;
    const d = g.getImageData(Math.round(x - R), Math.round(y - R), Math.round(R*2), Math.round(R*2)).data;
    let red = 0, grn = 0;
    for (let i = 0; i < d.length; i += 4){ if (d[i+3] < 200) continue;
      if (d[i] > 150 && d[i+1] < 110 && d[i+2] < 110) red++;
      if (d[i+1] > 150 && d[i] < 110 && d[i+2] < 110) grn++; }
    return red > grn * 1.5 ? 'base' : grn > red * 1.5 ? 'e1' : (red + grn ? 'mix' : 'none'); };
  return at.map((t, i) => ({ k:t && t.k, look: t ? read(t) : null }));
}, [put.at, put.cell]);

const after = await page.evaluate(() => ({
  count: __chk.instCount(), save: localStorage.getItem('sweetTD.inst'),
  cache: __chk.cacheKeys(),
  tw: JSON.parse(localStorage.getItem('sweetTD.run') || '{}').tw || null,
  towers: __dbg.towers(),
}));
await page.evaluate(() => { const AS = __chk.artSprite();
  for (const k in window.__keep) AS[k] = window.__keep[k]; });

const WANT = { c_purin:'e1', c_witch:'base', c_icecream:'base', ice:'e1', candy:'base' };
for (const s of seen){
  if (!s.k){ bad.push('タワーを おけなかった'); continue; }
  if (s.look !== WANT[s.k]) bad.push('盤面の ' + s.k + ' が ' + s.look + '（' + WANT[s.k] + ' のはず）');
  console.log('  盤面 ' + String(s.k).padEnd(12) + ' → ' + s.look);
}
if (put.before !== after.count) bad.push('⑥ 盤面を えがくと 個体が ふえる（' + put.before + '→' + after.count + '）');
if (put.beforeSave !== after.save) bad.push('⑥ 盤面を えがくと 個体の セーブが 変わる');
/* キャッシュキーが base と e1 で 分かれて いるか */
const gk = after.cache.gen.filter(k => /^c_purin@|^c_witch@/.test(k));
if (!gk.some(k => /^c_purin@\d+@e1$/.test(k))) bad.push('なかまの キャッシュキーに @e1 が つかない：' + gk.join(','));
if (gk.some(k => /^c_witch@\d+@e1$/.test(k)))  bad.push('未進化の なかまに @e1 が ついた：' + gk.join(','));
console.log('  genキャッシュ ' + gk.join('  '));
/* ⑦ run の セーブに iid / evo が 入って いない */
if (after.tw) for (const t of after.tw)
  if ('iid' in t || 'evo' in t) bad.push('⑦ saveRun の tw に iid / evo が 入って いる：' + JSON.stringify(t));
if (after.towers.some(t => 'iid' in t || 'evo' in t)) bad.push('⑦ towers に iid / evo が 入って いる');
console.log('  個体数 ' + put.before + ' → ' + after.count + '（えがくだけ）／セーブ 不変 ' +
            (put.beforeSave === after.save) + '／run の tw ' + JSON.stringify(after.tw));

/* ---------- ③ 実行 ——en側を ぜんぶ 進化ずみに しても 盤面の てきは base ----------
   **タワーの ない まっさらな ページで 見ること。**タワーが のこって いると、
   その 仮色（みどり）を てきの ぶんと 数えて しまいます（1回 やりました） */
{
  const page2 = await ctx.newPage();
  page2.on('pageerror', e => errs.push(e.message));
  await page2.goto(URL0, { waitUntil:'load' });
  await page2.waitForFunction(() => window.__chk && window.__dbg, null, { timeout:30000 });
  await page2.evaluate(() => { const b = document.getElementById('titleGo'); if (b) b.click(); });
  await page2.waitForTimeout(600);
  for (let i = 0; i < 8; i++){
    await page2.evaluate(() => {
      const b = document.getElementById('ovBtn');
      if (b && !b.disabled && document.getElementById('ov').classList.contains('on')) b.click();
      document.querySelectorAll('.ov.on,.ov2.on').forEach(e => e.classList.remove('on'));
    });
    await page2.waitForTimeout(150);
    const clear = await page2.evaluate(() => { const c = document.querySelector('#cv canvas').getBoundingClientRect();
      const e = document.elementFromPoint(c.x + 8, c.y + 8); return !!e && e.tagName === 'CANVAS'; });
    if (clear) break;
  }
  const en = await page2.evaluate(() => {
    const AS = __chk.artSprite(), I = __chk.inst.all(), roster = __chk.buildRoster();
    const solid = c => { const cv = document.createElement('canvas'); cv.width = cv.height = 256;
      const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0,0,256,256); return cv; };
    const list = []; let n = 0;
    for (const k of __chk.artKeys()){
      if (!/_e1$/.test(k)) continue;
      const sp = k.slice(0, -3), rc = roster.find(o => o.id === sp);
      if (!rc || rc.side !== 'en') continue;
      I['zEn.' + (n++)] = { sp, origin:'debug', evo:'e1' };
      AS[__chk.artKeyOf(rc)] = solid('#ff0000'); AS[k] = solid('#00ff00');
      list.push(sp);
    }
    return { list, ok: list.every(s => __chk.evoOfSpecies(s) === 'e1') };
  });
  if (!en.ok) bad.push('③ en側の 個体に evo が 立って いない（検査が 空ぶる）');
  let red = 0, grn = 0, keys = [];
  for (const w of [60, 150, 190, 230]){
    await page2.evaluate(w => { __dbg.setWave(w);
      const b = document.getElementById('btnWave'); if (b && !b.disabled) b.click(); }, w);
    await page2.waitForTimeout(2000);
    const r = await page2.evaluate(() => {
      const cv = document.querySelector('#cv canvas');
      const d = cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
      let a = 0, b = 0;
      for (let i = 0; i < d.length; i += 4){ if (d[i+3] < 200) continue;
        if (d[i] > 150 && d[i+1] < 110 && d[i+2] < 110) a++;
        if (d[i+1] > 150 && d[i] < 110 && d[i+2] < 110) b++; }
      return { a, b, keys: __chk.cacheKeys().gen.filter(k => /@e1/.test(k)) };
    });
    red += r.a; grn += r.b; keys = r.keys;
  }
  if (!red) bad.push('③ てきが 1体も えがかれて いない（カナリアが 空ぶる）');
  const leak = keys.filter(k => en.list.some(s => k.startsWith(s + '@')));
  if (leak.length) bad.push('③ てきの 絵に @e1 の キャッシュが できた：' + leak.join(','));
  if (grn) bad.push('③ 盤面の てきに e1 が 出た（みどり ' + grn + '画素）');
  console.log('  てき ' + en.list.length + '体 進化ずみ → あか(base) ' + red + ' ／ みどり(e1) ' + grn);
}

await browser.close(); srv.close();
if (errs.length) bad.push('JSエラー ' + errs.length + '件：' + errs.slice(0,2).join(' / '));
if (bad.length){ console.error('\n盤面の 進化の 絵 NG'); for (const b of bad) console.error('  - ' + b); process.exit(1); }
console.log('\n盤面の 進化の 絵（なかま・お菓子タワー）OK ✅');
