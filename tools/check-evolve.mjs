/* 進化の秘薬（`evolve`）が 3軸ぜんぶで 閉じて いるかを しらべる。
 *
 *   node tools/check-evolve.mjs      # 終了コード 0 で 合格
 *
 * ねらいは 1つ ——**「ITEMS には いるが、遊ぶ人には まだ 見えず、
 * 戦闘にも 出ず、通常ドロップにも まざらない」**育成アイテムを
 * 安全に 1件 足せる ことの 確認です。
 *
 * 軸は 4つ あって、**それぞれ 別の 関数が 決めます**。
 *
 *   isBattleItem  battle  !== false   戦闘で つかえるか（7-7-3-1）
 *   isPublicItem  visible !== false   存在を 公開するか（7-7-3-2）
 *   isDropItem    drop    !== false   通常ドロップに 入るか（7-7-3-3）
 *   late                              何ウェーブから 出るか
 *
 * 目では 見つけられません ——1つ 軸が 抜けても、画面に 1行 ふえるだけで、
 * それが「そういう ものだ」に 見えます。
 */
import { launch } from './_pw.mjs';
import { resolve } from 'path';

const ID = 'evolve';
const target = resolve(process.argv[2] || 'index.html');
const b = await launch({ args: ['--allow-file-access-from-files'] });
const pg = await b.newPage();
const errs = [], bad = [];
pg.on('pageerror', e => errs.push(e.message));
pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

/* はじめての 5人は Math.random で えらぶので、決めうちの セーブを 先に 入れる */
await pg.addInitScript(() => { if (!localStorage.getItem('sweetTD.starter')){
  localStorage.setItem('sweetTD.starter', '2026-09-03');
  localStorage.setItem('sweetTD.dex', JSON.stringify({ c_rabbit:{w:1,d:'2026-09-03',origin:'starter'} }));
} });
await pg.goto('file://' + target + '?dbg=1');
await pg.waitForTimeout(1200);

const r = await pg.evaluate(id => {
  const k = window.__chk, d = window.__dbg;
  const raw = k.itemsRaw();
  const rec = raw.find(i => i.id === id);
  document.getElementById('btnHelp').click();
  const guide = (document.getElementById('helpBody') || {}).textContent || '';
  /* ショップの 2セット（💎20・💎55）の 説明。ここに まざると 有料商品の 事故 */
  document.getElementById('btnShop').click();
  const shop = (document.getElementById('shopBody') || document.getElementById('colOv') || {}).textContent || '';
  return {
    rec: rec || null,
    nItems: raw.length,
    byId: !!k.itemById()[id],
    gearHas: Object.prototype.hasOwnProperty.call(d.gear(), id),
    battle: k.battleItems(),
    public: k.publicItems(),
    battleRecount: raw.filter(k.isBattleItem).map(i => i.id),
    publicRecount: raw.filter(k.isPublicItem).map(i => i.id),
    dropRecount: raw.filter(k.isDropItem).map(i => i.id),
    dexItemIds: k.dexItemIds(),
    dexLen: k.dexIds().length,
    guideHasName: rec ? guide.includes(rec.name) : false,
    shopKinds: (shop.match(/\d+しゅるい/g) || []),
    stage: [1, 200, 250, 5000].map(w => d.stageDropPool(w)),
    battleDrop: [1, 200, 250, 5000].map(w => d.battleDropPool(w)),
  };
}, ID);

/* ---- **持って いても** ワザバーに 出ないか・useItem が はねるか ----
   在庫 0 の ままだと `gear[it.id] < 1` で どのみち 出ないので、
   **8件ぜんぶ 持たせてから** 見ないと 意味が ありません
   （じっさい 在庫 0 で 見て いて、から の 配列を 見て 合格に なりかけた）*/
const own = await pg.evaluate(id => {
  window.__dbg.give(null, 3);                     // ITEMS ぜんぶ 3こずつ
  const bar = [...document.querySelectorAll('#skillBar .sk.it')].map(e => e.dataset.it);
  const before = window.__dbg.gear()[id];
  const said = window.__dbg.useItem(id);          // 戦闘では つかえない はず
  return { bar, before, said, after: window.__dbg.gear()[id] };
}, ID);

/* ---- 1件 わたして 保存 → 読みなおして のこるか ---- */
const save = await pg.evaluate(id => {
  /* いったん 0 に もどしてから 1こ だけ わたす。
     **入手経路は 1つも つないで いない**ので、検査どうぐから 直に */
  const g = JSON.parse(localStorage.getItem('sweetTD.gear') || '{}');
  delete g[id]; localStorage.setItem('sweetTD.gear', JSON.stringify(g));
  return 1;
}, ID);
await pg.reload(); await pg.waitForTimeout(1200);
const save2 = await pg.evaluate(id => {
  const before = window.__dbg.gear()[id];
  window.__dbg.give(id, 1);
  return { before, after: window.__dbg.gear()[id],
           saved: (JSON.parse(localStorage.getItem('sweetTD.gear') || '{}'))[id] };
}, ID);
await pg.reload(); await pg.waitForTimeout(1200);
const reload = await pg.evaluate(id => window.__dbg.gear()[id], ID);
/* 古い セーブ（新しい キーが ない）でも 0 として 読めるか */
const old = await pg.evaluate(id => {
  localStorage.setItem('sweetTD.gear', JSON.stringify({ ball: 3 }));
  return 1;
}, ID);
await pg.reload(); await pg.waitForTimeout(1200);
const oldGear = await pg.evaluate(id => ({ evolve: window.__dbg.gear()[id], ball: window.__dbg.gear().ball }), ID);
await b.close();

const eq = (a, c) => a.length === c.length && a.every((v, i) => v === c[i]);
const S = a => a.join(',');

if (!r.rec) bad.push(ID + ' が ITEMS に ない');
else {
  for (const [k2, v] of [['battle', false], ['visible', false], ['drop', false]])
    if (r.rec[k2] !== v) bad.push(ID + ' の ' + k2 + ' が ' + JSON.stringify(r.rec[k2]) + '（' + v + ' の はず）');
  if ('late' in r.rec) bad.push(ID + ' が late を もって いる（軸が ちがう）');
  if (r.rec.icKey || r.rec.art) bad.push(ID + ' が ほかの 絵を さして いる');
  if (!r.rec.name) bad.push(ID + ' に 表示名が ない');
}
if (r.nItems !== 8) bad.push('ITEMS が ' + r.nItems + '件（8件の はず）');
/* データ基盤には いる */
if (!r.byId)    bad.push('ITEM_BY_ID から 引けない');
if (!r.gearHas) bad.push('gear の 在庫を 持てない');
/* 3軸ぜんぶで 外れて いる。**写しでは なく 数えなおして** くらべる */
for (const [name, snap, recount] of [['BATTLE_ITEMS', r.battle, r.battleRecount],
                                     ['PUBLIC_ITEMS', r.public, r.publicRecount]]){
  if (!eq(snap, recount)) bad.push(name + ' の 写しと 数えなおしが ちがう（しきりが 逆？）');
  if (snap.includes(ID))  bad.push(name + ' に ' + ID + ' が いる');
  if (snap.length !== 7)  bad.push(name + ' が ' + snap.length + '件（7件の はず）：' + S(snap));
}
if (r.dropRecount.includes(ID)) bad.push('通常ドロップの しきりを 通って しまう');
if (r.dropRecount.length !== 7) bad.push('ドロップ対象が ' + r.dropRecount.length + '件（7件の はず）');
/* 画面に 出ない */
if (r.dexItemIds.includes(ID)) bad.push('図鑑に 出て いる');
if (r.dexItemIds.length !== 7) bad.push('図鑑の アイテムが ' + r.dexItemIds.length + '件（7件の はず）');
if (r.guideHasName)            bad.push('ガイドに 出て いる');
if (own.bar.includes(ID))      bad.push('持って いる とき ワザバーに 出て いる');
if (own.bar.length !== 7)      bad.push('ワザバーの アイテムが ' + own.bar.length + '件（7件の はず）：' + S(own.bar));
if (own.after !== own.before)  bad.push('useItem で 在庫が へった（' + own.before + '→' + own.after + '）＝戦闘で つかえて しまう');
for (const s of r.shopKinds) if (s !== '7しゅるい') bad.push('ショップの 種類数が ' + s + '（7しゅるいの はず）');
if (!r.shopKinds.length)       bad.push('ショップの「Nしゅるい」が 見つからない');
/* ドロップの pool。**W5000 まで 見る**（大きい late で 代用して いたら ここで 出る）*/
[1, 200, 250, 5000].forEach((w, i) => {
  for (const [nm, a] of [['stage', r.stage[i]], ['battle', r.battleDrop[i]]])
    if (a.includes(ID)) bad.push('W' + w + ' の ' + nm + ' drop に いる');
  if (!eq(r.stage[i], r.battleDrop[i]))
    bad.push('W' + w + ': stage と battle の pool が ちがう');
});
/* 在庫の 保存 */
if (save2.before !== 0) bad.push('キーを 消した セーブで 在庫が ' + save2.before + '（0の はず）');
if (save2.after !== 1)  bad.push('1こ わたした あとの 在庫が ' + save2.after);
if (save2.saved !== 1)  bad.push('localStorage に 1こ 保存されて いない（' + save2.saved + '）');
if (reload !== 1)       bad.push('読みなおしたら 在庫が ' + reload + '（1の はず）');
/* 古い セーブに 新しい キーが 無くても 0 として 読める（bulk migration 不要）*/
if (oldGear.evolve !== 0) bad.push('古い セーブで 在庫が ' + oldGear.evolve + '（0の はず）');
if (oldGear.ball !== 3)   bad.push('古い セーブの ほかの 在庫が こわれた（ball=' + oldGear.ball + '）');

const out = (t, a) => console.log('  ' + t.padEnd(16, ' ') + (a.length ? '✗\n    ' + a.join('\n    ') : 'なし ✅'));
console.log('進化の秘薬（' + ID + '）');
console.log('  ITEMS ' + r.nItems + '件 ／ BATTLE ' + r.battle.length + ' ／ PUBLIC ' + r.public.length +
            ' ／ drop対象 ' + r.dropRecount.length + ' ／ 図鑑 ' + r.dexItemIds.length +
            ' ／ ショップ ' + S(r.shopKinds));
console.log('  W250 drop  ' + S(r.battleDrop[2]));
out('JSエラー', errs);
out('canary', bad);
const ng = errs.length + bad.length;
console.log(ng ? '\n検査 NG（' + ng + '件）' : '\n検査 OK ✅');
process.exit(ng ? 1 : 0);
