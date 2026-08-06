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
const releases = all.map((entry, index) => {
  const info = entry.basic_information;
  const note = entry.notes?.map((item) => item.value).filter(Boolean).join(' · ') || `${formatName(info)} — ${info.genres?.join(', ') || 'No genre listed'}`;
  return {
    id: entry.instance_id,
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
  };
});

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
