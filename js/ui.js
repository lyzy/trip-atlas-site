import {
  categoryLabel,
  confidenceLabel,
  escapeHtml,
  formatKm,
  formatNumber,
  modeLabel,
  placeTitle,
  precisionLabel,
  sortPlaces,
  tagLabel,
  tripTitle,
} from './format.js';

export function renderStats(el, stats) {
  el.setAttribute(
    'aria-label',
    `${stats.trips} trip${stats.trips === 1 ? '' : 's'}, ${stats.countries} ${
      stats.countries === 1 ? 'country' : 'countries'
    }, ${stats.cities} cities, ${stats.regions || 0} regions, ${stats.places} places`
  );
  el.innerHTML = [
    `<span class="stat-pill"><strong>${formatNumber(stats.trips)}</strong> trip${stats.trips === 1 ? '' : 's'}</span>`,
    `<span class="stat-pill"><strong>${formatNumber(stats.countries)}</strong> ${stats.countries === 1 ? 'country' : 'countries'}</span>`,
    `<span class="stat-pill"><strong>${formatNumber(stats.cities)}</strong> cities</span>`,
    `<span class="stat-pill"><strong>${formatNumber(stats.regions || 0)}</strong> regions</span>`,
    `<span class="stat-pill"><strong>${formatNumber(stats.places)}</strong> places</span>`,
  ].join('');
}

export function fillFilters(elements, atlas) {
  const { yearEl, countryEl, tripEl, tagEl } = elements;
  const years = [...new Set(atlas.trips.map((trip) => trip.year).filter(Boolean))].sort((a, b) => b - a);
  const countries = [...new Set(atlas.trips.flatMap((trip) => trip.countries || []))].sort();
  const trips = [...atlas.trips].sort((a, b) => String(b.date_start || '').localeCompare(String(a.date_start || '')));
  const tags = [...new Set(atlas.trips.flatMap((trip) => trip.tags || []))].sort((a, b) =>
    tagLabel(a).localeCompare(tagLabel(b))
  );

  yearEl.innerHTML =
    `<option value="all">All years</option>` +
    years.map((year) => `<option value="${year}">${year}</option>`).join('');
  countryEl.innerHTML =
    `<option value="all">All countries</option>` +
    countries.map((country) => `<option value="${escapeHtml(country)}">${escapeHtml(country)}</option>`).join('');
  tripEl.innerHTML =
    `<option value="all">All trips</option>` +
    trips.map((trip) => `<option value="${escapeHtml(trip.id)}">${escapeHtml(trip.title)}</option>`).join('');
  if (tagEl) {
    tagEl.innerHTML =
      `<option value="all">All purposes</option>` +
      tags.map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tagLabel(tag))}</option>`).join('');
  }
}

export function renderList(el, { places, trips, selected, routes = [] }) {
  const tripMap = new Map(trips.map((trip) => [trip.id, trip]));
  const grouped = new Map();
  for (const place of sortPlaces(places)) {
    if (!grouped.has(place.trip)) grouped.set(place.trip, []);
    grouped.get(place.trip).push(place);
  }
  const tripOrder = [...grouped.keys()].sort((a, b) => {
    const ta = tripMap.get(a);
    const tb = tripMap.get(b);
    return String(tb?.date_start || '').localeCompare(String(ta?.date_start || ''));
  });

  const placeBlocks = tripOrder
    .map((tripId) => {
      const trip = tripMap.get(tripId) || { id: tripId, title: tripId, title_zh: '', date_label: '' };
      const tripPlaces = grouped.get(tripId);
      const head = `
        <button class="trip-head" type="button" data-trip-id="${escapeHtml(trip.id)}">
          <span class="trip-title">
            <strong>${escapeHtml(trip.title)}</strong>
            ${trip.title_zh ? `<span class="zh">${escapeHtml(trip.title_zh)}</span>` : ''}
          </span>
          <span class="trip-date">${escapeHtml(trip.date_label || '')} · ${tripPlaces.length} place${tripPlaces.length === 1 ? '' : 's'}</span>
          ${tagPills(trip.tags)}
        </button>`;
      const items = tripPlaces
        .map((place) => {
          const meta = [place.city, place.date ? place.date_label : null].filter(Boolean).join(' · ');
          return `
            <button class="place-item ${selected === place.id ? 'selected' : ''}" type="button" data-place-id="${escapeHtml(place.id)}">
              <span class="place-dot category-${escapeHtml(place.category || 'other')}"></span>
              <span class="place-name">${escapeHtml(place.name)}${place.name_zh && place.name_zh !== place.name ? `<span class="zh">${escapeHtml(place.name_zh)}</span>` : ''}</span>
              <span class="place-meta">${escapeHtml(meta)}</span>
            </button>`;
        })
        .join('');
      return `<section class="trip-block">${head}${items}</section>`;
    })
    .join('');

  const tripsWithPlaces = new Set(grouped.keys());
  const routesByTrip = new Map();
  for (const route of routes) {
    const tripId = route.properties?.trip;
    if (!tripId) continue;
    routesByTrip.set(tripId, (routesByTrip.get(tripId) || 0) + 1);
  }
  const detailedOnly = trips
    .filter(
      (trip) =>
        !trip.id.startsWith('flights-') &&
        routesByTrip.has(trip.id) &&
        !tripsWithPlaces.has(trip.id)
    )
    .sort((a, b) => String(b.date_start || '').localeCompare(String(a.date_start || '')))
    .map((trip) => {
      const legs = routesByTrip.get(trip.id);
      return `
        <section class="trip-block flight-only-trip">
          <button class="trip-head" type="button" data-trip-id="${escapeHtml(trip.id)}">
            <span class="trip-title">
              <strong>${escapeHtml(trip.title)}</strong>
              ${trip.title_zh ? `<span class="zh">${escapeHtml(trip.title_zh)}</span>` : ''}
            </span>
            <span class="trip-date">${escapeHtml(trip.date_label || '')} · ${legs} flight leg${legs === 1 ? '' : 's'} · flight only</span>
            ${tagPills(trip.tags)}
          </button>
        </section>`;
    })
    .join('');

  if (!placeBlocks && !detailedOnly) {
    el.innerHTML = `<div class="empty">No places or flights match these filters. Try clearing the search or choosing another trip.</div>`;
    return;
  }
  el.innerHTML =
    placeBlocks +
    (detailedOnly
      ? `<div class="list-section-head">Trips without places <span>仅航班</span></div>${detailedOnly}`
      : '');
}

function timelineMonthLabel(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number);
  if (!year || !month) return monthKey;
  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function timelineTripCard(trip, selectedTripId) {
  const day = trip.date_start ? trip.date_start.slice(8, 10) : '—';
  const month = trip.date_start ? timelineMonthLabel(trip.date_start.slice(0, 7)) : 'Undated';
  const flights = (trip.transfers || []).filter((transfer) => transfer.flight_no).length;
  const counts = [`${formatNumber(trip.places_count)} place${trip.places_count === 1 ? '' : 's'}`];
  if (flights) counts.push(`${formatNumber(flights)} flight${flights === 1 ? '' : 's'}`);
  return `
    <button class="timeline-item ${selectedTripId === trip.id ? 'selected' : ''}" type="button" data-trip-id="${escapeHtml(trip.id)}">
      <span class="timeline-date">
        <strong>${escapeHtml(day)}</strong>
        <span>${escapeHtml(month)}</span>
      </span>
      <span class="timeline-body">
        <span class="timeline-title">${escapeHtml(trip.title)}${
          trip.title_zh && trip.title_zh !== trip.title ? `<span class="zh">${escapeHtml(trip.title_zh)}</span>` : ''
        }</span>
        <span class="timeline-meta">${escapeHtml([trip.date_label, ...counts].filter(Boolean).join(' · '))}</span>
        ${tagPills(trip.tags, 'timeline-tags')}
        ${trip.summary ? `<span class="timeline-summary">${escapeHtml(trip.summary)}</span>` : ''}
      </span>
    </button>`;
}

export function renderTimeline(el, { trips, places, selectedTripId, selectedPlaceId }) {
  const dated = trips
    .filter((trip) => trip.date_start)
    .sort((a, b) => String(b.date_start).localeCompare(String(a.date_start)));
  const undatedTrips = trips.filter((trip) => !trip.date_start);
  const undatedPlaces = places.filter((place) => !place.day_date);
  const tripById = new Map(trips.map((trip) => [trip.id, trip]));
  const years = new Map();

  for (const trip of dated) {
    const year = String(trip.date_start).slice(0, 4);
    if (!years.has(year)) years.set(year, new Map());
    const months = years.get(year);
    const month = String(trip.date_start).slice(0, 7);
    if (!months.has(month)) months.set(month, []);
    months.get(month).push(trip);
  }

  const yearBlocks = [...years.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, months]) => {
      const monthBlocks = [...months.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(
          ([month, monthTrips]) => `
            <h4 class="timeline-month">${escapeHtml(timelineMonthLabel(month))}</h4>
            ${monthTrips.map((trip) => timelineTripCard(trip, selectedTripId)).join('')}`
        )
        .join('');
      return `<section class="timeline-section"><h3>${escapeHtml(year)}</h3>${monthBlocks}</section>`;
    })
    .join('');

  const placeGroups = new Map();
  for (const place of undatedPlaces) {
    if (!placeGroups.has(place.trip)) placeGroups.set(place.trip, []);
    placeGroups.get(place.trip).push(place);
  }
  const undatedPlaceBlocks = [...placeGroups.entries()]
    .map(([tripId, tripPlaces]) => {
      const trip = tripById.get(tripId);
      return `
        <details class="timeline-undated-group">
          <summary>${escapeHtml(trip?.title || tripId)} <span>${formatNumber(tripPlaces.length)}</span></summary>
          <div class="pool-list">${tripPlaces
            .map((place) => `<button class="place-item ${selectedPlaceId === place.id ? 'selected' : ''}" type="button" data-place-id="${escapeHtml(place.id)}">
              <span class="place-dot category-${escapeHtml(place.category || 'other')}"></span>
              <span class="place-name">${escapeHtml(place.name)}${place.name_zh && place.name_zh !== place.name ? `<span class="zh">${escapeHtml(place.name_zh)}</span>` : ''}</span>
              <span class="place-meta">${escapeHtml(place.city || 'Undated')}</span>
            </button>`)
            .join('')}</div>
        </details>`;
    })
    .join('');

  const undatedBlocks = undatedTrips.map((trip) => timelineTripCard(trip, selectedTripId)).join('');
  const undated = undatedBlocks || undatedPlaceBlocks
    ? `<section class="timeline-section timeline-undated">
        <h3>Undated <span>未定日期</span></h3>
        ${undatedBlocks}
        ${undatedPlaceBlocks}
      </section>`
    : '';

  if (!yearBlocks && !undated) {
    el.innerHTML = '<div class="empty">No trips or places match these filters.</div>';
    return;
  }
  el.innerHTML = `<div class="timeline">${yearBlocks}${undated}</div>`;
}

export function renderRegionList(el, { regions, selected }) {
  if (!regions.length) {
    el.innerHTML = `<div class="empty">No visited regions match these filters. Home airports and short transit stops are excluded.</div>`;
    return;
  }
  const grouped = new Map();
  for (const feature of regions) {
    const country = feature.properties.country_name || feature.properties.country || 'Regions';
    if (!grouped.has(country)) grouped.set(country, []);
    grouped.get(country).push(feature);
  }
  el.innerHTML = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([country, features]) => `
        <section class="trip-block">
          <div class="region-country">${escapeHtml(country)}</div>
          ${features
            .sort((a, b) => a.properties.name.localeCompare(b.properties.name))
            .map((feature) => {
              const properties = feature.properties;
              const name = properties.name_zh
                ? `${properties.name} <span class="zh">${escapeHtml(properties.name_zh)}</span>`
                : escapeHtml(properties.name);
              const bits = [];
              if (properties.places_count) {
                bits.push(
                  `${formatNumber(properties.places_count)} place${properties.places_count === 1 ? '' : 's'}`
                );
              }
              if (properties.flight_count) {
                bits.push(
                  `${formatNumber(properties.flight_count)} flight${properties.flight_count === 1 ? '' : 's'}`
                );
              }
              if (!bits.length) {
                bits.push(
                  properties.manual_visited
                    ? 'Manually visited'
                    : `${formatNumber(properties.trip_count)} trip${properties.trip_count === 1 ? '' : 's'}`
                );
              }
              return `
                <button class="place-item region-item ${
                  selected === properties.id ? 'selected' : ''
                }" type="button" data-region-id="${escapeHtml(properties.id)}">
                  <span class="region-dot"></span>
                  <span class="place-name">${name}</span>
                  <span class="place-meta">${bits.join(' · ')}</span>
                </button>`;
            })
            .join('')}
        </section>`
    )
    .join('');
}

function copyLinkButton() {
  return '<button class="button copy-link" type="button" data-copy-link>Copy link</button>';
}

function tagPills(tags, className = 'trip-tags') {
  if (!tags?.length) return '';
  return `<span class="${className}">${tags
    .map((tag) => `<span class="tag-pill">${escapeHtml(tagLabel(tag))}</span>`)
    .join('')}</span>`;
}

export function renderRegionDetail({ region, places, flights = [] }) {
  const properties = region.properties;
  const title = properties.name_zh
    ? `${properties.name}<span class="zh">${escapeHtml(properties.name_zh)}</span>`
    : escapeHtml(properties.name);
  const trips = [
    ...new Set([
      ...places.map((place) => place.trip_title).filter(Boolean),
      ...flights.map((flight) => flight.trip_title).filter(Boolean),
    ]),
  ];
  const sortedPlaces = [...places].sort((a, b) => a.name.localeCompare(b.name));
  const sortedFlights = [...flights].sort(
    (a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.flight_no || '').localeCompare(String(b.flight_no || ''))
  );
  return `
    <div class="kicker">${properties.admin_level === 'country' ? 'Country / territory' : 'Region'}</div>
    <h2>${title}</h2>
    <div class="badges">
      <span class="badge accent">${escapeHtml(properties.country_name || properties.country || '')}</span>
      <span class="badge">Visited</span>
      ${properties.admin_level === 'country' ? '<span class="badge">Country</span>' : ''}
      ${properties.manual_visited ? '<span class="badge warn">Manually added</span>' : ''}
    </div>
    <div class="stat-grid">
      <div class="stat-card"><strong>${formatNumber(properties.places_count)}</strong><span>places</span></div>
      <div class="stat-card"><strong>${formatNumber(properties.flight_count || 0)}</strong><span>flights</span></div>
      <div class="stat-card"><strong>${formatNumber(properties.trip_count)}</strong><span>trips</span></div>
      <div class="stat-card"><strong>${escapeHtml(properties.id)}</strong><span>${properties.admin_level === 'country' ? 'country' : 'admin-1'}</span></div>
    </div>
    <div class="detail-actions">${copyLinkButton()}</div>
    ${
      trips.length
        ? `<div class="section"><h3>Trips</h3><div class="day-card">${trips
            .map((trip) => `<div class="transfer-row"><span class="transfer-label">${escapeHtml(trip)}</span></div>`)
            .join('')}</div></div>`
        : ''
    }
    ${
      sortedFlights.length
        ? `<div class="section"><h3>Flight endpoints</h3><div class="day-card">${sortedFlights
            .map(
              (flight) => `
                <div class="transfer-row">
                  <span class="transfer-mode">Flight</span>
                  <span class="transfer-label">${escapeHtml(
                    `${flight.flight_no ? `${flight.flight_no} · ` : ''}${flight.label || ''}`
                  )}</span>
                  <span class="transfer-date">${escapeHtml(flight.date_label || '')}</span>
                </div>`
            )
            .join('')}</div></div>`
        : ''
    }
    ${
      sortedPlaces.length
        ? `<div class="section"><h3>Places</h3><div class="day-card"><div class="pool-list">${sortedPlaces
            .map((place) => placeButton(place))
            .join('')}</div></div></div>`
        : ''
    }
    ${
      properties.manual_visited && !trips.length && !sortedFlights.length && !sortedPlaces.length
        ? `<div class="route-note">Marked as visited manually. Add places, flights, or notes later.</div>`
        : ''
    }
    <div class="route-note">Administrative boundaries: Natural Earth 10m admin-1. Visited regions combine public places, non-home/non-transit flight endpoints, and manual entries.</div>`;
}

function placeButton(place, action = 'place') {
  return `<button type="button" data-${action}-id="${escapeHtml(place.id)}">${escapeHtml(place.name)}${
    place.name_zh && place.name_zh !== place.name ? ` · ${escapeHtml(place.name_zh)}` : ''
  }</button>`;
}

function restaurantCard(restaurant) {
  const name = `${escapeHtml(restaurant.name)}${
    restaurant.name_zh && restaurant.name_zh !== restaurant.name
      ? `<span class="zh">${escapeHtml(restaurant.name_zh)}</span>`
      : ''
  }`;
  const meta = [restaurant.city, restaurant.date_label || 'Undated']
    .filter(Boolean)
    .join(' · ');
  const price = restaurant.price_level
    ? '$'.repeat(Math.max(1, Math.min(5, restaurant.price_level)))
    : '';
  const details = [restaurant.cuisine, restaurant.meal, price].filter(Boolean);
  const ratingValue = restaurant.rating ? Math.max(1, Math.min(3, restaurant.rating)) : 0;
  const rating = ratingValue
    ? `${'★'.repeat(ratingValue)}${'☆'.repeat(3 - ratingValue)}`
    : '';
  const ratingLabel = ratingValue ? `Rating ${ratingValue} of 3` : '';
  const notes = restaurant.notes_html || (restaurant.notes ? escapeHtml(restaurant.notes) : '');
  const cityCoords = restaurant.city_coords;
  const cityAttrs = cityCoords
    ? ` tabindex="0" title="Show ${escapeHtml(restaurant.city || 'city')} on the map" data-city-lng="${escapeHtml(cityCoords[0])}" data-city-lat="${escapeHtml(cityCoords[1])}"`
    : '';
  return `
    <div class="food-card food-card-link"${cityAttrs}>
      <div class="food-head">
        <div class="food-name"><strong>${name}</strong><span class="food-meta-line">${escapeHtml(meta)}</span></div>
        ${rating ? `<span class="food-rating" aria-label="${escapeHtml(ratingLabel)}" title="${escapeHtml(ratingLabel)}">${escapeHtml(rating)}</span>` : ''}
      </div>
      ${details.length ? `<div class="food-details">${details.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}
      ${notes ? `<div class="food-notes prose">${notes}</div>` : ''}
      ${
        restaurant.source_url
          ? `<a class="food-source" href="${escapeHtml(restaurant.source_url)}" target="_blank" rel="nofollow noopener noreferrer">Source</a>`
          : ''
      }
    </div>`;
}

function tripContext(trip) {
  if (!trip) return '';
  return `
    <div class="section">
      <h3>Trip</h3>
      <div class="day-card">
        <div class="day-head">
          <strong>${escapeHtml(trip.title)}</strong>
          <span>${escapeHtml(trip.date_label || '')}</span>
        </div>
        <div class="day-city">${escapeHtml((trip.countries || []).join(' · '))}</div>
        <div class="detail-actions">
          <button class="button" type="button" data-trip-id="${escapeHtml(trip.id)}">View trip</button>
        </div>
      </div>
    </div>`;
}

function renderPlaceDetail(place, trip) {
  const introHtml = place.intro_html || (place.intro ? escapeHtml(place.intro) : '');
  const notesHtml = place.notes_html || (place.notes ? escapeHtml(place.notes) : '');
  const badges = [
    `<span class="badge">${escapeHtml(categoryLabel(place.category))}</span>`,
    `<span class="badge">${escapeHtml(precisionLabel(place.location_precision))}</span>`,
    place.approx ? `<span class="badge warn">Approximate location</span>` : '',
    place.sensitive_downgraded ? `<span class="badge warn">Private place shown at city level</span>` : '',
    place.unassigned ? `<span class="badge">Not assigned to a day</span>` : '',
  ]
    .filter(Boolean)
    .join('');

  return `
    <div class="kicker">Place</div>
    <h2>${escapeHtml(place.name)}${place.name_zh && place.name_zh !== place.name ? `<span class="zh">${escapeHtml(place.name_zh)}</span>` : ''}</h2>
    <div class="badges">${badges}</div>
    <div class="lede">${escapeHtml([place.city, place.date_label].filter(Boolean).join(' · '))}</div>
    ${
      place.intro
        ? `<div class="place-intro">
            <div class="place-intro-label">About <span class="zh">简介</span></div>
            <div class="place-intro-text prose">${introHtml}</div>
          </div>`
        : ''
    }
    ${
      place.notes
        ? `<div class="place-notes">
            <div class="place-notes-label">My comments <span class="zh">我的评论</span></div>
            <div class="place-notes-text prose">${notesHtml}</div>
          </div>`
        : ''
    }
    <div class="detail-actions">${copyLinkButton()}</div>
    <div class="route-note">This map uses schematic routes, not a recorded GPS track. Approximate places are drawn with a halo.</div>
    ${tripContext(trip)}`;
}

function renderTripDetail(trip) {
  const days = (trip.days || [])
    .map((day) => {
      const stays = (day.stays || []).map((stay) => stay.city).filter(Boolean);
      const stops = (day.stops || []).map((place) => placeButton(place)).join('');
      const unassigned = (day.unassigned || []).map((place) => placeButton(place)).join('');
      return `
        <div class="day-card">
          <div class="day-head">
            <strong>${escapeHtml(day.date_label || 'Undated')}</strong>
            <span>${(day.stops || []).length + (day.unassigned || []).length} place${(day.stops || []).length + (day.unassigned || []).length === 1 ? '' : 's'}</span>
          </div>
          ${day.city ? `<div class="day-city">${escapeHtml(day.city)}</div>` : ''}
          ${stays.length ? `<div class="day-stays">Stay in ${escapeHtml([...new Set(stays)].join(', '))}</div>` : ''}
          ${stops ? `<div class="day-stops">${stops}</div>` : ''}
          ${
            unassigned
              ? `<details class="pool-section"><summary>${(day.unassigned || []).length} unassigned place${
                  (day.unassigned || []).length === 1 ? '' : 's'
                }</summary><div class="pool-list">${unassigned}</div></details>`
              : ''
          }
        </div>`;
    })
    .join('');

  const transfers = (trip.transfers || [])
    .map((transfer) => {
      const label = transfer.label || `${transfer.from || '?'} → ${transfer.to || '?'}`;
      const title = transfer.flight_no ? `${transfer.flight_no} · ${label}` : label;
      const date = [transfer.date_label, transfer.time_label].filter(Boolean).join(' · ');
      const dateWithEnd = transfer.end_date_label ? `${date} → ${transfer.end_date_label}` : date;
      return `
        <div class="transfer-row">
          <span class="transfer-mode">${escapeHtml(transfer.flight_no ? 'Flight' : modeLabel(transfer.mode))}</span>
          <span class="transfer-label">${escapeHtml(title)}</span>
          <span class="transfer-date">${escapeHtml(dateWithEnd)}</span>
        </div>`;
    })
    .join('');

  const poolGroups = new Map();
  for (const place of trip.pool || []) {
    const key = place.city || 'Unplaced';
    if (!poolGroups.has(key)) poolGroups.set(key, []);
    poolGroups.get(key).push(place);
  }
  const pool = [...poolGroups.entries()]
    .map(
      ([city, places]) => `
        <div class="pool-group">
          <h4>${escapeHtml(city)}</h4>
          <div class="pool-list">${places.map((place) => placeButton(place)).join('')}</div>
        </div>`
    )
    .join('');

  return `
    <div class="kicker">Trip</div>
    <h2>${escapeHtml(trip.title)}${trip.title_zh ? `<span class="zh">${escapeHtml(trip.title_zh)}</span>` : ''}</h2>
    <div class="badges">
      <span class="badge accent">${escapeHtml(trip.date_label || 'Undated')}</span>
      ${(trip.countries || []).map((country) => `<span class="badge">${escapeHtml(country)}</span>`).join('')}
      ${(trip.tags || []).map((tag) => `<span class="badge tag">${escapeHtml(tagLabel(tag))}</span>`).join('')}
    </div>
    ${trip.summary ? `<div class="lede">${escapeHtml(trip.summary)}</div>` : ''}
    <div class="stat-grid">
      <div class="stat-card"><strong>${formatNumber(trip.days_count)}</strong><span>days</span></div>
      <div class="stat-card"><strong>${formatNumber(trip.places_count)}</strong><span>places</span></div>
      <div class="stat-card"><strong>${formatNumber((trip.cities || []).length)}</strong><span>cities</span></div>
      <div class="stat-card"><strong>${escapeHtml(formatKm(trip.distance_km))}</strong><span>route</span></div>
    </div>
    <div class="detail-actions">${copyLinkButton()}</div>
    ${
      (trip.restaurants || []).length
        ? `<div class="detail-tabs" role="tablist" aria-label="Trip sections">
            <button type="button" class="detail-tab active" role="tab" aria-selected="true" aria-controls="trip-panel-places" data-trip-tab="places">Places <span class="zh">景点</span></button>
            <button type="button" class="detail-tab" role="tab" aria-selected="false" aria-controls="trip-panel-food" data-trip-tab="food">Food <span class="zh">餐厅</span><span class="tab-count">${trip.restaurants.length}</span></button>
          </div>`
        : ''
    }
    <div class="detail-tab-panel" id="trip-panel-places" data-trip-section="places" role="tabpanel">
      ${
        transfers
          ? `<div class="section"><h3>Transfers</h3><div class="day-card">${transfers}</div></div>`
          : ''
      }
      ${(trip.places_count || 0) > 0 && days ? `<div class="section"><h3>Days</h3>${days}</div>` : ''}
      ${
        pool
          ? `<details class="pool-section"><summary>${(trip.pool || []).length} place${
              (trip.pool || []).length === 1 ? '' : 's'
            } not yet assigned to a day</summary>${pool}</details>`
          : ''
      }
      ${
        trip.story
          ? `<div class="section"><h3>Story</h3><div class="notes prose">${
              trip.story_html || escapeHtml(trip.story)
            }</div></div>`
          : ''
      }
    </div>
    ${
      (trip.restaurants || []).length
        ? `<div class="detail-tab-panel" id="trip-panel-food" data-trip-section="food" role="tabpanel" hidden>
            <div class="section">
              <h3>Food <span class="zh">餐厅</span></h3>
              <details class="food-legend">
                <summary>Rating &amp; price guide</summary>
                <div class="food-legend-body">
                  <p><strong>Rating ★☆☆–★★★</strong></p>
                  <ul>
                    <li><strong>★☆☆</strong> — above average or a local specialty, but not worth a return trip</li>
                    <li><strong>★★☆</strong> — special enough to try on a first visit</li>
                    <li><strong>★★★</strong> — worth returning for, or memorable fine dining</li>
                  </ul>
                  <p><strong>Price 1–5</strong></p>
                  <ul>
                    <li><strong>1</strong> — under 20 RMB</li>
                    <li><strong>2</strong> — daily meal, under 50 RMB</li>
                    <li><strong>3</strong> — around 100 RMB</li>
                    <li><strong>4</strong> — around 200 RMB / common European level</li>
                    <li><strong>5</strong> — fine dining or a cuisine performance</li>
                  </ul>
                </div>
              </details>
              <div class="food-list">${trip.restaurants
                .map((restaurant) => restaurantCard(restaurant))
                .join('')}</div>
            </div>
          </div>`
        : ''
    }
    <div class="route-note">Routes are schematic: flight legs use great-circle arcs; city transfers connect cities. Local stop order is shown in the day list. Dashed lines mean the order is likely or uncertain.</div>`;
}

export function renderDetail(el, { trip, place, region, places, flights }) {
  if (place) {
    el.innerHTML = renderPlaceDetail(place, trip);
  } else if (region) {
    el.innerHTML = renderRegionDetail({ region, places: places || [], flights: flights || [] });
  } else if (trip) {
    el.innerHTML = renderTripDetail(trip);
  } else {
    el.innerHTML = '';
  }
}
