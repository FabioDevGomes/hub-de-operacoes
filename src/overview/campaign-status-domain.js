(function(global){
  const digits=value=>String(value??'').replace(/\D/g,'');
  const timestamp=value=>{const parsed=typeof value==='number'?value:Date.parse(value||'');return Number.isFinite(parsed)?parsed:NaN};
  const statusCode=value=>{const status=String(value||'').trim().toUpperCase();return['ENABLED','PAUSED','REMOVED'].includes(status)?status:''};
  const statusForCode=status=>status==='ENABLED'?'ativa':status==='PAUSED'||status==='REMOVED'?'pausada':'';
  function matchesIdentity(record,identity){
    if(!record||!identity?.managerCustomerId||!identity?.customerId||!identity?.campaignId)return false;
    return digits(record.managerCustomerId)===digits(identity.managerCustomerId)
      &&digits(record.customerId)===digits(identity.customerId)
      &&String(record.campaignId||'')===String(identity.campaignId||'');
  }
  function resolveCampaignStatus({fallbackStatus='ativa',apiStatus='',apiObservedAt='',captureSavedAt='',identity=null,memoryOverride=null,persistedOverride=null,automaticPauseAt=NaN,diaryPauseAt=NaN}={}){
    const api=statusCode(apiStatus),observedAt=timestamp(apiObservedAt),captureAt=timestamp(captureSavedAt);
    const overrides=[memoryOverride,persistedOverride].filter(item=>matchesIdentity(item,identity)&&statusCode(item.status)&&Number.isFinite(timestamp(item.verifiedAtUtc)))
      .sort((a,b)=>timestamp(a.verifiedAtUtc)-timestamp(b.verifiedAtUtc));
    let override=overrides.at(-1)||null;
    const overrideAt=timestamp(override?.verifiedAtUtc),sameReportedSecond=Number.isFinite(observedAt)&&Number.isFinite(overrideAt)&&Math.floor(observedAt/1000)===Math.floor(overrideAt/1000);
    const apiStatusIsNewer=Boolean(override)&&(observedAt>overrideAt||(sameReportedSecond&&captureAt>overrideAt));
    if(apiStatusIsNewer)override=null;
    const verifiedOverrideAt=timestamp(override?.verifiedAtUtc),pauseTimes=[timestamp(automaticPauseAt),timestamp(diaryPauseAt)].filter(Number.isFinite),pauseAt=pauseTimes.length?Math.max(...pauseTimes):NaN;
    let status=statusForCode(api)||(['ativa','pausada','historico'].includes(fallbackStatus)?fallbackStatus:'ativa');
    if(override)status=statusForCode(override.status)||status;
    const apiReactivated=api==='ENABLED'&&Number.isFinite(pauseAt)&&observedAt>pauseAt,apiRemoved=api==='REMOVED'&&Number.isFinite(pauseAt)&&observedAt>pauseAt;
    const laterManualStatus=Boolean(override)&&Number.isFinite(pauseAt)&&verifiedOverrideAt>pauseAt;
    const laterManualReactivation=laterManualStatus&&override.status==='ENABLED';
    const autoPauseCurrent=Number.isFinite(pauseAt)&&pauseAt>0&&!apiReactivated&&!apiRemoved&&!laterManualStatus;
    if(autoPauseCurrent)status='pausada';
    const actionStatus=laterManualStatus?override.status:autoPauseCurrent?'PAUSED':override?.status||(api==='REMOVED'?'REMOVED':api);
    return{status,actionStatus,autoPauseCurrent,autoPauseAt:Number.isFinite(pauseAt)?pauseAt:null,apiReactivated,laterManualReactivation};
  }
  global.CampaignStatusDomain=Object.freeze({resolveCampaignStatus,matchesIdentity,statusCode,statusForCode});
})(globalThis);
