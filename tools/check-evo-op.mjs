/* 進化の 操作（Phase 7-7-3-7）を しらべる。
 *
 *   node tools/check-evo-op.mjs      # 終了コード 0 で 合格
 *
 * いちばん 大事な ものさしは 2つ。
 *   ① **`evolveInst()` が false なのに 秘薬が へる 道が 無い**
 *   ② **失敗する 操作で legacy の 個体を 作らない**
 *      （秘薬 0 で ボタンに さわった／やめた／未所持）
 *
 * どちらも 画面には 何も 出ないので、目では 見つけられません。
 */
import { launch } from './_pw.mjs';
import { resolve } from 'path';

const target = resolve(process.argv[2] || 'index.html');
const bad = [], errs = [];
const IID = 'zzzzzz.1';                 // c_bear の 個体（ふつうの individual）
const b = await launch({ args: ['--allow-file-access-from-files'] });

/* 毎回 まっさらな ページから 始める（進化は 不可逆なので 使い回せない）*/
async function fresh(seed){
  const pg = await b.newPage();
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.setViewportSize({ width: 393, height: 852 });
  await pg.addInitScript(({ seed, IID }) => {
    if (localStorage.getItem('__seeded')) return;
    localStorage.setItem('__seeded', '1');
    localStorage.setItem('sweetTD.starter', '2026-09-03');
    localStorage.setItem('sweetTD.pins', '[]');
    localStorage.setItem('sweetTD.itemsV2', '1');
    localStorage.setItem('sweetTD.dex', JSON.stringify({
      c_bear:   { w:9, d:'2026-09-03', origin:'egg' },     // 個体あり／なし は seed しだい
      c_purin:  { w:2, d:'2026-09-03', origin:'battle' },  // **legacy**（個体を 作らない）
    }));
    if (seed.inst)
      localStorage.setItem('sweetTD.inst', JSON.stringify({
        v:1, pfx:'zzzzzz', seq:1, items:{ [IID]: { sp:'c_bear', origin:'egg' } } }));
    if (seed.evolve != null)
      localStorage.setItem('sweetTD.gear', JSON.stringify({ evolve: seed.evolve }));
  }, { seed, IID });
  await pg.goto('file://' + target + '?dbg=1');
  await pg.waitForTimeout(1400);
  await pg.evaluate(() => { const o = document.getElementById('ov');
    if (o && o.classList.contains('on')) document.getElementById('ovBtn').click(); });
  await pg.waitForTimeout(300);
  await pg.click('#btnCol'); await pg.waitForTimeout(400);
  return pg;
}
/* 詳細画面を ひらく（本番の 道＝カードの ボタン）*/
const openDet = (pg, id) => pg.evaluate(id => {
  for (const t of ['ch', 'en', 'lg']){
    const tb = [...document.querySelectorAll('#colTabs .ctab')].find(x => x.dataset.t === t);
    if (tb) tb.click();
    const b2 = document.querySelector('.cDet[data-det="' + id + '"]');
    if (b2){ b2.click(); return true; }
  }
  return false;
}, id);
const snap = pg => pg.evaluate(() => ({
  n: window.__chk.inst.count(), seq: window.__chk.inst.seq(),
  instRaw: window.__chk.inst.raw(), gear: window.__dbg.gear().evolve,
  gearSave: localStorage.getItem('sweetTD.gear'),
  dex: localStorage.getItem('sweetTD.dex'),
  sugata: [...document.querySelectorAll('#chRows .chRow')]
    .filter(r => r.querySelector('b').textContent === 'すがた')
    .map(r => r.querySelector('span').textContent)[0] || null,
  btn: !!document.getElementById('chEvo'),
  yes: !!document.getElementById('chEvoYes'),
  msg: (document.getElementById('chMsg') || {}).textContent || null,
}));
const eqs = (n, a, c) => { if (a !== c) bad.push(n + ' が ' + JSON.stringify(a) + '（' + JSON.stringify(c) + ' の はず）'); };

/* ============ ① legacy（dex あり・個体なし・秘薬1こ） ============ */
{
  const pg = await fresh({ inst: false, evolve: 1 });
  await openDet(pg, 'c_purin');
  const s0 = await snap(pg);
  eqs('legacy：ひらいた だけの 個体の 数', s0.n, 0);
  eqs('legacy：進化の ボタン', s0.btn, true);
  /* たしかめを 出して → やめる。**何も 変わらない こと** */
  await pg.click('#chEvo'); await pg.waitForTimeout(150);
  const s1 = await snap(pg);
  eqs('legacy：たしかめの「はい」', s1.yes, true);
  eqs('legacy：たしかめ中の 個体の 数', s1.n, 0);
  await pg.click('#chEvoNo'); await pg.waitForTimeout(150);
  const s2 = await snap(pg);
  eqs('legacy：やめた あとの 個体の 数', s2.n, 0);
  eqs('legacy：やめた あとの 秘薬', s2.gear, 1);
  eqs('legacy：やめた あとの inst のセーブ', s2.instRaw, s0.instRaw);
  eqs('legacy：やめた あとの gear のセーブ', s2.gearSave, s0.gearSave);
  eqs('legacy：やめた あとの dex', s2.dex, s0.dex);
  eqs('legacy：やめた あとの すがた', s2.sugata, s0.sugata);
  /* 進化を 確定 */
  await pg.click('#chEvo'); await pg.waitForTimeout(150);
  await pg.click('#chEvoYes'); await pg.waitForTimeout(250);
  const s3 = await snap(pg);
  eqs('legacy：確定した あとの 個体の 数', s3.n, 1);
  eqs('legacy：確定した あとの すがた', s3.sugata, '進化ずみ');
  eqs('legacy：確定した あとの 秘薬', s3.gear, 0);
  eqs('legacy：確定した あとの ボタン', s3.btn, false);
  const ev = await pg.evaluate(() => { const I = window.__chk.inst, all = I.all();
    const id = Object.keys(all).find(k => all[k].sp === 'c_purin');
    return { id, evo: id ? I.evoOf(id) : null, sp: id ? all[id].sp : null }; });
  eqs('legacy：evo', ev.evo, 'e1');
  eqs('legacy：species', ev.sp, 'c_purin');
  /* 読みなおしても のこる */
  await pg.reload(); await pg.waitForTimeout(1400);
  const after = await pg.evaluate(() => { const I = window.__chk.inst, all = I.all();
    const id = Object.keys(all).find(k => all[k].sp === 'c_purin');
    return { n: I.count(), evo: id ? I.evoOf(id) : null, gear: window.__dbg.gear().evolve }; });
  eqs('legacy：読みなおした 個体の 数', after.n, 1);
  eqs('legacy：読みなおした evo', after.evo, 'e1');
  eqs('legacy：読みなおした 秘薬', after.gear, 0);
  await pg.close();
}

/* ============ ② ふつうの individual（個体あり・秘薬2こ） ============ */
{
  const pg = await fresh({ inst: true, evolve: 2 });
  await openDet(pg, 'c_bear');
  const s0 = await snap(pg);
  eqs('individual：はじめの 個体の 数', s0.n, 1);
  eqs('individual：はじめの すがた', s0.sugata, 'まだ 進化して いません');
  await pg.click('#chEvo'); await pg.waitForTimeout(150);
  await pg.click('#chEvoYes'); await pg.waitForTimeout(250);
  const s1 = await snap(pg);
  eqs('individual：1回目の あとの すがた', s1.sugata, '進化ずみ');
  eqs('individual：1回目の あとの 秘薬', s1.gear, 1);
  eqs('individual：1回目の あとの 個体の 数', s1.n, 1);
  eqs('individual：1回目の あとの ボタン', s1.btn, false);
  eqs('individual：evo', await pg.evaluate(i => window.__chk.inst.evoOf(i), IID), 'e1');
  /* もう一度 ——**UI にも 出ないし、直に 呼んでも へらない** */
  const again = await pg.evaluate(() => window.__chk.inst.tryEvolve(
    window.__chk.dexListDbg ? null : { id:'c_bear', name:'x' }));
  const s2 = await snap(pg);
  eqs('individual：2回目の こたえ', again, 'done');
  eqs('individual：2回目の あとの 秘薬', s2.gear, 1);
  eqs('individual：2回目の あとの すがた', s2.sugata, '進化ずみ');
  eqs('individual：2回目の あとの 個体の 数', s2.n, 1);
  await pg.close();
}

/* ============ ③ 連打（たしかめの「はい」を つづけて 押す） ============ */
{
  const pg = await fresh({ inst: true, evolve: 2 });
  await openDet(pg, 'c_bear');
  const r = await pg.evaluate(() => {
    document.getElementById('chEvo').click();
    const y = document.getElementById('chEvoYes');
    y.click(); y.click(); y.click();        // 同じ ボタンを 3回（作りなおされる 前）
    return { gear: window.__dbg.gear().evolve, n: window.__chk.inst.count() };
  });
  eqs('連打：秘薬', r.gear, 1);
  eqs('連打：個体の 数', r.n, 1);
  await pg.close();
}

/* ============ ④ 秘薬 0（ボタンが 出ない・個体も できない） ============ */
{
  const pg = await fresh({ inst: false, evolve: 0 });
  await openDet(pg, 'c_purin');
  const s = await snap(pg);
  eqs('秘薬0：ボタン', s.btn, false);
  eqs('秘薬0：個体の 数', s.n, 0);
  /* **直に 呼んでも** 個体を 作らない（在庫を 先に 見て いる 証拠）*/
  const r = await pg.evaluate(() => window.__chk.inst.tryEvolve({ id:'c_purin' }));
  const s2 = await snap(pg);
  eqs('秘薬0：tryEvolve の こたえ', r, 'poor');
  eqs('秘薬0：呼んだ あとの 個体の 数', s2.n, 0);
  eqs('秘薬0：呼んだ あとの instSeq', s2.seq, s.seq);
  eqs('秘薬0：inst のセーブ', s2.instRaw, s.instRaw);
  await pg.close();
}

/* ============ ⑤ 未所持（秘薬を 持って いても 出さない） ============ */
{
  const pg = await fresh({ inst: false, evolve: 3 });
  await openDet(pg, 'c_whale');
  const s = await snap(pg);
  eqs('未所持：ボタン', s.btn, false);
  eqs('未所持：個体の 数', s.n, 0);
  const r = await pg.evaluate(() => window.__chk.inst.tryEvolve({ id:'c_whale' }));
  const s2 = await snap(pg);
  eqs('未所持：tryEvolve の こたえ', r, 'no');
  eqs('未所持：呼んだ あとの 個体の 数', s2.n, 0);
  eqs('未所持：秘薬', s2.gear, 3);
  await pg.close();
}

/* ============ ⑥ アイテムには 出さない ============ */
{
  const pg = await fresh({ inst: false, evolve: 3 });
  const has = await pg.evaluate(() => !!document.querySelector('.cDet[data-det="it_ball"]'));
  const r = await pg.evaluate(() => window.__chk.inst.tryEvolve({ id:'it_ball', item:{} }));
  eqs('アイテムに 詳細の 入口', has, false);
  eqs('アイテムの tryEvolve', r, 'no');
  await pg.close();
}

/* ============ ⑦ canary ——evolveInst が false なら 秘薬は へらない ============ */
{
  const pg = await fresh({ inst: true, evolve: 2 });
  await openDet(pg, 'c_bear');
  const r = await pg.evaluate(() => {
    /* `EVO_IDS` から e1 を 外すと、`evolveInst` は かならず false を かえす。
       **本番の コードは 1文字も 変えて いません** ——集合から 1つ 抜くだけ */
    window.__chk.inst.evoIds.delete('e1');
    const before = window.__dbg.gear().evolve;
    const said = window.__chk.inst.tryEvolve({ id:'c_bear' });
    const after = window.__dbg.gear().evolve;
    window.__chk.inst.evoIds.add('e1');
    return { said, before, after, evo: window.__chk.inst.evoOf('zzzzzz.1') };
  });
  eqs('canary：tryEvolve の こたえ', r.said, 'ng');
  eqs('canary：秘薬（へって いない こと）', r.after, r.before);
  eqs('canary：evo', r.evo, null);
  await pg.close();
}
await b.close();

const out = (t, a) => console.log('  ' + t.padEnd(16, ' ') + (a.length ? '✗\n    ' + a.join('\n    ') : 'なし ✅'));
console.log('進化の 操作（tryEvolve）');
out('JSエラー', errs);
out('canary', bad);
const ng = errs.length + bad.length;
console.log(ng ? '\n検査 NG（' + ng + '件）' : '\n検査 OK ✅');
process.exit(ng ? 1 : 0);
