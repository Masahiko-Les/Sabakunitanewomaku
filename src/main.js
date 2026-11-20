import './style.css';
import { enabled as FB, initUser, saveUser, loadMyWorld, plantSeed, findDeliverable, receiveSeed,
  getUid, watchLetters, watchMyLetter, writeLetter, thankLetter, resetAll, reportSeed, reportLetter } from './firebase.js';
import { startOpening, grandmaLines, arrivalLines } from './opening/opening.js';
import { PLANT_TALK, PLANT_BUTTONS, PLANT_PLACEHOLDERS } from './talk/plant.js';

// 見本の種 8 つを置くか。公開版では置かない（最初は種も花もない）。VITE_USE_SAMPLES=true で試作版と同じく置く
const USE_SAMPLES = import.meta.env.VITE_USE_SAMPLES === 'true';
// 1 日に受け取る種の数の上限
const DAILY_RECEIVE = 3;
// 種と芽が消えるまで（蒔いてから）。花は消えない
const SEED_LIFE = 7 * 24 * 60 * 60 * 1000;
// 届いた種で埋めずに、自分で蒔けるように残しておく緑のマスの数
const KEEP_FREE = 2;
// 配達を見にいく間隔（アプリを開いている間）
const DELIVERY_INTERVAL = 5 * 60 * 1000;

(()=>{
const TILE=48, N=100, WORLD=TILE*N, STORM_GAP=10;
const cv=document.getElementById('c'), ctx=cv.getContext('2d');
const dk=document.createElement('canvas'), dctx=dk.getContext('2d');
const $=s=>document.querySelector(s);
const esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let dpr=1,vw=0,vh=0;
function resize(){dpr=Math.min(window.devicePixelRatio||1,2);vw=innerWidth;vh=innerHeight;cv.width=dk.width=vw*dpr;cv.height=dk.height=vh*dpr;cv.style.width=vw+'px';cv.style.height=vh+'px'}
addEventListener('resize',resize);resize();
// オープニング（初回のみ。INTEGRATION.md）。見たかどうかがわかるまで、地図を黒い幕で覆っておく。?opening=1 で強制表示
const OPEN_KEY='sabaku.openingSeen',INTEREST_KEY='sabaku.interest';
const forceOpening=new URLSearchParams(location.search).get('opening')==='1';
if(forceOpening)try{history.replaceState(null,'',location.pathname)}catch(e){}
let openingEl=null;
try{if(forceOpening||localStorage.getItem(OPEN_KEY)!=='1'){openingEl=document.createElement('div');openingEl.id='opening';document.body.appendChild(openingEl)}}catch(e){}

/* ---------- noise ---------- */
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function hash(x,y){let h=(x*374761393+y*668265263)|0;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296}
function vnoise(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,s=t=>t*t*(3-2*t);
 const a=hash(xi,yi),b=hash(xi+1,yi),c=hash(xi,yi+1),d=hash(xi+1,yi+1),u=s(xf),v=s(yf);
 return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/* ---------- the village ---------- */
const VC={x:50*TILE,y:49.6*TILE};
const VILLAGES=[{id:'hajimari',name:'はじまりの村',x:VC.x/TILE,y:VC.y/TILE,core:2.0,r:2.3}];
const HOUSE={x:VC.x,y:VC.y-40};
const FIRE={x:VC.x,y:VC.y+12};
const TREES=[];
const GRAN={x:VC.x-50,y:VC.y+10};
const BUSHES=[[-112,-55,1],[85,-25,.9],[-40,92,.8],[72,88,1],[-98,-22,.85]].map(([dx,dy,s])=>({x:VC.x+dx,y:VC.y+dy,s}));
const inVillage=(tx,ty)=>VILLAGES.some(v=>Math.hypot(tx+.5-v.x,ty+.5-v.y)<=v.core);
// 家と茂みの絵に重なるマスには、種を置かない
const onDrawing=(tx,ty)=>{const cx=(tx+.5)*TILE,cy=(ty+.5)*TILE;
 return (Math.abs(cx-HOUSE.x)<1.3*TILE&&cy>HOUSE.y-2.8*TILE&&cy<HOUSE.y+.4*TILE)||BUSHES.some(b=>Math.hypot(cx-b.x,cy-b.y)<.6*TILE)};

/* ---------- sand texture ---------- */
const SR=220, sand=document.createElement('canvas');sand.width=sand.height=SR;
{const g=sand.getContext('2d'),img=g.createImageData(SR,SR);
 const L=[246,230,196],D=[226,190,140];
 for(let y=0;y<SR;y++)for(let x=0;x<SR;x++){
  let n=.6*vnoise(x/30,y/26)+.3*vnoise(x/10+50,y/9)+.1*vnoise(x/3,y/3+20);
  n=clamp((n-.25)*1.6,0,1);
  const i=(y*SR+x)*4;for(let k=0;k<3;k++)img.data[i+k]=L[k]+(D[k]-L[k])*n;img.data[i+3]=255}
 g.putImageData(img,0,0)}

/* ---------- samples & decorations ---------- */
const SAMPLES=[
 [-4,-1,'人と話すとき、言葉が詰まってしまう。\n電話がとくに怖い。','最初のひと言を「あの」で始めると、少し楽になると気づいた。\nうまく話せなかった日も、電話をかけた自分をほめることにしている。',3,false],
 [3,-2,'朝、布団から出られない日が続いている。','起きられた日は、カーテンを開けるだけでいいことにした。\nできない日があっても、明日の自分にまかせている。',1,false],
 [-3,2,'職場で、自分だけ浮いている気がする。','無理に輪に入ろうとするのをやめて、ひとりの昼休みを散歩の時間にした。\n季節の変化に気づけるようになった。',0,true],
 [2,2,'家族の介護で、自分の時間がほとんどない。','週に一度だけ、コンビニの新しいお菓子を買う。\n小さなごほうびを自分に許すことから始めている。',0,false],
 [0,3,'人に頼るのが苦手で、全部ひとりで抱えてしまう。','「手伝って」と言う練習を、小さなことから。\n先週、同僚にコピーを頼めた。',2,false],
 [-1,-4,'眠れない夜に、昔の失敗ばかり思い出す。','思い出したことをノートに書いて閉じるようにしている。\n書くと、少しだけ頭の外に置いておける。',0,false],
 [-4,-3,'自分には何の取り柄もないと思ってしまう。','今日できたことを3つ書く習慣を始めた。\n「水を飲んだ」でもいいことにしている。',0,true],
 [3,0,'人混みにいると、息が苦しくなる。','空いている時間を選んで出かけるようにした。\n逃げ道を用意しておくと、少し安心できる。',1,false]];
const decor=new Uint8Array(N*N), decoList=[];
{const r=mulberry(7),skip=new Set(SAMPLES.map(([dx,dy])=>(50+dy)*N+50+dx));
 for(let i=0;i<460;i++){const x=Math.floor(r()*N),y=Math.floor(r()*N),p=r(),s=.8+r()*.5,o=r();
  if(Math.hypot(x+.5-VC.x/TILE,y+.5-VC.y/TILE)<6.5)continue;if(decor[y*N+x]||skip.has(y*N+x))continue;
  const type=p<.42?1:p<.82?2:3;decor[y*N+x]=type;decoList.push({x,y,type,s,o})}}

/* ---------- state ---------- */
const KEY='sabaku-ni-tane-v3';
let S={seeds:[],init:false,introSeen:false};
let ready=false; // users/{uid} を読み終えるまで操作を受け付けない
const MUTED={}; // 知らせた手紙（users/{uid}.muted、'種ID_書いた人' → true）。自分の画面には出さない
const DUMMIES={}; // おばあちゃんの種が咲いたあとに蒔かれる 3 つの種の場所（users/{uid}.dummies、's0'〜's7' → {x,y}）
const SEEN={}; // 種ごとに、最後に見たできごとの時刻（users/{uid}.seen）
const FLOWERS=[{p:'#f29bb0',c:'#f7d36b',n:5,g:'255,150,180'},{p:'#f7c948',c:'#c97b2b',n:8,g:'255,210,90'},{p:'#ffffff',c:'#f2c14e',n:6,g:'255,250,235'},{p:'#b79be8',c:'#f5e08a',n:5,g:'190,160,255'},{p:'#f59a7a',c:'#fff1c1',n:6,g:'255,170,130'}];
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
function load(){try{localStorage.removeItem('sabaku-ni-tane-v1');localStorage.removeItem('sabaku-ni-tane-v2');const r=localStorage.getItem(KEY);if(r)S=JSON.parse(r)}catch(e){}
 if(!S.init){S.seeds=sampleSeeds();S.init=true;save()}}
function sampleSeeds(){if(USE_SAMPLES)return SAMPLES.map(([dx,dy,h,f,bloom,sprout],i)=>({id:'s'+i,x:50+dx,y:50+dy,mine:false,h,f,t:Date.now()-86400000*(i+1),flower:i%5,letters:[],bloom,sprout,sample:true}));
 // おばあちゃんの種が咲いたあとに蒔かれる、見本の文章から選んだ 3 つの種（users/{uid}.dummies に場所を保存）
 return Object.entries(DUMMIES).map(([id,{x,y}])=>{const i=+id.slice(1),[,,h,f]=SAMPLES[i];return{id,x,y,mine:false,h,f,t:Date.now(),flower:i%5,letters:[],bloom:0,sprout:false,sample:true}})}
load();
const thanksOf=s=>(s.bloom||0)+s.letters.filter(l=>l.thanked).length;
const stageOf=s=>thanksOf(s)>0?'flower':(s.letters.length||s.sprout)?'sprout':'seed';
const myLetter=s=>s.letters.find(l=>l.from==='me');
// 種と芽は、蒔いてから 1 週間で消える（花は消えない）。手紙を読み込む前は、花かどうかわからないので見せない
const expired=s=>!s.granny&&!s.sample&&Date.now()-s.t>SEED_LIFE;
const shown=s=>!expired(s)||(s.loaded&&stageOf(s)==='flower');
const hasNew=()=>S.seeds.some(s=>s.unread);
const seedOn=(tx,ty)=>S.seeds.find(s=>s.x===tx&&s.y===ty);

/* ---------- greenery & storm ---------- */
const green=new Float32Array(N*N), storm=new Float32Array(N*N);
const greenC=document.createElement('canvas'), stormC=document.createElement('canvas');greenC.width=greenC.height=stormC.width=stormC.height=N;
function rebuildWorld(){
 const gt=[];
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){let g=0;
  for(const v of VILLAGES){const d=Math.hypot(x+.5-v.x,y+.5-v.y);g=Math.max(g,1-(d-v.r)/1.2)}
  green[y*N+x]=clamp(g,0,1)}
 for(const s of S.seeds){if(s.hidden||thanksOf(s)<1)continue;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=s.x+dx,y=s.y+dy;if(x>=0&&y>=0&&x<N&&y<N)green[y*N+x]=1}}
 for(let i=0;i<N*N;i++)if(green[i]>=.5)gt.push(i%N,Math.floor(i/N));
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){let m=1e9;
  for(let i=0;i<gt.length;i+=2){const dx=x-gt[i],dy=y-gt[i+1];const d=dx*dx+dy*dy;if(d<m)m=d}
  storm[y*N+x]=clamp((Math.sqrt(m)-STORM_GAP)/1.5,0,1)}
 const gi=greenC.getContext('2d'),gimg=gi.createImageData(N,N),si=stormC.getContext('2d'),simg=si.createImageData(N,N);
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x,n=vnoise(x/3.5,y/3.5);
  gimg.data[i*4]=146-38*n;gimg.data[i*4+1]=190-26*n;gimg.data[i*4+2]=104-14*n;gimg.data[i*4+3]=green[i]*240;
  simg.data[i*4]=200;simg.data[i*4+1]=164;simg.data[i*4+2]=118;simg.data[i*4+3]=storm[i]*215}
 gi.putImageData(gimg,0,0);si.putImageData(simg,0,0)}
const GRANNY_SEED={h:'年をとって、できないことが、少しずつ増えてきた。',f:'できなくなったことより、できることを数えるようにしている。\n毎晩この焚き火に薪をくべるのが、いまのわたしの仕事さ。\nそれから、ここに来た人の話を聴くこと。それも、まだできる。'};
function ensureGranny(){if(!S.tutorial)S.tutorial=0;let g=S.seeds.find(s=>s.granny);if(g&&g.id==='granny')g.id='granny-seed';
 if(!g){let pos=[47,50];for(const p of [[47,50],[47,51],[46,50],[46,51],[46,48]]){if(!seedOn(p[0],p[1])&&!inVillage(p[0],p[1])){pos=p;break}}
  g={id:'granny-seed',granny:true,x:pos[0],y:pos[1],mine:false,h:GRANNY_SEED.h,f:GRANNY_SEED.f,t:Date.now(),flower:0,letters:[],bloom:0,sprout:false};S.seeds.push(g)}
 if(S.tutorial===2){const l=myLetter(g);if(l&&!l.thanked){l.thanked=true;l.thankedAt=Date.now()}}
 save()}
ensureGranny();
rebuildWorld();
const tileOf=(wx,wy)=>[Math.floor(wx/TILE),Math.floor(wy/TILE)];
function stormAt(wx,wy){const[tx,ty]=tileOf(wx,wy);if(tx<0||ty<0||tx>=N||ty>=N)return 1;return storm[ty*N+tx]}

/* ---------- player / camera ---------- */
const P={x:VC.x+30,y:VC.y+85,face:1};
const cam={x:clamp(P.x-vw/2,0,WORLD-vw),y:clamp(P.y-vh*.45,0,WORLD-vh)};
let target=null,pendingOpen=null,moving=false,lastStep={x:P.x,y:P.y},tapFx=null,lastStormMsg=0;
const prints=[],sparks=[],keys={};
const dust=Array.from({length:150},()=>({x:Math.random()*1400-200,y:Math.random()*1000-100,v:180+Math.random()*220,len:8+Math.random()*22}));
const flies=Array.from({length:16},(_, i)=>({a:Math.random()*6.28,r:40+Math.random()*150,s:.2+Math.random()*.4,ph:Math.random()*6.28}));
addEventListener('keydown',e=>{if(sheetOpen||!ready)return;const k=e.key;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(k)){keys[k]=1;e.preventDefault()}});
addEventListener('keyup',e=>{keys[e.key]=0});

function solid(wx,wy){const[tx,ty]=tileOf(wx,wy);
 if(tx<0||ty<0||tx>=N||ty>=N)return 'edge';
 if(storm[ty*N+tx]>.5)return 'storm';
 if(wx>HOUSE.x-44&&wx<HOUSE.x+44&&wy>HOUSE.y-56&&wy<HOUSE.y+4)return 'obj';
 if(Math.hypot(wx-FIRE.x,(wy-FIRE.y)*1.6)<24)return 'obj';
 if(Math.hypot(wx-GRAN.x,(wy-GRAN.y-6)*1.6)<14)return 'obj';
 for(const t of TREES)if(Math.hypot(wx-t.x,(wy-t.y)*1.6)<12)return 'obj';
 return false}
function stormMsg(){const n=performance.now();if(n-lastStormMsg>4500){lastStormMsg=n;toast('砂嵐が強くて、この先へは進めない')}}

cv.addEventListener('pointerdown',e=>{if(sheetOpen||!ready)return;
 const wx=e.clientX+cam.x,wy=e.clientY+cam.y;tapFx={x:wx,y:wy,t:performance.now()};
 if(Math.hypot(wx-GRAN.x,wy-GRAN.y+8)<26){if(Math.hypot(P.x-GRAN.x,P.y-GRAN.y)<120)openGranny();else{target={x:GRAN.x-6,y:GRAN.y+42};pendingOpen='granny'}return}
 if(Math.hypot(wx-FIRE.x,wy-FIRE.y+8)<26&&Math.hypot(P.x-FIRE.x,P.y-FIRE.y)<130){toast('焚き火が、静かに燃えている');return}
 const[tx,ty]=tileOf(wx,wy),s0=seedOn(tx,ty),s=s0&&shown(s0)?s0:null;
 if(s){const cx=(tx+.5)*TILE,cy=(ty+.5)*TILE;
  if(Math.hypot(P.x-cx,P.y+10-cy)<TILE*1.6){openSeed(s);target=null;pendingOpen=null}
  else{target={x:cx+(P.x<cx?-TILE:TILE),y:cy-10};pendingOpen=s.id}}
 else{target={x:(tx+.5)*TILE,y:(ty+.5)*TILE-10};pendingOpen=null}});

let plantInfo=null,plantLabel='';
function plantState(){const tx=Math.floor(P.x/TILE),ty=Math.floor((P.y+10)/TILE);
 if((S.tutorial||0)<3)return{ok:false,label:['おばあちゃんと話そう','おばあちゃんの種に水やり','おばあちゃんの話を聞こう'][S.tutorial||0]};
 if(inVillage(tx,ty))return{ok:false,label:'村のまわりの緑に蒔けます'};
 if(seedOn(tx,ty))return{ok:false,label:'このマスには種があります'};
 if(green[ty*N+tx]<.5)return{ok:false,label:'緑の上にだけ蒔けます'};
 if(decor[ty*N+tx]||onDrawing(tx,ty))return{ok:false,label:'ここには蒔けません'};
 return{ok:true,label:'ここに種を蒔く',tx,ty}}

function update(dt,now){
 let vx=0,vy=0;moving=false;
 if(!sheetOpen){if(keys.ArrowLeft||keys.a)vx--;if(keys.ArrowRight||keys.d)vx++;if(keys.ArrowUp||keys.w)vy--;if(keys.ArrowDown||keys.s)vy++}
 const sp=175;let mx=0,my=0;
 if(vx||vy){target=null;pendingOpen=null;const l=Math.hypot(vx,vy);mx=vx/l*sp*dt;my=vy/l*sp*dt}
 else if(target&&!sheetOpen){const dx=target.x-P.x,dy=target.y-P.y,d=Math.hypot(dx,dy);
  if(d<2.5){P.x=target.x;P.y=target.y;target=null;if(pendingOpen==='granny'){pendingOpen=null;openGranny()}else if(pendingOpen){const s=S.seeds.find(z=>z.id===pendingOpen);pendingOpen=null;if(s)openSeed(s)}}
  else{const st=Math.min(d,sp*dt);mx=dx/d*st;my=dy/d*st}}
 if(mx||my){let hit=null;
  const b1=solid(P.x+mx,P.y+10);if(!b1)P.x+=mx;else hit=b1;
  const b2=solid(P.x,P.y+my+10);if(!b2)P.y+=my;else hit=hit||b2;
  if(Math.abs(mx)>.01)P.face=mx<0?-1:1;
  moving=!(b1&&b2);
  if(hit==='storm')stormMsg();
  if(hit&&target&&(b1&&b2||hit==='storm')){target=null;pendingOpen=null}}
 if(Math.hypot(P.x-lastStep.x,P.y-lastStep.y)>16){prints.push({x:P.x,y:P.y+11,t:now,side:prints.length%2});lastStep={x:P.x,y:P.y};if(prints.length>60)prints.shift()}
 const tx=clamp(P.x-vw/2,0,WORLD-vw),ty=clamp(P.y-vh*.45,0,WORLD-vh),k=Math.min(1,dt*5);cam.x+=(tx-cam.x)*k;cam.y+=(ty-cam.y)*k;
 if(Math.random()<dt*14)sparks.push({x:FIRE.x+(Math.random()-.5)*10,y:FIRE.y-12,vx:(Math.random()-.5)*14,vy:-30-Math.random()*40,t:0,life:.9+Math.random()*.9});
 for(const p of sparks){p.t+=dt;p.x+=p.vx*dt+Math.sin(p.t*6)*.3;p.y+=p.vy*dt}
 while(sparks.length&&sparks[0].t>sparks[0].life)sparks.shift();
 for(const p of dust){p.x+=p.v*dt;p.y+=p.v*.28*dt;if(p.x>vw+60||p.y>vh+60){p.x=-60+Math.random()*(vw*.6);p.y=Math.random()*vh-120}}
 night+=((skyNight()?1:0)-night)*Math.min(1,dt*1.4);
 document.body.classList.toggle('night',night>.5);$('#vig').style.opacity=1-night;
 plantInfo=plantState();if(plantInfo.label!==plantLabel){plantLabel=plantInfo.label;const b=$('#btnPlant');b.textContent=plantLabel;b.disabled=!plantInfo.ok}}

/* ---------- sky ---------- */
// 昼と夜：設定で「時刻に合わせる／昼／夜」を選ぶ（このブラウザに覚えておく）
const SKY_KEY='sabaku-sky';
let sessionNight=false; // オープニングの着地から、この画面を開いている間だけ夜にする（保存しない）
let night=0,skyOverride=(()=>{try{const v=localStorage.getItem(SKY_KEY);return v==='night'?true:v==='day'?false:null}catch(e){return null}})();
const autoNight=()=>{const h=new Date().getHours();return h>=18||h<6};
const skyNight=()=>sessionNight||(skyOverride===null?autoNight():skyOverride);
const skyMode=()=>skyOverride===null?'auto':skyOverride?'night':'day';
function setSky(m){sessionNight=false;skyOverride=m==='auto'?null:m==='night';try{localStorage.setItem(SKY_KEY,m)}catch(e){}}
night=skyNight()?1:0;

/* ---------- drawing ---------- */
function ell(x,y,rx,ry,c){ctx.fillStyle=c;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill()}
function drawDecor(d){const x=d.x*TILE+TILE/2+(d.o-.5)*12,y=d.y*TILE+TILE/2,s=d.s;
 if(d.type===1){ell(x+2,y+5*s,13*s,4*s,'rgba(140,100,60,.16)');ell(x,y,12*s,8*s,'#c8ad8a');ell(x-3*s,y-2.5*s,6*s,3*s,'#dcc6a6')}
 else if(d.type===2){ctx.strokeStyle='#bba56c';ctx.lineWidth=1.4;ctx.lineCap='round';ctx.beginPath();
  for(let i=-2;i<=2;i++){ctx.moveTo(x+i*2,y+4);ctx.quadraticCurveTo(x+i*3,y-4,x+i*5,y-9*s+Math.abs(i))}ctx.stroke()}
 else{ell(x+3,y+13*s,12*s,4*s,'rgba(110,90,50,.18)');ctx.fillStyle='#86a77e';
  const rr=(a,b,w,h)=>{ctx.beginPath();ctx.roundRect(a,b,w,h,w/2);ctx.fill()};
  rr(x-5*s,y-18*s,10*s,32*s);rr(x-14*s,y-8*s,7*s,14*s);rr(x+7*s,y-13*s,7*s,12*s);ctx.fillRect(x-10*s,y,6*s,4*s);ctx.fillRect(x+4*s,y-4*s,5*s,4*s);
  ctx.fillStyle='rgba(255,255,255,.18)';rr(x-3*s,y-16*s,3*s,24*s)}}
function drawFlower(x,y,type,sc,t){const F=FLOWERS[type%5],sw=Math.sin(t/900+x*.05)*1.6*sc;
 ctx.save();ctx.translate(x,y);ctx.scale(sc,sc);
 ctx.strokeStyle='#6f9a5e';ctx.lineWidth=1.8;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,10);ctx.quadraticCurveTo(1,4,sw,-2);ctx.stroke();
 ctx.fillStyle='#7fae6b';ctx.beginPath();ctx.ellipse(-3,6,4,1.8,-.6,0,Math.PI*2);ctx.fill();
 ctx.translate(sw,-3);ctx.fillStyle=F.p;
 for(let i=0;i<F.n;i++){ctx.save();ctx.rotate(i/F.n*Math.PI*2+t/6000);ctx.beginPath();ctx.ellipse(0,-4.6,2.8,4.6,0,0,Math.PI*2);ctx.fill();ctx.restore()}
 ctx.fillStyle=F.c;ctx.beginPath();ctx.arc(0,0,2.6,0,Math.PI*2);ctx.fill();ctx.restore()}
const OFFS=[[0,-3]];
function bloomScale(s,i,n){if(i===n-1&&s.bloomAt){const k=clamp((Date.now()-s.bloomAt)/1400,0,1);return 1-Math.pow(1-k,3)}return 1}
function drawSeed(s,t){const x=s.x*TILE+TILE/2,y=s.y*TILE+TILE/2,st=stageOf(s);
 if((s.mine&&s.unread)||(s.granny&&(S.tutorial||0)===1)){const a=.25+.15*Math.sin(t/400);const g=ctx.createRadialGradient(x,y,2,x,y,26);g.addColorStop(0,`rgba(255,240,200,${a})`);g.addColorStop(1,'rgba(255,240,200,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,26,0,Math.PI*2);ctx.fill()}
 if(st!=='flower'){ell(x,y+4,13,5.5,'#d8b07c');ell(x,y+3,11,4,'#e2bf8c')}
 if(s.mine){ctx.setLineDash([2,4]);ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(x,y+4,17,7.5,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([])}
 if(st==='seed'){if(s.plantedAt&&t<s.plantedAt)return;const g=s.plantedAt?clamp((t-s.plantedAt)/250,0,1):1;ell(x,y+2-(1-g)*2,3.2,2.3,'#8a6440');
  // ② まで書かれた種には、小さな葉を 1 枚だけ（控えめに）
  if(s.f){ctx.fillStyle='rgba(134,184,116,.9)';ctx.beginPath();ctx.ellipse(x+4.2,y-.6,2.6,1.2,-.6,0,Math.PI*2);ctx.fill()}}
 else if(st==='sprout'){const sw=Math.sin(t/800+x)*1.2;ctx.strokeStyle='#6f9a5e';ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(x,y+3);ctx.lineTo(x+sw,y-6);ctx.stroke();
  ctx.fillStyle='#86b874';ctx.beginPath();ctx.ellipse(x+sw-4,y-7,4.5,2.2,.5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(x+sw+4,y-8,4.5,2.2,-.5,0,Math.PI*2);ctx.fill()}
 else{const n=Math.min(OFFS.length,thanksOf(s));for(let i=0;i<n;i++)drawFlower(x+OFFS[i][0],y+OFFS[i][1],s.flower+i*2,bloomScale(s,i,n),t)}}
function drawPlayer(t){const bob=moving?Math.sin(t/85)*1.4:0,k=moving?Math.sin(t/85):0,x=P.x,y=P.y,f=P.face,H='#4a3a2e',SK='#f4d6b6';
 ell(x,y+12,9,3.4,'rgba(120,80,40,.22)');
 ctx.fillStyle=SK;ctx.fillRect(x-3.4,y+4,2,6-Math.max(0,k)*1.6);ctx.fillRect(x+1.4,y+4,2,6-Math.max(0,-k)*1.6);
 ell(x-2.4,y+10.4-Math.max(0,k)*1.6,2.3,1.4,'#6b4a36');ell(x+2.4,y+10.4-Math.max(0,-k)*1.6,2.3,1.4,'#6b4a36');
 ctx.fillStyle='#d4604f';ctx.beginPath();ctx.moveTo(x-8,y+6);ctx.lineTo(x-4,y-6+bob);ctx.lineTo(x+4,y-6+bob);ctx.lineTo(x+8,y+6);ctx.quadraticCurveTo(x,y+7.5,x-8,y+6);ctx.closePath();ctx.fill();
 ctx.fillStyle=H;ctx.beginPath();ctx.roundRect(x-7.2-f*.5,y-20+bob,14.4,12.5,[7,7,1.5,1.5]);ctx.fill();
 ell(x+f*1.3,y-12.2+bob,4.9,5,SK);
 ctx.fillStyle=H;ctx.beginPath();ctx.roundRect(x-7.2-f*.5,y-20+bob,14.4,5.6,[7,7,0,0]);ctx.fill();
 ell(x+f*3.2,y-11.6+bob,.9,1.1,'#3e3026')}
function drawHouse(){const x=HOUSE.x,y=HOUSE.y;
 ell(x+6,y+4,54,11,'rgba(60,80,40,.22)');
 ctx.fillStyle='#efe0c4';ctx.fillRect(x-40,y-46,80,48);ctx.fillStyle='rgba(120,90,60,.10)';ctx.fillRect(x+18,y-46,22,48);
 ctx.fillStyle='#a7623f';ctx.fillRect(x+22,y-92,10,22);
 ctx.fillStyle='#c9714f';ctx.beginPath();ctx.moveTo(x-50,y-40);ctx.lineTo(x-38,y-84);ctx.lineTo(x+38,y-84);ctx.lineTo(x+50,y-40);ctx.closePath();ctx.fill();
 ctx.fillStyle='rgba(255,255,255,.12)';ctx.beginPath();ctx.moveTo(x-38,y-84);ctx.lineTo(x+38,y-84);ctx.lineTo(x+41,y-74);ctx.lineTo(x-41,y-74);ctx.fill();
 ctx.fillStyle='#a95a3d';ctx.fillRect(x-50,y-42,100,4);
 ctx.fillStyle='#8a5a3c';ctx.beginPath();ctx.roundRect(x-9,y-28,18,30,[9,9,0,0]);ctx.fill();ell(x+4,y-13,1.3,1.3,'#e9c48a');
 ctx.fillStyle='#9cc3d5';ctx.beginPath();ctx.roundRect(x-31,y-30,14,12,2);ctx.fill();ctx.beginPath();ctx.roundRect(x+17,y-30,14,12,2);ctx.fill();
 ctx.strokeStyle='#efe0c4';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x-24,y-30);ctx.lineTo(x-24,y-18);ctx.moveTo(x+24,y-30);ctx.lineTo(x+24,y-18);ctx.stroke()}
function drawTree(tr,t){const x=tr.x,y=tr.y,s=tr.s,sw=Math.sin(t/1400+x)*1.2;
 ell(x+5,y+3,22*s,7*s,'rgba(50,80,40,.22)');ctx.fillStyle='#8a6446';ctx.fillRect(x-3*s,y-16*s,6*s,18*s);
 ell(x+sw,y-28*s,20*s,17*s,'#6a9f58');ell(x-8*s+sw,y-33*s,13*s,11*s,'#7fb069');ell(x+7*s+sw,y-36*s,11*s,9*s,'#8fbe76');ell(x-3*s+sw,y-40*s,6*s,4*s,'rgba(255,255,255,.14)')}
function drawBush(b){const x=b.x,y=b.y,s=b.s;ell(x+3,y+3,15*s,5*s,'rgba(50,80,40,.18)');ell(x-6*s,y-3*s,9*s,7*s,'#6f9f5b');ell(x+6*s,y-3*s,9*s,7*s,'#78a862');ell(x,y-8*s,9*s,7*s,'#86b66d');
 ell(x-4*s,y-9*s,1.8,1.8,'#f6e7a8');ell(x+5*s,y-5*s,1.8,1.8,'#fff')}
function drawFireBase(){const x=FIRE.x,y=FIRE.y;
 ell(x,y+4,22,8,'rgba(60,50,40,.25)');
 for(let i=0;i<9;i++){const a=i/9*Math.PI*2;ell(x+Math.cos(a)*17,y+Math.sin(a)*7,4.5,3.3,i%2?'#a59a8c':'#b9ae9f')}
 ctx.save();ctx.translate(x,y);ctx.fillStyle='#7a5236';ctx.rotate(.45);ctx.beginPath();ctx.roundRect(-13,-3,26,6,3);ctx.fill();ctx.rotate(-.9);ctx.fillStyle='#8a5e3e';ctx.beginPath();ctx.roundRect(-13,-3,26,6,3);ctx.fill();ctx.restore()}
function flame(x,y,w,h,col){ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(x,y-h);ctx.bezierCurveTo(x+w*.9,y-h*.45,x+w,y,x,y);ctx.bezierCurveTo(x-w,y,x-w*.9,y-h*.45,x,y-h);ctx.fill()}
function drawFlames(t){const x=FIRE.x,y=FIRE.y+1,f1=Math.sin(t/90)*2+Math.sin(t/37)*1.5;
 flame(x+Math.sin(t/120)*1.5,y,11,27+f1,'#ff7a32');flame(x-4,y,7,18+Math.sin(t/70)*2,'#ff9f43');flame(x+4,y,7,20+Math.cos(t/80)*2,'#ff9f43');
 flame(x,y,6,15+Math.sin(t/55)*2,'#ffd166');flame(x,y,3,8+Math.sin(t/45),'#fff3c4');
 for(const p of sparks){const a=1-p.t/p.life;ell(p.x,p.y,1.3,1.3,`rgba(255,${180+60*a|0},90,${a})`)}}
function drawGrass(t){const x0=Math.max(0,Math.floor(cam.x/TILE)),x1=Math.min(N-1,Math.floor((cam.x+vw)/TILE)),y0=Math.max(0,Math.floor(cam.y/TILE)),y1=Math.min(N-1,Math.floor((cam.y+vh)/TILE));
 ctx.lineWidth=1.3;ctx.lineCap='round';
 for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++){const g=green[ty*N+tx];if(g<.55)continue;
  ctx.strokeStyle=`rgba(88,138,70,${.75*g})`;ctx.beginPath();
  for(let k=0;k<3;k++){const h=hash(tx*3+k,ty*5);const gx=tx*TILE+6+hash(tx+k*17,ty)*36,gy=ty*TILE+8+h*34,sw=Math.sin(t/1100+gx*.04)*1.2;
   for(let i=-1;i<=1;i++){ctx.moveTo(gx+i*2,gy);ctx.quadraticCurveTo(gx+i*2.5,gy-3,gx+i*4+sw,gy-7+Math.abs(i))}}
  ctx.stroke()}}
function hole(c,x,y,r,a){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(0,0,0,${a})`);g.addColorStop(.5,`rgba(0,0,0,${a*.7})`);g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill()}
function glow(x,y,r,rgb,a){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(${rgb},${a})`);g.addColorStop(1,`rgba(${rgb},0)`);ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}

function draw(t){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.drawImage(sand,cam.x/WORLD*SR,cam.y/WORLD*SR,vw/WORLD*SR,vh/WORLD*SR,0,0,vw,vh);
 ctx.save();ctx.translate(-cam.x,-cam.y);
 ctx.strokeStyle='rgba(170,125,70,.12)';ctx.lineWidth=1.3;
 const x0=Math.floor(cam.x/20)*20-20,x1=cam.x+vw+20;
 for(let ry=Math.floor(cam.y/30)*30-30;ry<cam.y+vh+30;ry+=30){const row=ry/30;ctx.beginPath();
  for(let x=x0;x<x1;x+=20){const yy=ry+Math.sin(x*.016+row*1.7)*7+vnoise(x/260,row*.7)*18;x===x0?ctx.moveTo(x,yy):ctx.lineTo(x,yy)}ctx.stroke()}
 ctx.restore();
 ctx.drawImage(greenC,cam.x/TILE,cam.y/TILE,vw/TILE,vh/TILE,0,0,vw,vh);
 ctx.save();ctx.translate(-cam.x,-cam.y);
 drawGrass(t);
 const now=performance.now();
 for(const p of prints){const a=1-(now-p.t)/7000;if(a<=0)continue;ell(p.x+(p.side?3:-3),p.y,2.2,1.4,`rgba(120,90,55,${.25*a})`)}
 if(tapFx){const a=1-(now-tapFx.t)/600;if(a>0){ctx.strokeStyle=`rgba(255,255,255,${.7*a})`;ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(tapFx.x,tapFx.y,8+(1-a)*10,4+(1-a)*5,0,0,Math.PI*2);ctx.stroke()}else tapFx=null}
 const vis=(x,y)=>x>cam.x-80&&x<cam.x+vw+80&&y>cam.y-80&&y<cam.y+vh+120;
 const items=[];
 for(const d of decoList){const x=d.x*TILE+TILE/2,y=d.y*TILE+TILE/2;if(vis(x,y))items.push([y,()=>drawDecor(d)])}
 for(const s of S.seeds){if(!shown(s))continue;const x=s.x*TILE+TILE/2,y=s.y*TILE+TILE/2;if(vis(x,y))items.push([y+4,()=>drawSeed(s,t)])}
 if(vis(HOUSE.x,HOUSE.y)){items.push([HOUSE.y,drawHouse]);items.push([FIRE.y,drawFireBase]);items.push([GRAN.y+8,()=>drawGranny(t)])}
 for(const tr of TREES)if(vis(tr.x,tr.y))items.push([tr.y,()=>drawTree(tr,t)]);
 for(const b of BUSHES)if(vis(b.x,b.y))items.push([b.y,()=>drawBush(b)]);
 items.push([P.y+10,()=>drawPlayer(t)]);
 items.sort((a,b)=>a[0]-b[0]).forEach(i=>i[1]());
 ctx.restore();
 ctx.drawImage(stormC,cam.x/TILE,cam.y/TILE,vw/TILE,vh/TILE,0,0,vw,vh);
 ctx.globalAlpha=.55;ctx.drawImage(stormC,cam.x/TILE+Math.sin(t/700)*.35,cam.y/TILE+Math.cos(t/900)*.25,vw/TILE,vh/TILE,0,0,vw,vh);ctx.globalAlpha=1;
 ctx.lineWidth=1.2;ctx.lineCap='round';
 for(const p of dust){const st=stormAt(p.x+cam.x,p.y+cam.y);if(st<.15)continue;ctx.strokeStyle=`rgba(255,244,225,${.5*st})`;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.len,p.y-p.len*.28);ctx.stroke()}
 const flick=1+.025*Math.sin(t/1100)+.015*Math.sin(t/430);
 if(night>.01){
  dctx.setTransform(dpr,0,0,dpr,0,0);dctx.globalCompositeOperation='source-over';dctx.clearRect(0,0,vw,vh);
  dctx.fillStyle=`rgba(5,7,22,${.93*night})`;dctx.fillRect(0,0,vw,vh);
  dctx.globalCompositeOperation='destination-out';
  // 緑地は夜でもわずかに明るく（花が咲いて緑が広がったのが、暗闇でも分かるように）
  dctx.globalAlpha=.3;dctx.drawImage(greenC,cam.x/TILE,cam.y/TILE,vw/TILE,vh/TILE,0,0,vw,vh);dctx.globalAlpha=1;
  dctx.translate(-cam.x,-cam.y);
  hole(dctx,FIRE.x,FIRE.y-6,175*flick,.95);
  for(const s of S.seeds){if(stageOf(s)!=='flower')continue;const x=s.x*TILE+TILE/2,y=s.y*TILE+TILE/2;if(!vis(x,y))continue;hole(dctx,x,y-2,36,.9)}
  hole(dctx,P.x,P.y,62,.4);
  ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(dk,0,0);ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.08*night;ctx.drawImage(greenC,cam.x/TILE,cam.y/TILE,vw/TILE,vh/TILE,0,0,vw,vh);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  ctx.save();ctx.translate(-cam.x,-cam.y);ctx.globalCompositeOperation='lighter';
  glow(FIRE.x,FIRE.y-8,150*flick,'255,130,40',.32*night);glow(FIRE.x,FIRE.y-10,55*flick,'255,190,90',.4*night);
  for(const s of S.seeds){if(stageOf(s)!=='flower')continue;const x=s.x*TILE+TILE/2,y=s.y*TILE+TILE/2;if(!vis(x,y))continue;
   const n=Math.min(OFFS.length,thanksOf(s));for(let i=0;i<n;i++){const F=FLOWERS[(s.flower+i*2)%5];glow(x+OFFS[i][0],y+OFFS[i][1]-3,16*bloomScale(s,i,n)*(1+.08*Math.sin(t/700+i)),F.g,.5*night)}}
  for(const f of flies){const a=f.a+t/1000*f.s,x=VC.x+Math.cos(a)*f.r+Math.sin(t/900+f.ph)*12,y=VC.y+Math.sin(a*1.3)*f.r*.6+Math.cos(t/700+f.ph)*10;const b=(.5+.5*Math.sin(t/400+f.ph))*night;
   glow(x,y,9,'200,255,140',.5*b);ell(x,y,1.2,1.2,`rgba(235,255,190,${b})`)}
  ctx.restore();ctx.globalCompositeOperation='source-over'}
 ctx.save();ctx.translate(-cam.x,-cam.y);if(vis(FIRE.x,FIRE.y))drawFlames(t);
 if((S.tutorial||0)===1){const g=S.seeds.find(s=>s.granny);if(g){const ax=(g.x+.5)*TILE,ay=(g.y+.5)*TILE-24+Math.sin(t/300)*4;ctx.fillStyle='rgba(217,130,91,.95)';ctx.beginPath();ctx.moveTo(ax-7,ay-9);ctx.lineTo(ax+7,ay-9);ctx.lineTo(ax,ay+1);ctx.closePath();ctx.fill()}}
 if(!sheetOpen&&Math.hypot(P.x-GRAN.x,P.y-GRAN.y)<230){const bx=GRAN.x+2,by=GRAN.y-40+Math.sin(t/500)*1.5;
  ctx.fillStyle='rgba(255,252,245,.95)';ctx.beginPath();ctx.roundRect(bx-15,by-10,30,18,9);ctx.fill();ctx.beginPath();ctx.moveTo(bx-3,by+7);ctx.lineTo(bx,by+12);ctx.lineTo(bx+3,by+7);ctx.fill();
  for(let i=-1;i<=1;i++)ell(bx+i*7,by-1,1.7,1.7,`rgba(138,117,96,${.45+.55*((Math.floor(t/350)%3)===i+1)})`)}
 ctx.restore();drawWind(t)}
function drawGranny(t){const x=GRAN.x,y=GRAN.y,br=Math.sin(t/900)*.6;
 ell(x,y+11,14,4.5,'rgba(60,50,40,.22)');
 ctx.fillStyle='#8a5e3e';ctx.beginPath();ctx.roundRect(x-11,y+2,22,8,3);ctx.fill();ell(x+11,y+6,2.5,4,'#a87a55');
 ctx.fillStyle='#8c7aa8';ctx.beginPath();ctx.moveTo(x-11,y+7);ctx.quadraticCurveTo(x-11,y-7+br,x-1,y-9+br);ctx.quadraticCurveTo(x+10,y-7+br,x+11,y+7);ctx.closePath();ctx.fill();
 ctx.fillStyle='#d98f7a';ctx.beginPath();ctx.ellipse(x,y-6+br,10,4.2,0,0,Math.PI*2);ctx.fill();ell(x+5,y-1+br,2.4,4,'#d98f7a');
 ell(x+1.5,y-14+br,6.2,6.2,'#f2d4b8');
 ell(x-1.5,y-17.5+br,6.4,4.4,'#ebe7df');ell(x-6,y-19+br,3.2,3.2,'#ebe7df');
 ctx.strokeStyle='#6b5a49';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x+4.5,y-14.5+br,1.3,.2,Math.PI-.2);ctx.stroke();
 ell(x+5,y-12+br,1.5,1,'rgba(240,140,130,.55)')}

/* ---------- sheet ---------- */
let sheetOpen=false;
function openSheet(html,mount){$('#sheetBody').innerHTML=html;$('#sheet').scrollTop=0;$('#sheet').classList.add('on');$('#scrim').classList.add('on');sheetOpen=true;target=null;if(mount)mount($('#sheetBody'))}
function closeSheet(){$('#sheet').classList.remove('on');$('#scrim').classList.remove('on');sheetOpen=false;refreshDot()}
$('#scrim').onclick=closeSheet;
let toastT;function toast(m){const el=$('#toast');el.textContent=m;el.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('on'),2600)}
function refreshDot(){$('#dot').style.display=hasNew()?'inline-block':'none'}
function lineLimit(ta,max,counter){const f=()=>{const ls=ta.value.split('\n');if(ls.length>max)ta.value=ls.slice(0,max).join('\n');if(counter)counter.textContent=`${ta.value.length} / ${ta.maxLength}`};
 ta.addEventListener('input',f);ta.addEventListener('keydown',e=>{if(e.key==='Enter'&&ta.value.split('\n').length>=max)e.preventDefault()});f()}
const CRISIS=/死にたい|しにたい|消えたい|きえたい|自殺|死のう|殺して|いなくなりたい/;
function contactsHTML(){const c=(t,n,d)=>`<div class="ct"><b>${t}</b><a class="num" href="tel:${n.replace(/-/g,'')}">${n}</a>${d}</div>`;
 return `<div class="care contacts">${c('命があぶないとき・けがをしているとき','119','救急')}${c('#いのちSOS','0120-061-338','24時間・無料')}${c('よりそいホットライン','0120-279-338','24時間・無料')}${c('いのちの電話','0120-783-556','毎日16〜21時・無料')}${c('こころの健康相談統一ダイヤル','0570-064-556','住んでいる地域の公的な窓口につながります')}${c('18歳までの人 ── チャイルドライン','0120-99-7777','毎日16〜21時・無料')}
 <a class="lk" href="https://www.mhlw.go.jp/mamorouyokokoro/" target="_blank" rel="noopener">まもろうよ こころ（電話・LINE・チャットの相談先一覧）</a><p class="note">受付時間は変わることがあります。</p></div>`}
function careHTML(){return `<p class="hard" style="font-size:15.5px">つらい気持ちを、ここに書いてくれてありがとう。ひとりで抱えこまずに、信頼できる人や、相談の窓口に話してみてください。</p>${contactsHTML()}`}
function bloom(s){s.bloomAt=Date.now();const before=storm.reduce((a,v)=>a+(v>.5),0);rebuildWorld();const after=storm.reduce((a,v)=>a+(v>.5),0);
 setTimeout(()=>toast(after<before?'花のまわりに緑が広がり、嵐が少しやわらいだ':'花のまわりに、緑が広がった'),900)}

/* ---------- plant ---------- */
// 種カード：本文だけ。② があるときは、区切りの下に
function seedCard(s){return `<div class="parchment"><p class="hard">${esc(s.h)}</p>${s.f?`<div class="psep"></div><p class="face">${esc(s.f)}</p>`:''}</div>`}
$('#btnPlant').onclick=()=>{if(!ready)return;const pi=plantState();if(!pi.ok)return;plantTalk(pi,{h:'',f:''})};
// 種を蒔く：おばあちゃんとの会話。入力欄は 1 つずつ出す（① → ② → 確認）
function plantTalk(pi,draft){talkSheet(({say,you,ctl,scroll})=>{
 const talk=document.getElementById('talk');
 const ask=(key,rows,max,lines,buttons)=>{
  ctl.innerHTML=`<textarea id="tIn" class="talkin" rows="${rows}" maxlength="${max}" placeholder="${PLANT_PLACEHOLDERS[key]}"></textarea><div class="count" id="cIn"></div>
   <div class="row">${buttons.map(([id,label,cls])=>`<button class="btn ${cls} small" id="${id}">${label}</button>`).join('')}</div>`;
  const ta=ctl.querySelector('#tIn');ta.value=draft[key]||'';lineLimit(ta,lines,ctl.querySelector('#cIn'));
  const go=ctl.querySelector('#pTalk');const chk=()=>go.disabled=!ta.value.trim();ta.addEventListener('input',chk);chk();scroll();return ta};
 const step1=()=>{say(PLANT_TALK.ask);
  const ta=ask('h',2,60,2,[['pTalk',PLANT_BUTTONS.talk,'main']]);
  ctl.querySelector('#pTalk').onclick=()=>{draft.h=ta.value.trim();you(draft.h);ctl.innerHTML='';setTimeout(step2,400)}};
 const step2=()=>{say(PLANT_TALK.how);
  const ta=ask('f',6,240,8,[['pSkip',PLANT_BUTTONS.skip,'ghost'],['pTalk',PLANT_BUTTONS.talk,'main']]);
  ctl.querySelector('#pTalk').onclick=()=>{draft.f=ta.value.trim();you(draft.f);ctl.innerHTML='';setTimeout(step3,400)};
  ctl.querySelector('#pSkip').onclick=()=>{draft.f='';you(PLANT_BUTTONS.skip);ctl.innerHTML='';setTimeout(()=>{say(PLANT_TALK.skipped);setTimeout(step3,700)},400)}};
 const step3=()=>{say(PLANT_TALK.ready);
  const card=document.createElement('div');card.className='preview';card.innerHTML=seedCard({h:draft.h,f:draft.f||null});talk.appendChild(card);
  ctl.innerHTML=`<p class="note">名前はどこにも表示されません。通りがかった人は、この本文だけを読めます。</p>
   <div class="row"><button class="btn ghost small" id="pEdit">${PLANT_BUTTONS.edit}</button><button class="btn main small" id="pPlant">${PLANT_BUTTONS.plant}</button></div>`;scroll();
  ctl.querySelector('#pEdit').onclick=()=>plantTalk(pi,draft);
  ctl.querySelector('#pPlant').onclick=()=>sow(pi,draft)};
 step1()})}
function sow(pi,draft){if(seedOn(pi.tx,pi.ty)){closeSheet();return}
 const h=draft.h,f=draft.f||null,crisis=CRISIS.test(h+(f||''));
 const sd={x:pi.tx,y:pi.ty,h,f,flower:Math.floor(Math.random()*5),hidden:crisis};
 const fx=performance.now();
 const pr=plantSeed(sd),ns={id:pr.id||uid(),...sd,mine:true,t:Date.now(),letters:[],plantedAt:fx+WIND.fall};S.seeds.push(ns);save();
 if(pr.id)pr.done.then(()=>watchOwn(ns));
 const sx=(pi.tx+.5)*TILE,from={x:P.x,y:P.y-14};for(const dx of[-TILE*.75,TILE*.75]){if(!solid(sx+dx,P.y+10)){P.x=sx+dx;break}}
 if(crisis){openSheet(`<div class="kicker">種を預かりました</div>${careHTML()}<p class="note">この種は、ほかの人には見えない場所にそっと置いておきます。（公開版では、管理者が確認してから扱いを決める想定です）</p><div class="row"><button class="btn main small" id="x">閉じる</button></div>`,e=>e.querySelector('#x').onclick=closeSheet);return}
 // 種が地面に落ち、風が吹いて、種が画面の外へ運ばれていく → おばあちゃんのひと言 → 砂漠に戻る
 closeSheet();windFx={t0:fx,from,x:sx,y:(pi.ty+.5)*TILE+2,seeds:Array.from({length:5},(_,i)=>({dy:-30-i*16+Math.random()*10,ph:Math.random()*6,d:i*120}))};
 setTimeout(()=>{windFx=null;talkSheet(({play,button})=>play([PLANT_TALK.sent],()=>button(PLANT_BUTTONS.close,closeSheet)))},WIND.total)}
const WIND={fall:700,blowAt:1000,total:4200};
let windFx=null;
function drawWind(t){const w=windFx;if(!w)return;const e=t-w.t0;ctx.save();ctx.translate(-cam.x,-cam.y);
 // 1. 手もとから、マスへ落ちる
 if(e<WIND.fall){const k=clamp(e/WIND.fall,0,1),ease=k*k;const x=w.from.x+(w.x-w.from.x)*k,y=w.from.y+(w.y-w.from.y)*ease-Math.sin(k*Math.PI)*10;ell(x,y,3.2,2.3,'#8a6440')}
 // 2. 風が吹いて、小さな種が画面の外へ運ばれていく
 const b=e-WIND.blowAt;
 if(b>0){const span=WIND.total-WIND.blowAt,a=clamp(Math.min(b/400,(span-b)/500),0,1);
  ctx.lineCap='round';ctx.lineWidth=1.4;
  for(let i=0;i<9;i++){const yy=w.y-120+i*34+Math.sin(i*2.3)*12,xx=cam.x-160+((b*.55+i*137)%(vw+320)),len=60+(i%3)*24;
   ctx.strokeStyle=`rgba(255,250,235,${.45*a})`;ctx.beginPath();ctx.moveTo(xx,yy);ctx.quadraticCurveTo(xx+len*.5,yy-6,xx+len,yy);ctx.stroke()}
  for(const s of w.seeds){const k=clamp((b-s.d)/(span-500),0,1);if(k<=0||k>=1)continue;
   const x=w.x+Math.pow(k,1.8)*(vw*.9+160),y=w.y+s.dy*Math.min(1,k*3)-k*90+Math.sin(k*9+s.ph)*8;
   glow(x,y,11,'255,240,200',.45*(1-k*.5)*(.5+night*.5));ell(x,y,2.9,2.1,'#8a6440')}}
 ctx.restore()}

/* ---------- open seed ---------- */
const stageText={seed:'まだ、水を待っています',sprout:'芽が出ています',flower:'花が咲いています'};
function openSeed(s){if(s.mine)return openMine(s);if(s.granny)return openGrannySeed(s);
 const mine=myLetter(s);
 let body=`<div class="kicker">誰かの種</div>${seedCard(s)}<p class="state">${stageText[stageOf(s)]}</p>`;
 if(!mine&&(S.tutorial||0)<3){body+=`<p class="note">水やりは、焚き火のそばのおばあちゃんに教わってからにしよう。</p><div class="row"><button class="btn soft small" id="x">閉じる</button></div>`}
 else if(!mine){body+=`<label>優しい言葉で、水をあげる（10行まで）</label><textarea id="tL" rows="5" maxlength="300" placeholder="アドバイスより、まずは受けとめる言葉を"></textarea><div class="count" id="cL"></div>
  ${s.sample?'':'<p class="note">手紙は、この種を蒔いた人にだけ届きます。ほかの人には見えません。</p>'}
  <div class="row"><button class="btn ghost small" id="x">閉じる</button><button class="btn main small" id="ok" disabled>水をあげる</button></div>`}
 else{body+=`<div class="letter"><div class="from">あなたが届けた手紙</div><div class="txt">${esc(mine.text)}</div></div>
  <p class="state">${mine.thanked?'ありがとうが返ってきて、花がひとつ咲きました。':'手紙は届いています。'}</p><div class="row"><button class="btn soft small" id="x">閉じる</button></div>`}
 const canRep=FB&&!s.sample&&!s.granny;
 if(canRep)body=body.replace(/(<div class="row">[^]*<\/div>)$/,'<div class="row" style="justify-content:flex-start;margin-top:8px"><button class="btn ghost small" id="rep" style="padding-left:0">この種を知らせる</button></div>$1');
 markSeen(s);
 openSheet(body,el=>{el.querySelector('#x').onclick=closeSheet;
  const rp=el.querySelector('#rep');if(rp)rp.onclick=()=>{if(!rp.dataset.c){rp.dataset.c=1;rp.textContent='本当に知らせる';return}
   reportSeed(s.id);stopWatch(s.id);S.seeds=S.seeds.filter(z=>z!==s);save();rebuildWorld();refreshDot();closeSheet();toast('知らせました。この種は、あなたの世界から見えなくなります')};
  const ta=el.querySelector('#tL');if(!ta)return;
  const ok=el.querySelector('#ok');lineLimit(ta,10,el.querySelector('#cL'));ta.addEventListener('input',()=>ok.disabled=!ta.value.trim());
  ok.onclick=()=>{const l={id:getUid()||uid(),from:'me',text:ta.value.trim(),t:Date.now(),thanked:false};s.letters.push(l);save();
   if(s.sample)saveUser({['sampleLetters.'+s.id]:{text:l.text,t:l.t,thanked:false}});
   else if(FB){writeLetter(s.id,l.text);watchReceived(s)}closeSheet();toast('水をあげました')}})}

function openMine(s){
 const self=s.letters.find(l=>l.from==='me');
 const letters=s.letters.map(l=>`<div class="letter"><div class="from">${l.from==='me'?'自分から自分への手紙':'誰かからの手紙'}</div><div class="txt">${esc(l.text)}</div>
  <div class="act">${FB&&l.from!=='me'?`<button class="btn ghost small" data-rep="${l.id}" style="margin-right:auto;padding-left:0">この手紙を知らせる</button>`:''}${l.thanked?'ありがとうを返しました':expired(s)?'':`<button class="btn main small" data-thx="${l.id}">ありがとう</button>`}</div></div>`).join('');
 const body=`<div class="kicker">あなたの種</div>${seedCard(s)}
 <p class="state">${s.hidden?'この種は、ほかの人には見えない場所に置いてあります':stageText[stageOf(s)]}</p>
 ${s.letters.length?`<div class="sec">届いた手紙</div>${letters}`:`<p class="empty">まだ手紙は届いていません。誰かが通りかかるのを、静かに待っています。</p>`}
 ${self||expired(s)?'':`<div id="selfWrap"><div class="row" style="justify-content:flex-start"><button class="btn ghost small" id="selfBtn" style="padding-left:0">自分に、手紙を書く</button></div></div>`}
 <div class="row"><button class="btn soft small" id="x">閉じる</button></div>`;
 markSeen(s);
 openSheet(body,el=>{el.querySelector('#x').onclick=closeSheet;
  el.querySelectorAll('[data-rep]').forEach(b=>b.onclick=()=>{if(!b.dataset.c){b.dataset.c=1;b.textContent='本当に知らせる';return}
   const w=b.dataset.rep;MUTED[s.id+'_'+w]=true;reportLetter(s.id,w);s.letters=s.letters.filter(z=>z.id!==w);save();rebuildWorld();refreshDot();openMine(s);toast('知らせました。この手紙は、もう表示されません')});
  el.querySelectorAll('[data-thx]').forEach(b=>b.onclick=()=>{const l=s.letters.find(z=>z.id===b.dataset.thx);if(!l)return;l.thanked=true;l.thankedAt=Date.now();save();thankLetter(s.id,l.id);
   b.parentElement.textContent='ありがとうを返しました';if(!s.hidden){bloom(s);setTimeout(closeSheet,500)}});
  const sb=el.querySelector('#selfBtn');if(sb)sb.onclick=()=>{const w=el.querySelector('#selfWrap');
   w.innerHTML=`<label>自分に、優しい言葉をかける（10行まで）</label><textarea id="tS" rows="5" maxlength="300" placeholder="友だちにかけるような言葉で"></textarea><div class="count" id="cS"></div><div class="row"><button class="btn main small" id="sOk" disabled>水をあげる</button></div>`;
   const ta=w.querySelector('#tS'),ok=w.querySelector('#sOk');lineLimit(ta,10,w.querySelector('#cS'));ta.addEventListener('input',()=>ok.disabled=!ta.value.trim());ta.focus();
   ok.onclick=()=>{const text=ta.value.trim();s.letters.push({id:getUid()||uid(),from:'me',text,t:Date.now(),thanked:false});save();writeLetter(s.id,text);openMine(s)}}})}

/* ---------- my seeds list ---------- */
function goTo(s){const cx=(s.x+.5)*TILE,cy=(s.y+.5)*TILE;P.x=cx-TILE;P.y=cy-10;if(solid(P.x,P.y+10))P.x=cx+TILE;
 cam.x=clamp(P.x-vw/2,0,WORLD-vw);cam.y=clamp(P.y-vh*.45,0,WORLD-vh);prints.length=0;lastStep={x:P.x,y:P.y};target=null}
$('#btnMine').onclick=()=>{if(!ready)return;
 const mine=S.seeds.filter(s=>s.mine&&shown(s)).sort((a,b)=>b.t-a.t),wat=S.seeds.filter(s=>!s.mine&&myLetter(s)&&shown(s));
 const item=s=>`<button class="list-item" data-go="${s.id}">${s.unread?'<span class="dot" style="margin:0 6px 0 0"></span>':''}${esc(s.h.split('\n')[0])}<div class="s">${s.hidden?'見えない場所に置いてあります':stageText[stageOf(s)]}${s.mine&&s.letters.length?` ・ 手紙 ${s.letters.length}通`:''}${!s.mine&&myLetter(s).thanked?' ・ ありがとうが返ってきました':''}</div></button>`;
 openSheet(`<div class="kicker">わたしの種</div>
 ${mine.length?mine.map(item).join(''):'<p class="empty">まだ種を蒔いていません。<br>村のまわりの緑で、気になったマスを選んで「ここに種を蒔く」を押してみてください。</p>'}
 <div class="sec">水をあげた種</div>${wat.length?wat.map(item).join(''):'<p class="empty">砂漠を歩いて、誰かの種を探してみてください。</p>'}
 <div class="row"><button class="btn soft small" id="x">閉じる</button></div>`,el=>{el.querySelector('#x').onclick=closeSheet;
  el.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{const s=S.seeds.find(z=>z.id===b.dataset.go);if(!s)return;closeSheet();goTo(s);setTimeout(()=>openSeed(s),380)})})};

/* ---------- the grandmother by the fire ---------- */
const TALK={
 world:[
  'ここはね、見わたすかぎりの砂漠なんだ。「生きづらさ」っていう名前の砂漠さ。',
  'ひとりで歩くには、ちょっと広すぎるし、乾きすぎてる。遠くでは砂嵐も吹いていて、その先へは進めないんだよ。',
  'でもね、ここに来た人たちが、自分の生きづらさを「種」にして蒔いてくれる。',
  '通りがかった誰かが、その種にやさしい言葉の手紙で水をあげる。蒔いた人が「ありがとう」を返すと、花が咲くんだ。',
  '花が咲くと、まわりの砂がほんの少しだけ緑になる。その緑に、また別の誰かが種を蒔く。',
  'そうやって、この小さな村から、少しずつ、少しずつ緑が広がってきたんだよ。緑が広がると、嵐もだんだんやわらいでいく。',
  'ひとりでは越えられない砂漠も、みんなで蒔いて、みんなで水をあげれば、ちょっとずつ生きやすい場所になる。わたしはそう信じてるよ。',
  '急がなくていいからね。あんたのペースで歩いておいで。この火は、いつでも燃えてるから。'],
 seed:[
  '種の蒔き方かい。むずかしく考えなくていいんだよ。',
  '種には、書くところがふたつある。ひとつめは「抱えている生きづらさ」。ここは2行までだよ。',
  'いちばん困っていることを、ひとつだけ、短く書くといい。いっぺんにたくさん書くと、読む人もどこに水をあげたらいいか迷っちゃうからね。',
  'たとえば「人と話すとき、言葉が詰まってしまう。」とか、「朝、布団から出られない日が続いている。」くらいで十分さ。',
  'ふたつめは「それに、どう向き合っているか」。こっちは8行まで書ける。',
  'うまくいってることじゃなくていいんだよ。試してみたこと、ちょっと楽になった瞬間、支えになってる人やもの。そういうのを書いてごらん。',
  '「いつ・どんなときに・何をしてみたら・どうだったか」の順に書くと、読む人にもよく伝わるねぇ。',
  'たとえば、「電話の前は、最初のひと言だけメモに書いておく。それだけで、少し落ち着いて話せた日があった。」こんなふうにね。',
  'まだ向き合い方が見つからないなら、「どうしたらいいかわからなくて、ここに書いてみた。」でもいいんだよ。書いてみたこと自体が、ひとつの向き合い方なんだから。',
  'それからね、名前や住んでいる場所、学校や職場の名前みたいに、あんたが誰かわかってしまうことは書かないでおくれ。ほかの誰かを悪く言うことも、書かないでおこうね。',
  'この砂漠は、みんなが安心して歩ける場所にしたいからさ。ここでは、生きづらさと、その向き合い方だけが旅をするんだよ。',
  '種は、緑の上にだけ蒔ける。村のまわりの緑か、花が咲いて広がった緑を探して、その上に立って「ここに種を蒔く」を押してごらん。'],
 water:[
  '水やりはね、種を蒔くのと同じくらい、大事なしごとなんだよ。',
  '誰かの種を見つけたら、まずはゆっくり読んでごらん。この人はどんな気持ちで書いたのかなって、想像しながらね。',
  'それから、いちばん大事なこと。水やりは「アドバイスより、共感」なんだ。',
  '「こうすればいいよ」「もっとこうしたら？」って言いたくなる気持ちも、よくわかる。でもね、苦しいときに正しい答えを渡されると、かえって「わかってもらえなかった」って感じてしまうことがあるんだよ。',
  'だから、まずは受けとめる。「それは、つらかったね」「書いてくれて、ありがとう」。それだけで、乾いた土がじんわり湿るのさ。',
  '向き合い方のところを読んで、いいなと思ったことがあったら、それを伝えてあげるといい。「その工夫、すてきだね」ってね。自分で見つけた力を認めてもらえると、人はまた歩けるんだ。',
  '同じような経験があったら、少しだけ分けてあげてもいい。「わたしも、似たことで苦しかったことがあるよ」。ひとりじゃないってわかるだけで、救われることがあるからねぇ。',
  '反対に、「そんなの大したことないよ」「もっと大変な人もいる」みたいな言葉は、どんなに軽い気持ちでも、相手を傷つけてしまう。「がんばれ」も、もう十分がんばってる人には、重たく聞こえることがあるんだ。',
  '言葉は丁寧に、ゆっくり書いておくれ。送る前にいっぺん読み返して、「これをもらったら、自分はうれしいかな」って考えてみるといい。',
  '短くたっていいんだよ。上手な言葉より、あたたかい言葉のほうが、ずっとよく花を咲かせるからね。',
  'それにね、人にやさしい言葉をかけていると、不思議と自分の心もやわらかくなる。水やりは、あんた自身のためにもなるんだよ。'],
 help:[
  'ひとつ、大事な話をさせておくれ。',
  'この砂漠は、みんなで少しずつ生きやすくしていく場所だけど、すぐに助けが届く場所じゃないんだ。手紙が届くまで、時間がかかることもある。',
  'だからね、「死にたい」「消えてしまいたい」と思うくらい苦しいときや、ひとりでいるのがあぶないと感じるときは、ここに書くより先に、人に直接話してほしいんだ。',
  '身近な信頼できる人でもいいし、相談の窓口でもいい。電話の向こうには、話を聴くことを仕事にしている人たちがいるからね。',
  '{CONTACTS}',
  'けがをしている、命があぶない、っていうときは、迷わず119番だよ。',
  '電話が苦手なら、LINEやチャットで相談できるところもある。「まもろうよ こころ」っていうページにまとまってるから、のぞいてごらん。',
  '助けを求めるのは、弱いことじゃない。生きるための、立派な向き合い方なんだよ。',
  '話せたら、また火にあたりにおいで。待ってるからね。']};
const TOPICS=[['world','この世界のこと'],['seed','種の蒔き方'],['water','水やりのこつ'],['help','とても苦しいときは']];
const TUT={
 intro:[
  'おや、はじめて見る顔だねぇ。よく来たね。まあ、火にあたっていきな。',
  'ここはね、「生きづらさ」っていう名前の砂漠なんだ。ここに来た人は、みんなそれぞれ、自分だけの砂漠を歩いてる。',
  'でもね、ときどき、どこかの誰かが蒔いた種が、風に運ばれてあんたの砂漠にも届くんだよ。',
  'その種にやさしい言葉で水をあげて、蒔いた人が「ありがとう」を返すと、花が咲く。花が咲くと、砂漠が少しずつ緑になっていくんだ。',
  'あんたが種を蒔く前に、まずは水やりを覚えてほしいんだ。',
  'じつはね、わたしも種を蒔いてあるんだよ。ほら、わたしのすぐそばの、左のところさ。',
  '水やりのこつは「アドバイスより、共感」。「こうしたら？」より、「それはさみしいね」「その考え方、すてきだね」って、受けとめる言葉をかけてあげることさ。',
  'うまく書こうとしなくていいからね。わたしの種を読んで、やさしい言葉で水をあげてみておくれ。'],
 remind:['わたしの種は、すぐそばの左のところだよ。','アドバイスより、共感。受けとめる言葉で、水をあげてみておくれ。'],
 reading:['（おばあちゃんが、あなたの言葉をゆっくり読んでいる……）','……ありがとうねぇ。あったかい言葉だった。','こんなふうに言ってもらえると、明日もまた薪をくべようって思えるよ。','じゃあ、わたしからも「ありがとう」を返そうね。'],
 finish:['ほら、咲いたねぇ。まわりの砂も、少し緑になっただろう？','あんたの言葉で、この砂漠がひとつ、生きやすくなったんだよ。','こんどは、あんたの番だ。緑の上に立って、あんたの生きづらさを種にして蒔いてごらん。','あんたの種も、どこかの誰かの砂漠に届いて、きっと誰かが水をあげてくれるからね。','書き方に迷ったら、いつでもわたしに聞きにおいで。']};
function talkSheet(build){openSheet(`<div class="kicker">焚き火のそばのおばあちゃん</div><div class="talk" id="talk"></div><div id="ctl"></div>`,el=>{
 const talk=el.querySelector('#talk'),ctl=el.querySelector('#ctl');
 const scroll=()=>requestAnimationFrame(()=>{const sh=$('#sheet');sh.scrollTo({top:sh.scrollHeight,behavior:'smooth'})});
 const say=txt=>{const d=document.createElement('div');if(txt==='{CONTACTS}')d.innerHTML=contactsHTML();else{d.className='bub';d.textContent=txt}talk.appendChild(d);scroll()};
 const you=txt=>{const d=document.createElement('div');d.className='bub me';d.textContent=txt;talk.appendChild(d)};
 const play=(lines,done)=>{let i=0;const next=()=>{say(lines[i++]);
  if(i<lines.length){ctl.innerHTML=`<div class="row"><button class="btn soft small" id="nx">つぎへ</button></div>`;ctl.querySelector('#nx').onclick=next}
  else{ctl.innerHTML='';setTimeout(done,400)}};next()};
 const button=(label,fn)=>{ctl.innerHTML=`<div class="row"><button class="btn main small" id="bt">${label}</button></div>`;ctl.querySelector('#bt').onclick=fn;scroll()};
 build({say,you,play,button,ctl,scroll})})}
function grannySeed(){return S.seeds.find(s=>s.granny)}
function walkToGrannySeed(){const g=grannySeed();if(!g)return;target={x:(g.x+.5)*TILE+TILE,y:(g.y+.5)*TILE-10};pendingOpen=g.id}
// 初回講習のはじまり：「おばあちゃんの種を見にいく」。自動では歩かず、プレイヤーが自分でおばあちゃんの種を探してタップする
function goGrannySeed(){S.tutorial=1;S.metGranny=true;save();saveUser({tutorial:1,metGranny:true});closeSheet()}
function finishTutorial(){S.tutorial=3;S.metGranny=true;save();saveUser({tutorial:3,metGranny:true});closeSheet();setTimeout(()=>toast('緑の上に立って、種を蒔いてみよう'),400)}
function grannyThanks(){talkSheet(({play,button})=>play(TUT.reading,()=>button('花を見る',()=>{
 const g=grannySeed(),l=g&&myLetter(g);if(l&&!l.thanked){l.thanked=true;l.thankedAt=Date.now();save()}
 closeSheet();if(g)bloom(g);
 setTimeout(plantDummies,1600);
 setTimeout(()=>talkSheet(({play,button})=>play(TUT.finish,()=>button('はじめる',finishTutorial))),3200)})))}
function openGrannySeed(s){const mine=myLetter(s),tu=S.tutorial||0;
 let body=`<div class="kicker">おばあちゃんの種</div>${seedCard(s)}`;
 if(!mine&&tu>=1){body+=`<div class="care" style="font-size:13.5px;line-height:1.95"><b style="font-weight:500">水やりのこつ</b><br>・まずは、気持ちを受けとめる<br>　（「それは、さみしいですね」）<br>・向き合い方の、よいところを伝える<br>　（「その考え方、すてきです」）<br>・アドバイスは、しなくて大丈夫</div>
  <label>やさしい言葉で、水をあげる（10行まで）</label><textarea id="tL" rows="5" maxlength="300" placeholder="たとえば：できることを数えるって、すてきですね。"></textarea><div class="count" id="cL"></div>
  <div class="row"><button class="btn ghost small" id="x">閉じる</button><button class="btn main small" id="ok" disabled>水をあげる</button></div>`}
 else if(!mine){body+=`<p class="note">先に、焚き火のそばのおばあちゃんに話しかけてみよう。</p><div class="row"><button class="btn soft small" id="x">閉じる</button></div>`}
 else{body+=`<div class="letter"><div class="from">あなたがおばあちゃんに届けた手紙</div><div class="txt">${esc(mine.text)}</div></div><p class="state">${mine.thanked?'おばあちゃんから、ありがとうが返ってきました。':'おばあちゃんが、手紙を読んでいます。'}</p><div class="row"><button class="btn soft small" id="x">閉じる</button></div>`}
 openSheet(body,el=>{el.querySelector('#x').onclick=closeSheet;const ta=el.querySelector('#tL');if(!ta)return;
  const ok=el.querySelector('#ok');lineLimit(ta,10,el.querySelector('#cL'));ta.addEventListener('input',()=>ok.disabled=!ta.value.trim());
  ok.onclick=()=>{s.letters.push({id:uid(),from:'me',text:ta.value.trim(),t:Date.now(),thanked:false});S.tutorial=2;save();saveUser({tutorial:2,grannyLetter:ta.value.trim()});closeSheet();toast('水をあげました');setTimeout(grannyThanks,1600)}})}
function openGranny(){target=null;const tu=S.tutorial||0;
 if(tu===0)return talkSheet(({play,button})=>play(TUT.intro,()=>button('おばあちゃんの種を見にいく',goGrannySeed)));
 if(tu===1)return talkSheet(({play,button})=>play(TUT.remind,()=>button('おばあちゃんの種を見にいく',()=>{closeSheet();walkToGrannySeed()})));
 if(tu===2)return talkSheet(({play,button})=>play(TUT.finish,()=>button('はじめる',finishTutorial)));
 talkSheet(({say,you,play,ctl,scroll})=>{
  const menu=()=>{ctl.innerHTML=`<div class="topics">${TOPICS.map(([k,l])=>`<button class="topic" data-k="${k}">${l}</button>`).join('')}<button class="topic bye" data-k="bye">またね</button></div>`;
   ctl.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{const k=b.dataset.k;if(k==='bye'){closeSheet();return}you(b.textContent);play(TALK[k],()=>{say('ほかに、聞きたいことはあるかい？');menu()})});scroll()};
  say('おや、また来てくれたんだねぇ。まあ、火にあたっていきな。');say('何か、聞きたいことはあるかい？');menu()})}

/* ---------- help ---------- */
function openHelp(){openSheet(`<div class="help"><div class="kicker">この世界について</div><h2>砂漠に種を蒔く</h2>
 <p>砂漠のまんなかに、家が一軒だけの小さな村があります。村から先は、どこまでも砂漠。緑から10マス離れると砂嵐が吹いていて、その先へは進めません。種は、緑の上にだけ蒔けます。</p>
 <div class="flow"><div><b>🌰</b>種を蒔く</div><i>›</i><div><b>✉️</b>手紙で<br>水やり</div><i>›</i><div><b>🌱</b>芽が出る</div><i>›</i><div><b>🤲</b>ありがとう</div><i>›</i><div><b>🌸</b>花が咲き<br>緑が広がる</div></div>
 <p>種には、抱えている生きづらさと、それにどう向き合っているかを書きます。誰かの種を見つけたら、優しい言葉の手紙で水をあげてください。手紙は蒔いた人にだけ届き、名前はどこにも表示されません。</p>
 <p>蒔いた人が「ありがとう」を返すと花が咲き、まわり8マスの砂が緑に変わります。そこにまた種が蒔けるようになります。緑が広がるほど嵐はやわらぎ、世界は少しずつ先へひらけていきます。</p>
 <p>焚き火のそばのおばあちゃんに話しかけると、この世界のことや、種の蒔き方・水やりのこつを教えてくれます。</p>
 <p class="note">砂漠をタップすると歩けます（パソコンでは矢印キーでも）。右上の ☾ で昼と夜を切り替えられます（ふだんは時刻に合わせて変わります）。</p>
 <div class="row"><button class="btn main small" id="x">歩きはじめる</button></div></div>`,el=>{
  el.querySelector('#x').onclick=()=>{const first=(S.tutorial||0)<1;S.introSeen=true;save();saveUser({introSeen:true});closeSheet();if(first)setTimeout(()=>toast('焚き火のそばのおばあちゃんに、話しかけてみよう'),500)}})}

/* ---------- settings ---------- */
// 利用規約などのページ（public/ に置いた下書き）
const LINKS=[['利用規約','/terms.html'],['プライバシーポリシー','/privacy.html'],['お問い合わせ','/contact.html']];
const RESET_KEY='sabaku-reset';
function openSettings(){
 const seg=[['auto','時刻に合わせる'],['day','昼'],['night','夜']].map(([k,t])=>`<button data-sky="${k}"${k===skyMode()?' class="on"':''}>${t}</button>`).join('');
 openSheet(`<div class="settings"><div class="kicker">設定</div><h2>設定</h2>
 <button class="list-item go" id="sHelp">この世界について</button>
 <button class="list-item go" id="sOpening">オープニングをもう一度見る</button>
 <label>昼と夜</label><div class="seg">${seg}</div>
 <div class="gap"></div><button class="list-item go" id="sCare">困ったときの相談先</button>
 <label>データについて</label><p class="data">名前や連絡先は保存しません。種と手紙は、このブラウザに結びついた記録として保存されます。ブラウザのデータを消したり、別の端末で開いたりすると、自分の世界には戻れません。</p>
 <div class="row" style="justify-content:flex-start;margin-top:8px"><button class="btn ghost small" id="rst" style="padding-left:0">すべてのデータを消す</button></div>
 <div class="gap"></div>${LINKS.map(([t,u])=>`<a class="list-item go" href="${u}" target="_blank" rel="noopener">${t}</a>`).join('')}
 <div class="row"><button class="btn main small" id="x">閉じる</button></div></div>`,el=>{
  el.querySelector('#x').onclick=closeSheet;
  el.querySelector('#sHelp').onclick=openHelp;
  el.querySelector('#sOpening').onclick=()=>{location.href=location.pathname+'?opening=1'};
  el.querySelector('#sCare').onclick=openCare;
  el.querySelectorAll('[data-sky]').forEach(b=>b.onclick=()=>{setSky(b.dataset.sky);el.querySelectorAll('[data-sky]').forEach(x=>x.classList.toggle('on',x===b))});
  const r=el.querySelector('#rst');r.onclick=async()=>{if(!r.dataset.c){r.dataset.c=1;r.textContent='本当に消す';return}
   if(r.dataset.busy)return;r.dataset.busy=1;
   // 自分の記録と自分の世界を消し、新しい匿名アカウントで最初から（ほかの人の世界にある種や手紙はそのまま）
   try{await resetAll()}catch(e){console.error('[resetAll]',e)}
   try{localStorage.removeItem(KEY);sessionStorage.setItem(RESET_KEY,'1')}catch(e){}
   location.reload()}})}
function openCare(){openSheet(`<div class="kicker">困ったときの相談先</div>${contactsHTML()}<div class="row"><button class="btn main small" id="x">閉じる</button></div>`,e=>e.querySelector('#x').onclick=closeSheet)}
$('#btnSet').onclick=()=>{if(ready)openSettings()};

/* ---------- loop ---------- */
let last=performance.now();
function frame(ts){const dt=Math.min(.05,(ts-last)/1000);last=ts;update(dt,ts);draw(ts);requestAnimationFrame(frame)}
requestAnimationFrame(frame);refreshDot();

/* ---------- user (Firestore) ---------- */
// 講習の進み具合・説明を見たか・おばあちゃんへの手紙は users/{uid} を正とする
function applyUser(u){if(!u)return;S.tutorial=u.tutorial||0;S.metGranny=!!u.metGranny;S.introSeen=!!u.introSeen;
 U.openingSeen=!!u.openingSeen;U.receivedToday=u.receivedToday||0;U.receivedDate=u.receivedDate||'';Object.assign(SEEN,u.seen||{});Object.assign(MUTED,u.muted||{});
 if(!USE_SAMPLES&&u.dummies){Object.assign(DUMMIES,u.dummies);const have=new Set(S.seeds.map(s=>s.id));S.seeds.push(...sampleSeeds().filter(s=>!have.has(s.id)))}
 for(const s of S.seeds){if(!s.sample)continue;const l=(u.sampleLetters||{})[s.id];
  if(l)s.letters=[{id:'sample-letter',from:'me',text:l.text,t:l.t,thanked:!!l.thanked}];else s.letters=[]}
 const g=grannySeed();if(g)g.letters=u.grannyLetter?[{id:'granny-letter',from:'me',text:u.grannyLetter,t:Date.now(),thanked:S.tutorial>=2}]:[];
 save();rebuildWorld()}
// 自分の世界の種は worlds/{uid}/tiles と seeds を正とする。
// 手紙・ありがとうは、このあと watchers が seeds/{id}/letters から読み込む。
function applyWorld(list){if(!list)return;const prev=new Map(S.seeds.map(s=>[s.id,s]));
 const keep=s=>{const p=prev.get(s.id);return p?{...s,letters:p.letters||[],unread:!!p.unread}:s};
 // 手紙を読み込むまでは、花かどうかわからない（片付けるのは読み込んでから）
 const fromFs=({tile,seed})=>({id:seed.id,x:tile.x,y:tile.y,mine:tile.kind==='own',h:seed.h,f:seed.f,
  t:seed.createdAt?.toMillis?.()||Date.now(),flower:seed.flower||0,letters:[],hidden:seed.status==='hidden'});
 const g=grannySeed();S.seeds=[...sampleSeeds().map(keep),...(g?[g]:[]),...list.map(fromFs)];save();rebuildWorld()}
const U={receivedToday:0,receivedDate:''};
const dayKey=ms=>{const d=new Date(ms);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};

/* ---------- samples: 見本の種への手紙は、どこにも届かず、翌日にありがとうが返って花が咲く ---------- */
function sampleThanks(){const t=dayKey(Date.now());let ch=false;
 for(const s of S.seeds){if(!s.sample)continue;const l=myLetter(s);
  if(l&&!l.thanked&&dayKey(l.t)<t){l.thanked=true;l.thankedAt=Date.now();s.unread=true;ch=true;bloom(s);
   saveUser({['sampleLetters.'+s.id+'.thanked']:true})}}
 if(ch){save();refreshDot()}}

/* ---------- delivery: まだ 5 つの世界に届いていない種を、自分の世界に受け取る ---------- */
// おばあちゃんの種が咲いたら、見本の文章から 3 つ選んで、空いている緑のマスにランダムに蒔く（自分で蒔く場所は残す）
const DUMMY_COUNT=3;
function plantDummies(){if(USE_SAMPLES||Object.keys(DUMMIES).length)return;
 const free=freeGreenTiles(),n=Math.min(DUMMY_COUNT,free.length-KEEP_FREE);if(n<=0)return;
 const ids=SAMPLES.map((_,i)=>i).sort(()=>Math.random()-.5).slice(0,n);
 for(const i of ids){const [x,y]=free.splice(Math.floor(Math.random()*free.length),1)[0];DUMMIES['s'+i]={x,y}}
 saveUser({dummies:{...DUMMIES}});
 const have=new Set(S.seeds.map(s=>s.id));S.seeds.push(...sampleSeeds().filter(s=>!have.has(s.id)));save();rebuildWorld()}
function freeGreenTiles(){const out=[];
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){if(green[y*N+x]<.5||inVillage(x,y)||decor[y*N+x]||onDrawing(x,y)||seedOn(x,y))continue;out.push([x,y])}
 return out}
// ほかの人と同時に受け取ろうとすると、ルールで弾かれる（先に書いた人がいる）ので、少し待って読み直す
async function receiveWithRetry(id,x,y,t){
 for(let i=0;i<6;i++){try{return await receiveSeed(id,x,y,t,DAILY_RECEIVE)}
  catch(e){if(!['permission-denied','aborted','failed-precondition'].includes(e.code)||i===5){console.error('[receiveSeed]',e);return null}
   await new Promise(r=>setTimeout(r,150+Math.random()*350*(i+1)))}}
 return null}
let delivering=false;
async function receiveSeeds(){if(!FB||delivering||!ready)return;delivering=true;
 try{const t=dayKey(Date.now());let n=U.receivedDate===t?U.receivedToday:0;if(n>=DAILY_RECEIVE)return;
  // ほかの人に先を越されることもあるので、候補は多めに取り、足りなければ探しなおす
  for(let round=0;round<3&&n<DAILY_RECEIVE;round++){
  const ids=await findDeliverable(new Set(S.seeds.map(s=>s.id)),(DAILY_RECEIVE-n)*4).catch(e=>{console.error('[findDeliverable]',e);return[]});if(!ids.length)break;
  for(const id of ids){if(n>=DAILY_RECEIVE)break;
   const free=freeGreenTiles();if(free.length<=KEEP_FREE)break; // 自分で蒔く場所を残し、それ以上空いていなければ、次の機会に回す
   const[x,y]=free[Math.floor(Math.random()*free.length)];
   const r=await receiveWithRetry(id,x,y,t);
   if(!r)continue;n=r.count;U.receivedToday=n;U.receivedDate=t;
   if(seedOn(x,y))continue;
   S.seeds.push({id,x,y,mine:false,h:r.seed.h,f:r.seed.f,t:r.seed.createdAt?.toMillis?.()||Date.now(),flower:r.seed.flower||0,letters:[]});save()}}}
 finally{delivering=false}}

/* ---------- letters & thanks: 手紙が届く・ありがとうが返る ---------- */
// 未読：自分の種に、ほかの人（自分以外）から手紙が届いた／自分の手紙に、ありがとうが返ってきた
function lastEvent(s){if(s.mine)return Math.max(0,...s.letters.filter(l=>l.from!=='me').map(l=>l.t));
 const l=myLetter(s);return l&&l.thanked?(l.thankedAt||1):0}
function markSeen(s){if(s.unread){s.unread=false;save()}
 if(!FB||s.sample||s.granny)return;const e=lastEvent(s);if(e>(SEEN[s.id]||0)){SEEN[s.id]=e;saveUser({['seen.'+s.id]:e})}}
const watchers=new Map();
let rebuildT=0;function rebuildSoon(){clearTimeout(rebuildT);rebuildT=setTimeout(()=>{prune();rebuildWorld();save();refreshDot()},60)}
function stopWatch(id){const f=watchers.get(id);if(f){f();watchers.delete(id)}}
// 1 週間たって、花にならなかった種と芽を、自分の世界から片付ける（マスが空く）
function prune(){const gone=S.seeds.filter(s=>expired(s)&&s.loaded&&stageOf(s)!=='flower');if(!gone.length)return false;
 for(const s of gone)stopWatch(s.id);S.seeds=S.seeds.filter(s=>!gone.includes(s));save();rebuildWorld();refreshDot();return true}
// 自分の種：届いた手紙をずっと見張る（蒔いた人だけが読める）
function watchOwn(s){if(!FB||watchers.has(s.id))return;
 watchers.set(s.id,watchLetters(s.id,ls=>{const me=getUid();s.loaded=true;
  s.letters=ls.filter(l=>!MUTED[s.id+'_'+l.id]).sort((a,b)=>a.t-b.t).map(l=>({id:l.id,from:l.writerUid===me?'me':'other',text:l.text,t:l.t,thanked:l.thanked,thankedAt:l.thankedAt}));
  s.unread=lastEvent(s)>(SEEN[s.id]||0);rebuildSoon()}))}
// 届いた種：自分が書いた手紙に、ありがとうが返ってくるまで見張る（返ったら取り消せないので、そこで終わり）
function watchReceived(s){if(!FB||watchers.has(s.id))return;
 watchers.set(s.id,watchMyLetter(s.id,(l,first)=>{s.loaded=true;
  if(!l){if(first)stopWatch(s.id);rebuildSoon();return}
  const was=!!myLetter(s)?.thanked;
  s.letters=[{id:l.id,from:'me',text:l.text,t:l.t,thanked:l.thanked,thankedAt:l.thankedAt}];
  s.unread=lastEvent(s)>(SEEN[s.id]||0);
  if(l.thanked)stopWatch(s.id);
  if(l.thanked&&!was&&!first){bloom(s);save();refreshDot()}else rebuildSoon()}))}
function startWatchers(){for(const s of S.seeds){if(s.sample||s.granny)continue;s.mine?watchOwn(s):watchReceived(s)}}

/* ---------- opening: 初回だけ、オープニング → おばあちゃんの到着のことば → 初回講習 ---------- */
function runOpening(){let chose=false;
 startOpening(openingEl,{
  onChoice:v=>{chose=true;try{localStorage.setItem(INTEREST_KEY,v)}catch(e){}saveUser({interest:v})},
  onLanding:()=>{sessionNight=true;night=1},
  onLanded:c=>{openingEl=null;try{localStorage.setItem(OPEN_KEY,'1')}catch(e){}
   S.introSeen=true;save();saveUser({openingSeen:true,introSeen:true,...(chose?{}:{interest:null})});U.openingSeen=true;
   // 講習前：到着のことば → 水やりの説明 → おばあちゃんの種へ。講習を始めている人（もう一度見る）：到着のことばだけ
   if((S.tutorial||0)===0)talkSheet(({play,button})=>play(grandmaLines(c),()=>button('おばあちゃんの種を見にいく',goGrannySeed)));
   else talkSheet(({play,button})=>play(arrivalLines(c),()=>button('はじめる',closeSheet)))}})}

initUser().then(async u=>{if(u)applyWorld(await loadMyWorld());applyUser(u);startWatchers();if(u&&(S.tutorial||0)>=2)plantDummies()}).catch(e=>console.error('[initUser]',e)).finally(()=>{ready=true;sampleThanks();refreshDot();
 // はじめての人（講習を始めておらず、オープニングも見ていない）にだけ、オープニングを出す
 if(openingEl&&(forceOpening||(!S.metGranny&&(S.tutorial||0)===0&&!U.openingSeen))){runOpening();receiveSeeds();setInterval(receiveSeeds,DELIVERY_INTERVAL);setInterval(()=>{sampleThanks();prune()},60*1000);return}
 if(openingEl){openingEl.remove();openingEl=null}
 try{localStorage.setItem(OPEN_KEY,'1')}catch(e){}
 // 「すべてのデータを消す」のあと：試作版と同じく、説明は出さずに「世界をはじめの姿に戻しました」
 let wasReset=false;try{wasReset=!!sessionStorage.getItem(RESET_KEY);sessionStorage.removeItem(RESET_KEY)}catch(e){}
 if(wasReset){S.introSeen=true;save();saveUser({introSeen:true});setTimeout(()=>toast('世界をはじめの姿に戻しました'),400)}
 else if(!S.introSeen)setTimeout(openHelp,400);
 receiveSeeds();setInterval(receiveSeeds,DELIVERY_INTERVAL);setInterval(()=>{sampleThanks();prune()},60*1000)});
})();
