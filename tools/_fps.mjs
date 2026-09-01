import { launch } from './_pw.mjs';
const b = await launch({ args:['--allow-file-access-from-files'] });
for (const dsf of [2,3]){
  const p = await b.newPage({ viewport:{width:402,height:874}, deviceScaleFactor:dsf });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => new Promise(res => {
    const ts=[]; let n=0;
    const tick = () => { ts.push(performance.now()); if (++n < 90) requestAnimationFrame(tick);
      else { const d=[]; for(let i=1;i<ts.length;i++) d.push(ts[i]-ts[i-1]);
        d.sort((a,b)=>a-b);
        res({ ave:+(1000/(d.reduce((a,b)=>a+b,0)/d.length)).toFixed(1),
              worst:+d[d.length-3].toFixed(1) }); } };
    requestAnimationFrame(tick);
  }));
  console.log(`DPR${dsf}: 平均 ${r.ave}fps ／ わるい方の1フレーム ${r.worst}ms`);
  await p.close();
}
await b.close();
