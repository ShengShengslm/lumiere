(() => {
  const API=(window.LUMIERE_CONFIG?.API_BASE_URL||"/api").replace(/\/$/,"");
  const callPage=document.querySelector('[data-page="call"]');
  const status=document.querySelector("#call-status");
  const translation=document.querySelector("#call-translation");
  const spoken=document.querySelector("#call-spoken");
  const duration=document.querySelector("#call-duration");
  const modelSelect=document.querySelector("#model-select");
  const incoming=document.querySelector("#incoming-call");
  const incomingReason=document.querySelector("#incoming-call-reason");
  let active=false,muted=false,busy=false,startedAt=0,timer=null,audio=null;
  let micStream=null,recorder=null,recordTimer=null,discardRecording=false;
  let audioContext=null,analyser=null,toneTimer=null,toneSamples=[],speechDetected=false,silenceSince=0,lingerTimer=null,lingerSeconds=0;
  const voiceAudioCache=new Map();

  const tokenHeaders=()=>{const token=localStorage.getItem("lumiere-access-token")||"";return token?{Authorization:`Bearer ${token}`}:{}};
  async function apiRequest(path,{method="GET",body}={}){
    const response=await fetch(`${API}${path}`,{method,headers:{...(body?{"Content-Type":"application/json"}:{}),...tokenHeaders()},body:body?JSON.stringify(body):undefined});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`请求失败 (${response.status})`);
    return data;
  }
  async function jsonRequest(path,body){
    return apiRequest(path,{method:"POST",body});
  }
  function cachedSpeechUrl(text){
    const key=String(text||"").trim();
    if(!key)return Promise.reject(new Error("语音内容为空"));
    if(voiceAudioCache.has(key))return voiceAudioCache.get(key);
    const pending=fetch(`${API}/tts`,{method:"POST",headers:{"Content-Type":"application/json",...tokenHeaders()},body:JSON.stringify({text:key})})
      .then(async response=>{
        if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||"语音生成失败")}
        return URL.createObjectURL(await response.blob());
      })
      .catch(error=>{voiceAudioCache.delete(key);throw error});
    voiceAudioCache.set(key,pending);
    if(voiceAudioCache.size>40){
      const oldest=voiceAudioCache.keys().next().value;
      voiceAudioCache.get(oldest)?.then(url=>URL.revokeObjectURL(url)).catch(()=>{});
      voiceAudioCache.delete(oldest);
    }
    return pending;
  }
  function preloadVoiceNote(note){
    if(!note||note.dataset.preloading)return;
    note.dataset.preloading="1";note.classList.add("preloading");
    cachedSpeechUrl(note.dataset.tts).then(()=>note.classList.add("ready")).catch(()=>{}).finally(()=>note.classList.remove("preloading"));
  }
  async function playSpeech(text,button=null){
    button?.classList.add("loading");
    const url=await cachedSpeechUrl(text);
    audio?.pause();if(!audio)audio=new Audio();audio.src=url;audio.playsInline=true;
    button?.classList.remove("loading");button?.classList.add("playing");button?.querySelector(".voice-play-icon path")?.setAttribute("d","M8 7h3v10H8zM13 7h3v10h-3z");callPage?.classList.add("speaking");
    await audio.play();
    await new Promise(resolve=>{audio.onended=resolve;audio.onerror=resolve;audio.onpause=resolve});
    button?.classList.remove("playing");button?.querySelector(".voice-play-icon path")?.setAttribute("d","M9 7.5v9l7-4.5z");callPage?.classList.remove("speaking");
  }
  function unlockAudio(){
    if(!audio)audio=new Audio();
    audio.playsInline=true;
    audio.src="data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
    const attempt=audio.play();
    attempt?.then(()=>{audio.pause();audio.removeAttribute("src")}).catch(()=>{});
  }
  document.addEventListener("click",async event=>{
    const note=event.target.closest(".voice-note");if(!note)return;
    if(note.classList.contains("playing")){audio?.pause();note.classList.remove("playing");note.querySelector(".voice-play-icon path")?.setAttribute("d","M9 7.5v9l7-4.5z");return}
    try{await playSpeech(note.dataset.tts,note)}catch(error){note.classList.remove("loading");alert(error.message)}
  });
  const voiceObserver=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{
    if(!(node instanceof Element))return;
    if(node.matches?.(".voice-note"))preloadVoiceNote(node);
    node.querySelectorAll?.(".voice-note").forEach(preloadVoiceNote);
  })));
  voiceObserver.observe(document.body,{childList:true,subtree:true});
  setTimeout(()=>[...document.querySelectorAll(".voice-note")].slice(-3).forEach(preloadVoiceNote),600);
  function updateDuration(){const seconds=Math.floor((Date.now()-startedAt)/1000);duration.textContent=`${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`}
  async function ensureMicrophone(){
    if(micStream?.active)return micStream;
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error("当前浏览器不支持网页录音");
    micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    return micStream;
  }
  function startToneSampling(stream){
    toneSamples=[];speechDetected=false;silenceSince=0;
    try{
      audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
      analyser=audioContext.createAnalyser();analyser.fftSize=1024;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const values=new Uint8Array(analyser.fftSize);
      toneTimer=setInterval(()=>{
        analyser.getByteTimeDomainData(values);
        let sum=0;for(const value of values){const sample=(value-128)/128;sum+=sample*sample}
        const rms=Math.sqrt(sum/values.length);
        toneSamples.push(rms);
        if(rms>.015){speechDetected=true;silenceSince=0}
        else if(speechDetected){
          silenceSince ||= Date.now();
          if(Date.now()-silenceSince>1800&&recorder?.state==="recording")recorder.stop();
        }
      },70);
    }catch{analyser=null}
  }
  function finishToneSampling(durationMs=6500){
    clearInterval(toneTimer);toneTimer=null;
    if(!toneSamples.length)return null;
    const voiced=toneSamples.filter(value=>value>.012);
    const energy=voiced.length?voiced.reduce((sum,value)=>sum+value,0)/voiced.length:0;
    const pause=1-(voiced.length/toneSamples.length);
    return {duration:Math.round(durationMs)/1000,energy:Number(energy.toFixed(4)),pause:Number(pause.toFixed(3))};
  }
  async function transcribe(blob){
    const response=await fetch(`${API}/stt`,{method:"POST",headers:{...tokenHeaders(),"Content-Type":blob.type||"audio/webm"},body:blob});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"没有听清");
    return String(data.text||"").trim();
  }
  async function listen(){
    if(!active||muted||busy||recorder?.state==="recording")return;
    try{
      const stream=await ensureMicrophone();
      const preferred=["audio/mp4","audio/webm;codecs=opus","audio/webm"].find(type=>MediaRecorder.isTypeSupported?.(type));
      recorder=new MediaRecorder(stream,preferred?{mimeType:preferred}:undefined);
      startToneSampling(stream);const recordedAt=Date.now();
      const chunks=[];
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)};
      recorder.onstop=async()=>{
        clearTimeout(recordTimer);
        const tone=finishToneSampling(Date.now()-recordedAt);
        if(discardRecording){discardRecording=false;return}
        if(!active||muted)return;
        const blob=new Blob(chunks,{type:recorder.mimeType||chunks[0]?.type||"audio/webm"});
        if(blob.size<500){setTimeout(listen,300);return}
        busy=true;status.textContent="正在听懂你说的话…";
        try{const text=await transcribe(blob);if(text)await reply(text,tone);else{busy=false;status.textContent="没有听清，再说一次吧";setTimeout(listen,500)}}
        catch(error){busy=false;translation.textContent=error.message;status.textContent="语音识别暂时失败";setTimeout(listen,900)}
      };
      recorder.start(250);status.textContent="正在听你说话…";
      recordTimer=setTimeout(()=>{if(recorder?.state==="recording")recorder.stop()},20000);
    }catch(error){status.textContent=error.name==="NotAllowedError"?"请允许 Lumière 使用麦克风":error.message;translation.textContent="麦克风没有连接成功。"}
  }
  function cancelLinger(){
    if(!lingerTimer)return;
    clearInterval(lingerTimer);lingerTimer=null;lingerSeconds=0;status.textContent="还在通话中";
  }
  function beginLinger(){
    lingerSeconds=15;status.textContent=`顾克在等你 · ${lingerSeconds}s`;
    lingerTimer=setInterval(()=>{
      lingerSeconds-=1;
      if(lingerSeconds<=0){clearInterval(lingerTimer);lingerTimer=null;hangup();return}
      status.textContent=`顾克在等你 · ${lingerSeconds}s`;
    },1000);
  }
  async function reply(content,tone=null){
    cancelLinger();
    spoken.textContent=content;
    busy=true;status.textContent="顾克正在回应…";
    try{
      const data=await jsonRequest("/call/reply",{content,tone,model:modelSelect.value,session_id:Number(localStorage.getItem("lumiere-session-id"))||null});
      translation.textContent=data.translation;status.textContent="顾克正在说话";
      await playSpeech(data.spoken);
      if(data.action==="hangup"){busy=false;beginLinger();return}
    }catch(error){translation.textContent=error.message;status.textContent="通话暂时中断"}
    finally{busy=false;if(active&&!muted)setTimeout(listen,350)}
  }
  async function startCall(){
    if(active)return;unlockAudio();active=true;startedAt=Date.now();duration.textContent="00:00";timer=setInterval(updateDuration,1000);
    document.querySelector("#call-start-button").classList.add("active");document.querySelector("#call-start-button span").textContent="通话中";
    translation.textContent="我在听。你可以直接说话。";spoken.textContent="等待你的声音…";status.textContent="正在请求麦克风…";
    await listen();
  }
  function hangup(){
    const seconds=startedAt?Math.max(1,Math.round((Date.now()-startedAt)/1000)):0;
    active=false;busy=false;clearInterval(timer);clearTimeout(recordTimer);
    clearInterval(lingerTimer);lingerTimer=null;clearInterval(toneTimer);toneTimer=null;
    if(recorder?.state==="recording")recorder.stop();micStream?.getTracks().forEach(track=>track.stop());micStream=null;audio?.pause();callPage.classList.remove("speaking");
    status.textContent="通话已结束";document.querySelector("#call-start-button").classList.remove("active");document.querySelector("#call-start-button span").textContent="开始";
    if(seconds>=5)jsonRequest("/call/record",{session_id:Number(localStorage.getItem("lumiere-session-id"))||null,seconds}).then(()=>window.dispatchEvent(new Event("lumiere:call-recorded"))).catch(()=>{});
    startedAt=0;
    window.LumiereSwitchPage?.("chat");
  }
  let shownInviteId="";
  async function pollInvite(){
    if(active||document.hidden)return;
    try{
      const {invite}=await apiRequest("/call/invite");
      if(!invite){incoming.hidden=true;shownInviteId="";return}
      if(invite.id===shownInviteId&&!incoming.hidden)return;
      shownInviteId=invite.id;incoming.dataset.inviteId=invite.id;incoming.dataset.sessionId=invite.session_id;
      incomingReason.textContent=invite.reason||"想听听你的声音。";incoming.hidden=false;
    }catch{}
  }
  document.querySelector("#incoming-call-accept")?.addEventListener("click",async()=>{
    const id=incoming.dataset.inviteId;if(!id)return;
    try{await apiRequest("/call/answer",{method:"POST",body:{id,action:"accept"}})}catch{}
    if(incoming.dataset.sessionId)localStorage.setItem("lumiere-session-id",incoming.dataset.sessionId);
    incoming.hidden=true;window.LumiereSwitchPage?.("call");setTimeout(startCall,180);
  });
  document.querySelector("#incoming-call-decline")?.addEventListener("click",async()=>{
    const id=incoming.dataset.inviteId;if(!id)return;
    const note=window.prompt("想留一句什么给顾克？（可以留空）","现在不方便，晚点找你");
    try{await apiRequest("/call/answer",{method:"POST",body:{id,action:"decline",note:note||""}})}catch{}
    incoming.hidden=true;
  });
  document.querySelector("#start-call-button")?.addEventListener("click",()=>{window.LumiereSwitchPage?.("call");setTimeout(startCall,250)});
  document.querySelector("#call-start-button")?.addEventListener("click",startCall);
  document.querySelector("#call-hangup-button")?.addEventListener("click",hangup);
  document.querySelector("#call-back-button")?.addEventListener("click",hangup);
  document.querySelector("#call-mute-button")?.addEventListener("click",event=>{muted=!muted;event.currentTarget.classList.toggle("muted",muted);if(muted){if(recorder?.state==="recording")recorder.stop();status.textContent="麦克风已静音"}else listen()});
  document.querySelector("#call-text-form")?.addEventListener("submit",event=>{event.preventDefault();const input=document.querySelector("#call-text-input");const text=input.value.trim();if(!text||busy)return;input.value="";if(!active)startCall();if(recorder?.state==="recording"){discardRecording=true;recorder.stop()}reply(text)});
  setInterval(pollInvite,8000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)pollInvite()});setTimeout(pollInvite,1200);
})();
