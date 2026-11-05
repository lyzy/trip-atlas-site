import { createMap } from './map.js';
import {
  fillFilters,
  renderDetail,
  renderList,
  renderRegionDetail,
  renderRegionList,
  renderStats,
  renderTimeline,
} from './ui.js';

const BASE_TITLE = 'Trip Atlas · 旅行图册';
const VIEWS = new Set(['routes', 'timeline', 'visited']);

const state = {
  atlas: null,
  places: [],
  routes: [],
  regions: [],
  placeById: new Map(),
  tripById: new Map(),
  regionById: new Map(),
  filters: { year: 'all', country: 'all', trip: 'all', tag: 'all', q: '' },
  view: 'routes',
  selectedPlaceId: null,
  selectedTripId: null,
  selectedRegionId: null,
  map: null,
  regionsLoaded: false,
};

let regionsPromise = null;
let viewRequest = 0;

const els = {
  stats: document.getElementById('stats'),
  list: document.getElementById('list'),
  resultCount: document.getElementById('result-count'),
  search: document.getElementById('search'),
  year: document.getElementById('filter-year'),
  country: document.getElementById('filter-country'),
  trip: document.getElementById('filter-trip'),
  tag: document.getElementById('filter-tag'),
  clear: document.getElementById('clear-filters'),
  detail: document.getElementById('detail'),
  detailContent: document.getElementById('detail-content'),
  detailClose: document.getElementById('detail-close'),
  panelToggle: document.getElementById('panel-toggle'),
  backdrop: document.getElementById('backdrop'),
  mapError: document.getElementById('map-error'),
  map: document.getElementById('map'),
  listTitle: document.getElementById('list-title'),
  regionLegend: document.getElementById('region-legend'),
  viewButtons: [...document.querySelectorAll('[data-view]')],
};

function showMapError() {
  els.mapError.classList.remove('hidden');
}

function readParams() {
  const params = new URLSearchParams(window.location.search);
  state.filters.year = params.get('year') || 'all';
  state.filters.country = params.get('country') || 'all';
  state.filters.trip = params.get('trip') || 'all';
  state.filters.tag = params.get('tag') || 'all';
  state.filters.q = params.get('q') || '';
  const view = params.get('view');
  state.view = VIEWS.has(view) ? view : 'routes';
  return {
    place: params.get('place'),
    trip: params.get('trip'),
    region: params.get('region'),
    view: state.view,
  };
}

function syncParams(mode = 'replace') {
  const params = new URLSearchParams();
  if (state.filters.year !== 'all') params.set('year', state.filters.year);
  if (state.filters.country !== 'all') params.set('country', state.filters.country);
  if (state.filters.trip !== 'all') params.set('trip', state.filters.trip);
  if (state.filters.tag !== 'all') params.set('tag', state.filters.tag);
  if (state.filters.q) params.set('q', state.filters.q);
  if (state.view !== 'routes') params.set('view', state.view);
  if (state.selectedPlaceId) params.set('place', state.selectedPlaceId);
  if (state.selectedRegionId) params.set('region', state.selectedRegionId);
  const query = params.toString();
  const url = query ? `?${query}` : window.location.pathname;
  if (mode === 'push') window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
}

function tripMatchesTag(tripId) {
  if (state.filters.tag === 'all') return true;
  return Boolean(state.tripById.get(tripId)?.tags?.includes(state.filters.tag));
}

function filteredPlaces() {
  const q = state.filters.q.trim().toLowerCase();
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
  return state.places.filter((place) => {
    if (state.filters.trip !== 'all' && place.trip !== state.filters.trip) return false;
    if (!tripMatchesTag(place.trip)) return false;
    if (state.filters.year !== 'all' && String(place.year) !== state.filters.year) return false;
    if (state.filters.country !== 'all' && !(place.countries || []).includes(state.filters.country)) return false;
    if (tokens.length) {
      const haystack = [
        place.search,
        place.notes,
        place.admin1_name,
        place.country,
        ...(state.tripById.get(place.trip)?.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!tokens.every((token) => haystack.includes(token))) return false;
    }
    return true;
  });
}

function filteredRoutes() {
  const q = state.filters.q.trim().toLowerCase();
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
  return state.routes.filter((route) => {
    const properties = route.properties;
    if (state.filters.trip !== 'all' && properties.trip !== state.filters.trip) return false;
    if (!tripMatchesTag(properties.trip)) return false;
    if (state.filters.year !== 'all' && String(properties.year) !== state.filters.year) return false;
    if (state.filters.country !== 'all' && !(properties.countries || []).includes(state.filters.country)) return false;
    if (tokens.length) {
      const haystack = [
        properties.label,
        properties.from,
        properties.to,
        properties.from_code,
        properties.to_code,
        properties.flight_no,
        properties.trip_title,
        properties.mode,
        properties.notes,
        properties.time_label,
        ...(state.tripById.get(properties.trip)?.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!tokens.every((token) => haystack.includes(token))) return false;
    }
    return true;
  });
}

function filteredTrips() {
  const q = state.filters.q.trim().toLowerCase();
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
  return state.atlas.trips.filter((trip) => {
    if (state.filters.trip !== 'all' && trip.id !== state.filters.trip) return false;
    if (!tripMatchesTag(trip.id)) return false;
    if (state.filters.year !== 'all' && String(trip.year) !== state.filters.year) return false;
    if (state.filters.country !== 'all' && !(trip.countries || []).includes(state.filters.country)) return false;
    if (!tokens.length) return true;

    const haystack = [
      trip.title,
      trip.title_zh,
      trip.summary,
      trip.story,
      ...(trip.cities || []),
      ...(trip.countries || []),
      ...(trip.tags || []),
    ];
    for (const place of state.places) {
      if (place.trip !== trip.id) continue;
      haystack.push(place.name, place.name_zh, place.search, place.notes, place.city);
    }
    for (const route of state.routes) {
      if (route.properties.trip !== trip.id) continue;
      haystack.push(
        route.properties.label,
        route.properties.from,
        route.properties.to,
        route.properties.flight_no,
        route.properties.trip_title
      );
    }
    const search = haystack.filter(Boolean).join(' ').toLowerCase();
    return tokens.every((token) => search.includes(token));
  });
}

function syncFilterInputs() {
  els.search.value = state.filters.q;
  els.year.value = state.filters.year;
  els.country.value = state.filters.country;
  els.trip.value = state.filters.trip;
  els.tag.value = state.filters.tag;
}

function fitAll() {
  const coords = [
    ...state.places.map((place) => place.coords),
    ...state.routes.flatMap((route) => route.geometry.coordinates),
  ].filter(Boolean);
  if (!coords.length) return;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  state.map?.fitBounds(
    [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
    { maxZoom: 5, duration: 0 }
  );
}

function regionStatsFor(places, routes) {
  const stats = new Map();
  const ensure = (id) => {
    if (!stats.has(id)) stats.set(id, { places: [], flights: [], trips: new Set() });
    return stats.get(id);
  };
  for (const place of places) {
    if (!place.admin1) continue;
    const entry = ensure(place.admin1);
    entry.places.push(place);
    entry.trips.add(place.trip);
  }
  for (const route of routes) {
    const properties = route.properties;
    if (properties.mode !== 'flight') continue;
    if (properties.from_admin1 && !properties.from_home && !properties.from_transit) {
      const entry = ensure(properties.from_admin1);
      if (!entry.flights.some((flight) => flight.id === properties.id)) entry.flights.push(properties);
      entry.trips.add(properties.trip);
    }
    if (properties.to_admin1 && !properties.to_home && !properties.to_transit) {
      const entry = ensure(properties.to_admin1);
      if (!entry.flights.some((flight) => flight.id === properties.id)) entry.flights.push(properties);
      entry.trips.add(properties.trip);
    }
  }
  return stats;
}

function regionCollection(places, routes) {
  const stats = regionStatsFor(places, routes);
  return {
    type: 'FeatureCollection',
    features: state.regions.map((feature) => {
      const entry = stats.get(feature.properties.id);
      const manual = Boolean(feature.properties.manual_visited);
      const search = [
        feature.properties.name,
        feature.properties.name_zh,
        feature.properties.country_name,
        manual ? 'manual manually visited' : '',
        ...(entry ? entry.places.map((place) => `${place.name} ${place.name_zh || ''}`) : []),
        ...(entry ? entry.flights.map((flight) => `${flight.flight_no || ''} ${flight.label || ''}`) : []),
        ...(entry
          ? [...entry.trips].flatMap((tripId) => state.tripById.get(tripId)?.tags || [])
          : []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return {
        ...feature,
        properties: {
          ...feature.properties,
          visited: Boolean(entry) || manual,
          manual_visited: manual,
          places_count: entry ? entry.places.length : 0,
          flight_count: entry ? entry.flights.length : 0,
          trip_count: entry ? entry.trips.size : 0,
          search,
        },
      };
    }),
  };
}

function visibleRegionFeatures(places, routes) {
  const q = state.filters.q.trim().toLowerCase();
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
  return regionCollection(places, routes).features.filter((feature) => {
    if (!feature.properties.visited) return false;
    if (state.filters.country !== 'all' && feature.properties.country !== state.filters.country) return false;
    if (tokens.length && !tokens.every((token) => feature.properties.search.includes(token))) return false;
    return true;
  });
}

function fitVisited(places, routes) {
  const features = regionCollection(places, routes).features.filter((feature) => feature.properties.visited);
  if (!features.length) {
    fitAll();
    return;
  }
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const feature of features) {
    const bbox = feature.properties.bbox;
    if (!bbox) continue;
    minLng = Math.min(minLng, bbox[0][0]);
    minLat = Math.min(minLat, bbox[0][1]);
    maxLng = Math.max(maxLng, bbox[1][0]);
    maxLat = Math.max(maxLat, bbox[1][1]);
  }
  if (!Number.isFinite(minLng)) {
    fitAll();
    return;
  }
  state.map?.fitBounds(
    [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
    { maxZoom: 6, duration: 0 }
  );
}

function updateViewUi() {
  for (const button of els.viewButtons) {
    const active = button.dataset.view === state.view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  if (els.listTitle) {
    els.listTitle.innerHTML = {
      routes: 'Places <span>地点</span>',
      timeline: 'Timeline <span>时间线</span>',
      visited: 'Regions <span>地区</span>',
    }[state.view];
  }
  els.search.placeholder = {
    routes: 'Search 搜索…',
    timeline: 'Search timeline 搜索时间线…',
    visited: 'Search regions 搜索地区…',
  }[state.view];
  els.regionLegend?.classList.toggle('hidden', state.view !== 'visited');
}

async function setView(view, { fit = true, clear = true, history = 'push' } = {}) {
  const request = ++viewRequest;
  const next = VIEWS.has(view) ? view : 'routes';
  if (next === 'visited') {
    try {
      await ensureRegions();
    } catch {
      return;
    }
    if (request !== viewRequest) return;
  }
  const changed = state.view !== next;
  state.view = next;
  if (clear && changed) {
    state.selectedPlaceId = null;
    state.selectedRegionId = null;
    state.selectedTripId = null;
    state.map?.setSelected(null);
    els.detail.classList.add('hidden');
  }
  updateViewUi();
  state.map?.setView(next);
  applyFilters({ history: changed ? history : 'replace' });
  if (fit) {
    if (next === 'visited') fitVisited(filteredPlaces(), filteredRoutes());
    else fitAll();
  }
}

function applyFilters({ history = 'replace' } = {}) {
  const places = filteredPlaces();
  const routes = filteredRoutes();
  const placeCollection = {
    type: 'FeatureCollection',
    features: places.map((place) => ({
      type: 'Feature',
      id: place.id,
      geometry: { type: 'Point', coordinates: place.coords },
      properties: place,
    })),
  };
  const routeCollection = { type: 'FeatureCollection', features: routes };
  state.map?.setData(placeCollection, routeCollection);

  if (state.view === 'visited') {
    const regions = regionCollection(places, routes);
    state.map?.setRegions(regions);
    const visible = visibleRegionFeatures(places, routes);
    renderRegionList(els.list, {
      regions: visible,
      selected: state.selectedRegionId,
    });
    els.resultCount.textContent = `${visible.length} region${visible.length === 1 ? '' : 's'} · ${
      places.length
    } place${places.length === 1 ? '' : 's'}`;
  } else if (state.view === 'timeline') {
    const trips = filteredTrips();
    renderTimeline(els.list, {
      trips,
      places,
      routes,
      selectedTripId: state.selectedTripId,
      selectedPlaceId: state.selectedPlaceId,
    });
    els.resultCount.textContent = `${trips.length} trip${trips.length === 1 ? '' : 's'} · ${
      places.length
    } place${places.length === 1 ? '' : 's'}`;
  } else {
    renderList(els.list, {
      places,
      trips: state.atlas.trips,
      selected: state.selectedPlaceId,
      routes,
    });
    els.resultCount.textContent = `${places.length} place${places.length === 1 ? '' : 's'} · ${
      routes.length
    } route leg${routes.length === 1 ? '' : 's'}`;
  }
  syncParams(history);
  updateDocumentTitle();
}

function updateDocumentTitle() {
  let title = BASE_TITLE;
  if (state.selectedPlaceId) {
    const place = state.placeById.get(state.selectedPlaceId);
    const trip = place ? state.tripById.get(place.trip) : null;
    if (place) title = `${place.name}${trip ? ` · ${trip.title}` : ''} · Trip Atlas`;
  } else if (state.selectedTripId) {
    const trip = state.tripById.get(state.selectedTripId);
    if (trip) title = `${trip.title} · Trip Atlas`;
  } else if (state.selectedRegionId) {
    const region = state.regionById.get(state.selectedRegionId);
    if (region) title = `${region.properties.name} · Trip Atlas`;
  }
  document.title = title;
}

async function copyCurrentUrl(button) {
  const url = window.location.href;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      throw new Error('Clipboard API unavailable');
    }
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) {
      button.textContent = 'Copy failed';
      window.setTimeout(() => {
        button.textContent = 'Copy link';
      }, 1600);
      return;
    }
  }
  button.textContent = 'Copied';
  button.classList.add('copied');
  window.setTimeout(() => {
    button.textContent = 'Copy link';
    button.classList.remove('copied');
  }, 1600);
}

function listButtons() {
  return [
    ...els.list.querySelectorAll('button[data-place-id], button[data-trip-id], button[data-region-id]'),
  ];
}

function focusListButton(delta) {
  const items = listButtons();
  if (!items.length) return false;
  const current = items.indexOf(document.activeElement);
  const next = current === -1 ? (delta > 0 ? 0 : items.length - 1) : (current + delta + items.length) % items.length;
  items[next].focus();
  return true;
}

async function restoreFromParams() {
  const params = readParams();
  validateFilters();
  syncFilterInputs();
  updateViewUi();

  state.selectedPlaceId = null;
  state.selectedTripId = null;
  state.selectedRegionId = null;
  state.map?.setSelected(null);
  els.detail.classList.add('hidden');

  if (state.view === 'visited' || params.region) {
    try {
      await ensureRegions();
    } catch {
      state.view = 'routes';
      updateViewUi();
    }
  }

  state.map?.setView(state.view);
  applyFilters({ history: 'replace' });

  const hasRegion = Boolean(params.region && state.regionById.has(params.region));
  const hasPlace = Boolean(params.place && state.placeById.has(params.place));
  const hasTrip = Boolean(params.trip && state.tripById.has(params.trip));

  if (hasRegion) {
    await selectRegion(params.region, { record: false });
  } else if (hasPlace) {
    selectPlace(params.place, { record: false });
  } else if (hasTrip) {
    selectTrip(params.trip, { record: false });
  } else if (state.view === 'visited') {
    fitVisited(filteredPlaces(), filteredRoutes());
  } else {
    fitAll();
  }
}

function openSidebar(open) {
  document.body.classList.toggle('sidebar-open', open);
  els.panelToggle.setAttribute('aria-expanded', String(open));
  els.backdrop.hidden = !open;
  state.map?.resize();
}

function openDetail() {
  els.detail.classList.remove('hidden');
  if (window.innerWidth <= 900) openSidebar(false);
}

function closeDetail() {
  els.detail.classList.add('hidden');
  state.selectedPlaceId = null;
  state.selectedTripId = null;
  state.selectedRegionId = null;
  state.map?.setSelected(null);
  applyFilters();
}

async function selectRegion(id, { record = true } = {}) {
  const region = state.regionById.get(id);
  if (!region) return;
  if (state.view !== 'visited') {
    await setView('visited', { fit: false, clear: false, history: 'replace' });
  }
  state.selectedRegionId = id;
  state.selectedPlaceId = null;
  state.selectedTripId = null;
  state.map?.setSelected(null);
  const places = filteredPlaces();
  const routes = filteredRoutes();
  const enriched =
    regionCollection(places, routes).features.find((feature) => feature.properties.id === id) || region;
  state.map?.fitBounds(enriched.properties.bbox, { maxZoom: 7 });
  const stats = regionStatsFor(places, routes).get(id);
  els.detailContent.innerHTML = renderRegionDetail({
    region: enriched,
    places: stats?.places || [],
    flights: stats?.flights || [],
  });
  openDetail();
  applyFilters({ history: record ? 'push' : 'replace' });
}

function selectPlace(id, { record = true } = {}) {
  const place = state.placeById.get(id);
  if (!place) return;
  if (state.view !== 'routes') {
    setView('routes', { fit: false, clear: false, history: 'replace' });
  }
  const trip = state.tripById.get(place.trip);
  state.selectedPlaceId = id;
  state.selectedTripId = place.trip;
  state.selectedRegionId = null;
  state.map?.setSelected(place);
  state.map?.flyToPlace(place);
  renderDetail(els.detailContent, { place, trip });
  openDetail();
  applyFilters({ history: record ? 'push' : 'replace' });
}

function selectTrip(id, { record = true } = {}) {
  const trip = state.tripById.get(id);
  if (!trip) return;
  if (state.view !== 'routes') {
    setView('routes', { fit: false, clear: false, history: 'replace' });
  }
  state.selectedPlaceId = null;
  state.selectedTripId = id;
  state.filters.trip = id;
  state.map?.setSelected(null);
  state.map?.fitBounds(trip.bbox);
  renderDetail(els.detailContent, { trip, place: null });
  openDetail();
  syncFilterInputs();
  applyFilters({ history: record ? 'push' : 'replace' });
}

function bindEvents() {
  let searchTimer = null;
  const commitSearch = () => {
    window.clearTimeout(searchTimer);
    state.filters.q = els.search.value;
    applyFilters();
  };
  els.search.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(commitSearch, 120);
  });
  els.search.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      commitSearch();
      if (focusListButton(1)) event.preventDefault();
    } else if (event.key === 'ArrowUp') {
      commitSearch();
      if (focusListButton(-1)) event.preventDefault();
    } else if (event.key === 'Enter') {
      commitSearch();
      const [first] = listButtons();
      if (first) {
        event.preventDefault();
        first.click();
      }
    } else if (event.key === 'Escape' && els.search.value) {
      event.preventDefault();
      els.search.value = '';
      commitSearch();
    }
  });

  els.list.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      if (focusListButton(1)) event.preventDefault();
    } else if (event.key === 'ArrowUp') {
      if (focusListButton(-1)) event.preventDefault();
    } else if (event.key === 'Home') {
      const [first] = listButtons();
      if (first) {
        event.preventDefault();
        first.focus();
      }
    } else if (event.key === 'End') {
      const items = listButtons();
      const last = items[items.length - 1];
      if (last) {
        event.preventDefault();
        last.focus();
      }
    }
  });

  for (const [element, key] of [
    [els.year, 'year'],
    [els.country, 'country'],
    [els.trip, 'trip'],
    [els.tag, 'tag'],
  ]) {
    element.addEventListener('change', () => {
      state.filters[key] = element.value;
      applyFilters();
    });
  }

  els.clear.addEventListener('click', () => {
    state.filters = { year: 'all', country: 'all', trip: 'all', tag: 'all', q: '' };
    state.selectedPlaceId = null;
    state.selectedTripId = null;
    state.selectedRegionId = null;
    state.map?.setSelected(null);
    els.detail.classList.add('hidden');
    syncFilterInputs();
    applyFilters();
  });

  for (const button of els.viewButtons) {
    button.addEventListener('click', () => setView(button.dataset.view));
  }

  els.list.addEventListener('click', (event) => {
    const regionButton = event.target.closest('[data-region-id]');
    if (regionButton) {
      selectRegion(regionButton.dataset.regionId);
      return;
    }
    const placeButton = event.target.closest('[data-place-id]');
    if (placeButton) {
      selectPlace(placeButton.dataset.placeId);
      return;
    }
    const tripButton = event.target.closest('[data-trip-id]');
    if (tripButton) selectTrip(tripButton.dataset.tripId);
  });

  els.detailContent.addEventListener('click', (event) => {
    const copyButton = event.target.closest('[data-copy-link]');
    if (copyButton) {
      event.preventDefault();
      copyCurrentUrl(copyButton);
      return;
    }
    const regionButton = event.target.closest('[data-region-id]');
    if (regionButton) {
      selectRegion(regionButton.dataset.regionId);
      return;
    }
    const placeButton = event.target.closest('[data-place-id]');
    if (placeButton) {
      selectPlace(placeButton.dataset.placeId);
      return;
    }
    const tripButton = event.target.closest('[data-trip-id]');
    if (tripButton) selectTrip(tripButton.dataset.tripId);
  });

  els.detailClose.addEventListener('click', closeDetail);

  els.panelToggle.addEventListener('click', () => {
    openSidebar(!document.body.classList.contains('sidebar-open'));
  });

  els.backdrop.addEventListener('click', () => {
    openSidebar(false);
    if (window.innerWidth <= 900) els.detail.classList.add('hidden');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      openSidebar(false);
      if (!els.detail.classList.contains('hidden')) closeDetail();
    }
  });

  window.addEventListener('popstate', () => {
    restoreFromParams().catch((error) => console.error(error));
  });

  window.addEventListener('resize', () => state.map?.resize());
}

async function loadData() {
  const responses = await Promise.all([
    fetch('./data/atlas.json'),
    fetch('./data/places.geojson'),
    fetch('./data/routes.geojson'),
  ]);
  if (responses.some((response) => !response.ok)) {
    throw new Error(`Data load failed: ${responses.map((response) => response.status).join(', ')}`);
  }
  const [atlas, places, routes] = await Promise.all(responses.map((response) => response.json()));
  state.atlas = atlas;
  state.places = places.features.map((feature) => feature.properties);
  state.routes = routes.features;
  state.placeById = new Map(state.places.map((place) => [place.id, place]));
  state.tripById = new Map(atlas.trips.map((trip) => [trip.id, trip]));
}

async function ensureRegions() {
  if (state.regionsLoaded) return;
  if (!regionsPromise) {
    els.resultCount.textContent = 'Loading region boundaries…';
    regionsPromise = fetch('./data/regions.geojson')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        state.regions = data.features || [];
        state.regionById = new Map(state.regions.map((feature) => [feature.properties.id, feature]));
        state.regionsLoaded = true;
      })
      .catch((error) => {
        regionsPromise = null;
        console.error(error);
        els.list.innerHTML = `<div class="empty">Could not load region boundaries. Run <code>npm run build</code> and reload.</div>`;
        throw error;
      });
  }
  await regionsPromise;
}

function validateFilters() {
  if (state.filters.trip !== 'all' && !state.tripById.has(state.filters.trip)) {
    state.filters.trip = 'all';
  }
  const validCountries = new Set(state.atlas.trips.flatMap((trip) => trip.countries || []));
  if (state.filters.country !== 'all' && !validCountries.has(state.filters.country)) {
    state.filters.country = 'all';
  }
  const validYears = new Set(state.atlas.trips.map((trip) => String(trip.year)).filter(Boolean));
  if (state.filters.year !== 'all' && !validYears.has(state.filters.year)) {
    state.filters.year = 'all';
  }
  const validTags = new Set(state.atlas.trips.flatMap((trip) => trip.tags || []));
  if (state.filters.tag !== 'all' && !validTags.has(state.filters.tag)) {
    state.filters.tag = 'all';
  }
}

async function init() {
  document.title = BASE_TITLE;
  try {
    await loadData();
  } catch (error) {
    console.error(error);
    els.list.innerHTML = `<div class="empty">Could not load the atlas data. Run <code>npm run build</code> and reload.</div>`;
    showMapError();
    return;
  }

  renderStats(els.stats, state.atlas.stats);
  fillFilters({ yearEl: els.year, countryEl: els.country, tripEl: els.trip, tagEl: els.tag }, state.atlas);
  const params = readParams();
  validateFilters();
  syncFilterInputs();
  updateViewUi();

  if (state.view === 'visited' || params.region) {
    try {
      await ensureRegions();
    } catch {
      state.view = 'routes';
      updateViewUi();
    }
  }

  try {
    state.map = createMap(els.map, {
      onSelectPlace: selectPlace,
      onSelectTrip: selectTrip,
      onSelectRegion: selectRegion,
      onBackgroundClick: () => {},
    });
    state.map.map.once('load', () => {
      els.mapError.classList.add('hidden');
    });
    if (new URLSearchParams(window.location.search).has('debug')) {
      window.__tripAtlasMap = state.map.map;
    }
    window.setTimeout(() => {
      if (!state.map?.isReady()) showMapError();
    }, 10000);
  } catch (error) {
    console.error(error);
    showMapError();
    state.map = null;
  }

  bindEvents();
  applyFilters();
  state.map?.setView(state.view);

  const hasRegion = Boolean(params.region && state.regionById.has(params.region));
  const hasPlace = Boolean(params.place && state.placeById.has(params.place));
  const hasTrip = Boolean(params.trip && state.tripById.has(params.trip));

  if (hasRegion) {
    await setView('visited', { fit: false, clear: false, history: 'replace' });
    await selectRegion(params.region, { record: false });
  } else if (hasPlace) {
    selectPlace(params.place, { record: false });
  } else if (hasTrip) {
    selectTrip(params.trip, { record: false });
  } else if (state.view === 'visited') {
    fitVisited(filteredPlaces(), filteredRoutes());
  } else {
    fitAll();
  }
}

init();
