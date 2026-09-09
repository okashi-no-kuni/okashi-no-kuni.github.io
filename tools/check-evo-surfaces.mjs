/* 進化の 絵を 出す **非戦闘UI の 5系統**（Phase 7-7-3-8-4-C1）を しらべる。
 *
 *   node tools/check-evo-surfaces.mjs      # 終了コード 0 で 合格
 *
 * 見るのは 5つ。
 *   ① 対象の 5系統が **evo を 受けとって いる**（ソース＋実行）
 *   ② **詳細画面（#chOv）の 既存経路を こわして いない**
 *   ③ **てきの 道へ evo を 流して いない**（あれは 世界の てきで、自分の 個体では ない）
 *   ④ **表示の 処理から `ensureInst()` を 呼んで いない**（見るだけで 個体が できる）
 *   ⑤ **EVO_LOCK が 1件も 変わって いない**
 *
 * ①は ソースだけでは 足りません ——`evo` と 書いて あっても、いつも `null` を
 * わたして いれば 見た目は base の ままです。だから **base を マゼンタ・
 * e1 を シアンに 差しかえて、どちらを 拾うか**を 実行して 見ます
 * （Phase C と 同じ カナリア。**仮色は repo に のこしません**）。
 */
import { launch } from './_pw.mjs';
import { resolve, dirname } from 'path';
import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const ROOT   = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(process.argv[2] || resolve(ROOT, 'index.html'));
const bad = [], errs = [];
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
                    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' ');
const src = strip(readFileSync(target, 'utf8'));

/* ---------- ⑤ EVO_LOCK は 1件も 変わって いない ---------- */
{
  const lock = readFileSync(resolve(ROOT, 'tools/check-chars.mjs'), 'utf8');
  const blk = (lock.match(/const EVO_LOCK = \[([\s\S]*?)\n\];/) || [])[1] || '';
  const pairs = [...blk.matchAll(/\['([^']+)',\s*'([0-9a-f]{64})'\]/g)];
  if (!pairs.length) bad.push('EVO_LOCK が 読めない');
  for (const [, k, want] of pairs){
    const f = resolve(ROOT, 'art/sprites/' + k + '.png');
    if (!existsSync(f)){ bad.push('EVO_LOCK の 絵が ない：' + k); continue; }
    const got = createHash('sha256').update(readFileSync(f)).digest('hex');
    if (got !== want) bad.push('EVO_LOCK の SHA が 変わった：' + k);
  }
  console.log('  EVO_LOCK ' + pairs.length + '件 照合');
}

/* ---------- 読みとりの 口（evoOfSpecies）は 作らない・書かない ---------- */
{
  const fn = (src.match(/function evoOfSpecies\(sp\)\{[\s\S]*?\n\}/) || [''])[0];
  if (!fn) bad.push('evoOfSpecies が ない（表示用の 読み口が いる）');
  else for (const [re, why] of [[/ensureInst/, 'ensureInst（見るだけで 個体を 作る）'],
                                [/save[A-Z]\w*\(/, '保存（saveXxx）'],
                                [/\bdex\b\s*\[/, 'dex の 書き読み'],
                                [/mintInst|evolveInst/, '個体を 作る／書きかえる']])
    if (re.test(fn)) bad.push('evoOfSpecies が ' + why + ' に 手を のばして いる');
}

/* ---------- ① 5系統が evo を 受けとって いるか（ソース） ---------- */
const SITES = [
  ['① 図鑑一覧カード',   /box\.__draw = \(\) => \{[^}]*evoOfSpecies\(o\.id\)[\s\S]{0,220}?genThumb\(o\.gen, size, evo\)[\s\S]{0,120}?charThumb\(o, size, evo, o\.id\)/],
  ['② 仲間を選ぶ',       /box\.__draw = \(\) => box\.replaceWith\(genThumb\(o, 56, evoOfSpecies\(o\.id\)\)\)/],
  ['③ ショップバーの札', /charThumb\(\{ pid:'tw_' \+ k \}, 46, evoOfSpecies\('tw_' \+ k\), 'tw_' \+ k\)/],
  ['④ 選択中の札',       /genThumb\(TOWERS\[selTool\]\.gen, 42, evoOfSpecies\(TOWERS\[selTool\]\.gen\.id\)\)/],
  ['⑤a 情報カード 46px', /infoIc\.append\(genThumb\(T\.gen, 46, evoOfSpecies\(T\.gen\.id\)\)\)/],
  ['⑤b 情報カード 31px', /charThumb\(\{ pid:'tw_' \+ t\.k \}, 31, evoOfSpecies\('tw_' \+ t\.k\), 'tw_' \+ t\.k\)/],
];
for (const [name, re] of SITES) if (!re.test(src)) bad.push(name + ' が evo を 受けとって いない');

/* ---------- ② 詳細画面の 既存経路 ---------- */
{
  const fn = (src.match(/function buildCharDetail\(\)\{[\s\S]*?\n\}/) || [''])[0];
  if (!/art\.append\([^;]*genThumb\([^)]*,\s*evo\s*\)/.test(fn))
    bad.push('詳細画面の 絵が evo を 受けとって いない（C1 で こわした）');
  if (/ensureInst/.test(fn)) bad.push('詳細画面が ensureInst を 呼んで いる');
  /* 詳細は **個体**から、一覧は **種**から。ここが 入れかわると
     複数所持を 開けた とき どちらも まちがえる */
  if (/evoOfSpecies/.test(fn))
    bad.push('詳細画面は 種では なく **個体**（detailIid → instEvoOf）から 読むこと');
}

/* ---------- ③ てきの 道へ evo を 流して いないか ---------- */
{
  const fn = (src.match(/function drawEnemy\(e\)\{[\s\S]*?\n\}/) || [''])[0];
  if (!fn) bad.push('drawEnemy が 見つからない');
  else {
    if (/evoOfSpecies|instEvoOf|instOfSpecies/.test(fn))
      bad.push('drawEnemy が 個体の 進化を のぞいて いる（てきは 世界の てき）');
    const gs = (fn.match(/genSprite\([^)]*\)/g) || []);
    for (const c of gs) if ((c.match(/,/g) || []).length >= 2)
      bad.push('drawEnemy の genSprite に 3つめ（evo）が ついて いる：' + c);
  }
}

/* ---------- ④ 表示の 処理から ensureInst を 呼んで いないか ---------- */
{
  const ok = ['function ensureInst', 'function gainSpecies', '__chk', '__dbg'];
  for (const m of src.matchAll(/ensureInst\s*\(/g)){
    const line = src.slice(src.lastIndexOf('\n', m.index) + 1, src.indexOf('\n', m.index));
    const near = src.slice(Math.max(0, m.index - 2000), m.index);
    const fnName = (near.match(/function (\w+)\s*\(/g) || []).pop() || '';
    if (ok.some(o => line.includes(o) || fnName.includes(o.replace('function ', '')))) continue;
    if (/lazyThumb|buildShop|syncShop|openInfo|buildPick|buildColGrid|genThumb|charThumb/.test(fnName))
      bad.push('表示の 処理（' + fnName + '）が ensureInst を 呼んで いる');
  }
}

/* ---------- 実行 ——カナリアで「ほんとうに e1 を 拾うか」 ---------- */
const browser = await launch();
const page = await browser.newPage({ viewport:{ width:393, height:852 }, deviceScaleFactor:2 });
page.on('pageerror', e => errs.push(e.message));
await page.addInitScript(() => {
  const dex = {}, inst = {};
  const EVO = ['c_witch','c_tower','ch_queen','tw_ice'];   // 進化ずみ（e1 の 絵が ある）
  const BASE = ['c_purin'];                                // 未進化
  const NOASSET = ['c_candy'];                             // e1 の 絵が ない のに evo を 立てる
  for (const s of [...EVO, ...BASE, ...NOASSET]) dex[s] = { w:10, d:'2026-01-01', origin:'egg' };
  EVO.forEach((s,i) => inst['ze'+i+'.1'] = { sp:s, origin:'egg', evo:'e1' });
  BASE.forEach((s,i) => inst['zb'+i+'.1'] = { sp:s, origin:'egg' });
  NOASSET.forEach((s,i) => inst['zn'+i+'.1'] = { sp:s, origin:'egg', evo:'e1' });
  localStorage.setItem('sweetTD.dex', JSON.stringify(dex));
  localStorage.setItem('sweetTD.inst', JSON.stringify({ v:1, pfx:'zzzzzz', seq:99, items:inst }));
  localStorage.setItem('sweetTD.starter','1'); localStorage.setItem('sweetTD.welcomed','1');
  localStorage.setItem('sweetTD.guided','1');
});
await page.goto('file://' + target + '?dbg=1', { waitUntil:'load' });
await page.waitForFunction(() => window.__chk && window.__chk.evoOfSpecies, null, { timeout:30000 });
await page.waitForTimeout(1500);

const out = await page.evaluate(() => {
  const AS = __chk.artSprite(), roster = __chk.buildRoster(), dexArt = __chk.dexArt();
  const solid = c => { const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0,0,256,256); return cv; };
  const gen = sp => roster.find(o => o.id === sp);
  const pidOf = sp => sp.startsWith('tw_') ? sp : sp.replace(/^(ch_|lg_|sp_)/, '');
  const baseKeyOf = sp => { const rc = gen(sp);
    return rc ? __chk.artKeyOf(rc)
      : sp.startsWith('tw_') ? __chk.towerArt(sp.slice(3)) : dexArt[pidOf(sp)]; };
  const SPS = ['c_witch','c_tower','ch_queen','tw_ice','c_purin','c_candy'];
  const keep = {}, put = (k,v) => { if (!(k in keep)) keep[k] = AS[k]; AS[k] = v; };
  for (const sp of SPS){ put(baseKeyOf(sp), solid('#ff00ff'));
                         if (AS[sp + '_e1']) put(sp + '_e1', solid('#00ffff')); }
  const sniff = cv => { const n = cv.width, d = cv.getContext('2d').getImageData(0,0,n,n).data;
    let m = 0, c = 0, o = 0;
    for (let i = 0; i < d.length; i += 4){ if (d[i+3] < 40) continue; o++;
      const R = d[i], G = d[i+1], B = d[i+2];
      if (R > 140 && B > 140 && G < 130) m++; else if (G > 140 && B > 140 && R < 130) c++; }
    return m > c*1.5 ? 'base' : c > m*1.5 ? 'e1' : (o ? 'other' : 'none'); };
  /* **本番と 同じ 呼びかた**で 5系統を 再現する（引数の 形まで そろえる）*/
  const shot = (sp, size) => { const g = gen(sp), evo = __chk.evoOfSpecies(sp);
    if (g){ const c = document.createElement('canvas'); c.width = c.height = size;
            __chk.drawGen(c.getContext('2d'), size, g, evo); return c; }
    return __chk.charThumb({ pid: pidOf(sp) }, size, evo, sp); };
  const before = __chk.instCount(), beforeSave = localStorage.getItem('sweetTD.inst');
  const rows = SPS.map(sp => ({ sp, evo: __chk.evoOfSpecies(sp),
    dex64: sniff(shot(sp, 64)), pick56: gen(sp) ? sniff(shot(sp, 56)) : null,
    bar46: !gen(sp) ? sniff(shot(sp, 46)) : null, sel42: gen(sp) ? sniff(shot(sp, 42)) : null,
    info:  sniff(shot(sp, gen(sp) ? 46 : 31)), detail128: sniff(shot(sp, 128)) }));
  const unowned = __chk.evoOfSpecies('c_bee');
  for (const sp of [...SPS, 'c_bee', 'c_horse']) __chk.evoOfSpecies(sp);   // 何回 呼んでも
  const after = __chk.instCount(), afterSave = localStorage.getItem('sweetTD.inst');
  for (const k in keep) AS[k] = keep[k];       // 仮色を かならず もどす
  const left = SPS.filter(sp => { const im = AS[baseKeyOf(sp)];
    return im && im.tagName === 'CANVAS'; });
  return { rows, unowned, before, after, saveSame: beforeSave === afterSave, left };
});

const WANT = {
  c_witch:'e1', c_tower:'e1', ch_queen:'e1', tw_ice:'e1',
  c_purin:'base', c_candy:'base',        // 未進化 ／ e1 の 絵が ない → base へ 落ちる
};
for (const r of out.rows){
  const want = WANT[r.sp];
  for (const k of ['dex64','pick56','bar46','sel42','info','detail128']){
    if (r[k] === null) continue;
    if (r[k] !== want) bad.push(r.sp + ' の ' + k + ' が ' + r[k] + '（' + want + ' のはず）');
  }
  console.log('  ' + r.sp.padEnd(10), 'evo=' + String(r.evo).padEnd(6),
    ['dex64','pick56','bar46','sel42','info','detail128']
      .map(k => k + ':' + (r[k] ?? '—')).join(' '));
}
if (out.unowned !== null) bad.push('未所持の 種で evoOfSpecies が null を かえさない');
if (out.before !== out.after) bad.push('evoOfSpecies を 呼ぶと 個体が ふえる（' + out.before + '→' + out.after + '）');
if (!out.saveSame) bad.push('evoOfSpecies を 呼ぶと セーブが 変わる');
if (out.left.length) bad.push('仮色が のこって いる：' + out.left.join(','));
console.log('  個体数 ' + out.before + ' → ' + out.after + '（読むだけ）／セーブ 不変 ' + out.saveSame);

await browser.close();
if (errs.length) bad.push('JSエラー ' + errs.length + '件：' + errs.slice(0,2).join(' / '));
if (bad.length){ console.error('\n進化の 表示先 NG'); for (const b of bad) console.error('  - ' + b); process.exit(1); }
console.log('\n進化の 表示先（非戦闘UI 5系統）OK ✅');
