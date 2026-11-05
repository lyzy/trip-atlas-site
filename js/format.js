export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function categoryLabel(category) {
  const labels = {
    tourist: 'Tourist site',
    historical: 'Historical place',
    saved: 'Saved place',
    city: 'City',
    other: 'Place',
  };
  return labels[category] || 'Place';
}

export function modeLabel(mode) {
  const labels = {
    walk: 'Walk',
    bike: 'Bike',
    car: 'Car',
    bus: 'Bus',
    train: 'Train',
    metro: 'Metro',
    flight: 'Flight',
    boat: 'Boat',
    ferry: 'Ferry',
    other: 'Route',
  };
  return labels[mode] || 'Route';
}

export function confidenceLabel(confidence) {
  const labels = {
    certain: 'Certain',
    likely: 'Likely',
    uncertain: 'Uncertain',
  };
  return labels[confidence] || 'Likely';
}

export function precisionLabel(precision) {
  const labels = {
    exact: 'Exact location',
    street: 'Street level',
    city: 'City level',
    region: 'Region level',
    country: 'Country level',
  };
  return labels[precision] || 'Location';
}

const TRIP_TAG_LABELS = {
  leisure: 'Leisure',
  work: 'Work',
  family: 'Family',
  friends: 'Friends',
  solo: 'Solo',
  study: 'Study',
  transit: 'Transit',
  visa: 'Visa',
  conference: 'Conference',
  honeymoon: 'Honeymoon',
  medical: 'Medical',
  relocation: 'Relocation',
  'flight-log': 'Flight log',
};

export function tagLabel(tag) {
  const key = String(tag || '').toLowerCase();
  if (TRIP_TAG_LABELS[key]) return TRIP_TAG_LABELS[key];
  const words = key.split('-').filter(Boolean);
  if (!words.length) return 'Purpose';
  return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}

export function formatNumber(value) {
  return new Intl.NumberFormat('en-GB').format(Number(value) || 0);
}

export function formatKm(value) {
  const number = Number(value) || 0;
  if (number >= 1000) return `${formatNumber(Math.round(number))} km`;
  return `${number.toFixed(number < 10 ? 1 : 0)} km`;
}

export function tripTitle(trip) {
  if (!trip) return '';
  return trip.title_zh ? `${trip.title} · ${trip.title_zh}` : trip.title;
}

export function placeTitle(place) {
  if (!place) return '';
  if (place.name_zh && place.name_zh !== place.name) return `${place.name} · ${place.name_zh}`;
  return place.name;
}

export function sortPlaces(places) {
  return [...places].sort((a, b) => {
    const dateCompare = String(a.day_date || '').localeCompare(String(b.day_date || ''));
    if (dateCompare) return dateCompare;
    return String(a.name).localeCompare(String(b.name));
  });
}

export function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}
