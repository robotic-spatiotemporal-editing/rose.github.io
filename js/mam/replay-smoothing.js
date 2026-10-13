/* Symmetric, bounded filtering reduces frame jitter without a time lag.
   Recorded samples stay immutable; contact and reference samples are pinned. */
(function(root){
 function smooth(samples,getTime,getValues,putValues,anchors=[]){
  const pins=[getTime(samples[0]),getTime(samples.at(-1)),...anchors];
  return samples.map((sample,i)=>{
   const values=getValues(sample),t=getTime(sample),distance=Math.min(...pins.map(a=>Math.abs(t-a)));
   const strength=Math.min(1,distance/.08);
   if(!strength)return putValues(sample,values.slice());
   const weights=[1,4,6,4,1];
   const filtered=values.map((v,k)=>{if(k>=7)return v;let sum=0;for(let j=-2;j<=2;j++)sum+=getValues(samples[Math.max(0,Math.min(samples.length-1,i+j))])[k]*weights[j+2];return v+strength*Math.max(-.006,Math.min(.006,sum/16-v));});
   return putValues(sample,filtered);
  });
 }
 function interpolate(samples,time,getTime,getValues){
  let lo=0,hi=samples.length-1;
  if(time<=getTime(samples[lo]))return getValues(samples[lo]).slice();
  if(time>=getTime(samples[hi]))return getValues(samples[hi]).slice();
  while(hi-lo>1){const mid=(lo+hi)>>1;if(getTime(samples[mid])<=time)lo=mid;else hi=mid;}
  const a=getValues(samples[lo]),b=getValues(samples[hi]),left=samples[Math.max(0,lo-1)],right=samples[Math.min(samples.length-1,hi+1)];
  const h=getTime(samples[hi])-getTime(samples[lo]),u=(time-getTime(samples[lo]))/h;
  return a.map((v,k)=>{
   if(k>=7)return v+(b[k]-v)*u;
   const d=(b[k]-v)/h,dl=lo?(v-getValues(left)[k])/(getTime(samples[lo])-getTime(left)):d,dr=hi<samples.length-1?(getValues(right)[k]-b[k])/(getTime(right)-getTime(samples[hi])):d;
   const tangent=(x,y)=>x*y<=0?0:2*x*y/(x+y),m0=tangent(dl,d),m1=tangent(d,dr);
   return (2*u**3-3*u*u+1)*v+(u**3-2*u*u+u)*h*m0+(-2*u**3+3*u*u)*b[k]+(u**3-u*u)*h*m1;
  });
 }
 root.ReplaySmoothing={smooth,interpolate};if(typeof module!=='undefined')module.exports=root.ReplaySmoothing;
})(typeof window==='undefined'?globalThis:window);
