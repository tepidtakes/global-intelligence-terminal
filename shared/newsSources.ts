// Who published a headline, and how much weight it can carry. Tiers describe what kind of
// outlet it is (primary source, wire service, public broadcaster, paper of record…), not
// its politics. Used by the server to rank, corroborate and filter news, and by the UI to
// label every headline. Unknown outlets are shown as "unrated", never hidden silently.

export type PublisherTier = 'official' | 'wire' | 'broadcaster' | 'major' | 'specialist' | 'state-media' | 'unrated';

export const TIER_INFO: Record<PublisherTier, { label: string; rank: number; help: string }> = {
  official: { label: 'official', rank: 1, help: 'Primary source: a government, central bank, regulator or international organisation publishing its own decisions and data.' },
  wire: { label: 'wire', rank: 1, help: 'News agency (wire service) whose reporting other outlets republish; strict sourcing and corrections policies.' },
  broadcaster: { label: 'public broadcaster', rank: 2, help: 'Public-service broadcaster with a published editorial-independence charter.' },
  major: { label: 'major outlet', rank: 2, help: 'Established newspaper, broadcaster or business publication with a public corrections policy.' },
  specialist: { label: 'specialist', rank: 3, help: 'Specialist or regional publication with an editorial track record in its field.' },
  'state-media': { label: 'state media', rank: 4, help: 'Outlet controlled by a government. Useful for that government’s stated position; not independent reporting.' },
  unrated: { label: 'unrated', rank: 5, help: 'Outlet not in the terminal’s publisher list. Check the original before relying on it.' },
};

/** Headlines from tiers at or above this rank count as "trusted" (filters, corroboration, signals). */
export const TRUSTED_RANK = 3;

export interface Publisher { id: string; name: string; tier: PublisherTier; domains: string[]; country?: string; note?: string; paywalled?: boolean; }

const P = (id: string, name: string, tier: PublisherTier, domains: string[], country?: string, note?: string): Publisher => ({ id, name, tier, domains, country, note });

export const PUBLISHERS: Publisher[] = [
  // Wire services / national news agencies
  P('reuters', 'Reuters', 'wire', ['reuters.com'], 'GBR'),
  P('ap', 'Associated Press', 'wire', ['apnews.com', 'ap.org'], 'USA'),
  P('afp', 'Agence France-Presse', 'wire', ['afp.com'], 'FRA'),
  P('bloomberg', 'Bloomberg', 'wire', ['bloomberg.com'], 'USA'),
  P('dpa', 'dpa', 'wire', ['dpa-international.com', 'dpa.com'], 'DEU'),
  P('kyodo', 'Kyodo News', 'wire', ['kyodonews.net', 'english.kyodonews.net'], 'JPN'),
  P('yonhap', 'Yonhap News Agency', 'wire', ['yna.co.kr', 'en.yna.co.kr', 'yonhapnews.co.kr'], 'KOR'),
  P('ansa', 'ANSA', 'wire', ['ansa.it'], 'ITA'),
  P('efe', 'EFE', 'wire', ['efe.com'], 'ESP'),
  P('pti', 'Press Trust of India', 'wire', ['ptinews.com'], 'IND'),
  // Public-service broadcasters
  P('bbc', 'BBC News', 'broadcaster', ['bbc.com', 'bbc.co.uk'], 'GBR'),
  P('npr', 'NPR', 'broadcaster', ['npr.org'], 'USA'),
  P('pbs', 'PBS NewsHour', 'broadcaster', ['pbs.org'], 'USA'),
  P('dw', 'Deutsche Welle', 'broadcaster', ['dw.com'], 'DEU'),
  P('france24', 'France 24', 'broadcaster', ['france24.com'], 'FRA'),
  P('rfi', 'RFI', 'broadcaster', ['rfi.fr'], 'FRA'),
  P('cbc', 'CBC News', 'broadcaster', ['cbc.ca'], 'CAN'),
  P('abc-au', 'ABC News (Australia)', 'broadcaster', ['abc.net.au'], 'AUS'),
  P('nhk', 'NHK World', 'broadcaster', ['nhk.or.jp'], 'JPN'),
  P('rnz', 'RNZ', 'broadcaster', ['rnz.co.nz'], 'NZL'),
  P('swissinfo', 'Swissinfo', 'broadcaster', ['swissinfo.ch'], 'CHE'),
  P('rferl', 'Radio Free Europe/Radio Liberty', 'broadcaster', ['rferl.org'], 'USA', 'Funded by the US Congress through the US Agency for Global Media'),
  // Major newspapers, broadcasters and business press
  P('nyt', 'The New York Times', 'major', ['nytimes.com'], 'USA'),
  P('wsj', 'The Wall Street Journal', 'major', ['wsj.com'], 'USA'),
  P('ft', 'Financial Times', 'major', ['ft.com'], 'GBR'),
  P('wapo', 'The Washington Post', 'major', ['washingtonpost.com'], 'USA'),
  P('guardian', 'The Guardian', 'major', ['theguardian.com'], 'GBR'),
  P('economist', 'The Economist', 'major', ['economist.com'], 'GBR'),
  P('nikkei', 'Nikkei Asia', 'major', ['nikkei.com'], 'JPN'),
  P('cnbc', 'CNBC', 'major', ['cnbc.com'], 'USA'),
  P('marketwatch', 'MarketWatch', 'major', ['marketwatch.com'], 'USA'),
  P('barrons', 'Barron’s', 'major', ['barrons.com'], 'USA'),
  P('politico', 'Politico', 'major', ['politico.com', 'politico.eu'], 'USA'),
  P('axios', 'Axios', 'major', ['axios.com'], 'USA'),
  P('cnn', 'CNN', 'major', ['cnn.com'], 'USA'),
  P('nbc', 'NBC News', 'major', ['nbcnews.com'], 'USA'),
  P('cbs', 'CBS News', 'major', ['cbsnews.com'], 'USA'),
  P('abc-us', 'ABC News', 'major', ['abcnews.go.com', 'abcnews.com'], 'USA'),
  P('fox', 'Fox News', 'major', ['foxnews.com', 'foxbusiness.com'], 'USA'),
  P('latimes', 'Los Angeles Times', 'major', ['latimes.com'], 'USA'),
  P('times-uk', 'The Times', 'major', ['thetimes.com', 'thetimes.co.uk'], 'GBR'),
  P('telegraph', 'The Telegraph', 'major', ['telegraph.co.uk'], 'GBR'),
  P('aljazeera', 'Al Jazeera', 'major', ['aljazeera.com'], 'QAT', 'Funded by the State of Qatar'),
  P('scmp', 'South China Morning Post', 'major', ['scmp.com'], 'HKG'),
  P('japantimes', 'The Japan Times', 'major', ['japantimes.co.jp'], 'JPN'),
  P('hindu', 'The Hindu', 'major', ['thehindu.com'], 'IND'),
  P('straitstimes', 'The Straits Times', 'major', ['straitstimes.com'], 'SGP'),
  P('cna', 'CNA', 'major', ['channelnewsasia.com'], 'SGP', 'Owned by Mediacorp, a Singapore state investment company'),
  P('globeandmail', 'The Globe and Mail', 'major', ['theglobeandmail.com'], 'CAN'),
  P('smh', 'The Sydney Morning Herald', 'major', ['smh.com.au'], 'AUS'),
  P('lemonde', 'Le Monde', 'major', ['lemonde.fr'], 'FRA'),
  P('spiegel', 'Der Spiegel', 'major', ['spiegel.de'], 'DEU'),
  P('handelsblatt', 'Handelsblatt', 'major', ['handelsblatt.com'], 'DEU'),
  P('elpais', 'El País', 'major', ['elpais.com'], 'ESP'),
  P('euronews', 'Euronews', 'major', ['euronews.com'], 'FRA'),
  // Specialist and regional
  P('foreignpolicy', 'Foreign Policy', 'specialist', ['foreignpolicy.com']),
  P('foreignaffairs', 'Foreign Affairs', 'specialist', ['foreignaffairs.com']),
  P('diplomat', 'The Diplomat', 'specialist', ['thediplomat.com']),
  P('defensenews', 'Defense News', 'specialist', ['defensenews.com']),
  P('breakingdefense', 'Breaking Defense', 'specialist', ['breakingdefense.com']),
  P('spglobal', 'S&P Global Commodity Insights', 'specialist', ['spglobal.com']),
  P('argus', 'Argus Media', 'specialist', ['argusmedia.com']),
  P('caixin', 'Caixin Global', 'specialist', ['caixinglobal.com'], 'CHN'),
  P('kyivindependent', 'The Kyiv Independent', 'specialist', ['kyivindependent.com'], 'UKR'),
  P('timesofisrael', 'The Times of Israel', 'specialist', ['timesofisrael.com'], 'ISR'),
  P('haaretz', 'Haaretz', 'specialist', ['haaretz.com'], 'ISR'),
  P('meduza', 'Meduza', 'specialist', ['meduza.io'], 'RUS'),
  P('restofworld', 'Rest of World', 'specialist', ['restofworld.org']),
  P('semafor', 'Semafor', 'specialist', ['semafor.com']),
  // Official / primary sources (the domain rules below cover most other government sites)
  P('fed', 'Federal Reserve Board', 'official', ['federalreserve.gov'], 'USA'),
  P('ecb', 'European Central Bank', 'official', ['ecb.europa.eu'], undefined),
  P('boe', 'Bank of England', 'official', ['bankofengland.co.uk'], 'GBR'),
  P('boj', 'Bank of Japan', 'official', ['boj.or.jp'], 'JPN'),
  P('imf', 'International Monetary Fund', 'official', ['imf.org']),
  P('worldbank', 'World Bank', 'official', ['worldbank.org']),
  P('un-news', 'UN News', 'official', ['un.org']),
  P('wto', 'World Trade Organization', 'official', ['wto.org']),
  P('oecd', 'OECD', 'official', ['oecd.org']),
  P('bis', 'Bank for International Settlements', 'official', ['bis.org']),
  P('opec', 'OPEC', 'official', ['opec.org']),
  P('eu', 'European Union', 'official', ['europa.eu']),
  // State-controlled media
  P('xinhua', 'Xinhua', 'state-media', ['xinhuanet.com', 'news.cn'], 'CHN'),
  P('cgtn', 'CGTN', 'state-media', ['cgtn.com'], 'CHN'),
  P('globaltimes', 'Global Times', 'state-media', ['globaltimes.cn'], 'CHN'),
  P('chinadaily', 'China Daily', 'state-media', ['chinadaily.com.cn'], 'CHN'),
  P('tass', 'TASS', 'state-media', ['tass.com', 'tass.ru'], 'RUS'),
  P('rt', 'RT', 'state-media', ['rt.com'], 'RUS'),
  P('sputnik', 'Sputnik', 'state-media', ['sputnikglobe.com', 'sputniknews.com'], 'RUS'),
  P('presstv', 'Press TV', 'state-media', ['presstv.ir'], 'IRN'),
  P('irna', 'IRNA', 'state-media', ['irna.ir'], 'IRN'),
  P('kcna', 'KCNA', 'state-media', ['kcna.kp', 'kcnawatch.org'], 'PRK'),
  P('anadolu', 'Anadolu Agency', 'state-media', ['aa.com.tr'], 'TUR'),
  P('trt', 'TRT World', 'state-media', ['trtworld.com'], 'TUR'),
];

// Outlets that need a subscription for full articles. You can mark the ones you subscribe to in
// Settings; stories they carried then get a direct link that opens with your own login.
const PAYWALLED = new Set(['wsj', 'ft', 'economist', 'bloomberg', 'nikkei', 'wapo', 'nyt', 'barrons', 'times-uk', 'telegraph', 'handelsblatt', 'lemonde', 'spiegel', 'scmp', 'japantimes', 'straitstimes', 'hindu', 'politico', 'theinformation', 'globeandmail', 'smh', 'latimes', 'marketwatch', 'foreignaffairs', 'foreignpolicy', 'haaretz', 'caixin', 'spglobal', 'argus']);
for (const p of PUBLISHERS) if (PAYWALLED.has(p.id)) p.paywalled = true;
export const SUBSCRIPTION_OUTLETS = PUBLISHERS.filter((p) => p.paywalled);

const byDomain = new Map<string, Publisher>();
for (const p of PUBLISHERS) for (const d of p.domains) byDomain.set(d, p);
export const publisherById = new Map(PUBLISHERS.map((p) => [p.id, p]));

// Government and intergovernmental domains not listed above.
const OFFICIAL_DOMAIN = /(^|\.)((gov|mil|int)|gov\.[a-z]{2}|gouv\.[a-z]{2}|gc\.ca|go\.jp|go\.kr|gob\.[a-z]{2}|govt\.nz|admin\.ch|bund\.de|gv\.at)$/;

export function cleanDomain(d: string) { return d.toLowerCase().replace(/^www\d?\./, '').replace(/\.$/, ''); }

/** Find the publisher for a host name ("edition.cnn.com" → CNN); official domains by rule. */
export function publisherForDomain(domain?: string): Publisher | undefined {
  if (!domain) return undefined;
  const parts = cleanDomain(domain).split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const p = byDomain.get(parts.slice(i).join('.'));
    if (p) return p;
  }
  return undefined;
}

export function tierForDomain(domain?: string): PublisherTier {
  const p = publisherForDomain(domain);
  if (p) return p.tier;
  return domain && OFFICIAL_DOMAIN.test(cleanDomain(domain)) ? 'official' : 'unrated';
}

const byName = new Map(PUBLISHERS.map((p) => [p.name.toLowerCase(), p]));
/** Google News reports a publisher name; match it when the domain is missing. */
export function publisherForName(name?: string) { return name ? byName.get(name.toLowerCase().replace(/^the /, 'the ')) || byName.get(name.toLowerCase()) : undefined; }

export const isTrusted = (tier: PublisherTier) => TIER_INFO[tier].rank <= TRUSTED_RANK;
