(function(global){
  'use strict';
  const rows=[['x','x'],['y','y'],['z','z'],['rx','θx'],['ry','θy'],['rz','θz'],['g','G']];
  const clamp=(n,min=0,max=1)=>Math.min(max,Math.max(min,Number.isFinite(n)?n:min));
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function progressAt(alignment,time){
    if(!alignment.length)return 0;
    if(time<=alignment[0][0])return clamp(alignment[0][1]);
    for(let i=1;i<alignment.length;i++){
      const [t1,p1]=alignment[i], [t0,p0]=alignment[i-1];
      if(time<=t1)return clamp(p0+(p1-p0)*(t1===t0?1:(time-t0)/(t1-t0)));
    }
    return clamp(alignment[alignment.length-1][1]);
  }
  function createAlgorithmPanel({root,onSeek=()=>{},onProgressSeek=()=>{},onAnchorFocus=()=>{}}){
    if(!root)throw new Error('Algorithm panel requires a root element.');
    root.classList.add('algorithm-panel');root.setAttribute('aria-label','Map Interface');
    const studio=document.body.dataset.layout==='compact';
    root.innerHTML=`<div class="algorithm-heading"><div class="algorithm-heading-copy"><h2>Map Interface</h2><span class="algorithm-ref-type" aria-label="Reference type"></span></div>${studio?'<output class="algorithm-progress" aria-label="Current task progress">Progress p = 0.00</output>':`<label class="algorithm-window-toggle" title="Illustrative reference window: ±0.10 task progress"><input type="checkbox" checked>Local window</label>`}</div>
      <div class="algorithm-timeline" role="group" aria-label="Seven-dimensional reference mask"><input class="algorithm-scrub-input" type="range" min="0" max="100" step="1" value="0" aria-label="Illustrative task progress"><svg class="algorithm-plot" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"></svg></div>
      <div class="algorithm-footer"><div class="algorithm-legend"><span><i class="algorithm-known"></i><b>M = 1</b> Control reference</span><span><i class="algorithm-unknown"></i><b>M = 0</b> Mask</span><span><i class="algorithm-anchor-swatch"></i>Progress anchor</span>${studio?'':'<output class="algorithm-progress">p 0.00</output>'}</div><p class="algorithm-source"></p><p class="algorithm-status"></p></div>`;
    const query=selector=>root.querySelector(selector);
    const title=query('h2'), timeline=query('.algorithm-timeline'), svg=query('.algorithm-plot'), input=query('.algorithm-scrub-input'), source=query('.algorithm-source'), status=query('.algorithm-status'), progress=query('.algorithm-progress'), windowToggle=query('.algorithm-window-toggle input');
    let spec={anchors:[],frames:[],alignment:[]}, state={time:0,mode:'video',playing:false}, p=0, visible=false, dragging=null, width=0, plotLeft=studio?42:28, plotRight=540;
    let playhead=null, localWindow=null, anchorNodes=[], completedRows=[];
    let predicted=false;
    const predictionLabel=document.createElement('span');
    predictionLabel.className='prediction-state';predictionLabel.setAttribute('role','status');
    if(studio)query('.algorithm-heading-copy').append(predictionLabel);
    function setPrediction(value){
      predicted=!!value;root.classList.toggle('is-predicted',predicted);
      predictionLabel.textContent=p>0?'Inpainting':'Inpainting';
      if(studio){
        source.textContent='Illustrative inpainting · Recorded replay, not live inference.';
        query('.algorithm-known').parentElement.innerHTML='<i class="algorithm-known"></i>Inpainting';
        query('.algorithm-unknown').parentElement.innerHTML='<i class="algorithm-unknown"></i>Mask';
        timeline.setAttribute('aria-label','Inpainted actions up to current progress; future actions remain gray masks');
      }
    }
    const isEnabled=()=>state.mode==='rollout';
    const x=value=>plotLeft+clamp(value)*(plotRight-plotLeft);
    function setProgress(value){
      p=clamp(value);
      input.value=String(Math.round(p*100));
      input.setAttribute('aria-valuetext',`${Math.round(p*100)} percent illustrative task progress`);
      progress.textContent=studio?`Progress p = ${p.toFixed(2)}`:`p ${p.toFixed(2)}`;
      if(studio){
        completedRows.forEach(row=>row.setAttribute('width',Math.max(0,x(p)-plotLeft)));
        predictionLabel.textContent=p>0?'Inpainting':'Inpainting';
      }
      if(playhead)playhead.setAttribute('transform',`translate(${x(p)} 0)`);
      if(localWindow){localWindow.setAttribute('x',x(p-.1));localWindow.setAttribute('width',Math.max(0,x(p+.1)-x(p-.1)));localWindow.style.display=windowToggle.checked?'':'none';}
      anchorNodes.forEach((node,i)=>node.classList.toggle('is-current',Math.abs(p-spec.anchors[i].p)<.026));
    }
    function syncEnabled(){
      const enabled=isEnabled();
      input.disabled=!enabled;
      timeline.classList.toggle('is-disabled',!enabled);
      timeline.setAttribute('aria-disabled',String(!enabled));
      anchorNodes.forEach(node=>{node.setAttribute('tabindex',enabled?'0':'-1');node.setAttribute('aria-disabled',String(!enabled));});
      status.textContent=state.mode==='video'?'Watch video → 3D explanation':state.mode==='rollout'?(state.playing?'Playing · Select an anchor to inspect':'Paused · Select an anchor or drag the timeline'):'Preparing 3D · Reference mask shown below';
    }
    function draw(){
      const measured=timeline.clientWidth;
      width=measured>0?measured:width||540;
      plotRight=Math.max(plotLeft+80,width-10);
      const top=16,rowHeight=18,height=146,bottom=top+rows.length*rowHeight;
      svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
      let content=`<title>Reference mask for ${escape(spec.title||'selected motion')}</title>`;
      for(let i=0;i<rows.length;i++)content+=`<text class="algorithm-axis-label" x="${plotLeft-10}" y="${top+i*rowHeight+rowHeight/2}" dominant-baseline="middle" text-anchor="end">${rows[i][1]}</text><rect class="algorithm-mask-row" x="${plotLeft}" y="${top+i*rowHeight}" width="${plotRight-plotLeft}" height="${rowHeight-1}" rx="0"/>`;
      if(studio)for(let i=0;i<rows.length;i++)content+=`<rect class="algorithm-completed-row" x="${plotLeft}" y="${top+i*rowHeight}" width="0" height="${rowHeight-1}" rx="0" pointer-events="none"/>`;
      if(!studio)content+=`<rect class="algorithm-local-window" y="${top-2}" height="${bottom-top+1}" rx="3"/>`;content+=`<g class="algorithm-axis-ticks">`;
      (studio?[]:[0,.25,.5,.75,1]).forEach(t=>{content+=`<path d="M ${x(t)} ${bottom+1} v 3"/><text x="${x(t)}" y="${bottom+15}" text-anchor="${t===0?'start':t===1?'end':'middle'}">${t===1?'1.0':t.toFixed(2)}</text>`;});
      content+='</g>';
      spec.anchors.forEach((anchor,index)=>{
        const ax=x(anchor.p),window=anchor.window||[anchor.p-.012,anchor.p+.012],vals=Object.entries(anchor.valueLabels||{}).map(([key,val])=>`${rows.find(row=>row[0]===key)?.[1]||key}: ${val}`).join(', ');
        content+=`<g class="algorithm-anchor" data-algorithm-anchor="${index}" role="button" aria-label="${escape(`${anchor.label||'Reference '+(index+1)}, progress ${Math.round(anchor.p*100)} percent${vals?', '+vals:''}`)}"><title>${escape(anchor.label||'Reference '+(index+1))}${vals?' · '+escape(vals):''}</title><rect class="algorithm-anchor-hit" x="${ax-(anchor.p>.97?28:9)}" y="0" width="${anchor.p>.97?37:18}" height="${bottom+1}"/>${spec.refType==='3D Keypoint'?'':`<path class="algorithm-anchor-line" d="M ${ax} 14 V ${bottom}"/>`}<path class="algorithm-anchor-dot" d="M ${ax} ${bottom+1} l -5 8 h 10 Z"/><text class="algorithm-anchor-label" x="${ax}" y="7" text-anchor="${anchor.p<.03?'start':anchor.p>.97?'end':'middle'}">${spec.anchors.length<=8||index===0||index===spec.anchors.length-1||!anchor.label?.includes('Flow')?anchor.p.toFixed(2):''}</text>`;
        rows.forEach(([id],row)=>{if(anchor.rows?.includes(id))content+=`<rect class="algorithm-control-cell" x="${x(window[0])}" y="${top+row*rowHeight}" width="${Math.max(3,x(window[1])-x(window[0]))}" height="${rowHeight-1}" rx="0"/>`;});
        content+='</g>';
      });
      content+=`<g class="algorithm-playhead" pointer-events="none"><path d="M 0 9 V ${bottom+1}"/><path class="algorithm-playhead-cap" d="M -7 2 L 7 2 L 7 8 L 0 16 L -7 8 Z"/></g>`;
      svg.innerHTML=content;
      playhead=svg.querySelector('.algorithm-playhead');localWindow=svg.querySelector('.algorithm-local-window');anchorNodes=Array.from(svg.querySelectorAll('.algorithm-anchor'));
      completedRows=Array.from(svg.querySelectorAll('.algorithm-completed-row'));
      syncEnabled();setProgress(p);
    }
    function seekProgress(value){if(!isEnabled())return;setProgress(value);onProgressSeek(p);}
    function pointerProgress(event){const rect=svg.getBoundingClientRect();return clamp(((event.clientX-rect.left)*width/Math.max(1,rect.width)-plotLeft)/(plotRight-plotLeft));}
    function activateAnchor(node){if(!isEnabled())return;const anchor=spec.anchors[Number(node.dataset.algorithmAnchor)];if(anchor){setProgress(anchor.p);onAnchorFocus(anchor);}}
    timeline.addEventListener('pointerdown',event=>{
      if(!isEnabled()||event.button!==0)return;
      const anchor=event.target.closest('[data-algorithm-anchor]');
      if(anchor){event.preventDefault();anchor.focus();return;}
      if(event.target===input)return;
      const rect=svg.getBoundingClientRect(),localX=(event.clientX-rect.left)*width/Math.max(1,rect.width);
      if(localX<plotLeft||localX>plotRight)return;
      event.preventDefault();dragging=event.pointerId;timeline.setPointerCapture(event.pointerId);input.focus({preventScroll:true});seekProgress(pointerProgress(event));
    });
    timeline.addEventListener('pointermove',event=>{if(event.pointerId===dragging)seekProgress(pointerProgress(event));});
    timeline.addEventListener('click',event=>{const anchor=event.target.closest('[data-algorithm-anchor]');if(anchor)activateAnchor(anchor);});
    const endDrag=event=>{if(event.pointerId!==dragging)return;dragging=null;if(timeline.hasPointerCapture(event.pointerId))timeline.releasePointerCapture(event.pointerId);};
    timeline.addEventListener('pointerup',endDrag);timeline.addEventListener('pointercancel',endDrag);timeline.addEventListener('lostpointercapture',()=>{dragging=null;});
    timeline.addEventListener('keydown',event=>{
      const anchor=event.target.closest('[data-algorithm-anchor]');
      if(anchor&&(event.key==='Enter'||event.key===' ')){event.preventDefault();activateAnchor(anchor);}
    });
    input.addEventListener('input',()=>seekProgress(Number(input.value)/100));
    input.addEventListener('keydown',event=>{
      if(!isEnabled())return;
      const delta=event.shiftKey ? .1 : .01;
      const values={ArrowLeft:p-delta,ArrowDown:p-delta,ArrowRight:p+delta,ArrowUp:p+delta,Home:0,End:1};
      if(event.key in values){event.preventDefault();seekProgress(values[event.key]);}
    });
    windowToggle?.addEventListener('change',()=>setProgress(p));
    function setReference(next){
      spec={...next,anchors:next.anchors||[],frames:(next.frames||[]).slice(0,3),alignment:(next.alignment||[]).filter(pair=>pair.length===2&&pair.every(Number.isFinite)).slice().sort((a,b)=>a[0]-b[0])};
      dragging=null;
      title.textContent='Map Interface';
      const specified=rows.filter(([id])=>spec.anchors.some(anchor=>anchor.rows?.includes(id))).map(([,label])=>label).join(' · ');
      const type=spec.refType||({cup:'3D Keypoint',water:'Orientation',pick:'2D Flow'}[spec.task])||'Reference';
      query('.algorithm-ref-type').textContent=type;
      title.title=[`${type}: ${specified||'No constrained dimensions'}`,spec.refSummary||spec.title].filter(Boolean).join(' · ');
      source.textContent=spec.sourceNote||'Illustrative progress alignment; replay, not live policy inference.';
      state={time:0,mode:'video',playing:false};p=progressAt(spec.alignment,0);setPrediction(false);draw();
    }
    function update(next){
      const changed=state.mode!==next.mode||state.playing!==next.playing;
      state={...state,...next};
      if(changed)syncEnabled();
      const clock=spec.progressClock;
      const clockTime=clock?(studio?state.videoTime:PlaybackTiming.inverse(clock.replayKnots,Number(state.time)||0)):state.time;
      setProgress(progressAt(clock?clock.knots:spec.alignment,Number(clockTime)||0));
      return p;
    }
    function resize(){if(visible&&timeline.clientWidth&&Math.abs(timeline.clientWidth-width)>.5)draw();}
    function setVisible(value){visible=!!value;root.hidden=!visible;document.body.classList.toggle('algorithm-visible',visible);if(!visible)dragging=null;else resize();}
    if(typeof ResizeObserver!=='undefined')new ResizeObserver(resize).observe(timeline);
    root.hidden=true;
    draw();
    return {setReference,update,setVisible,resize,setPrediction};
  }
  global.createAlgorithmPanel=createAlgorithmPanel;
})(typeof window!=='undefined'?window:globalThis);
