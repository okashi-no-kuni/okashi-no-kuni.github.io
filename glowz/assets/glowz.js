/* ==========================================================================
   GLOWZ 共通スクリプト
   グラフは外部ライブラリを入れずCanvasで描く。
   このアプリで要るのは「折れ線」「ドーナツ」「スパークライン」の3つだけで、
   そのためにChart.jsを読みこむと初回表示が重くなるため。
   ========================================================================== */

/* 画面の色は CSS 側の変数が正。JS からも同じ値を読んで、ブランドを切りかえても
   グラフだけ色が残る、ということが起きないようにする */
function cssVar(el, name){
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/* devicePixelRatio に合わせないと、Retina でグラフだけぼやける。
   隠れている画面（display:none）の Canvas は幅も高さも 0 になる。
   そのまま描くと半径がマイナスになって arc() が例外を投げるので、
   ここで null を返して、呼ぶ側が何もしないで戻れるようにする。
   画面を切りかえたあとに描きなおせば、そのとき正しい幅が取れる。 */
function fitCanvas(cv){
  const w = cv.clientWidth, h = cv.clientHeight;
  if (w < 2 || h < 2) return null;
  const r = window.devicePixelRatio || 1;
  cv.width = Math.round(w * r);
  cv.height = Math.round(h * r);
  const ctx = cv.getContext('2d');
  ctx.setTransform(r, 0, 0, r, 0, 0);
  return { ctx, w, h };
}

/* ---- 折れ線＋塗り ------------------------------------------------------ */
function lineChart(cv, data, opt){
  opt = opt || {};
  const fit = fitCanvas(cv); if (!fit) return;
  const { ctx, w, h } = fit;
  const pad = opt.pad || { l: 34, r: 8, t: 10, b: 22 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const c1 = opt.color || cssVar(cv, '--accent');
  const c2 = opt.color2 || cssVar(cv, '--accent-2');

  const max = Math.max(...data.map(d => d.v)) * 1.12;
  const min = opt.zero === false ? Math.min(...data.map(d => d.v)) * .88 : 0;
  const X = i => pad.l + (iw * i) / (data.length - 1);
  const Y = v => pad.t + ih - ((v - min) / (max - min)) * ih;

  ctx.clearRect(0, 0, w, h);

  // 目もりの線。文字より先に引かないと線が文字の上に乗る
  ctx.strokeStyle = 'rgba(0,0,0,.05)';
  ctx.lineWidth = 1;
  ctx.fillStyle = cssVar(cv, '--ink-4');
  ctx.font = '10px ' + cssVar(document.body, '--font-b').split(',')[0].replace(/"/g, '');
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 3; i++){
    const v = min + ((max - min) * i) / 3, y = Math.round(Y(v)) + .5;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    if (opt.axis !== false) ctx.fillText(fmtShort(v), pad.l - 8, y);
  }

  // 塗り。上から下へ薄くしていくと、線が主役のまま面積が出る
  const g = ctx.createLinearGradient(0, pad.t, 0, pad.t + ih);
  g.addColorStop(0, hexA(c1, .28));
  g.addColorStop(1, hexA(c1, 0));
  ctx.beginPath();
  ctx.moveTo(X(0), Y(data[0].v));
  data.forEach((d, i) => { if (i) curveTo(ctx, X(i - 1), Y(data[i-1].v), X(i), Y(d.v)); });
  ctx.lineTo(X(data.length - 1), pad.t + ih);
  ctx.lineTo(X(0), pad.t + ih);
  ctx.closePath();
  ctx.fillStyle = g; ctx.fill();

  // 線
  const lg = ctx.createLinearGradient(pad.l, 0, w - pad.r, 0);
  lg.addColorStop(0, c2); lg.addColorStop(1, c1);
  ctx.beginPath();
  ctx.moveTo(X(0), Y(data[0].v));
  data.forEach((d, i) => { if (i) curveTo(ctx, X(i - 1), Y(data[i-1].v), X(i), Y(d.v)); });
  ctx.strokeStyle = lg; ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.stroke();

  // 最後の点だけ丸をうつ。全部に打つとごちゃつく
  const lx = X(data.length - 1), ly = Y(data[data.length - 1].v);
  ctx.beginPath(); ctx.arc(lx, ly, 5.5, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.beginPath(); ctx.arc(lx, ly, 3.4, 0, 7); ctx.fillStyle = c1; ctx.fill();

  // 横の目もり。
  // 両はしだけ内がわに寄せる。中央ぞろえのままだと、最後の「5/30」が
  // 枠からはみ出して「5/3(」のように切れる。
  if (opt.axis !== false){
    ctx.fillStyle = cssVar(cv, '--ink-4');
    ctx.textBaseline = 'top';
    const step = Math.ceil(data.length / 6);
    const last = data.length - 1;
    data.forEach((d, i) => {
      if (i % step !== 0 && i !== last) return;
      // 最後の1つに近すぎる目もりは、重なるので出さない
      if (i !== last && X(last) - X(i) < 26) return;
      ctx.textAlign = i === 0 ? 'left' : i === last ? 'right' : 'center';
      ctx.fillText(d.l, X(i), pad.t + ih + 7);
    });
  }
}

/* なめらかな線にする。折れ線のままだと数字が硬く見える */
function curveTo(ctx, x0, y0, x1, y1){
  const mx = (x0 + x1) / 2;
  ctx.bezierCurveTo(mx, y0, mx, y1, x1, y1);
}

/* ---- スパークライン（KPIカードの中の小さい線）--------------------------- */
function sparkline(cv, vals, color){
  const fit = fitCanvas(cv); if (!fit) return;
  const { ctx, w, h } = fit;
  const c = color || cssVar(cv, '--accent');
  const max = Math.max(...vals), min = Math.min(...vals);
  const X = i => (w * i) / (vals.length - 1);
  const Y = v => h - 3 - ((v - min) / ((max - min) || 1)) * (h - 6);
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, hexA(c, .3)); g.addColorStop(1, hexA(c, 0));
  ctx.beginPath(); ctx.moveTo(X(0), Y(vals[0]));
  vals.forEach((v, i) => { if (i) curveTo(ctx, X(i-1), Y(vals[i-1]), X(i), Y(v)); });
  ctx.lineTo(X(vals.length-1), h); ctx.lineTo(0, h); ctx.closePath();
  ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.moveTo(X(0), Y(vals[0]));
  vals.forEach((v, i) => { if (i) curveTo(ctx, X(i-1), Y(vals[i-1]), X(i), Y(v)); });
  ctx.strokeStyle = c; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
}

/* ---- ドーナツ（達成率・稼働率）------------------------------------------ */
function ring(cv, pct, opt){
  opt = opt || {};
  const fit = fitCanvas(cv); if (!fit) return;
  const { ctx, w, h } = fit;
  const cx = w / 2, cy = h / 2;
  const th = opt.thick || 9;
  const r = Math.min(w, h) / 2 - th / 2 - 2;
  const c1 = opt.color || cssVar(cv, '--accent');
  const c2 = opt.color2 || cssVar(cv, '--accent-2');
  ctx.clearRect(0, 0, w, h);

  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = opt.track || cssVar(cv, '--sv-2');
  ctx.lineWidth = th; ctx.stroke();

  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, c2); g.addColorStop(1, c1);
  const start = -Math.PI / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, start + Math.PI * 2 * Math.max(0, Math.min(1, pct / 100)));
  ctx.strokeStyle = g; ctx.lineWidth = th; ctx.lineCap = 'round'; ctx.stroke();
}

/* ---- 数字 ---------------------------------------------------------------- */
const fmtYen = n => '¥' + Math.round(n).toLocaleString('ja-JP');
function fmtShort(n){
  if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '億';
  if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + '万';
  return Math.round(n).toLocaleString('ja-JP');
}

/* 数字がふえる瞬間を見せる。止まった数字より「動いている」ほうが伝わる */
function countUp(el, to, fmt, ms){
  fmt = fmt || (v => Math.round(v).toLocaleString('ja-JP'));
  ms = ms || 900;
  const t0 = performance.now();
  (function step(t){
    const p = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - p, 3);   // 最後にゆっくり止まる
    el.textContent = fmt(to * e);
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}

/* #RRGGBB / rgb() を透明ありに変える */
function hexA(c, a){
  c = c.trim();
  if (c.startsWith('#')){
    const n = c.length === 4
      ? c.slice(1).split('').map(x => parseInt(x + x, 16))
      : [c.slice(1,3), c.slice(3,5), c.slice(5,7)].map(x => parseInt(x, 16));
    return `rgba(${n[0]},${n[1]},${n[2]},${a})`;
  }
  const m = c.match(/[\d.]+/g);
  return m ? `rgba(${m[0]},${m[1]},${m[2]},${a})` : c;
}

/* ---- 背景（オーロラ）を1行で置けるように ------------------------------- */
function mountAurora(){
  if (document.querySelector('.aurora')) return;
  const d = document.createElement('div');
  d.className = 'aurora';
  d.innerHTML = '<span></span><span></span><span></span>';
  document.body.prepend(d);
}

/* ---- 画面サイズが変わったらグラフを描きなおす ---------------------------
   Canvas は CSS で伸びても中身の解像度は変わらないため、
   放っておくと横向きにしたときだけグラフがぼやける。 */
const _redraw = [];
function onDraw(fn){ _redraw.push(fn); fn(); }
let _rt;
window.addEventListener('resize', () => {
  clearTimeout(_rt);
  _rt = setTimeout(() => _redraw.forEach(f => f()), 120);
});

document.addEventListener('DOMContentLoaded', mountAurora);
