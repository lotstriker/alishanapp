'use strict';
const {stores}=require('./database');
// Only named, audited readers bypass the write transaction. New/unknown actions
// default to the locked write path, including settings, backups and searches.
const readers=new Set(`init getDamagedCount getReferenceError getQualityData getColors getColorStyle getColorStyleSafe colorDisplayName getPrice getItems getItem hasItems itemCount getPayments query summary paginate typeStats qualityOptions lowStockItems itemPayment getRecentActivity getQualityHistory missingLotItems pendingList paymentCards advancedPaymentSearch weekOptions weeklyReport paymentHistory valuationTrend qualitySummary agingReport exportRows exportFilterItems exportSizeRows exportTotals exportInRange exportParseDate normalizeQualityHistory completionInfo missingCompletionItems suggest getSearchHistory getSearchAnalytics parseBulk getProductTypes typeOfQuality closeQualities closeColors colorChoices checkImportDraft batchDuplicateIds importTotals aiPrompt listImportBatches backupFile listBackups getBackupSettings inspectBackup`.split(' '));
const referenceReaders=new Set('getQualityData getColors getColorStyle getColorStyleSafe colorDisplayName getPrice getProductTypes getReferenceError exportSizeRows exportTotals exportInRange exportParseDate normalizeQualityHistory completionInfo paginate'.split(' '));
const dbReaders=new Set('init get getAll getAllFrom getSetting getTheme getSearchAnalytics getSearchHistory getInventory getPayments getArchive getQualityHistory getRecentActivity'.split(' '));
function isReader(c){return ['Calc','Groups','Search','Views','Reports'].includes(c.target)||c.target==='Store'&&readers.has(c.method)||c.target==='DB'&&dbReaders.has(c.method)||c.target==='Archive'&&['list','summary','scanLeftovers'].includes(c.method);}
function selection(calls){
 const selected=new Set(),settings=new Set(['importAliases','searchHistory','searchAnalytics','autoBackupEnabled','backupFrequency','lastBackupDate']);let allSettings=false;
 for(const c of calls){
  if(['Calc','Groups','Search'].includes(c.target)||c.target==='Store'&&referenceReaders.has(c.method))continue;
  if(c.target==='Archive'&&c.method==='list'){selected.add('archive');continue;}
  if(c.target==='DB'){
   const m=c.method,a=c.args||[];
   if(m==='init')continue;
   const named={getInventory:'inventory',getPayments:'payments',getArchive:'archive',getQualityHistory:'auditLog',getRecentActivity:'editHistory'};
   if(named[m])selected.add(named[m]);
   else if(['get','getAll','getAllFrom'].includes(m)){selected.add(a[0]);if(a[0]==='settings'){if(m==='get')settings.add(a[1]);else allSettings=true;}}
   else{selected.add('settings');settings.add(({getTheme:'selectedTheme',getSearchHistory:'searchHistory',getSearchAnalytics:'searchAnalytics'})[m]||a[0]);}
  }else{
   for(const s of ['inventory','payments','auditLog','settings'])selected.add(s);
   if(['getRecentActivity','pageBundle'].includes(c.method)||c.target==='Reports')selected.add('editHistory');
   if(c.method==='listBackups')settings.add('autoBackups');
   if(c.method==='getDamagedCount')settings.add('corruptedItemsBackup');
   if(c.target==='Archive')for(const s of ['inventory','archive','auditLog','editHistory','payments'])selected.add(s);
  }
 }
 return {stores:[...selected].sort(),settings:allSettings?null:[...settings].filter(k=>typeof k==='string').sort()};
}
module.exports={isReader,selection};
