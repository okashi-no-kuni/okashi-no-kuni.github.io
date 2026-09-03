/* Phase 7-7-3-2 ——公開の 集合（PUBLIC_ITEMS）の canary。
 *
 *   node tools/check-public.mjs        # 終了コード 0 で 合格
 *
 * ふつうの index.html には 非公開の アイテムが 1つも ないので、
 * **検査の 中でだけ** 架空の 2件を ITEMS に さしこんだ 写しを 作って しらべます
 * （本物の index.html は 1文字も 変えません）。
 *
 *   __cn_hidden   visible:false ／ battle は 未指定  … 公開しない が 戦闘では つかえる
 *   __cn_nobattle battle:false  ／ visible は 未指定 … 公開する が 戦闘では つかえない
 *
 * この 2件が 「たすきがけ」に なって いるのが 大事です。しきりを
 * まちがえて `battle !== false` で 決めると **両方とも 落ちます**。
 * 1件だけだと、battle で 決めても 素通りします。
 */
import { launch } from './_pw.mjs';
import { resolve, dirname, join } from 'path';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';

const target = resolve(process.argv[2] || 'index.html');
const src = readFileSync(target, 'utf8');

const FAKE = `
  { id:'__cn_hidden', name:'かくれアイテム', sn:'かくれ', ic:'🚫', col:'#cccccc', need:false,
    visible:false,
    desc:'公開しない', note:'canary' },
  { id:'__cn_nobattle', name:'せんとうがい', sn:'がい', ic:'🧷', col:'#cccccc', need:false,
    battle:false,
    desc:'戦闘では つかえない', note:'canary' },
`;
const anchor = 'const ITEMS = [\n';
if (!src.includes(anchor)){ console.error('✗ ITEMS の 目じるしが 見つからない'); process.exit(1); }
const hacked = src.replace(anchor, anchor + FAKE);

/* **写しは リポジトリの 中に 置くこと。**よそに 置くと
   `vendor/phaser.min.js` などの 相対パスが 解けず、ページごと 動きません
   （じっさい 1回 だまされた ——`__chk` が undefined に なるだけで、
   理由は 画面にも 出ません）*/
const tmp = join(dirname(target), '.__pubchk.tmp.html');
writeFileSync(tmp, hacked);
process.on('exit', () => { try{ unlinkSync(tmp); }catch(e){} });

const b = await launch({ args: ['--allow-file-access-from-files'] });
const bad = [];
const errs = [];

/* 素の 版と さしこんだ 版の 両方を 見る。素の版は「7件のまま・
   PUBLIC_ITEMS ＝ ITEMS」を たしかめる ため */
async function look(path){
  const pg = await b.newPage();
  pg.on('pageerror', e => errs.push(path + ': ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push(path + ': ' + m.text()); });
  await pg.goto('file://' + path + '?dbg=1');
  await pg.waitForTimeout(1500);
  if (errs.length) console.error('errs:', errs.slice(0,3));
  const r = await pg.evaluate(() => {
    const k = window.__chk, d = window.__dbg;
    /* **写しでは なく 数えなおす。**`PUBLIC_ITEMS` は 読みこみの ときの
       写しなので、しきりを 逆に しても 写しを 見るだけでは 気づけない
       （7-7-3-1 で 実際に すりぬけた わな）*/
    const raw = k.itemsRaw();
    const recomputed = raw.filter(k.isPublicItem).map(i => i.id);
    return {
      rawIds: raw.map(i => i.id),
      byId: raw.map(i => i.id).filter(id => !!k.itemById()[id]),
      gearIds: Object.keys(d.gear()),
      publicIds: k.publicItems(),
      recomputed,
      battleIds: k.battleItems(),
      dexItemIds: k.dexItemIds(),
      dexLen: k.dexIds().length,
      /* ガイドは ひらいた ときに 中みが 作られる */
      guide: (() => { document.getElementById('btnHelp').click();
                      const el = document.getElementById('helpBody');
                      return el ? el.textContent : ''; })(),
    };
  });
  /* 完成判定と にじ は ぜんぶ うめてから 見る */
  const done = await pg.evaluate(() => {
    window.__dbg.fillDex(1);
    return { complete: window.__chk.completeOk(), rainbow: window.__chk.rainbowOk() };
  });
  await pg.close();
  return { ...r, ...done };
}

const base = await look(target);
const cn   = await look(tmp);
await b.close();

const has = (a, x) => a.indexOf(x) >= 0;
const eq  = (a, b2) => a.length === b2.length && a.every((v, i) => v === b2[i]);

/* ---- 素の 版：7件・PUBLIC_ITEMS ＝ ITEMS（同じ件数・同じ順） ---- */
if (!eq(base.publicIds, base.rawIds))
  bad.push('素の版で PUBLIC_ITEMS ≠ ITEMS：' + base.publicIds.join(',') + ' / ' + base.rawIds.join(','));
if (!eq(base.publicIds, base.recomputed))
  bad.push('素の版で 写しと 数えなおしが ちがう（しきりが 逆？）');
if (!eq(base.dexItemIds, base.rawIds))
  bad.push('素の版で 図鑑の アイテムが ITEMS と ちがう');

/* ---- さしこんだ 版 ---- */
// ① ITEM_BY_ID 相当では 存在する
for (const id of ['__cn_hidden', '__cn_nobattle'])
  if (!has(cn.byId, id)) bad.push(id + ' が ITEM_BY_ID に ない');
// ② gear の 対象には できる
for (const id of ['__cn_hidden', '__cn_nobattle'])
  if (!has(cn.gearIds, id)) bad.push(id + ' が gear に ない');
// ③ PUBLIC_ITEMS には 入らない／入る（たすきがけ）
if (has(cn.publicIds, '__cn_hidden'))     bad.push('visible:false が PUBLIC_ITEMS に 入って いる');
if (!has(cn.publicIds, '__cn_nobattle'))  bad.push('battle:false が PUBLIC_ITEMS から 落ちて いる（軸の 混同）');
if (!eq(cn.publicIds, cn.recomputed))     bad.push('さしこんだ版で 写しと 数えなおしが ちがう');
// ④⑤ 図鑑・ガイドに 出ない／出る
if (has(cn.dexItemIds, '__cn_hidden'))    bad.push('非公開の アイテムが 図鑑に 出て いる');
if (!has(cn.dexItemIds, '__cn_nobattle')) bad.push('公開の アイテムが 図鑑から 落ちて いる');
if (cn.guide.includes('かくれアイテム'))  bad.push('非公開の アイテムが ガイドに 出て いる');
if (!cn.guide.includes('せんとうがい'))   bad.push('公開の アイテムが ガイドから 落ちて いる');
// ⑥ dexList() の 分母を 増やさない（増えてよいのは 公開した 1件だけ）
if (cn.dexLen !== base.dexLen + 1)
  bad.push('dexList() の 分母が ' + base.dexLen + ' → ' + cn.dexLen + '（+1 の はず）');
// ⑦⑧ 完成判定・にじ を 止めない
if (!cn.complete) bad.push('非公開の アイテムが 「おかしの国 完成」を 止めて いる');
if (!cn.rainbow)  bad.push('非公開の アイテムが 国の にじを 止めて いる');
// ⑨ BATTLE_ITEMS は visible を 理由に 変わらない
if (!has(cn.battleIds, '__cn_hidden'))
  bad.push('visible:false が BATTLE_ITEMS から 落ちて いる（軸の 混同）');
if (has(cn.battleIds, '__cn_nobattle'))
  bad.push('battle:false が BATTLE_ITEMS に 入って いる');
if (!eq(base.battleIds, cn.battleIds.filter(id => !id.startsWith('__cn_'))))
  bad.push('BATTLE_ITEMS の 中みが 変わった');

const out = (t, a) => console.log('  ' + t.padEnd(18, ' ') + (a.length ? '✗ ' + a.join(' / ') : 'なし ✅'));
console.log('公開の 集合（canary）  素の版 ' + base.publicIds.length + '件 ／ さしこんだ版 ' + cn.publicIds.length + '件');
out('JSエラー', errs);
out('canary', bad);
const ng = errs.length + bad.length;
console.log(ng ? '\n検査 NG（' + ng + '件）' : '\n検査 OK ✅');
process.exit(ng ? 1 : 0);
