/* ウェーブの「かべ」が どこに 来るかを はかる。
 *
 * ウェーブに 終わりが ないので、どこまで もぐれるかが そのまま きろくになる。
 * かべが 近すぎると すぐ あきるし、遠すぎると 1プレイが 何時間にも なる。
 * だから hpScale・goldWave・upMul の どれかを いじったら、
 * かならず これを かけて かべの ばしょを たしかめること。
 *
 *   node tools/sim.mjs        # 終了コード 0 で 合格（かべが 250〜550）
 *
 * じっさいの プレイの 再現では ない。カーブどうしを くらべる ものさし。
 * ゲーム本体から 数字を 読むので、index.html を いじれば ここも ついてくる。
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { resolve } from 'path';

const FILE = resolve(process.argv[2] || 'index.html');
const LOW = 250, HIGH = 550;      // ここに 入っていれば 合格

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('file://' + FILE);
await p.waitForTimeout(1200);

const out = await p.evaluate(() => {
  const B = window.__chk.bal;
  const T = B.TOWERS.candy;                 // ⭐あたりの こうげきが いちばん よい子
  const dps1 = T.dmg / T.rate;
  const PATH = 34, SLOTS = 30;              // 道の ながさ／げんじつ的に おける かず
  let stars = 250, towers = [];
  for (let n = 1; n <= 5000; n++){
    // かいもの：⭐あたりの こうげきが いちばん のびる ものを えらぶ
    for(;;){
      let bi = -1, bg = 0, bc = 1e9;
      towers.forEach((lv, i) => {
        if (lv >= B.maxLvAt(n)) return;
        const c = Math.round(T.cost * B.upMul(lv));
        const g = dps1 * Math.pow(1.78, lv - 1) * 0.78;
        if (g / c > bg / bc){ bi = i; bg = g; bc = c; }
      });
      const canNew = towers.length < SLOTS && stars >= T.cost;
      const canUp  = bi >= 0 && stars >= bc;
      if (!canNew && !canUp) break;
      if (canNew && (!canUp || (dps1 / T.cost) >= bg / bc)){ towers.push(1); stars -= T.cost; }
      else { towers[bi]++; stars -= bc; }
    }
    // この ウェーブを たおしきれるか
    const q = B.waveList(n);
    const hp = q.reduce((s, k) => s + B.ENEMIES[k].hp, 0) * B.hpScale(n);
    const walk = PATH / Math.min(...q.map(k => B.ENEMIES[k].spd));
    const dps = towers.reduce((s, lv) => s + dps1 * Math.pow(1.78, lv - 1), 0) * 0.6;
    if (hp > dps * walk * 0.55)
      return { wall: n, lv: Math.max(...towers), towers: towers.length,
               reward: Math.round((20 + n*4) * B.goldWave(n)),
               hp1: Math.round(B.ENEMIES.slime.hp * B.hpScale(n)) };
    stars += Math.round((20 + n*4) * B.goldWave(n));
    for (const k of q) stars += Math.round(B.ENEMIES[k].gold * (1 + Math.max(0, n-30)*0.04) * B.goldWave(n));
  }
  return { wall: '>5000' };
});
// 道は 周ごとに その場で 作る。ながさと おけるマスが そろっていないと
// 道だけで むずかしさが 変わってしまうので、さいしょの 200周を しらべる
const ways = await p.evaluate(() => {
  const B = window.__chk.bal, out = { bad: [], seen: new Set(), n: 0 };
  for (let lap = 0; lap < 200; lap++){
    const w = B.makeWay(lap), m = B.wayMeasure(w);
    if (m.len < 28 || m.len > 36 || m.free < 72 || m.free > 82)
      out.bad.push('周' + lap + ' ながさ' + m.len.toFixed(1) + ' おける' + m.free);
    out.seen.add(JSON.stringify(w));
    if (B.makeWay(lap).toString() !== w.toString()) out.bad.push('周' + lap + ' 毎回ちがう形になる');
  }
  return { bad: out.bad, kinds: out.seen.size };
});
await b.close();

const jp = n => n.toLocaleString('ja-JP');
console.log('かべの ウェーブ   : ' + out.wall);
console.log('そのときの さいだいLv: ' + out.lv + '（上限 ' + (3 + Math.floor(out.wall/10)) + '）');
console.log('そのときの ⭐/かい : ' + jp(out.reward));
console.log('そのときの てき1体HP: ' + jp(out.hp1));
console.log('道の しゅるい（200周）: ' + ways.kinds + ' しゅるい');
if (ways.bad.length) console.log('道の はんい外: ' + ways.bad.slice(0,5).join(' / '));
if (errs.length){ console.log('\nJSエラー: ' + errs.join(' / ')); process.exit(1); }
const ok = typeof out.wall === 'number' && out.wall >= LOW && out.wall <= HIGH && ways.bad.length === 0;
console.log('\n' + (ok ? '検査 OK ✅' : `検査 NG ❌（かべは ${LOW}〜${HIGH} に おさめること）`));
process.exit(ok ? 0 : 1);
