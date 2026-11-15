(() => {
  const state = { sites: [], facts: [], sources: [], climateSummary: [], daily: [], downloadErrors: [], climateMetadata: null, selected: new Set(), body: 'Earth', map: null, markers: new Map(), chart: null, tilesUnavailable: false };
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
    const selected = state.sites.filter((site) => state.selected.has(site.site));
    if (!selected.length) {
      const empty = el('div', 'empty-state');
      empty.append(el('span', '', '＋'), el('strong', '', 'Select candidate sites to compare'), el('p', '', 'Use the site cards above. No rankings are produced.'));
      content.append(empty);
      return;
    }
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
      ['Site terrain / geology', () => 'Missing'],
      ['Measurement uncertainty', () => 'Not provided by current datasets'],
      ['Similarity outcome', () => 'Insufficient verified data']
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
      scientific_status: 'Insufficient verified data',
      similarity_score: null,
      interpretation: 'No validated analog outcome or ranking is calculated. Site-specific terrain and geology measurements are missing.',
      methodology: 'Candidate list is searched and compared descriptively only. NASA POWER Earth climate summaries, if present, are reported with source, location, unit, period, and coverage; global planetary facts are context only. No cross-world similarity score is computed because compatible site-level terrain and geology measurements are unavailable.',
      scientific_limitations: [
        'Candidate coordinates and environment labels are approximate and unvalidated.',
        'Earth atmospheric conditions and gravity do not reproduce lunar or Martian environments.',
        'No site-level elevation, slope, relief, roughness, or mapped geology products are processed.',
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
        terrain: 'Not processed; site-level measurements missing',
        geology: 'Not processed; site-specific mapped units missing',
        similarity: 'Not computed'
      },
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
    const columns = ['site', 'latitude', 'longitude', 'coordinate_precision', 'candidate_source_file', 'country', 'environment', 'role', 'status', 'selected_for_comparison', 'nasa_power_mean_temp_c', 'nasa_power_mean_temp_unit', 'nasa_power_total_precipitation_mm_2023_2024', 'nasa_power_total_precipitation_unit', 'nasa_power_dates_returned', 'nasa_power_dates_requested', 'nasa_power_valid_days_t2m', 'nasa_power_valid_days_precipitation', 'nasa_power_source', 'nasa_power_source_url', 'nasa_power_period', 'similarity_outcome'];
    const lines = [columns.map(csvCell).join(',')];
    for (const site of state.sites) {
      const summary = findSiteClimate(site.site) || {};
      lines.push([
        site.site, site.latitude, site.longitude, 'Approximate input coordinate', 'candidate_sites.csv / sites.json',
        site.country, site.environment, site.role, site.status, state.selected.has(site.site),
        summary.mean_temp_c ?? '', summary.mean_temp_unit ?? 'degC', summary.total_precipitation_mm_2023_2024 ?? '',
        summary.total_precipitation_unit ?? 'mm',
        summary.days_downloaded ?? '', summary.days_requested ?? '', summary.valid_days_t2m ?? '',
        summary.valid_days_precipitation ?? '', summary.source ?? '', summary.source_url ?? '', summary.period ?? '',
        'Insufficient verified data'
      ].map(csvCell).join(','));
    }
    download('space-analog-explorer-candidate-report.csv', `${lines.join('\r\n')}\r\n`, 'text/csv;charset=utf-8');
  }
  async function loadData() {
    const results = await Promise.allSettled([
      loadJSON('sites.json'), loadCSV('planetary_facts.csv'), loadCSV('data_sources.csv'),
      loadJSON('data/earth/climate_summary.json'), loadCSV('data/earth/climate_summary.csv'), loadCSV('data/earth/nasa_power_daily_2023_2024.csv'),
      loadJSON('data/earth/download_errors.json'), loadJSON('data/earth/climate_metadata.json')
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
    makeMap();
    if (state.map) state.sites.forEach(addMarker);
    renderSites(); renderFacts(); renderClimate(); renderSources(); updateSelection();
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
