/* キャラクターの 詳細画面（#chOv・Phase 7-7-3-5）を しらべる。
 *
 *   node tools/check-chdetail.mjs      # 終了コード 0 で 合格
 *
 * ものさしは 3つ。
 *   ① 見せる ものが 出る（絵・名前・所持／未所持・個体の origin・個体の evo）
 *   ② **見るだけで 何も 変わらない**（inst の 数・instSeq・dex・gear・セーブ）
 *   ③ **既存の カード操作を 1つも 壊して いない**
 *      （ワザを 貼る／外す・0こ の ときの 2回タップ購入）
 *
 * ②が いちばん 大事です。`ensureInst()` を うっかり 呼ぶと、
 * **詳細を のぞいた だけで 個体が でき、セーブまで 変わります。**
 * 画面には 何も 出ないので 目では 気づけません。
 */
import { launch } from './_pw.mjs';
import { resolve } from 'path';
import { readFileSync } from 'fs';

const target = resolve(process.argv[2] || 'index.html');
const bad = [], errs = [];

/* ---------- ソース ——この フェーズで つないでは いけない ものが ないか ----------
   「詳細画面を 足した」と「進化で 絵が 変わる」を **別の フェーズで**
   検証する ため、ここでは 絵に evo を わたしません（7-7-2 の receiver は 待機）*/
{
  const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
                      .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' ');
  const body = strip(readFileSync(target, 'utf8'));
  const fn = (body.match(/function buildCharDetail\(\)\{[\s\S]*?\n\}/) || [''])[0];
  if (!fn) bad.push('buildCharDetail が ない');
  else for (const [re, why] of [[/artKeyFor/, 'artKeyFor（resolver は genThumb ごしに 通す）'],
                                [/\bgear\b/, 'gear（秘薬の 消費）'],
                                [/evolveInst/, 'evolveInst（進化させる）'],
                                [/ensureInst/, 'ensureInst（見るだけで 個体を 作る）'],
                                [/\bgenSprite\b|\brbSprite\b/, '生の スプライト（似顔絵を とおすこと）']])
    if (re.test(fn)) bad.push('buildCharDetail が ' + why + ' に 手を のばして いる');
  /* **Phase 7-7-3-6 で ここが 逆に なりました。**7-7-3-5 では
     「絵に evo を わたして いない こと」を 見て いましたが、
     いまは **わたして いる こと**が 正しい。回帰では なく 前提の 変更です */
  const draw = (fn.match(/art\.append\([^;]*/) || [''])[0];
  if (!draw) bad.push('絵を 出す ところ（art.append）が 見つからない');
  else if (!/genThumb\([^)]*,\s*evo\s*\)/.test(draw))
    bad.push('詳細画面の 絵に evo を わたして いない：' + draw.slice(0, 90));
  /* **iid は 1回だけ 引く。**絵と「すがた」が 別の 個体を 見る 道を 作らない */
  const nIid = (fn.match(/detailIid\(/g) || []).length;
  if (nIid !== 1) bad.push('detailIid を ' + nIid + '回 呼んで いる（1回の はず）');
  const nEvo = (fn.match(/instEvoOf\(/g) || []).length;
  if (nEvo !== 1) bad.push('instEvoOf を ' + nEvo + '回 呼んで いる（1回の はず ——絵と 文で 同じ 値を つかう）');
  /* 恒久の 日本語名を データに 焼いて いないか */
  if (/e1\s*:\s*'|'e1'\s*:|第1進化/.test(body)) bad.push('evo の 恒久名称を データに 書いて いる');
}
const IID = 'zzzzzz.1';                     // c_bear の 個体（origin あり）
const IID2 = 'zzzzzz.2';                    // ch_purin の 個体（{ sp } だけ＝origin なし）

const b = await launch({ args: ['--allow-file-access-from-files'] });
const pg = await b.newPage();
pg.on('pageerror', e => errs.push(e.message));
pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

/* `addInitScript` は 読みなおしでも 走るので 旗で 1回だけ 仕こむ */
await pg.addInitScript(({ IID, IID2 }) => {
  if (localStorage.getItem('__seeded')) return;
  localStorage.setItem('__seeded', '1');
  localStorage.setItem('sweetTD.starter', '2026-09-03');
  localStorage.setItem('sweetTD.dex', JSON.stringify({
    c_bear:   { w:9,  d:'2026-09-03', origin:'egg' },      // 所持＋個体あり（origin あり）
    ch_purin: { w:4,  d:'2026-09-03', origin:'stage' },    // 所持＋個体は { sp } だけ
    c_purin:  { w:2,  d:'2026-09-03', origin:'battle' },   // 所持だが **個体が ない**（legacy）
    tw_candy: { w:1,  d:'2026-09-03', origin:'place', lv:3 },
  }));
  /* **ワザの 貼りぐあいと 在庫を 決めうちに する。**旗が 無いと
     `pins` に 4体 自動で ならび、引っこし処理が 在庫を 1こ 保証するので、
     「まだ 貼って いなくて 在庫 0」の カードが 1つも 無く なります
     （じっさい それで 別の子を 押して しまった）*/
  localStorage.setItem('sweetTD.pins', '[]');
  localStorage.setItem('sweetTD.itemsV2', '1');
  localStorage.setItem('sweetTD.skStock', '{}');
  localStorage.setItem('sweetTD.inst', JSON.stringify({
    v:1, pfx:'zzzzzz', seq:2,
    items: { [IID]: { sp:'c_bear', origin:'egg' }, [IID2]: { sp:'ch_purin' } } }));
}, { IID, IID2 });

await pg.setViewportSize({ width: 393, height: 852 });
await pg.goto('file://' + target + '?dbg=1');
await pg.waitForTimeout(1400);
await pg.evaluate(() => { const o = document.getElementById('ov');
  if (o && o.classList.contains('on')) document.getElementById('ovBtn').click(); });
await pg.waitForTimeout(400);
await pg.click('#btnCol');
await pg.waitForTimeout(500);

/* ---- ② 開く 前の すべて ---- */
const snap = () => pg.evaluate(() => ({
  n:    window.__chk.inst.count(),
  seq:  window.__chk.inst.seq(),
  instRaw: window.__chk.inst.raw(),
  dex:  localStorage.getItem('sweetTD.dex'),
  gear: localStorage.getItem('sweetTD.gear'),
  gearNow: JSON.stringify(window.__dbg.gear()),
}));
const before = await snap();

/* ---- ① 5つの ケースを 開いて 中みを 読む ---- */
const look = id => pg.evaluate(async id => {
  /* **どの タブに 出るかは `side` で 決まる**ので 決めうちに しない
     （クマは 敵、ぷりんは 仲間）。5つ 順に さがす */
  let btn = null;
  for (const t of ['ch', 'en', 'lg', 'it', 'fr']){
    const tb = [...document.querySelectorAll('#colTabs .ctab')].find(x => x.dataset.t === t);
    if (tb) tb.click();
    btn = document.querySelector('.cDet[data-det="' + id + '"]');
    if (btn) break;
  }
  /* 画面は **ボタンから 開く**（本番と まったく 同じ 道）*/
  if (btn) btn.click(); else return { missing: true };
  const rows = {};
  for (const r of document.querySelectorAll('#chRows .chRow'))
    rows[r.querySelector('b').textContent] = r.querySelector('span').textContent;
  return {
    on:   document.getElementById('chOv').classList.contains('on'),
    nm:   document.getElementById('chNm').textContent,
    tt:   document.getElementById('chTt').textContent,
    art:  document.querySelectorAll('#chArt canvas').length,
    dim:  document.getElementById('chArt').style.opacity,
    rows,
  };
}, id);

/* 図鑑に もどってから つぎを 開く（本番の 道）*/
const back = async () => { await pg.click('#chClose'); await pg.waitForTimeout(350); };

const cases = {};
for (const [tag, id] of [['所持＋個体あり（origin あり）', 'c_bear'],
                         ['所持＋個体は{sp}だけ（origin なし）', 'ch_purin'],
                         ['所持だが 個体が ない（legacy）', 'c_purin'],
                         ['未所持', 'c_whale'],
                         ['お菓子タワー', 'tw_candy']]){
  cases[tag] = await look(id);
  if (cases[tag] && cases[tag].on) await back();
}
const after = await snap();

/* ---- 検査用に e1 を 入れて、詳細画面に 出るか ---- */
const evoShown = await pg.evaluate(async iid => {
  window.__chk.inst.evolve(iid, 'e1');
  let btn = null;
  for (const t of ['ch', 'en', 'lg']){
    const tb = [...document.querySelectorAll('#colTabs .ctab')].find(x => x.dataset.t === t);
    if (tb) tb.click();
    btn = document.querySelector('.cDet[data-det="c_bear"]');
    if (btn) break;
  }
  if (!btn) return { missing: true };
  btn.click();
  const rows = {};
  for (const r of document.querySelectorAll('#chRows .chRow'))
    rows[r.querySelector('b').textContent] = r.querySelector('span').textContent;
  document.getElementById('chClose').click();
  return { rows, evo: window.__chk.inst.evoOf(iid) };
}, IID);

/* ---- Phase 7-7-3-6 ——**架空の `_e1`** で 絵が 切りかわるか ----
   本番の `ART_SPRITE` に `_e1` は 1件も 無いので、**検査の 中だけで**
   その場に 登録します（ファイルは 1つも 作りません）。
   見るのは 3とおり ——evo なし＝base／`e1`＋架空assetあり＝`_e1`／
   架空assetを 消したら `e1` でも base（fallback）*/
const fake = await pg.evaluate(async iid => {
  const k = window.__chk, I = k.inst;
  /* 対象は クマ（c_bear）。`o.gen` の カードなので `artKeyFor` の 系統 */
  const open = async () => {
    for (const t of ['ch', 'en', 'lg']){
      const tb = [...document.querySelectorAll('#colTabs .ctab')].find(x => x.dataset.t === t);
      if (tb) tb.click();
      const b2 = document.querySelector('.cDet[data-det="c_bear"]');
      if (b2){ b2.click(); break; }
    }
    const cv = document.querySelector('#chArt canvas');
    const url = cv ? cv.toDataURL() : null;
    document.getElementById('chClose').click();
    return url;
  };
  const gen  = k.buildRoster().find(o => o.id === 'c_bear');
  const base = k.artKeyOf(gen);
  const out  = { base, evoKey: base + '_e1' };
  /* ① evo なし → base */
  out.noEvo = await open();
  out.keyNoEvo = k.artKeyFor(gen, null);
  /* ② e1 ＋ 架空asset あり → _e1 */
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'); g.fillStyle = '#ff00ff'; g.fillRect(0, 0, 64, 64);
  /* **本物の `_e1` を こわさない。**`delete` では なく
     もとの 値を おぼえて おいて、おわったら そのまま もどします
     （いまは `purin_e1` が 本物。対象が ぶつかって いなくても、
     ふえた ときに だまって 消さない ように する）*/
  out.had = Object.prototype.hasOwnProperty.call(k.artSprite(), base + '_e1');
  out.prev = k.artSprite()[base + '_e1'];
  const restore = () => { if (out.had) k.artSprite()[base + '_e1'] = out.prev;
                          else delete k.artSprite()[base + '_e1']; };
  try {
  k.artSprite()[base + '_e1'] = cv;
  I.evolve(iid, 'e1');
  out.keyWithFake = k.artKeyFor(gen, 'e1');
  out.withFake = await open();
  /* まん中が むらさきに なって いるか（＝架空assetが えらばれた）。
     **ぴったり 255,0,255 には なりません** ——`portraitShade` の つやと
     `drawGenFx` が あとから かかる ので（実測 240,60,237）。
     色あいで 見ること */
  out.magenta = await (async () => {
    for (const t of ['ch', 'en', 'lg']){
      const tb = [...document.querySelectorAll('#colTabs .ctab')].find(x => x.dataset.t === t);
      if (tb) tb.click();
      const b2 = document.querySelector('.cDet[data-det="c_bear"]');
      if (b2){ b2.click(); break; }
    }
    const c2 = document.querySelector('#chArt canvas');
    const gg = c2.getContext('2d');
    const d = gg.getImageData(Math.round(c2.width/2), Math.round(c2.height/2), 1, 1).data;
    document.getElementById('chClose').click();
    return [d[0], d[1], d[2]].join(',');
  })();
  /* ③ 架空assetを 外したら base へ もどる（fallback）——**完全復元**する。
     `restore()` は 下の finally からも 呼ぶので、途中で 例外が 出ても
     本物の `_e1`（いまは `purin_e1`）を こわしません */
  restore();
  out.keyAfterDel = k.artKeyFor(gen, 'e1');
  out.afterDel = await open();
  /* もとの 状態に もどって いるか（本物が あったなら ある、無かったなら 無い）*/
  out.stillHasFake = k.artHas(base + '_e1') !== out.had;
  /* キャッシュキーは base と evo で 別（7-7-2 の receiver を つかって いる 証拠）*/
  k.genSprite(gen, 64);  k.genSprite(gen, 64, 'e1');
  out.cache = k.cacheKeys().gen.filter(x => x.startsWith('c_bear@64'));
  } finally { restore(); }
  /* かたづけ ——この個体の evo を もどす 口は ない（不可逆）ので、
     セーブごと 元に もどす */
  return out;
}, IID);

/* ---- Phase 7-7-3-6B ——似顔絵（`charThumb`）の 2つの 道 ----
   `drawPortrait` の base は 2つの ところから 出ます。
     ① `DEX_ART[id]`     … 精霊・ながれぼし・**伝説**（**同じ 道**）
     ② `TOWERS[k].art`   … お菓子タワー（**別の 道**）
   だから ①から 1件（伝説）、②から 1件（お菓子タワー）を ためします */
const fake2 = await pg.evaluate(async () => {
  const k = window.__chk;
  const open = async id => {
    for (const t of ['ch', 'en', 'lg']){
      const tb = [...document.querySelectorAll('#colTabs .ctab')].find(x => x.dataset.t === t);
      if (tb) tb.click();
      const b2 = document.querySelector('.cDet[data-det="' + id + '"]');
      if (b2){ b2.click(); break; }
    }
    const cv = document.querySelector('#chArt canvas');
    const url = cv ? cv.toDataURL() : null;
    const gg = cv && cv.getContext('2d');
    const d = gg && gg.getImageData(Math.round(cv.width/2), Math.round(cv.height/2), 1, 1).data;
    document.getElementById('chClose').click();
    return { url, mid: d ? [d[0], d[1], d[2]].join(',') : null };
  };
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); g.fillStyle = '#ff00ff'; g.fillRect(0, 0, 64, 64); return c; };
  const out = {};
  for (const [tag, dexId, pid, base] of [
        ['伝説（DEX_ART の 道）', 'lg_candytree', 'candytree', k.dexArt()['candytree']],
        ['お菓子タワー（TOWERS.art の 道）', 'tw_candy', 'tw_candy', k.towerArt('candy')]]){
    const o = { base };
    o.keyNoEvo   = k.evoArtKey(base, null);
    o.noEvo      = await open(dexId);
    o.had  = Object.prototype.hasOwnProperty.call(k.artSprite(), base + '_e1');
    o.prev = k.artSprite()[base + '_e1'];
    const restore = () => { if (o.had) k.artSprite()[base + '_e1'] = o.prev;
                            else delete k.artSprite()[base + '_e1']; };
    try {
    k.artSprite()[base + '_e1'] = mk();
    o.keyWithFake = k.evoArtKey(base, 'e1');
    /* 個体は まだ ない ので、詳細画面が evo を わたす 道を 直に ためす
       ——`charThumb(o, 128, 'e1')` と 同じ ことを 検査どうぐから */
    o.direct = (() => { const c = k.charThumb({ pid }, 128, 'e1');
      const g = c.getContext('2d');
      const d = g.getImageData(Math.round(c.width/2), Math.round(c.height/2), 1, 1).data;
      return [d[0], d[1], d[2]].join(','); })();
    o.directBase = (() => { const c = k.charThumb({ pid }, 128);
      const g = c.getContext('2d');
      const d = g.getImageData(Math.round(c.width/2), Math.round(c.height/2), 1, 1).data;
      return [d[0], d[1], d[2]].join(','); })();
    restore();
    o.keyAfterDel = k.evoArtKey(base, 'e1');
    o.afterDel    = (() => { const c = k.charThumb({ pid }, 128, 'e1');
      const g = c.getContext('2d');
      const d = g.getImageData(Math.round(c.width/2), Math.round(c.height/2), 1, 1).data;
      return [d[0], d[1], d[2]].join(','); })();
    o.stillHasFake = k.artHas(base + '_e1') !== o.had;
    } finally { restore(); }
    out[tag] = o;
  }
  return out;
});

/* ---- ③ 既存の カード操作 ---- */
await pg.evaluate(() => { const t = [...document.querySelectorAll('#colTabs .ctab')].find(x => x.dataset.t === 'ch');
                          if (t) t.click(); });
await pg.waitForTimeout(400);
/* **どの子を つかうかは DOM から えらぶ。**どれが 貼られて いるか・在庫が
   いくつかは セーブと 初期状態で 変わるので、決めうちに しない
   （じっさい 決めうちで べつの子を 押して しまった）*/
const TARGET = await pg.evaluate(() => {
  const get = () => [...document.querySelectorAll('#colGrid .cCard')].filter(c => c.querySelector('.cDet'));
  const c = get().find(c2 => !c2.querySelector('.cPin') &&
    [...c2.querySelectorAll('.cLv')].some(e => /×0 所持/.test(e.textContent)));
  return c ? { id: c.querySelector('.cDet').dataset.det, nm: c.querySelector('.cNm').textContent } : null;
});
const card = TARGET ? await pg.evaluate(id => {
  const get = () => [...document.querySelectorAll('#colGrid .cCard')]
    .find(x => x.querySelector('.cDet') && x.querySelector('.cDet').dataset.det === id);
  get().click();                                   // 1回目 → 買う？ の たしかめ
  return { ask: document.getElementById('colHint').textContent };
}, TARGET.id) : { missing: true };
/* カードは タップごとに 作りなおされる ので、毎回 さがしなおす */
const card2 = TARGET ? await pg.evaluate(id => {
  const get = () => [...document.querySelectorAll('#colGrid .cCard')]
    .find(x => x.querySelector('.cDet') && x.querySelector('.cDet').dataset.det === id);
  get().click();                                   // 2回目 → 買う
  const c2 = get();
  /* 在庫は カードの 「×N 所持」から 読む（__dbg には 出て いない）*/
  return { bought: document.getElementById('colHint').textContent,
           stock: [...c2.querySelectorAll('.cLv')].map(e => e.textContent).join(' ') };
}, TARGET.id) : {};
const pin = TARGET ? await pg.evaluate(id => {
  const get = () => [...document.querySelectorAll('#colGrid .cCard')]
    .find(x => x.querySelector('.cDet') && x.querySelector('.cDet').dataset.det === id);
  /* 貼った 数は **📌 の 数**で 見る。案内の 文は 買った ときや 外した ときに
     別の 文に なるので、（N/7）が いつも あるとは かぎりません */
  const num = () => document.querySelectorAll('#colGrid .cPin').length;
  const n0 = num();
  get().click();                                   // 貼る
  const onPin = !!get().querySelector('.cPin'), n1 = num();
  get().click();                                   // 外す
  const offPin = !!get().querySelector('.cPin'), n2 = num();
  return { onPin, offPin, n0, n1, n2, h2: document.getElementById('colHint').textContent };
}, TARGET.id) : {};
/* 詳細ボタンは **カードの タップを 呼ばない**（stopPropagation）*/
const noBubble = TARGET ? await pg.evaluate(id => {
  const get = () => [...document.querySelectorAll('#colGrid .cCard')]
    .find(x => x.querySelector('.cDet') && x.querySelector('.cDet').dataset.det === id);
  const pinBefore = !!get().querySelector('.cPin');
  const stockBefore = [...get().querySelectorAll('.cLv')].map(e => e.textContent).join(' ');
  get().querySelector('.cDet').click();
  const on = document.getElementById('chOv').classList.contains('on');
  document.getElementById('chClose').click();
  return { pinBefore, pinAfter: !!get().querySelector('.cPin'), on, stockBefore,
           stockAfter: [...get().querySelectorAll('.cLv')].map(e => e.textContent).join(' ') };
}, TARGET.id) : {};
await b.close();

/* ================= 判定 ================= */
const eqs = (n, a, c) => { if (a !== c) bad.push(n + ' が ' + JSON.stringify(a) + '（' + JSON.stringify(c) + ' の はず）'); };

for (const [tag, r] of Object.entries(cases)){
  if (!r || r.missing){ bad.push(tag + '：詳細の 入口（.cDet）が 見つからない'); continue; }
  if (!r.on)  bad.push(tag + '：詳細画面が ひらかない');
  if (!r.nm)  bad.push(tag + '：名前が 出ない');
  if (r.art !== 1) bad.push(tag + '：絵が ' + r.art + 'まい（1まいの はず）');
}
const C = cases['所持＋個体あり（origin あり）'];
if (C && C.rows){
  eqs('個体あり の 状態',   C.rows['状態'], '仲間に います');
  eqs('個体あり の 入手元', C.rows['入手元'], 'たまごから');
  eqs('個体あり の すがた', C.rows['すがた'], 'まだ 進化して いません');
}
const D = cases['所持＋個体は{sp}だけ（origin なし）'];
if (D && D.rows){
  eqs('{sp}だけ の 状態', D.rows['状態'], '仲間に います');
  /* origin が 無い（unknown）ときは **行ごと 出さない** */
  if ('入手元' in D.rows) bad.push('origin が unknown なのに 入手元の 行が 出て いる：' + D.rows['入手元']);
  eqs('{sp}だけ の すがた', D.rows['すがた'], 'まだ 進化して いません');
}
const E = cases['所持だが 個体が ない（legacy）'];
if (E && E.rows){
  eqs('個体なし の 状態', E.rows['状態'], '仲間に います');
  if ('入手元' in E.rows) bad.push('個体が ないのに 入手元が 出て いる');
  if ('すがた' in E.rows) bad.push('個体が ないのに すがたが 出て いる');
}
const F = cases['未所持'];
if (F && F.rows){
  eqs('未所持 の 状態', F.rows['状態'], 'まだ いません');
  if ('入手元' in F.rows) bad.push('未所持なのに 入手元が 出て いる');
  if ('すがた' in F.rows) bad.push('未所持なのに すがたが 出て いる');
  if (!F.rows['あつめかた']) bad.push('未所持に あつめかたが 出て いない');
  if (parseFloat(F.dim) !== 0.45) bad.push('未所持の 絵が うすく なって いない（' + F.dim + '）');
}
/* ② 見るだけで 何も 変わらない */
eqs('詳細を 見た あとの inst の 数', after.n, before.n);
eqs('詳細を 見た あとの instSeq',    after.seq, before.seq);
eqs('詳細を 見た あとの inst のセーブ', after.instRaw, before.instRaw);
eqs('詳細を 見た あとの dex',        after.dex, before.dex);
eqs('詳細を 見た あとの gear のセーブ', after.gear, before.gear);
eqs('詳細を 見た あとの gear',       after.gearNow, before.gearNow);
/* e1 の 表示 */
if (evoShown.missing) bad.push('e1 の たしかめで .cDet が 見つからない');
else {
  eqs('e1 を 入れた あとの evo', evoShown.evo, 'e1');
  eqs('e1 の すがたの 表示', evoShown.rows['すがた'], '進化ずみ');
  /* 内部IDを そのまま 見せて いない */
  for (const v of Object.values(evoShown.rows))
    if (/\be1\b|第1進化/.test(v)) bad.push('内部の evo ID か 恒久の 名称が 画面に 出て いる：' + v);
}
/* ③ 既存の カード操作 */
if (!TARGET || card.missing) bad.push('「まだ 貼って いなくて 在庫 0」の ワザカードが 見つからない');
else {
  if (!/買いますか/.test(card.ask)) bad.push('0こ の 1回目タップで 「買いますか」が 出ない：' + card.ask);
  if (!/買いました/.test(card2.bought)) bad.push('2回目タップで 買えて いない：' + card2.bought);
  if (!/×1 所持/.test(card2.stock || '')) bad.push('買った あとの 在庫が ' + card2.stock + '（×1 所持 の はず）');
  if (!pin.onPin)  bad.push('タップで ワザバーに 貼れて いない（📌 が 出ない）');
  /* **貼った ときの 文は もともと 出ません**（`togglePin` が 'on' を かえす ときは
     `buildColGrid()` が ふだんの 案内に もどす）。だから 数で 見る */
  if (!(pin.n0 === 0 && pin.n1 === 1 && pin.n2 === 0))
    bad.push('貼った 数が ' + pin.n0 + '→' + pin.n1 + '→' + pin.n2 + '（0→1→0 の はず）');
  if (pin.offPin)  bad.push('もう一度 タップで 外れて いない（📌 が のこる）');
  if (!/戻しました/.test(pin.h2)) bad.push('外した ときの 文が ちがう：' + pin.h2);
}
if (!noBubble.on) bad.push('詳細ボタンで 画面が ひらかない');
if (noBubble.pinBefore !== noBubble.pinAfter)
  bad.push('詳細ボタンが カードの タップまで 呼んで いる（📌 が 変わった）');
/* **案内の 文では くらべられません** ——とじて ひらきなおすと
   `buildColGrid()` が ふだんの 文に もどすので、押して いなくても 変わります。
   見るのは 📌 と 在庫（＝カードの タップが したはずの こと）*/
if (noBubble.stockBefore !== noBubble.stockAfter)
  bad.push('詳細ボタンが カードの タップまで 呼んで いる（在庫が 変わった）：' +
           noBubble.stockBefore + ' → ' + noBubble.stockAfter);

/* ---- 架空assetの 判定 ---- */
eqs('evo なしの 絵の キー', fake.keyNoEvo, fake.base);
eqs('架空assetが ある ときの キー', fake.keyWithFake, fake.evoKey);
eqs('架空assetを 消した あとの キー', fake.keyAfterDel, fake.base);
if (fake.noEvo === fake.withFake) bad.push('e1＋架空assetでも 絵が 変わって いない');
if (fake.withFake === fake.afterDel) bad.push('架空assetを 消しても 絵が もどって いない');
if (fake.noEvo !== fake.afterDel)   bad.push('架空assetを 消した あとの 絵が base と ちがう（fallback して いない）');
{
  const [r, g2, b2] = fake.magenta.split(',').map(Number);
  if (!(r > 180 && g2 < 120 && b2 > 180))
    bad.push('架空assetが えがかれて いない（まん中の 色 ' + fake.magenta + '）');
}
if (fake.stillHasFake)              bad.push('架空assetが のこって いる');
if (!(fake.cache.includes('c_bear@64') && fake.cache.includes('c_bear@64@e1')))
  bad.push('キャッシュキーが base と evo で 分かれて いない：' + fake.cache.join(' / '));

/* ---- 似顔絵の 2つの 道 ---- */
for (const [tag, o] of Object.entries(fake2)){
  if (!o.base){ bad.push(tag + '：base の 絵の キーが 取れない'); continue; }
  eqs(tag + ' の evo なしの キー', o.keyNoEvo, o.base);
  eqs(tag + ' の 架空asset ありの キー', o.keyWithFake, o.base + '_e1');
  eqs(tag + ' の 架空assetを 消した あとの キー', o.keyAfterDel, o.base);
  const [r, g2, b2] = (o.direct || '').split(',').map(Number);
  if (!(r > 180 && g2 < 120 && b2 > 180))
    bad.push(tag + '：架空assetが えがかれて いない（まん中の 色 ' + o.direct + '）');
  if (o.direct === o.directBase) bad.push(tag + '：evo を わたしても 絵が 変わって いない');
  if (o.afterDel !== o.directBase) bad.push(tag + '：架空assetを 消しても base に もどって いない');
  if (o.stillHasFake) bad.push(tag + '：架空assetが のこって いる');
}

const out = (t, a) => console.log('  ' + t.padEnd(16, ' ') + (a.length ? '✗\n    ' + a.join('\n    ') : 'なし ✅'));
console.log('キャラクターの 詳細（#chOv）');
for (const [tag, r] of Object.entries(cases))
  console.log('  ' + tag + '\n    ' + (r && r.rows ? JSON.stringify(r.rows) : JSON.stringify(r)));
for (const [tag, o] of Object.entries(fake2))
  console.log('  ' + tag + '  base=' + o.base + ' / evo=' + o.keyWithFake +
              ' / 消したあと=' + o.keyAfterDel + ' ／ 色 base=' + o.directBase + ' evo=' + o.direct);
console.log('  絵の キー  base=' + fake.base + ' / evo=' + fake.keyWithFake +
            ' / 消したあと=' + fake.keyAfterDel + ' ／ キャッシュ ' + fake.cache.join(','));
console.log('  つかった ワザカード ' + (TARGET ? TARGET.nm + '（' + TARGET.id + '）' : 'なし'));
console.log('  inst ' + before.n + '件 → ' + after.n + '件 ／ seq ' + before.seq + ' → ' + after.seq);
out('JSエラー', errs);
out('canary', bad);
const ng = errs.length + bad.length;
console.log(ng ? '\n検査 NG（' + ng + '件）' : '\n検査 OK ✅');
process.exit(ng ? 1 : 0);
