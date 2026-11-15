(() => {
  const state = { sites: [], facts: [], sources: [], climateSummary: [], daily: [], downloadErrors: [], climateMetadata: null, terrainGeology: null, selected: new Set(), body: 'Earth', map: null, markers: new Map(), chart: null, tilesUnavailable: false };
  const $ = (selector) => document.querySelector(selector);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const pretty = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/\bUsa\b/g, 'USA');
  const validNumber = (value) => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const validPowerValue = (value) => validNumber(value) && Number(value) > -990;

  function parseCSV(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
      else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[i + 1] === '\n') i += 1;
        row.push(cell); cell = '';
        if (row.some((value) => value !== '')) rows.push(row);
        row = [];
      } else cell += char;
    }
    if (cell || row.length) { row.push(cell); if (row.some((value) => value !== '')) rows.push(row); }
    if (!rows.length) return [];
    const headers = rows.shift();
    return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
  }

  async function loadJSON(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  }
  async function loadCSV(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return parseCSV(await response.text());
  }
  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    window.setTimeout(() => toast.classList.remove('visible'), 2600);
  }
  function roleName(site) { return site.role === 'known_reference' ? 'Known reference' : 'Exploratory candidate'; }
  function currentSites() {
    const search = $('#site-search').value.trim().toLowerCase();
    const role = $('#role-filter').value;
    return state.sites.filter((site) => (role === 'all' || site.role === role)
      && (!search || `${pretty(site.site)} ${site.country} ${site.environment} ${site.role}`.toLowerCase().includes(search)));
  }
  function makeMap() {
    if (!window.L) {
      $('#map').hidden = true;
      $('#map-fallback').hidden = false;
      $('#map-fallback').style.display = 'grid';
      $('#map-fallback').textContent = 'Interactive map unavailable (mapping library could not be loaded). Candidate cards and coordinates remain available below.';
      return;
    }
    state.map = L.map('map', { scrollWheelZoom: false, zoomControl: true }).setView([22, 8], 2);
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18
    }).addTo(state.map);
    tiles.on('tileerror', () => {
      state.tilesUnavailable = true;
      if (state.body !== 'Earth') return;
      const notice = $('#map-fallback');
      notice.hidden = false; notice.classList.add('map-error');
      notice.textContent = 'Map tiles are unavailable. Candidate coordinates and details remain accessible in the list.';
    });
  }
  function addMarker(site) {
    const marker = L.circleMarker([Number(site.latitude), Number(site.longitude)], {
      radius: 7, color: '#c3e880', weight: 2, fillColor: '#c3e880', fillOpacity: .8
    }).addTo(state.map);
    const popup = document.createElement('div');
    const title = el('strong', '', pretty(site.site));
    const details = el('div', '', `${site.country} · ${site.environment} · ${Number(site.latitude).toFixed(2)}°, ${Number(site.longitude).toFixed(2)}°`);
    const status = el('div', '', `${roleName(site)} · ${site.status}`);
    popup.append(title, details, status);
    marker.bindPopup(popup);
    marker.on('click', () => highlightSite(site.site, false));
    state.markers.set(site.site, marker);
  }
  function highlightSite(id, pan = true) {
    document.querySelectorAll('.site-card').forEach((card) => card.classList.toggle('active', card.dataset.site === id));
    const marker = state.markers.get(id);
    if (marker && pan) {
      state.map.setView(marker.getLatLng(), Math.max(state.map.getZoom(), 4));
      marker.openPopup();
    }
  }
  function renderSites() {
    const list = $('#site-list');
    list.replaceChildren();
    const sites = currentSites();
    $('#candidate-count').textContent = sites.length;
    if (state.map) {
      const visible = new Set(sites.map((site) => site.site));
      for (const [id, marker] of state.markers) {
        if (visible.has(id) && !state.map.hasLayer(marker)) marker.addTo(state.map);
        else if (!visible.has(id) && state.map.hasLayer(marker)) state.map.removeLayer(marker);
      }
    }
    if (!sites.length) {
      list.append(el('div', 'empty-list', state.siteLoadError
        ? 'Candidate data could not be loaded. Check that sites.json is available.'
        : 'No listed candidates match this search. Try another term or site type.'));
      return;
    }
    for (const [index, site] of sites.entries()) {
      const card = el('article', 'site-card');
      card.dataset.site = site.site;
      const number = el('span', 'site-index', String(index + 1).padStart(2, '0'));
      const info = el('div', 'site-info');
      info.append(el('h3', '', pretty(site.site)), el('p', '', `${site.country} · ${site.environment}`));
      info.append(el('p', 'site-coordinate', `${Number(site.latitude).toFixed(2)}°, ${Number(site.longitude).toFixed(2)}° · approximate candidate coordinate`));
      const meta = el('div', 'site-meta');
      meta.append(el('span', site.role === 'known_reference' ? 'role-reference' : '', roleName(site)), el('span', '', 'Not scored'));
      info.append(meta);
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.className = 'site-check'; checkbox.checked = state.selected.has(site.site);
      checkbox.setAttribute('aria-label', `Select ${pretty(site.site)} for comparison`);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.selected.add(site.site); else state.selected.delete(site.site);
        updateSelection();
      });
      card.append(number, info, checkbox);
      card.addEventListener('click', (event) => {
        if (event.target !== checkbox) highlightSite(site.site);
      });
      list.append(card);
    }
  }
  function updateSelection() {
    $('#selected-count').textContent = state.selected.size;
    $('#selection-total').textContent = state.sites.length;
    $('#compare-button').disabled = state.selected.size === 0;
    renderComparison();
  }
  function findSiteClimate(siteId) {
    return state.climateSummary.find((item) => item.site === siteId) || null;
  }
  function renderComparison() {
    const content = $('#comparison-content');
    content.replaceChildren();
    const note = $('#comparison-provenance');
    const selected = state.sites.filter((site) => state.selected.has(site.site));
    if (!selected.length) {
      const empty = el('div', 'empty-state');
      empty.append(el('span', '', '＋'), el('strong', '', 'Select candidate sites to compare'), el('p', '', 'Use the site cards above. No rankings are produced.'));
      content.append(empty);
      note.textContent = 'Terrain measurements are compared only within matching source/resolution and vertical-reference groups. Geologic map units are descriptive and map scales vary. No combined score or ranking is calculated.';
      return;
    }
    const groups = selected.map((site) => terrainForSite(site.site)?.comparison_group).filter(Boolean);
    const uniqueGroups = new Set(groups);
    const everySiteHasTerrain = selected.every((site) => terrainForSite(site.site)?.status === 'complete');
    note.textContent = uniqueGroups.size === 1 && everySiteHasTerrain
      ? `All selected terrain values use ${[...uniqueGroups][0]} and the same 90 m-spaced 3×3 method; they may be compared descriptively at that scale. Geologic maps have varying scales and are shown as separate citations. Climate values share the NASA POWER 2023–2024 period. No combined score or ranking is calculated.`
      : `Selected terrain source/resolution or vertical-reference groups differ, or windows are missing (${[...uniqueGroups].join(', ') || 'none reported'}). Values are shown with provenance but are not directly compared across groups. Geologic maps have varying scales. Climate values share the NASA POWER 2023–2024 period. No combined score or ranking is calculated.`;
    const wrap = el('div', 'comparison-table-wrap');
    const table = el('table', 'comparison-table');
    const header = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const metric = document.createElement('th'); metric.textContent = 'Evidence'; headerRow.append(metric);
    for (const site of selected) {
      const th = document.createElement('th'); th.className = 'comp-head'; th.textContent = pretty(site.site); headerRow.append(th);
    }
    header.append(headerRow); table.append(header);
    const tbody = document.createElement('tbody');
    const rows = [
      ['Country', (site) => site.country],
      ['Environment label', (site) => site.environment],
      ['Latitude / longitude', (site) => `${Number(site.latitude).toFixed(2)}°, ${Number(site.longitude).toFixed(2)}°`],
      ['NASA POWER mean T2M (°C)', (site) => climateValue(site, 'mean_temp_c', 2)],
      ['NASA POWER 2023–24 precip. total (mm)', (site) => climateValue(site, 'total_precipitation_mm_2023_2024', 2)],
      ['NASA POWER dates returned / requested', (site) => climateDays(site)],
      ['Terrain elevation (m)', (site) => terrainMetric(site, 'elevation_m')],
      ['Terrain slope (degrees)', (site) => terrainMetric(site, 'slope_degrees')],
      ['Terrain local relief (m)', (site) => terrainMetric(site, 'relief_m')],
      ['Terrain roughness, 3×3 standard deviation (m)', (site) => terrainMetric(site, 'roughness_stddev_m')],
      ['Terrain source/resolution group', (site) => terrainForSite(site.site)?.comparison_group || null],
      ['Mapped geology (unit · scale)', geologySummary],
      ['Mapped lithology / age (Ma)', (site) => {
        const unit = geologyForSite(site.site)?.map_units?.[0];
        if (!unit) return null;
        const lithology = unit.lithology || 'Lithology not reported';
        const age = validNumber(unit.age_top_ma) && validNumber(unit.age_bottom_ma)
          ? `${unit.age_top_ma}–${unit.age_bottom_ma} Ma`
          : unit.geologic_age_name || 'Age not reported';
        return `${lithology} · ${age}`;
      }],
      ['Measurement uncertainty', () => 'Not provided by current datasets'],
      ['Similarity outcome', () => 'Insufficient comparable data']
    ];
    for (const [label, valueFor] of rows) {
      const tr = document.createElement('tr'); const th = document.createElement('td'); th.textContent = label; tr.append(th);
      for (const site of selected) {
        const td = document.createElement('td'); const value = valueFor(site);
        td.textContent = value ?? 'Not available'; if (value === null) td.className = 'missing'; tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(tbody); wrap.append(table); content.append(wrap);
  }
  function climateValue(site, key, digits) {
    const data = findSiteClimate(site.site);
    if (!data || !validNumber(data[key])) return null;
    return Number(data[key]).toFixed(digits);
  }
  function climateDays(site) {
    const data = findSiteClimate(site.site);
    if (!data || !validNumber(data.days_downloaded)) return null;
    return `${data.days_downloaded} / ${data.days_requested ?? 731}`;
  }
  function terrainForSite(siteId) {
    return state.terrainGeology?.locations?.[siteId]?.terrain || null;
  }
  function geologyForSite(siteId) {
    return state.terrainGeology?.locations?.[siteId]?.geology || null;
  }
  function terrainMetric(site, key, digits = 2) {
    const value = terrainForSite(site.site)?.metrics?.[key];
    return validNumber(value) ? Number(value).toFixed(digits) : null;
  }
  function geologySummary(site) {
    const geology = geologyForSite(site.site);
    const unit = geology?.map_units?.[0];
    return unit ? `${unit.name || 'Unnamed mapped unit'} · ${unit.map_scale_class || 'scale not reported'} map scale` : null;
  }
  function renderFacts() {
    const facts = state.facts.filter((fact) => fact.body === state.body);
    const strip = $('#planet-facts'); strip.replaceChildren();
    for (const fact of facts) {
      const item = el('div', 'fact');
      item.append(el('b', '', `${fact.value} ${fact.unit}`), el('span', '', `${pretty(fact.variable)} · ${fact.scope.replaceAll('_', ' ')}`));
      const source = el('a', 'fact-source', 'Source');
      try {
        const url = new URL(fact.source_url);
        if (url.protocol === 'https:') {
          source.href = url.href;
          source.target = '_blank';
          source.rel = 'noopener noreferrer';
          item.append(source, el('span', 'fact-period', 'Date/period not specified in source file'));
        } else {
          item.append(el('span', 'fact-period', 'Source URL is not HTTPS; date/period not specified'));
        }
      } catch {
        item.append(el('span', 'fact-period', 'Source URL or date/period not specified'));
      }
      strip.append(item);
    }
    const descriptions = {
      Earth: ['TERRESTRIAL CANDIDATES', 'Candidate points are approximate and unvalidated. They are a starting list for research, not a discovery catalogue.'],
      Moon: ['GLOBAL REFERENCE CONTEXT', 'Global reference facts are context only. No lunar site-specific terrain dataset has been processed for this explorer.'],
      Mars: ['GLOBAL REFERENCE CONTEXT', 'Global reference facts are context only. No Mars site-specific climate or terrain dataset has been processed for this explorer.']
    };
    $('#body-kicker').textContent = descriptions[state.body][0];
    $('#body-heading').textContent = state.body;
    $('#body-description').textContent = descriptions[state.body][1];
    window.dispatchEvent(new CustomEvent('planet-body-change', { detail: state.body }));
    const art = $('#planet-art');
    art.className = `planet-art ${state.body.toLowerCase()}-art`;
    art.setAttribute('aria-label', `Illustration of ${state.body}`);
    document.querySelectorAll('.planet-option').forEach((button) => {
      const selected = button.dataset.body === state.body;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    $('#map').style.opacity = state.body === 'Earth' ? '1' : '.28';
    if (state.body !== 'Earth') {
      $('#map-fallback').hidden = false;
      $('#map-fallback').classList.remove('map-error');
      $('#map-fallback').style.display = 'grid';
      $('#map-fallback').textContent = `No ${state.body} candidate locations are present in the supplied list. The map shows Earth candidates only.`;
      $('#map').style.visibility = 'hidden';
    } else {
      $('#map').style.visibility = window.L ? 'visible' : 'hidden';
      $('#map-fallback').hidden = Boolean(window.L) && !state.tilesUnavailable;
      $('#map-fallback').classList.toggle('map-error', state.tilesUnavailable);
      if (!window.L) {
        $('#map-fallback').style.display = 'grid';
        $('#map-fallback').textContent = 'Interactive map unavailable (mapping library could not be loaded). Candidate cards and coordinates remain available below.';
      }
      if (state.map) window.setTimeout(() => state.map.invalidateSize(), 50);
    }
  }
  function externalLink(parent, url, label) {
    try {
      const target = new URL(url);
      if (target.protocol !== 'https:') throw new Error('Source URL must use HTTPS');
      const link = el('a', 'source-link', label);
      link.href = target.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      parent.append(link);
      return true;
    } catch {
      parent.append(el('span', 'muted', 'Source URL not provided'));
      return false;
    }
  }
  function renderTerrain() {
    const area = $('#terrain-content');
    const status = $('#terrain-status');
    area.replaceChildren();
    const locations = state.terrainGeology?.locations;
    if (!locations) {
      status.textContent = 'NO DATA FILE';
      status.className = 'tag tag-missing';
      area.append(el('p', 'muted', 'Terrain data is unavailable. The live source extraction has not been run or its output file could not be loaded; no measurements are inferred.'));
      return;
    }
    const complete = state.sites.filter((site) => terrainForSite(site.site)?.status === 'complete').length;
    status.textContent = `${complete}/${state.sites.length} WINDOWS`;
    status.className = complete === state.sites.length && complete ? 'tag tag-available' : 'tag tag-missing';
    area.append(el('p', 'coverage-summary', `${complete} of ${state.sites.length} sites have all 9 terrain samples. Elevation, slope, relief, and roughness are not imputed.`));
    for (const site of state.sites) {
      const terrain = terrainForSite(site.site);
      const details = el('details', 'coverage-detail');
      const elevation = terrainMetric(site, 'elevation_m');
      details.append(el('summary', '', `${pretty(site.site)} · ${elevation === null ? 'elevation unavailable' : `${elevation} m`}`));
      if (!terrain) {
        details.append(el('p', 'muted', 'No terrain record for this candidate.'));
        area.append(details);
        continue;
      }
      const metrics = terrain.metrics || {};
      const rows = [
        ['Elevation', metrics.elevation_m, 'm'],
        ['Slope (Horn 3×3)', metrics.slope_degrees, '°'],
        ['Relief (3×3 max − min)', metrics.relief_m, 'm'],
        ['Roughness (3×3 population standard deviation)', metrics.roughness_stddev_m, 'm']
      ];
      for (const [label, value, unit] of rows) {
        details.append(el('div', 'measurement-row', `${label}: ${validNumber(value) ? `${Number(value).toFixed(2)} ${unit}` : 'Unavailable'}`));
      }
      details.append(el('p', 'measurement-provenance', `${terrain.metrics?.valid_samples ?? 0}/${terrain.metrics?.total_samples ?? 9} valid samples · ${terrain.sampling?.sample_spacing_m ?? '—'} m spacing · ${terrain.sampling?.footprint_m ?? '—'} m window · ${terrain.source?.dataset || 'Source not recorded'}`));
      details.append(el('p', 'measurement-provenance', `Approximate input point ${Number(site.latitude).toFixed(5)}°, ${Number(site.longitude).toFixed(5)}° · ${terrain.source?.horizontal_crs || 'CRS not reported'} · vertical datum: ${terrain.source?.vertical_datum || 'not reported'}`));
      if (terrain.source?.native_resolution_m) {
        details.append(el('p', 'measurement-provenance', `Native source resolution: ${terrain.source.native_resolution_m} m · ${terrain.source.native_resolution_note || ''}`));
      } else if (terrain.source?.native_resolution_note) {
        details.append(el('p', 'measurement-provenance', terrain.source.native_resolution_note));
      }
      const links = el('div', 'measurement-links');
      if (terrain.source?.product_page) externalLink(links, terrain.source.product_page, 'Product documentation ↗');
      if (terrain.source?.provider_url) externalLink(links, terrain.source.provider_url, 'Elevation API documentation ↗');
      else if (terrain.samples?.[0]?.source_url) externalLink(links, terrain.samples[0].source_url, 'Sample query ↗');
      details.append(links);
      const samples = el('details', 'sample-detail');
      samples.append(el('summary', '', 'View exact 3×3 sample coordinates and elevations'));
      for (const sample of terrain.samples || []) {
        samples.append(el('div', 'sample-row', `${sample.latitude}°, ${sample.longitude}° · ${validNumber(sample.elevation_m) ? `${Number(sample.elevation_m).toFixed(2)} m` : 'Missing'}`));
      }
      details.append(samples);
      area.append(details);
    }
    if (state.terrainGeology.metadata?.errors?.length) {
      area.append(el('p', 'muted', `${state.terrainGeology.metadata.errors.length} source error(s) are recorded in the exported evidence snapshot.`));
    }
  }
  function renderGeology() {
    const area = $('#geology-content');
    const status = $('#geology-status');
    area.replaceChildren();
    const locations = state.terrainGeology?.locations;
    if (!locations) {
      status.textContent = 'NO DATA FILE';
      status.className = 'tag tag-missing';
      area.append(el('p', 'muted', 'Mapped geology is unavailable. No units, rock types, or ages are inferred.'));
      return;
    }
    const detailed = state.sites.filter((site) => geologyForSite(site.site)?.status === 'detailed_map_unit_available').length;
    const mapped = state.sites.filter((site) => (geologyForSite(site.site)?.map_units || []).length).length;
    status.textContent = `${mapped}/${state.sites.length} MAPPED · ${detailed} DETAILED`;
    status.className = mapped === state.sites.length && detailed ? 'tag tag-available' : 'tag tag-missing';
    area.append(el('p', 'coverage-summary', `${detailed} sites have a large-scale map intersection; ${mapped - detailed} have regional-scale context only. Approximate point queries are not field verification.`));
    for (const site of state.sites) {
      const geology = geologyForSite(site.site);
      const details = el('details', 'coverage-detail');
      const firstUnit = geology?.map_units?.[0];
      details.append(el('summary', '', `${pretty(site.site)} · ${firstUnit?.map_scale_class || geology?.status || 'no map unit'}`));
      if (!geology?.map_units?.length) {
        details.append(el('p', 'muted', geology?.error || 'No mapped unit returned for this approximate coordinate.'));
        if (geology?.query_url) externalLink(details, geology.query_url, 'Open map query ↗');
        area.append(details);
        continue;
      }
      details.append(el('p', 'measurement-provenance', `${geology.dataset || 'Map product not specified'} · API v${geology.api_version ?? 'not reported'} · ${geology.license || 'license not reported'}`));
      details.append(el('p', 'measurement-provenance', geology.interpretation || 'Map-scale and coordinate limitations apply.'));
      for (const unit of geology.map_units) {
        const unitBlock = el('div', 'geology-unit');
        unitBlock.append(el('strong', '', unit.name || 'Unnamed mapped unit'));
        const lithology = unit.lithology || unit.stratigraphic_name || 'Lithology not reported';
        unitBlock.append(el('p', '', `Rock type / description: ${lithology}`));
        const age = validNumber(unit.age_top_ma) && validNumber(unit.age_bottom_ma)
          ? `${unit.age_top_ma}–${unit.age_bottom_ma} Ma · ${unit.geologic_age_name || 'interval name not reported'}`
          : unit.geologic_age_name || 'Geological age not reported';
        unitBlock.append(el('p', '', `Mapped age: ${age} · ${unit.map_scale_class || 'map scale not reported'} scale · map ${unit.map_id ?? 'ID not reported'}`));
        if (unit.description) unitBlock.append(el('p', 'measurement-provenance', unit.description));
        if (unit.source_reference) unitBlock.append(el('p', 'measurement-provenance', unit.source_reference));
        if (unit.source_reference_url) externalLink(unitBlock, unit.source_reference_url, 'Original map / DOI ↗');
        else unitBlock.append(el('span', 'muted', 'Original map URL not supplied in citation'));
        details.append(unitBlock);
      }
      const links = el('div', 'measurement-links');
      externalLink(links, geology.query_url, 'Open exact map query ↗');
      details.append(links);
      area.append(details);
    }
  }
  function renderClimate() {
    const status = $('#climate-status');
    const area = $('#climate-content'); area.replaceChildren();
    if (!state.climateSummary.length) {
      if (state.daily.length) {
        status.textContent = 'DAILY DATA ONLY'; status.className = 'tag tag-missing';
        area.append(el('p', 'muted', 'Daily NASA POWER records are present, but no climate summary file is available. The chart below shows valid returned records only.'));
        renderChart();
        return;
      }
      status.textContent = state.downloadErrors.length ? 'DOWNLOAD FAILED' : 'NO DATA FILE';
      status.className = 'tag tag-missing';
      area.append(el('p', 'muted', state.downloadErrors.length
        ? `${state.downloadErrors.length} site request(s) failed. See data/earth/download_errors.json; failed values were not replaced.`
        : 'No downloaded climate dataset found. Run the included downloader to request real NASA POWER values; API errors are recorded and are never replaced with synthetic values.'));
      $('#plot-status').textContent = 'NO SERIES'; $('#plot-status').className = 'tag tag-missing';
      return;
    }
    status.textContent = state.downloadErrors.length ? 'PARTIAL DOWNLOAD' : 'SUMMARY AVAILABLE';
    status.className = state.downloadErrors.length ? 'tag tag-missing' : 'tag tag-available';
    const table = el('table', 'climate-table');
    table.innerHTML = '<thead><tr><th>Candidate</th><th>Approx. coordinates</th><th>Dates returned / requested</th><th>Mean T2M (°C)</th></tr></thead>';
    const tbody = document.createElement('tbody');
    for (const item of state.climateSummary) {
      const tr = document.createElement('tr');
      const site = state.sites.find((candidate) => candidate.site === item.site);
      [pretty(item.site), site ? `${Number(site.latitude).toFixed(2)}°, ${Number(site.longitude).toFixed(2)}°` : 'Not available', validNumber(item.days_downloaded) ? `${item.days_downloaded} / ${item.days_requested ?? 731}` : '—', validNumber(item.mean_temp_c) ? `${Number(item.mean_temp_c).toFixed(2)}°` : 'Not available'].forEach((value) => {
        const td = document.createElement('td'); td.textContent = value; tr.append(td);
      });
      tbody.append(tr);
    }
    table.append(tbody); area.append(table);
    if (state.climateMetadata) {
      area.append(el('p', 'muted', `${state.climateMetadata.dataset || 'NASA POWER daily data'} · ${state.climateMetadata.requested_period || 'Period not specified'} · ${state.climateMetadata.data_character || 'Data type not specified'} · Uncertainty: ${state.climateMetadata.uncertainty || 'not supplied'}`));
    }
    if (state.daily.some((row) => validPowerValue(row.T2M))) renderChart();
    else {
      if (state.daily.length) {
        $('#plot-status').textContent = 'NO VALID SERIES'; $('#plot-status').className = 'tag tag-missing';
        $('#chart-empty').hidden = false;
        $('#chart-empty').textContent = 'The daily file contains no valid NASA POWER T2M observations to plot.';
      } else {
        $('#plot-status').textContent = 'SUMMARY ONLY'; $('#plot-status').className = 'tag tag-missing';
        $('#chart-empty').hidden = false;
        $('#chart-empty').textContent = 'A summary is available, but no daily NASA POWER series file is present.';
      }
    }
  }
  function renderSources() {
    const list = $('#source-list');
    list.replaceChildren();
    if (!state.sources.length) {
      list.append(el('p', 'muted', 'Source inventory is unavailable; see data_sources.csv in the repository.'));
      return;
    }
    for (const source of state.sources) {
      const item = el('article', 'source-item');
      const heading = el('div', 'source-heading');
      heading.append(el('span', 'source-body', source.body || 'Scope not specified'), el('strong', '', source.dataset || 'Dataset not specified'));
      const detail = el('p', '', `${source.variable || 'Variables not specified'} · ${source.notes || 'No processing notes supplied.'}`);
      item.append(heading, detail);
      try {
        const url = new URL(source.official_url);
        if (url.protocol === 'https:') {
          const link = el('a', 'source-link', 'Open official source ↗');
          link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
          item.append(link);
        }
      } catch {
        item.append(el('span', 'muted', 'No valid source URL supplied.'));
      }
      list.append(item);
    }
  }
  function renderChart() {
    const series = state.daily.filter((row) => validPowerValue(row.T2M));
    $('#chart-empty').hidden = true;
    if (!window.Chart) {
      $('#chart-empty').hidden = false;
      $('#chart-empty').textContent = 'Chart library unavailable. Valid daily climate records were found; see data/earth/nasa_power_daily_2023_2024.csv.';
      $('#plot-status').textContent = 'SERIES AVAILABLE'; $('#plot-status').className = 'tag tag-available';
      return;
    }
    const selected = state.sites.filter((site) => state.selected.has(site.site));
    const plottedSites = (selected.length ? selected : state.sites.filter((site) => series.some((row) => row.site === site.site)))
      .map((site) => ({ ...site, rows: series.filter((row) => row.site === site.site).sort((a, b) => a.date.localeCompare(b.date)) }))
      .filter((site) => site.rows.length);
    if (!plottedSites.length) {
      if (state.chart) { state.chart.destroy(); state.chart = null; }
      $('#chart-empty').hidden = false;
      $('#chart-empty').textContent = selected.length
        ? `No valid NASA POWER T2M observations are available for the selected candidates.`
        : 'No valid NASA POWER T2M observations are available.';
      $('#plot-status').textContent = 'NO VALID SERIES'; $('#plot-status').className = 'tag tag-missing';
      return;
    }
    const dates = [...new Set(plottedSites.flatMap((site) => site.rows.map((row) => row.date)))].sort();
    const labels = dates.map((day) => day.length === 8 ? `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}` : day);
    const palette = ['#c3e880', '#80cbe0', '#efad7a', '#b9a2e8', '#e58d9a', '#87c9a5', '#d2cf83', '#86a4de'];
    if (state.chart) state.chart.destroy();
    state.chart = new Chart($('#climate-chart'), {
      type: 'line',
      data: {
        labels,
        datasets: plottedSites.map((site, index) => {
          const byDate = new Map(site.rows.map((row) => [row.date, Number(row.T2M)]));
          const color = palette[index % palette.length];
          return {
            label: `${pretty(site.site)} · T2M (°C)`,
            data: dates.map((day) => byDate.has(day) ? byDate.get(day) : null),
            borderColor: color,
            backgroundColor: `${color}22`,
            pointRadius: 0,
            borderWidth: 1.4,
            fill: false,
            spanGaps: false
          };
        })
      },
      options: { maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: '#b5c2b9', boxWidth: 12, font: { size: 10 } } } }, scales: { x: { ticks: { color: '#879791', maxTicksLimit: 8, maxRotation: 0 }, grid: { color: '#ffffff0b' } }, y: { title: { display: true, text: 'T2M (°C)', color: '#aeb8ac' }, ticks: { color: '#879791' }, grid: { color: '#ffffff10' } } } }
    });
    $('#plot-status').textContent = `${plottedSites.length} SERIES · ${selected.length && plottedSites.length < selected.length ? 'SOME SITES MISSING' : 'T2M'}`;
    $('#plot-status').className = 'tag tag-available';
  }
  function reportObject() {
    return {
      report_title: 'Space Analog Explorer',
      generated_at_utc: new Date().toISOString(),
      selected_body: state.body,
      scientific_status: 'Insufficient comparable data',
      similarity_score: null,
      interpretation: 'No validated analog outcome or ranking is calculated. Earth terrain and mapped units are descriptive measurements at approximate candidate coordinates; planetary target coordinates are absent.',
      methodology: 'Candidate list is searched and compared descriptively only. NASA POWER Earth climate summaries and site terrain/geology evidence retain their sources, coordinates, units, processing, and coverage. Terrain metrics are comparable only within matching source/resolution and vertical-reference groups; map units retain their original scale. No cross-world similarity score is computed.',
      scientific_limitations: [
        'Candidate coordinates and environment labels are approximate and unvalidated.',
        'Earth atmospheric conditions and gravity do not reproduce lunar or Martian environments.',
        'Earth geology map intersections vary in map scale and are not field-verified observations.',
        'No lunar or Mars site coordinates are supplied; LOLA/MOLA and planetary geology site measurements are unavailable.',
        '3DEP point responses do not identify a vertical datum; values are not converted.',
        'Terrain values from different source/resolution groups are not directly compared.',
        'NASA POWER values are gridded modeled/reanalysis-derived estimates, not in-situ observations.',
        'Per-site measurement uncertainties and confidence intervals are not supplied by the current files or computed by this MVP.',
        'The planetary globe is illustrative and contains no scientific terrain or imagery data.'
      ],
      candidate_scope: 'Supplied list only; approximate, unvalidated candidates, not discoveries or validated analogs.',
      candidates: state.sites.map((site) => ({ ...site, selected_for_comparison: state.selected.has(site.site), climate_summary: findSiteClimate(site.site) })),
      planetary_facts: state.facts,
      source_inventory: state.sources,
      data_coverage: {
        nasa_power_summary_records: state.climateSummary.length,
        nasa_power_daily_records: state.daily.length,
        nasa_power_download_errors: state.downloadErrors,
        nasa_power_metadata: state.climateMetadata,
        terrain_complete_locations: state.sites.filter((site) => terrainForSite(site.site)?.status === 'complete').map((site) => site.site),
        terrain_missing_locations: state.sites.filter((site) => terrainForSite(site.site)?.status !== 'complete').map((site) => site.site),
        geology_by_location: Object.fromEntries(state.sites.map((site) => [site.site, geologyForSite(site.site)?.status || 'unavailable'])),
        planetary_reference: state.terrainGeology?.planetary_reference || null,
        terrain_geology_metadata: state.terrainGeology?.metadata || null,
        similarity: 'Not computed'
      },
      terrain_geology: state.terrainGeology,
      climate_summary: state.climateSummary,
      climate_daily_record_count: state.daily.length,
      climate_daily_records: state.daily
    };
  }
  function download(name, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
    document.body.append(anchor); anchor.click(); anchor.remove();     window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`${name} downloaded`);
  }
  function exportJSON() {
    download('space-analog-explorer-research-snapshot.json', `${JSON.stringify(reportObject(), null, 2)}\n`, 'application/json');
  }
  function csvCell(value) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }
  function exportCSV() {
    const columns = ['site', 'latitude', 'longitude', 'coordinate_precision', 'candidate_source_file', 'country', 'environment', 'role', 'status', 'selected_for_comparison', 'nasa_power_mean_temp_c', 'nasa_power_mean_temp_unit', 'nasa_power_total_precipitation_mm_2023_2024', 'nasa_power_total_precipitation_unit', 'nasa_power_dates_returned', 'nasa_power_dates_requested', 'nasa_power_valid_days_t2m', 'nasa_power_valid_days_precipitation', 'nasa_power_source', 'nasa_power_source_url', 'nasa_power_period', 'terrain_status', 'terrain_elevation_m', 'terrain_slope_degrees', 'terrain_relief_m', 'terrain_roughness_stddev_m', 'terrain_dataset', 'terrain_resolution_group', 'terrain_native_resolution', 'terrain_sample_spacing_m', 'terrain_window_m', 'terrain_source_url', 'geology_status', 'geology_top_unit', 'geology_lithology', 'geology_age_top_ma', 'geology_age_bottom_ma', 'geology_map_scale', 'geology_citation', 'geology_query_url', 'similarity_outcome'];
    const lines = [columns.map(csvCell).join(',')];
    for (const site of state.sites) {
      const summary = findSiteClimate(site.site) || {};
      const terrain = terrainForSite(site.site);
      const geology = geologyForSite(site.site);
      const unit = geology?.map_units?.[0] || {};
      const source = terrain?.source || {};
      lines.push([
        site.site, site.latitude, site.longitude, 'Approximate input coordinate', 'candidate_sites.csv / sites.json',
        site.country, site.environment, site.role, site.status, state.selected.has(site.site),
        summary.mean_temp_c ?? '', summary.mean_temp_unit ?? 'degC', summary.total_precipitation_mm_2023_2024 ?? '',
        summary.total_precipitation_unit ?? 'mm',
        summary.days_downloaded ?? '', summary.days_requested ?? '', summary.valid_days_t2m ?? '',
        summary.valid_days_precipitation ?? '', summary.source ?? '', summary.source_url ?? '', summary.period ?? '',
        terrain?.status ?? '', terrain?.metrics?.elevation_m ?? '', terrain?.metrics?.slope_degrees ?? '',
        terrain?.metrics?.relief_m ?? '', terrain?.metrics?.roughness_stddev_m ?? '',
        source.dataset ?? '', terrain?.comparison_group ?? '',
        source.native_resolution_m ?? source.native_resolution_note ?? '',
        terrain?.sampling?.sample_spacing_m ?? '', terrain?.sampling?.footprint_m ?? '',
        terrain?.samples?.[0]?.source_url ?? '',
        geology?.status ?? '', unit.name ?? '', unit.lithology ?? '',
        unit.age_top_ma ?? '', unit.age_bottom_ma ?? '', unit.map_scale_class ?? '',
        unit.source_reference ?? '', geology?.query_url ?? '',
        'Insufficient comparable data'
      ].map(csvCell).join(','));
    }
    download('space-analog-explorer-candidate-report.csv', `${lines.join('\r\n')}\r\n`, 'text/csv;charset=utf-8');
  }
  async function loadData() {
    const results = await Promise.allSettled([
      loadJSON('sites.json'), loadCSV('planetary_facts.csv'), loadCSV('data_sources.csv'),
      loadJSON('data/earth/climate_summary.json'), loadCSV('data/earth/climate_summary.csv'), loadCSV('data/earth/nasa_power_daily_2023_2024.csv'),
      loadJSON('data/earth/download_errors.json'), loadJSON('data/earth/climate_metadata.json'),
      loadJSON('data/processed/site_terrain_geology.json')
    ]);
    if (results[0].status === 'fulfilled') state.sites = results[0].value;
    else state.siteLoadError = true;
    if (results[1].status === 'fulfilled') state.facts = results[1].value;
    if (results[2].status === 'fulfilled') state.sources = results[2].value;
    const summaryJSON = results[3].status === 'fulfilled' ? results[3].value : null;
    const summaryCSV = results[4].status === 'fulfilled' ? results[4].value : null;
    state.climateSummary = Array.isArray(summaryJSON) ? summaryJSON : (summaryCSV || []);
    state.daily = results[5].status === 'fulfilled' ? results[5].value : [];
    state.downloadErrors = results[6].status === 'fulfilled' && Array.isArray(results[6].value) ? results[6].value : [];
    state.climateMetadata = results[7].status === 'fulfilled' ? results[7].value : null;
    state.terrainGeology = results[8].status === 'fulfilled' ? results[8].value : null;
    makeMap();
    if (state.map) state.sites.forEach(addMarker);
    renderSites(); renderFacts(); renderTerrain(); renderGeology(); renderClimate(); renderSources(); updateSelection();
  }
  function bindEvents() {
    let sourceWasOpen = false;
    $('#site-search').addEventListener('input', renderSites);
    $('#role-filter').addEventListener('change', renderSites);
    document.querySelectorAll('.planet-option').forEach((button) => button.addEventListener('click', () => {
      state.body = button.dataset.body; renderFacts();
    }));
    $('#compare-button').addEventListener('click', () => {
      renderComparison();
      if (state.daily.length) renderChart();
      $('#comparison').scrollIntoView({ behavior: 'smooth' });
    });
    $('#export-json').addEventListener('click', exportJSON);
    $('#export-csv').addEventListener('click', exportCSV);
    $('#print-report').addEventListener('click', () => window.print());
    window.addEventListener('beforeprint', () => {
      sourceWasOpen = $('.source-inventory').open;
      $('.source-inventory').open = true;
      renderComparison();
    });
    window.addEventListener('afterprint', () => {
      if (!sourceWasOpen) $('.source-inventory').open = false;
    });
  }
  bindEvents();
  loadData().catch((error) => {
    console.error('Unable to load research data:', error);
    showToast('Some project data could not be loaded. See the coverage notes.');
  });
})();
