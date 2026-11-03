
const $=s=>document.querySelector(s), seasons=['Winter','Spring','Summer','Fall'];let demo=true,idx=0,playing=false,lastStep=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;if($('#motion'))$('#motion').checked=!reduced;
const motionEnabled=()=>$('#motion')?.checked??!reduced;
const on=(selector,event,handler)=>{const node=$(selector);if(node)node[event]=handler};
const synthetic=Array.from({length:124},(_,i)=>{let q=i%4,y=1995+Math.floor(i/4),t=1.1*Math.sin(i*.13)+.5*Math.cos(i*.39)+.012*i-.65,u=48+29*Math.sin(i*.29)+16*Math.cos(i*.11);return{year:y,quarter:q+1,kelp:Math.round(Math.max(12000,165000+50000*Math.sin(q*1.57)-34000*t+500*u+22000*Math.cos(i*.43))),temp:+t.toFixed(2),up:+u.toFixed(1)}});let data=synthetic.map(d=>({...d}));
const extent=a=>{let v=a.filter(Number.isFinite);return v.length?[Math.min(...v),Math.max(...v)]:[0,1]},norm=(v,a,b)=>a===b?.5:Math.max(0,Math.min(1,(v-a)/(b-a))),fmt=v=>v===null?'Missing':Math.round(v).toLocaleString();
function anomalies(key){let means=[1,2,3,4].map(q=>{let a=data.filter(d=>d.quarter===q&&Number.isFinite(d[key])).map(d=>d[key]);return a.reduce((s,v)=>s+v,0)/(a.length||1)});return data.map(d=>d[key]===null?null:d[key]-means[d.quarter-1])}
function renderCalendar(){if(!$('#calendar'))return;let [lo,hi]=extent(data.map(d=>d.kelp));$('#calendar').style.gridTemplateColumns=`repeat(${data.length/4},minmax(0,1fr))`;$('#calendar').innerHTML='';for(let q=1;q<=4;q++)data.forEach((d,i)=>{if(d.quarter!==q)return;let b=document.createElement('button');b.className='calcell';b.dataset.i=i;b.style.background=d.kelp===null?'#647579':`hsl(100 30% ${75-48*norm(d.kelp,lo,hi)}%)`;b.title=`${d.year} Q${q}: ${fmt(d.kelp)} m²`;b.setAttribute('aria-label',b.title);b.onclick=()=>select(i);$('#calendar').append(b)})}
const ns='http://www.w3.org/2000/svg';function el(tag,attrs,parent){let e=document.createElementNS(ns,tag);for(let k in attrs)e.setAttribute(k,attrs[k]);parent.append(e);return e}function txt(s,x,y,t,color='#9fb6b7',size=11){let e=el('text',{x,y,fill:color,'font-size':size,'font-family':'system-ui'},s);e.textContent=t;return e}
function series(){let s=$('#series');if(!s)return;s.innerHTML='';['kelp','temp','up'].forEach((k,j)=>{let [lo,hi]=extent(data.map(d=>d[k])),top=15+j*103,H=75;let X=i=>68+i/(data.length-1)*910,Y=v=>top+H-(v-lo)/(hi-lo||1)*H;el('line',{x1:68,x2:978,y1:top+H,y2:top+H,stroke:'#ffffff20'},s);txt(s,0,top+12,j===0?'m²':j===1?'°C':'index');txt(s,0,top+30,Math.round(hi));txt(s,0,top+H,Math.round(lo));let path='',open=false;data.forEach((d,i)=>{if(d[k]===null){open=false;return}path+=(open?'L':'M')+X(i)+','+Y(d[k]);open=true});el('path',{d:path,fill:'none',stroke:['#bdd794','#edac86','#82c8de'][j],'stroke-width':2},s);el('line',{x1:X(idx),x2:X(idx),y1:top,y2:top+H,stroke:'#ffffff90','stroke-dasharray':'3 4'},s);if(data[idx][k]!==null)el('circle',{cx:X(idx),cy:Y(data[idx][k]),r:4,fill:'#f0f6df'},s)});[0,20,40,60,80,100,123].forEach(i=>txt(s,68+i/123*910-12,332,data[i].year));}
on('#series','onclick',e=>{let rect=e.currentTarget.getBoundingClientRect();select(Math.round(Math.max(0,Math.min(1,((e.clientX-rect.left)/rect.width*1000-68)/910))*123))});
function scatter(){let s=$('#scatter');if(!s)return;s.innerHTML='';let key=$('#variable').value,lag=+$('#lag').value,xx=anomalies(key),yy=anomalies('kelp'),pairs=[];for(let i=lag;i<data.length;i++)if(xx[i-lag]!==null&&yy[i]!==null)pairs.push({x:xx[i-lag],y:yy[i],i});let [xmin,xmax]=extent(pairs.map(p=>p.x)),[ymin,ymax]=extent(pairs.map(p=>p.y));let X=x=>65+(x-xmin)/(xmax-xmin||1)*510,Y=y=>305-(y-ymin)/(ymax-ymin||1)*275;for(let j=0;j<5;j++){let y=30+j*68.75;el('line',{x1:65,x2:575,y1:y,y2:y,stroke:'#ffffff16'},s);txt(s,2,y+4,Math.round(ymax-j*(ymax-ymin)/4/1).toLocaleString(),undefined,9);let x=xmin+j*(xmax-xmin)/4;txt(s,X(x)-10,325,x.toFixed(1),undefined,10)}txt(s,65,16,'Kelp area anomaly (m²)');txt(s,130,358,key==='temp'?'Temperature anomaly (°C)':'Upwelling seasonal anomaly (index units)');pairs.forEach(p=>{let c=el('circle',{cx:X(p.x),cy:Y(p.y),r:p.i===idx?6:3.5,fill:p.i===idx?'#fff6c5':`hsl(${160+(p.i/123)*35} 35% 65%)`,opacity:p.i===idx?1:.6,tabindex:0},s);let title=el('title',{},c);title.textContent=`${data[p.i].year} Q${data[p.i].quarter} kelp; environment ${lag} quarter(s) earlier`;c.style.cursor='pointer';c.onclick=()=>select(p.i);c.onkeydown=e=>{if(e.key==='Enter')select(p.i)}});let n=pairs.length,mx=pairs.reduce((a,p)=>a+p.x,0)/(n||1),my=pairs.reduce((a,p)=>a+p.y,0)/(n||1),cov=0,vx=0,vy=0;pairs.forEach(p=>{cov+=(p.x-mx)*(p.y-my);vx+=(p.x-mx)**2;vy+=(p.y-my)**2});let r=cov/Math.sqrt(vx*vy);$('#rval').textContent=Number.isFinite(r)?`r = ${r.toFixed(2)}`:'r unavailable';$('#pairCount').textContent=`${n} paired quarters · ${demo?'synthetic demonstration':'imported data'}`;if(vx&&n>1)el('line',{x1:X(xmin),y1:Y(my+cov/vx*(xmin-mx)),x2:X(xmax),y2:Y(my+cov/vx*(xmax-mx)),stroke:'#e6d8a5','stroke-width':1.5,'stroke-dasharray':'5 5'},s)}
// Observations stay in data; only this presentation state is interpolated.
const TRANSITION_MS=900, PLAY_INTERVAL_MS=1800;
const metricKeys=['kelp','temp','up'];
let visual=null, transition=null;
const mix=(a,b,p)=>p===1?b:a+(b-a)*p;
function sceneTarget(d){return{
  coverage:d.kelp===null?0:norm(d.kelp,0,extent(data.map(v=>v.kelp))[1]),
  warm:($('#tempFx')?.checked??true)&&d.temp!==null?Math.max(-1,Math.min(1,d.temp/2.5)):0,
  current:d.up===null?0:norm(d.up,...extent(data.map(v=>v.up))),
  currentAlpha:($('#upFx')?.checked??true)&&d.up!==null?1:0
}}
function renderMetrics(){
  if(!$('.metrics'))return;
  const d=visual.values;
  $('#kelpVal').textContent=d.kelp===null?'Missing':`${fmt(d.kelp)} m\u00b2`;
  $('#tempVal').textContent=d.temp===null?'Missing':`${d.temp>0?'+':''}${d.temp.toFixed(2)} \u00b0C`;
  $('#upVal').textContent=d.up===null?'Missing':d.up.toFixed(1);
}
function setDates(d,animate){
  return [['#date',`${d.year} \u00b7 Q${d.quarter}`],['#sceneDate',`${seasons[d.quarter-1]} ${d.year}`]].map(([id,label])=>{
    const host=$(id);if(!host)return null;
    host.classList.add('date-fade');
    host.setAttribute('aria-label',label);
    // Interrupt the old fade: keep its most visible label and discard the rest.
    const previous=animate?Array.from(host.children).reduce((best,node)=>
      !best||Number(node.style.opacity)>=Number(best.style.opacity)?node:best,null):null;
    host.replaceChildren(...(previous?[previous]:[]));
    if(previous?.textContent===label){previous.style.opacity=1;return null}
    const outgoing=previous?[{node:previous,opacity:Number(previous.style.opacity)}]:[];
    const node=document.createElement('span');
    node.textContent=label;node.setAttribute('aria-hidden','true');node.style.opacity=animate?'0':'1';host.append(node);
    return {host,node,outgoing};
  }).filter(Boolean);
}
function advanceVisual(now){
  if(!transition)return;
  const tr=transition,p=motionEnabled()?Math.min(1,Math.max(0,(now-tr.start)/TRANSITION_MS)):1;
  const eased=p*p*(3-2*p);
  for(const k of metricKeys){
    // Never count through a gap or fabricate a zero observation.
    const a=tr.from.values[k],b=tr.to.values[k];
    visual.values[k]=a===null||b===null?b:mix(a,b,eased);
  }
  for(const k in tr.to.scene)visual.scene[k]=mix(tr.from.scene[k],tr.to.scene[k],eased);
  tr.dates.forEach(({host,node,outgoing})=>{
    outgoing.forEach(old=>old.node.style.opacity=old.opacity*(1-eased));
    node.style.opacity=eased;
    if(p===1)host.replaceChildren(node);
  });
  renderMetrics();
  if(p===1){transition=null;$('.metrics')?.setAttribute('aria-busy','false')}
}
function retarget(d,now,immediate=false){
  advanceVisual(now);
  const to={values:Object.fromEntries(metricKeys.map(k=>[k,d[k]])),scene:sceneTarget(d)};
  const animate=visual!==null&&!immediate&&motionEnabled();
  const dates=setDates(d,animate);
  if(animate){
    transition={from:structuredClone(visual),to,start:now,dates};
    $('.metrics')?.setAttribute('aria-busy','true');
    advanceVisual(now);
  }else{visual=to;transition=null;renderMetrics();$('.metrics')?.setAttribute('aria-busy','false')}
}
function select(i,immediate=false){
  const now=performance.now();
  idx=Math.max(0,Math.min(data.length-1,i));
  if($('#time'))$('#time').value=idx;
  retarget(data[idx],now,immediate);
  if(playing)lastStep=now;
  document.querySelectorAll('.calcell').forEach(b=>b.classList.toggle('selected',+b.dataset.i===idx));
  series();scatter();
}
on('#motion','onchange',()=>{
  // Keep the last rendered pose; exclude paused time when resuming.
  previousFrame=performance.now();
  if(!motionEnabled())advanceVisual(previousFrame);
});
on('#tempFx','onchange',()=>retarget(data[idx],performance.now()));
on('#upFx','onchange',()=>retarget(data[idx],performance.now()));
on('#time','oninput',e=>select(+e.target.value));
on('#play','onclick',()=>{
  playing=!playing;
  $('#play').textContent=playing?'\u2161 Pause':'\u25b6 Play';
  $('#play').setAttribute('aria-label',playing?'Pause timeline':'Play timeline');
  lastStep=performance.now();
});
on('#variable','onchange',scatter);
on('#lag','onchange',scatter);
const canvas=$('#ocean'),ctx=canvas?.getContext('2d');let w=1,h=1;function resize(){if(!canvas)return;let r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);w=r.width;h=r.height;canvas.width=w*d;canvas.height=h*d;ctx.setTransform(d,0,0,d,0,0)}if(canvas)new ResizeObserver(resize).observe(canvas);const rand=n=>{let x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)};
// Integrate current travel so changing strength cannot teleport the particles.
let motionTime=0,currentTravel=0,previousFrame=null;
function draw(now){if(playing&&now-lastStep>=PLAY_INTERVAL_MS){select((idx+1)%data.length);lastStep=now}advanceVisual(now);if(!ctx){requestAnimationFrame(draw);return}let motion=motionEnabled(),d=data[idx],{warm,coverage,current:strength,currentAlpha}=visual.scene;let elapsed=previousFrame===null?0:Math.min(64,Math.max(0,now-previousFrame));previousFrame=now;if(motion){motionTime+=elapsed*.0006;currentTravel+=elapsed*.0006*(22+strength*55)}let t=motionTime;let g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,`rgb(${33+Math.max(0,warm)*27},${100-Math.max(0,warm)*21},${115-Math.max(0,warm)*53})`);g.addColorStop(.6,'#0b3e49');g.addColorStop(1,'#06262f');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
for(let j=0;j<7;j++){ctx.beginPath();let x=w*(j*.18-.1)+Math.sin(t*.3+j)*18;ctx.moveTo(x,0);ctx.lineTo(x+80,0);ctx.lineTo(x+w*.25,h);ctx.lineTo(x+w*.07,h);ctx.closePath();ctx.fillStyle='rgba(187,223,205,.035)';ctx.fill()}
if(currentAlpha>0){for(let j=0;j<40;j++){let alpha=currentAlpha*Math.max(0,Math.min(1,8+strength*32-j));if(alpha===0)continue;let x=rand(j+30)*w,y=h-((currentTravel+rand(j+200)*h)%(h+30));ctx.beginPath();ctx.moveTo(x,y+18);ctx.quadraticCurveTo(x+Math.sin(t+j)*15,y,x+Math.sin(t+j+1)*10,y-18);ctx.strokeStyle=`rgba(138,216,229,${alpha*(.07+strength*.16)})`;ctx.lineWidth=1;ctx.stroke()}}
ctx.beginPath();ctx.moveTo(0,h);for(let x=0;x<=w+10;x+=10)ctx.lineTo(x,h-25-8*Math.sin(x*.013)-4*Math.cos(x*.039));ctx.lineTo(w,h);ctx.fillStyle='#112e2d';ctx.fill();
for(let j=0;j<90;j++){let alpha=Math.max(0,Math.min(1,(coverage-rand(j+500))*90));if(alpha===0)continue;ctx.save();ctx.globalAlpha=alpha;let x=(j+.5)/90*w,y=h-27-8*Math.sin(x*.013),height=85+rand(j+10)*(h*.58),sway=Math.sin(t+j*.4)*14;let dark=j%3===0;ctx.strokeStyle=dark?'#356549':'#6e9255';ctx.lineWidth=dark?3:2;ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x-10,y-height*.35,x+sway*2,y-height*.7,x+sway,y-height);ctx.stroke();for(let k=1;k<9;k++){let f=k/9,px=x+Math.sin(f*Math.PI)*sway,py=y-f*height,side=k%2?1:-1,len=16+rand(j*9+k)*22;ctx.save();ctx.translate(px,py);ctx.rotate(side*.45+Math.sin(t+j+k)*.12);ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(side*len,-2,side*len,-20,side*len*.75,-29);ctx.bezierCurveTo(side*len*.3,-26,side*len*.1,-10,0,0);ctx.fillStyle=dark?'#366346':`rgba(${105+j%20},${137+j%18},65,.9)`;ctx.fill();ctx.restore()}ctx.restore()}
for(let j=0;j<35;j++){let x=rand(j+900)*w+Math.sin(t+j)*10,y=(rand(j+800)*h-t*5+h*10)%h;ctx.fillStyle='#d7e9d82c';ctx.beginPath();ctx.arc(x,y,rand(j+40)*1.6+.3,0,7);ctx.fill()}if(warm<0){let f=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.25,w/2,h/2,Math.max(w,h)*.7);f.addColorStop(0,'#b1eaff00');f.addColorStop(1,`rgba(169,220,240,${-warm*.22})`);ctx.fillStyle=f;ctx.fillRect(0,0,w,h)}if(d.kelp===null){ctx.fillStyle='#e9edde';ctx.font='14px system-ui';ctx.fillText('No kelp measurement for this quarter',25,h*.55)}requestAnimationFrame(draw)}
function csvRows(text){let rows=[],row=[],field='',quote=false;for(let i=0;i<text.length;i++){let c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){field+='"';i++}else quote=!quote}else if(c===','&&!quote){row.push(field);field=''}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field=''}else field+=c}if(quote)throw Error('Unclosed quoted CSV field.');row.push(field);if(row.some(x=>x.trim()))rows.push(row);return rows}
on('#upload','onchange',async e=>{try{let f=e.target.files[0];if(!f)return;let rows=csvRows(await f.text()),headers=rows.shift().map(s=>s.trim().replace(/^\uFEFF/,'')),keys=['year','quarter','kelp_area_m2','temp_anomaly_c','mean_upwelling_index'];if(keys.some(k=>!headers.includes(k)))throw Error('Required columns: '+keys.join(', '));let map=new Map;rows.forEach((r,j)=>{let vals=keys.map(k=>(r[headers.indexOf(k)]||'').trim()),v=vals.map(x=>x===''?null:Number(x)),[year,quarter,kelp,temp,up]=v;if(!Number.isInteger(year)||year<1995||year>2025||!Number.isInteger(quarter)||quarter<1||quarter>4||v.some(x=>x!==null&&!Number.isFinite(x))||(kelp!==null&&kelp<0))throw Error(`Invalid value in CSV row ${j+2}.`);let key=year+'-'+quarter;if(map.has(key))throw Error(`Duplicate quarter in row ${j+2}.`);map.set(key,{year,quarter,kelp,temp,up})});if(!map.size)throw Error('The file has no data rows.');data=synthetic.map(d=>map.get(d.year+'-'+d.quarter)||{year:d.year,quarter:d.quarter,kelp:null,temp:null,up:null});demo=false;$('#notice').textContent='IMPORTED TEAM DATA · Verify source, baseline, geography, and index units before interpreting results. Animations remain illustrative.';$('#upUnit').textContent='Imported index · confirm source units';$('#loadStatus').textContent=`Loaded ${map.size} quarters; unprovided quarters remain missing. Data stays in this session.`;renderCalendar();select(0,true)}catch(err){$('#loadStatus').textContent=err.message}e.target.value=''});
on('#reset','onclick',()=>{data=synthetic.map(d=>({...d}));demo=true;$('#notice').textContent='ILLUSTRATIVE PROTOTYPE · All values are synthetic demonstration data. These animations and correlations are not research findings.';$('#upUnit').textContent='Synthetic index · arbitrary units';$('#loadStatus').textContent='Showing 124 synthetic quarters.';renderCalendar();select(0,true)});renderCalendar();select(0,true);resize();requestAnimationFrame(draw);
