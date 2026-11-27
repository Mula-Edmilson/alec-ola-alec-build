/* ALEC Orb Evolution: original projected-3D filament renderer. No external dependencies. */
(() => {
  'use strict';
  const root = window.Roamie = window.Roamie || {};
  const TAU = Math.PI * 2, clamp = (x,a,b) => Math.min(b,Math.max(a,x));
  const profiles = {
    idle:[0.22,0.10,0.13,'100,185,255'], listen:[0.55,0.22,0.38,'92,222,255'],
    talk:[0.65,0.20,0.48,'148,207,255'], think:[0.80,0.25,0.55,'119,154,255'],
    execute:[0.95,0.24,0.65,'93,174,255'], error:[0.18,0.12,0.20,'255,147,147']
  };
  function paint(ctx,cx,cy,R,st={}) {
    if(!ctx || !Number.isFinite(R) || R<1)return;
    const mode=Object.hasOwn(profiles,st.mode)?st.mode:'idle', profile=profiles[mode];
    const t=st.reduced?0:(Number(st.t)||0), level=clamp(Number(st.level)||0,0,1);
    const audio=mode==='talk'||mode==='listen'?level:0;
    const energy=profile[2]+audio*.45, motion=t*profile[0];
    const p=R*.83*(1+.025*Math.sin(t*1.65)+.085*audio), tilt=.37+.12*Math.sin(motion*.28), yaw=motion*.34;
    const ct=Math.cos(tilt),sn=Math.sin(tilt),ca=Math.cos(yaw),sa=Math.sin(yaw);
    const project=(a,b,phase=0)=>{
      const cb=Math.cos(b), r=p*(1+profile[1]*Math.sin(3*a+b*2+motion+phase)*cb*cb+.055*Math.cos(5*a-b*3-motion*.6)+.045*audio*Math.sin(a*7-motion*3));
      const twist=a+.24*Math.sin(b*2.6+motion*.54)+.12*Math.sin(a*2+b);
      const x=r*cb*Math.cos(twist), y=r*Math.sin(b), z=r*cb*Math.sin(twist);
      const X=x*ca+z*sa, Z=z*ca-x*sa, Y=y*ct-Z*sn, depth=y*sn+Z*ct;
      const perspective=1/(1-depth/(R*5));
      return [cx+X*perspective,cy+Y*perspective,depth/R];
    };
    const rgba=(c,a)=>'rgba('+c+','+clamp(a,0,1)+')';
    ctx.save();
    try {
      ctx.beginPath();ctx.arc(cx,cy,R*1.47,0,TAU);ctx.clip();
      ctx.globalCompositeOperation='source-over';
      const halo=ctx.createRadialGradient(cx,cy,0,cx,cy,R*1.43);
      halo.addColorStop(0,rgba(profile[3],.075+energy*.04));halo.addColorStop(.52,rgba(profile[3],.035));halo.addColorStop(.83,rgba(profile[3],.014));halo.addColorStop(1,rgba(profile[3],0));
      ctx.fillStyle=halo;ctx.fillRect(cx-R*1.43,cy-R*1.43,R*2.86,R*2.86);
      ctx.lineJoin='round';ctx.lineCap='round';
      const count=R<35?24:R<65?34:42, samples=R<35?48:R<65?72:96;
      // Project each strand once, then draw its rear and front sections separately.
      const strands=Array.from({length:count},(_,j)=>{
        const b=Math.asin(-1+2*(j+.5)/count);
        return Array.from({length:samples+1},(_,k)=>project(k/samples*TAU,b));
      });
      for(let layer=0;layer<2;layer++){
        for(let j=0;j<count;j++){
          const pts=strands[j];
          ctx.beginPath();let connected=false;
          for(let k=0;k<pts.length;k++){
            const [x,y,z]=pts[k];const active=layer===0?z<.06:z>=.06;
            if(active){if(!connected)ctx.moveTo(x,y);else ctx.lineTo(x,y);connected=true;}else connected=false;
          }
          ctx.lineWidth=Math.max(.45,R*.020);ctx.strokeStyle=rgba(profile[3],layer===0?.028:.075+energy*.035);ctx.stroke();
          ctx.lineWidth=Math.max(.34,R*.008);ctx.strokeStyle=rgba(layer===0?'89,140,219':j%6===0?'230,248,255':profile[3],layer===0?.14:.46+energy*.20);ctx.stroke();
        }
      }
      for(let i=0;i<(R<35?36:88);i++){
        const b=Math.asin(-1+2*((i*.61803398875)%1)),a=i*2.39996323+motion*(.28+.04*(i%4));
        const [x,y,z]=project(a,b),alpha=.13+.56*clamp((z+1)/2,0,1);
        ctx.fillStyle=rgba(i%9===0?'242,251,255':profile[3],alpha);ctx.beginPath();ctx.arc(x,y,Math.max(.45,R*(i%9===0?.014:.008)),0,TAU);ctx.fill();
      }
      for(let j=0;j<3;j++){
        ctx.beginPath();const angle=j*1.05+motion*.09, c=Math.cos(angle),s=Math.sin(angle), rx=R*(1.04+j*.035),ry=R*(.37+j*.06);
        for(let k=0;k<=72;k++){let a=k/72*TAU,x=rx*Math.cos(a),y=ry*Math.sin(a);const xx=cx+x*c-y*s, yy=cy+x*s+y*c;k?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);}
        ctx.strokeStyle=rgba(profile[3],.11+j*.024);ctx.lineWidth=Math.max(.4,R*.006);ctx.stroke();
      }
      const cr=R*(.22+audio*.09+energy*.035),core=ctx.createRadialGradient(cx,cy,0,cx,cy,cr);
      core.addColorStop(0,'rgba(255,255,255,.98)');core.addColorStop(.10,'rgba(227,245,255,.94)');core.addColorStop(.28,rgba(profile[3],.75));core.addColorStop(.60,rgba(profile[3],.15));core.addColorStop(1,rgba(profile[3],0));
      ctx.fillStyle=core;ctx.beginPath();ctx.arc(cx,cy,cr,0,TAU);ctx.fill();
    } finally {ctx.restore();}
  }
  root.alecOrb={revision:'ALEC_ORB_EVOLUTION_V1',paint};
})();
