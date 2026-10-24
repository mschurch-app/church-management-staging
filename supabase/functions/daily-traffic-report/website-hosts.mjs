// The GA4 property also contains local previews; reports count only the public site.
export function websiteHostFilter(){return {filter:{fieldName:'hostName',inListFilter:{values:['mchurch.online','www.mchurch.online'],caseSensitive:false}}};}
