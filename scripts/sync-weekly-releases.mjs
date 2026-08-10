import { mkdir, writeFile } from 'node:fs/promises';

const today = new Date();
const start = new Date(today);
start.setUTCDate(today.getUTCDate() - 6);
const isoDate = (value) => value.toISOString().slice(0, 10);
const query = `firstreleasedate:[${isoDate(start)} TO ${isoDate(today)}] AND primarytype:album`;
const response = await fetch(`https://musicbrainz.org/ws/2/release-group?fmt=json&limit=12&query=${encodeURIComponent(query)}`, {
  headers: { 'User-Agent': 'NocturneArchive/1.0 (weekly release radar)' },
});
if (!response.ok) throw new Error(`MusicBrainz returned ${response.status}`);
const data = await response.json();
const releases = (data['release-groups'] || []).map((release) => ({
  id: release.id,
  title: release.title,
  artist: release['artist-credit']?.map((credit) => credit.name).join('') || 'Various artists',
  date: release['first-release-date'] || '',
  genres: (release.tags || [])
    .slice()
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 3)
    .map((tag) => tag.name),
}));
await mkdir('data', { recursive: true });
await writeFile('data/weekly-releases.json', `${JSON.stringify({ updatedAt: new Date().toISOString(), releases }, null, 2)}\n`);
console.log(`Synced ${releases.length} albums released this week.`);
