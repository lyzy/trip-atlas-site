import * as maplibregl from '../vendor/maplibre-gl.mjs';
import { escapeHtml, modeLabel } from './format.js';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const EMPTY = { type: 'FeatureCollection', features: [] };

const ROUTE_COLOR = [
  'match',
  ['get', 'mode'],
  'flight',
  '#6ecbff',
  'train',
  '#ffb74d',
  'metro',
  '#ffb74d',
  'bus',
  '#ffb74d',
  'car',
  '#81c784',
  'bike',
  '#4dd0e1',
  'walk',
  '#b39ddb',
  'boat',
  '#4db6ac',
  'ferry',
  '#4db6ac',
  '#90a4ae',
];

const POINT_COLOR = [
  'match',
  ['get', 'category'],
  'tourist',
  '#4aa3ff',
  'historical',
  '#b39ddb',
  'saved',
  '#81c784',
  '#90a4ae',
];

const POINT_RADIUS = [
  'match',
  ['get', 'location_precision'],
  'exact',
  6,
  'street',
  6,
  'city',
  5,
  'region',
  7,
  'country',
  5,
  5,
];

export function createMap(container, handlers) {
  let map;
  try {
    map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center: [69.2, 41.3],
      zoom: 4.6,
      minZoom: 2,
      maxZoom: 16,
      attributionControl: true,
    });
  } catch (error) {
    throw new Error(`Map initialization failed: ${error.message}`);
  }

  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
  let ready = false;
  let pending = null;
  let pendingRegions = null;
  let currentView = 'routes';
  let hoveredRegion = null;

  const ROUTE_LAYERS = [
    'routes-casing',
    'routes-certain',
    'routes-likely',
    'routes-uncertain',
    'flight-arrows',
    'routes-hit',
    'clusters',
    'cluster-count',
    'points-halo',
    'points',
    'selected-point',
  ];
  const REGION_LAYERS = ['regions-fill', 'regions-line', 'regions-label'];

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');

  function routeLayer(id, confidence, dash, opacity) {
    map.addLayer({
      id,
      type: 'line',
      source: 'routes',
      filter: ['==', ['get', 'confidence'], confidence],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ROUTE_COLOR,
        'line-width': ['match', ['get', 'mode'], 'flight', 1.5, 'walk', 0.75, 1.0],
        'line-opacity': opacity,
        ...(dash ? { 'line-dasharray': dash } : {}),
      },
    });
  }

  function applyCountryLabelOverrides() {
    const taiwan = [
      'any',
      ['==', ['get', 'name_en'], 'Taiwan'],
      ['==', ['get', 'name'], 'Taiwan'],
      ['==', ['get', 'name:latin'], 'Taiwan'],
    ];
    for (const id of ['label_country_1', 'label_country_2', 'label_country_3']) {
      if (!map.getLayer(id)) continue;
      const original = map.getLayoutProperty(id, 'text-field');
      if (!original) continue;
      map.setLayoutProperty(id, 'text-field', [
        'case',
        taiwan,
        'Taiwan, China',
        original,
      ]);
    }
  }

  function addLayers() {
    map.addSource('places', {
      type: 'geojson',
      data: EMPTY,
      cluster: true,
      clusterMaxZoom: 12,
      clusterRadius: 46,
    });
    map.addSource('routes', { type: 'geojson', data: EMPTY, lineMetrics: true });
    map.addSource('flight-arrows', { type: 'geojson', data: EMPTY });
    map.addSource('regions', { type: 'geojson', data: EMPTY, promoteId: 'id' });
    map.addSource('selected', { type: 'geojson', data: EMPTY });

    map.addLayer({
      id: 'routes-casing',
      type: 'line',
      source: 'routes',
      filter: ['!=', ['get', 'mode'], 'flight'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#04080d',
        'line-width': 1.3,
        'line-opacity': 0.16,
      },
    });
    routeLayer('routes-certain', 'certain', null, 0.9);
    routeLayer('routes-likely', 'likely', [2, 2], 0.8);
    routeLayer('routes-uncertain', 'uncertain', [1, 4], 0.5);

    if (!map.hasImage('flight-arrow')) {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const context = canvas.getContext('2d');
      context.beginPath();
      context.moveTo(16, 3);
      context.lineTo(27, 27);
      context.lineTo(16, 21);
      context.lineTo(5, 27);
      context.closePath();
      context.fillStyle = '#e8f5ff';
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = '#0b2236';
      context.stroke();
      map.addImage('flight-arrow', context.getImageData(0, 0, 32, 32), { pixelRatio: 2 });
    }

    map.addLayer({
      id: 'flight-arrows',
      type: 'symbol',
      source: 'flight-arrows',
      layout: {
        'icon-image': 'flight-arrow',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 6, 0.95, 10, 1.1],
        'icon-rotate': ['get', 'bearing'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });

    map.addLayer({
      id: 'routes-hit',
      type: 'line',
      source: 'routes',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#000000',
        'line-width': 14,
        'line-opacity': 0.01,
      },
    });

    map.addLayer({
      id: 'regions-fill',
      type: 'fill',
      source: 'regions',
      paint: {
        'fill-color': '#4aa3ff',
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          0.55,
          ['case', ['get', 'visited'], 0.36, 0.03],
        ],
      },
    });
    map.addLayer({
      id: 'regions-line',
      type: 'line',
      source: 'regions',
      paint: {
        'line-color': ['case', ['get', 'visited'], '#2f7fc4', '#9aa7b4'],
        'line-width': ['case', ['get', 'visited'], 1.2, 0.6],
        'line-opacity': ['case', ['get', 'visited'], 0.9, 0.45],
      },
    });
    map.addLayer({
      id: 'regions-label',
      type: 'symbol',
      source: 'regions',
      minzoom: 5,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 10,
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#17324a',
        'text-halo-color': 'rgba(255, 255, 255, 0.85)',
        'text-halo-width': 1,
      },
      filter: ['==', ['get', 'visited'], true],
    });

    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'places',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#4aa3ff',
        'circle-opacity': 0.9,
        'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 30, 24],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#0d1117',
      },
    });
    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'places',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
      },
      paint: { 'text-color': '#04121f' },
    });

    map.addLayer({
      id: 'points-halo',
      type: 'circle',
      source: 'places',
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'approx'], true]],
      paint: {
        'circle-radius': 12,
        'circle-color': 'rgba(74, 163, 255, 0.12)',
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(74, 163, 255, 0.22)',
      },
    });
    map.addLayer({
      id: 'points',
      type: 'circle',
      source: 'places',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': POINT_RADIUS,
        'circle-color': POINT_COLOR,
        'circle-opacity': 0.96,
        'circle-stroke-width': 1.2,
        'circle-stroke-color': '#0b1016',
      },
    });
    map.addLayer({
      id: 'selected-point',
      type: 'circle',
      source: 'selected',
      paint: {
        'circle-radius': 11,
        'circle-color': 'rgba(0, 0, 0, 0)',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });

    bindInteractions();
    applyView(currentView);
    if (pending) {
      setData(pending.places, pending.routes);
      pending = null;
    }
    if (pendingRegions) {
      setRegions(pendingRegions);
      pendingRegions = null;
    }
  }

  function bearingBetween(a, b) {
    const toRad = (value) => (value * Math.PI) / 180;
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const dLon = toRad(b[0] - a[0]);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180) / Math.PI;
  }

  function arrowsForRoutes(routes) {
    const features = [];
    for (const route of routes?.features || []) {
      if (route.properties?.mode !== 'flight') continue;
      const coordinates = route.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 3) continue;
      const index = Math.max(
        1,
        Math.min(coordinates.length - 2, Math.floor(coordinates.length * 0.55))
      );
      const previous = coordinates[index - 1];
      const point = coordinates[index];
      const next = coordinates[index + 1];
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: point },
        properties: {
          bearing: bearingBetween(previous, next),
          trip: route.properties.trip,
          flight_no: route.properties.flight_no || '',
        },
      });
    }
    return { type: 'FeatureCollection', features };
  }

  function routePopupHtml(features) {
    const unique = [];
    const seen = new Set();
    for (const feature of features) {
      const properties = feature.properties;
      if (!properties) continue;
      const key = `${properties.mode}|${properties.flight_no || ''}|${properties.date || ''}|${
        properties.from_code || properties.from || ''
      }|${properties.to_code || properties.to || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(properties);
    }
    unique.sort(
      (a, b) =>
        String(a.date || '').localeCompare(String(b.date || '')) ||
        String(a.flight_no || '').localeCompare(String(b.flight_no || ''))
    );

    const render = (properties) => {
      const mode = properties.mode || 'other';
      const route = `${properties.from_code || properties.from || '?'} → ${
        properties.to_code || properties.to || '?'
      }`;
      const when =
        [properties.date_label || properties.date, properties.time_label].filter(Boolean).join(' · ') +
        (properties.end_date_label ? ` → ${properties.end_date_label}` : '');
      const title =
        mode === 'flight'
          ? properties.flight_no
            ? `Flight ${properties.flight_no}`
            : 'Flight'
          : modeLabel(mode);
      return `<div class="popup-route"><strong>${escapeHtml(title)}</strong><br><span>${escapeHtml(
        route
      )}</span>${when ? `<br><span>${escapeHtml(when)}</span>` : ''}</div>`;
    };

    const flights = unique.filter((properties) => properties.mode === 'flight');
    if (flights.length) return flights.slice(0, 3).map(render).join('');
    return unique.length ? render(unique[0]) : '';
  }

  function regionPopupHtml(properties) {
    const name = properties.name_zh
      ? `${properties.name} · ${properties.name_zh}`
      : properties.name;
    const meta = properties.visited
      ? `${properties.country_name || properties.country} · ${properties.places_count || 0} places · ${
          properties.trip_count || 0
        } trips`
      : `${properties.country_name || properties.country} · Not visited`;
    return `<strong>${escapeHtml(name)}</strong><br><span>${escapeHtml(meta)}</span>`;
  }

  function setLayerVisibility(ids, visible) {
    for (const id of ids) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      }
    }
  }

  function applyView(view) {
    currentView = view === 'visited' ? 'visited' : 'routes';
    setLayerVisibility(ROUTE_LAYERS, currentView === 'routes');
    setLayerVisibility(REGION_LAYERS, currentView === 'visited');
    popup.remove();
  }

  function setView(view) {
    applyView(view);
  }

  function setRegions(collection) {
    if (!ready) {
      pendingRegions = collection || EMPTY;
      return;
    }
    map.getSource('regions')?.setData(collection || EMPTY);
  }

  function bindInteractions() {
    map.on('click', 'clusters', (event) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: ['clusters'] })[0];
      if (!feature) return;
      const clusterId = feature.properties.cluster_id;
      map
        .getSource('places')
        .getClusterExpansionZoom(clusterId)
        .then((zoom) => {
          map.easeTo({ center: feature.geometry.coordinates, zoom: zoom + 0.2, duration: 450 });
        })
        .catch(() => {});
    });

    map.on('click', 'points', (event) => {
      const feature = event.features?.[0];
      if (feature?.properties?.id) handlers.onSelectPlace(feature.properties.id);
    });

    map.on('click', 'routes-hit', (event) => {
      const pointFeatures = map.queryRenderedFeatures(event.point, { layers: ['points', 'clusters'] });
      if (pointFeatures.length) return;
      const feature = event.features?.[0];
      if (feature?.properties?.trip) handlers.onSelectTrip(feature.properties.trip);
    });
    map.on('mousemove', 'routes-hit', (event) => {
      const features = map.queryRenderedFeatures(event.point, { layers: ['routes-hit'] });
      if (!features.length) return;
      map.getCanvas().style.cursor = 'pointer';
      popup.setLngLat(event.lngLat).setHTML(routePopupHtml(features)).addTo(map);
    });
    map.on('mouseleave', 'routes-hit', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    });

    map.on('mousemove', 'regions-fill', (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const regionId = feature.id ?? feature.properties.id;
      if (hoveredRegion !== null && hoveredRegion !== regionId) {
        map.setFeatureState({ source: 'regions', id: hoveredRegion }, { hover: false });
      }
      hoveredRegion = regionId;
      map.setFeatureState({ source: 'regions', id: regionId }, { hover: true });
      map.getCanvas().style.cursor = 'pointer';
      popup.setLngLat(event.lngLat).setHTML(regionPopupHtml(feature.properties)).addTo(map);
    });
    map.on('mouseleave', 'regions-fill', () => {
      if (hoveredRegion !== null) {
        map.setFeatureState({ source: 'regions', id: hoveredRegion }, { hover: false });
      }
      hoveredRegion = null;
      map.getCanvas().style.cursor = '';
      popup.remove();
    });
    map.on('click', 'regions-fill', (event) => {
      const feature = event.features?.[0];
      if (feature?.properties?.id) handlers.onSelectRegion?.(feature.properties.id);
    });

    map.on('mousemove', 'points', (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      map.getCanvas().style.cursor = 'pointer';
      const name = feature.properties.name_zh
        ? `${feature.properties.name} · ${feature.properties.name_zh}`
        : feature.properties.name;
      popup.setLngLat(event.lngLat).setText(name).addTo(map);
    });
    map.on('mouseleave', 'points', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    });

    map.on('click', (event) => {
      const interactive = map.queryRenderedFeatures(event.point, {
        layers: ['clusters', 'points'],
      });
      if (!interactive.length) handlers.onBackgroundClick?.();
    });
  }

  map.on('load', () => {
    ready = true;
    addLayers();
    applyCountryLabelOverrides();
    setTimeout(() => map.resize(), 50);
  });

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => map.resize()).observe(container);
  }

  function setData(places, routes) {
    if (!ready) {
      pending = { places, routes };
      return;
    }
    map.getSource('places')?.setData(places || EMPTY);
    map.getSource('routes')?.setData(routes || EMPTY);
    map.getSource('flight-arrows')?.setData(arrowsForRoutes(routes || EMPTY));
  }

  function setSelected(place) {
    if (!ready) return;
    const source = map.getSource('selected');
    if (!source) return;
    source.setData(
      place?.coords
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: place.coords },
                properties: { id: place.id },
              },
            ],
          }
        : EMPTY
    );
  }

  function flyToPlace(place) {
    if (!place?.coords) return;
    const zoom = Math.max(map.getZoom(), 11);
    map.flyTo({ center: place.coords, zoom, duration: 750, essential: true });
  }

  function flyToCity(coords) {
    if (!coords) return;
    map.flyTo({ center: coords, zoom: 11, duration: 750, essential: true });
  }

  function fitBounds(bounds, options = {}) {
    if (!bounds) return;
    const [[minLng, minLat], [maxLng, maxLat]] = bounds;
    if (Math.abs(maxLng - minLng) < 0.0001 && Math.abs(maxLat - minLat) < 0.0001) {
      map.flyTo({ center: [minLng, minLat], zoom: options.maxZoom || 11, duration: 700, essential: true });
      return;
    }
    map.fitBounds(bounds, {
      padding: { top: 70, bottom: 70, left: 70, right: 70 },
      maxZoom: 9,
      duration: 750,
      ...options,
    });
  }

  function resize() {
    map.resize();
  }

  return {
    map,
    setData,
    setRegions,
    setView,
    setSelected,
    flyToPlace,
    flyToCity,
    fitBounds,
    resize,
    isReady: () => ready,
  };
}
