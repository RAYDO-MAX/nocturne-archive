import { mkdir, writeFile } from 'node:fs/promises';

const token = process.env.DISCOGS_TOKEN;
const configuredUsername = process.env.DISCOGS_USERNAME;

if (!token) throw new Error('DISCOGS_TOKEN is required. Add it as a GitHub Actions secret.');

const headers = {
  Authorization: `Discogs token=${token}`,
  'User-Agent': 'NocturneArchive/1.0 +https://github.com/',
};

const request = async (path) => {
  const response = await fetch(`https://api.discogs.com${path}`, { headers });
  if (!response.ok) throw new Error(`Discogs returned ${response.status} for ${path}`);
  return response.json();
};

const identity = configuredUsername ? null : await request('/oauth/identity');
const username = configuredUsername || identity.username;
const all = [];
for (let page = 1; ; page += 1) {
  const data = await request(`/users/${encodeURIComponent(username)}/collection/folders/0/releases?per_page=100&page=${page}`);
  all.push(...data.releases);
  if (page >= data.pagination.pages) break;
}

const formatName = (information) => information.formats?.map((format) => [format.name, ...(format.descriptions || [])].join(', ')).join(' · ') || 'Other';
const shortFormat = (information) => information.formats?.some((format) => format.name === 'Vinyl') ? 'Vinyl' : information.formats?.some((format) => format.name === 'CD') ? 'CD' : information.formats?.[0]?.name || 'Other';
const coverStyles = ['one', 'two', 'three', 'four'];
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const priceFor = (suggestions, condition) => {
  const preferred = [condition, 'Near Mint (NM or M-)', 'Very Good Plus (VG+)', 'Very Good (VG)', 'Good Plus (G+)'];
  const match = preferred.map((key) => suggestions?.[key]).find((entry) => entry?.value);
  return match ? `${match.currency} ${Number(match.value).toFixed(2)}` : null;
};
const releases = [];
for (const [index, entry] of all.entries()) {
  const info = entry.basic_information;
  const note = entry.notes?.map((item) => item.value).filter(Boolean).join(' · ') || `${formatName(info)} — ${info.genres?.join(', ') || 'No genre listed'}`;
  let detail = {};
  let suggestions = null;
  try {
    await delay(1050);
    detail = await request(`/releases/${info.id}`);
    await delay(1050);
    suggestions = await request(`/marketplace/price_suggestions/${info.id}`);
  } catch (_) {
    // Individual release details are optional; a complete catalogue is more useful than failing the full sync.
  }
  releases.push({
    id: entry.instance_id,
    discogsId: info.id,
    artist: info.artists?.map((artist) => artist.name.replace(/ \(\d+\)$/, '')).join(', ') || 'Unknown artist',
    title: info.title,
    format: shortFormat(info),
    year: info.year || '—',
    image: info.cover_image || info.thumb || null,
    cover: coverStyles[index % coverStyles.length],
    state: 'archive',
    note,
    genres: [...new Set([...(info.genres || []), ...(info.styles || [])])],
    dateAdded: entry.date_added,
    label: detail.labels?.map((label) => label.name).filter(Boolean).join(', ') || info.labels?.map((label) => label.name).filter(Boolean).join(', ') || 'Not specified',
    country: detail.country || 'Not specified',
    released: detail.released || info.year || '—',
    condition: entry.media_condition || entry.condition || 'Not specified',
    sleeveCondition: entry.sleeve_condition || 'Not specified',
    estimatedPrice: priceFor(suggestions, entry.media_condition || entry.condition),
    tracklist: (detail.tracklist || []).filter((track) => track.type_ === 'track' || !track.type_).map((track) => ({ position: track.position || '', title: track.title || '', duration: track.duration || '' })),
  });
}

let estimatedValue = 'Value unavailable';
try {
  const value = await request(`/users/${encodeURIComponent(username)}/collection/value`);
  estimatedValue = value.minimum && value.maximum ? `${value.minimum}–${value.maximum}` : value.median || estimatedValue;
} catch (_) {
  // Value estimates are optional: the visible collection remains available when Discogs does not return one.
}

await mkdir('data', { recursive: true });
await writeFile('data/collection.json', `${JSON.stringify({ username, updatedAt: new Date().toISOString(), estimatedValue, releases }, null, 2)}\n`);
console.log(`Synced ${releases.length} releases for ${username}.`);
