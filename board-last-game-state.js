(function(){
            try{
              const saved=localStorage.getItem('yachiyoLiveScoreLastGame');
              if(saved){
                const game=JSON.parse(saved);
                if(game&&typeof game==='object'){
                  const wrap=document.getElementById('liveScoreRestoreWrap');
                  if(wrap)wrap.hidden=false;
                }
              }
            }catch(e){}
          })();
