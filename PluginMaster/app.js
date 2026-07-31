/**
 * PluginMaster Directory Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // State Management
  let allPlugins = [];
  let currentChannel = 'all';
  let currentApiFilter = 'all';
  let currentSort = 'name-asc';
  let searchQuery = '';

  // DOM Elements
  const searchInput = document.getElementById('search-input');
  const clearSearchBtn = document.getElementById('clear-search');
  const channelTabs = document.getElementById('channel-tabs');
  const apiFilter = document.getElementById('api-filter');
  const sortSelect = document.getElementById('sort-select');
  const pluginsGrid = document.getElementById('plugins-grid');
  const visibleCount = document.getElementById('visible-count');
  const emptyState = document.getElementById('empty-state');
  const resetFiltersBtn = document.getElementById('reset-filters-btn');

  // Stats Elements
  const statTotal = document.getElementById('stat-total');
  const statStable = document.getElementById('stat-stable');
  const statTesting = document.getElementById('stat-testing');
  const statApi13 = document.getElementById('stat-api13');

  // Metadata Banner Elements
  const metaDistHash = document.getElementById('meta-dist-hash');
  const metaDistDate = document.getElementById('meta-dist-date');
  const metaCommitHash = document.getElementById('meta-commit-hash');

  // Repo Subscription URL Elements
  const repoUrlInput = document.getElementById('repo-url-input');
  const copyRepoUrlBtn = document.getElementById('copy-repo-url-btn');

  // Modal Elements
  const detailModal = document.getElementById('detail-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalName = document.getElementById('modal-name');
  const modalAuthor = document.getElementById('modal-author');
  const modalBadges = document.getElementById('modal-badges');
  const modalPunchline = document.getElementById('modal-punchline');
  const modalDescription = document.getElementById('modal-description');
  const modalChangelogSec = document.getElementById('modal-changelog-sec');
  const modalChangelog = document.getElementById('modal-changelog');
  const modalTestingChangelogSec = document.getElementById('modal-testing-changelog-sec');
  const modalTestingChangelog = document.getElementById('modal-testing-changelog');
  const modalInternalName = document.getElementById('modal-internal-name');
  const modalVersion = document.getElementById('modal-version');
  const modalApiLevel = document.getElementById('modal-api-level');
  const modalUpdated = document.getElementById('modal-updated');
  const modalRepoBtn = document.getElementById('modal-repo-btn');
  const modalDownloadBtn = document.getElementById('modal-download-btn');

  // Initialize Repo URL Subscription Box
  const repoJsonUrl = new URL('./repo.json', window.location.href).href;
  if (repoUrlInput) {
    repoUrlInput.value = repoJsonUrl;
  }

  if (copyRepoUrlBtn) {
    copyRepoUrlBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(repoJsonUrl).then(() => {
        const origHTML = copyRepoUrlBtn.innerHTML;
        copyRepoUrlBtn.innerHTML = '<i class="ri-check-line"></i> 已複製網址！';
        copyRepoUrlBtn.classList.add('copied');
        setTimeout(() => {
          copyRepoUrlBtn.innerHTML = origHTML;
          copyRepoUrlBtn.classList.remove('copied');
        }, 2000);
      });
    });
  }

  // Fetch Meta Data
  async function loadMetaData() {
    try {
      const response = await fetch('./meta.json');
      if (!response.ok) return;
      const meta = await response.json();
      
      if (meta.upstream_dist_hash) {
        metaDistHash.textContent = meta.upstream_dist_hash.substring(0, 8);
        metaDistHash.title = meta.upstream_dist_hash;
      } else {
        metaDistHash.textContent = 'N/A';
      }

      if (meta.upstream_dist_date) {
        const d = new Date(meta.upstream_dist_date);
        metaDistDate.textContent = isNaN(d.getTime()) ? meta.upstream_dist_date.split(' ')[0] : d.toLocaleDateString('zh-TW');
      } else {
        metaDistDate.textContent = '未知日期';
      }

      if (meta.commit_hash) {
        metaCommitHash.textContent = meta.commit_hash;
        metaCommitHash.title = meta.commit_full || meta.commit_hash;
      }
    } catch (e) {
      console.warn('Could not load meta.json:', e);
    }
  }

  // Fetch Plugin Data from repo.json
  async function loadPluginData() {
    try {
      const response = await fetch('./repo.json');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      allPlugins = await response.json();
      updateStats();
      applyFiltersAndRender();
    } catch (error) {
      console.error('Failed to load repo.json:', error);
      pluginsGrid.innerHTML = `
        <div class="empty-state">
          <i class="ri-error-warning-line empty-icon" style="color: #ef4444;"></i>
          <h3>無法載入 repo.json</h3>
          <p>請確認是否已執行 ./generate_repo.sh 產生最新 Dalamud擴充套件資料庫。</p>
        </div>
      `;
    }
  }

  // Update Statistics
  function updateStats() {
    statTotal.textContent = allPlugins.length;

    const stableCount = allPlugins.filter(p => p._Dip17Channel === 'stable' || !p.IsTestingExclusive).length;
    const testingCount = allPlugins.filter(p => p.IsTestingExclusive || p._Dip17Channel === 'testing-live').length;
    const api13Count = allPlugins.filter(p => p.DalamudApiLevel === 13 || p.TestingDalamudApiLevel === 13).length;

    statStable.textContent = stableCount;
    statTesting.textContent = testingCount;
    statApi13.textContent = api13Count;
  }

  // Event Listeners
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    clearSearchBtn.classList.toggle('hidden', searchQuery.length === 0);
    applyFiltersAndRender();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.classList.add('hidden');
    applyFiltersAndRender();
  });

  channelTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    
    channelTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    currentChannel = btn.dataset.channel;
    applyFiltersAndRender();
  });

  apiFilter.addEventListener('change', (e) => {
    currentApiFilter = e.target.value;
    applyFiltersAndRender();
  });

  sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    applyFiltersAndRender();
  });

  resetFiltersBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.classList.add('hidden');
    currentChannel = 'all';
    currentApiFilter = 'all';
    currentSort = 'name-asc';

    channelTabs.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.channel === 'all');
    });
    apiFilter.value = 'all';
    sortSelect.value = 'name-asc';

    applyFiltersAndRender();
  });

  // Modal Controls
  modalCloseBtn.addEventListener('click', closeModal);
  detailModal.addEventListener('click', (e) => {
    if (e.target === detailModal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !detailModal.classList.contains('hidden')) {
      closeModal();
    }
  });

  function closeModal() {
    detailModal.classList.add('hidden');
  }

  // Filter & Sort Logic
  function applyFiltersAndRender() {
    let result = allPlugins.filter(plugin => {
      // Channel Filter
      if (currentChannel === 'stable' && plugin.IsTestingExclusive) return false;
      if (currentChannel === 'testing-live' && plugin._Dip17Channel !== 'testing-live' && !plugin.IsTestingExclusive) return false;

      // API Level Filter
      const apiLvl = plugin.DalamudApiLevel || plugin.TestingDalamudApiLevel || 0;
      if (currentApiFilter === '13' && apiLvl !== 13) return false;
      if (currentApiFilter === '12' && apiLvl !== 12) return false;
      if (currentApiFilter === '11' && apiLvl !== 11) return false;
      if (currentApiFilter === '10' && apiLvl !== 10) return false;
      if (currentApiFilter === 'legacy' && apiLvl > 9) return false;

      // Search Query
      if (searchQuery) {
        const name = (plugin.Name || '').toLowerCase();
        const author = (plugin.Author || '').toLowerCase();
        const desc = (plugin.Description || '').toLowerCase();
        const punch = (plugin.Punchline || '').toLowerCase();
        const internal = (plugin.InternalName || '').toLowerCase();
        const tags = (plugin.Tags || []).join(' ').toLowerCase();

        return name.includes(searchQuery) ||
               author.includes(searchQuery) ||
               desc.includes(searchQuery) ||
               punch.includes(searchQuery) ||
               internal.includes(searchQuery) ||
               tags.includes(searchQuery);
      }

      return true;
    });

    // Sorting
    result.sort((a, b) => {
      if (currentSort === 'name-asc') {
        return (a.Name || '').localeCompare(b.Name || '');
      } else if (currentSort === 'name-desc') {
        return (b.Name || '').localeCompare(a.Name || '');
      } else if (currentSort === 'updated-desc') {
        return (b.LastUpdate || 0) - (a.LastUpdate || 0);
      } else if (currentSort === 'api-desc') {
        const apiA = a.DalamudApiLevel || a.TestingDalamudApiLevel || 0;
        const apiB = b.DalamudApiLevel || b.TestingDalamudApiLevel || 0;
        return apiB - apiA;
      }
      return 0;
    });

    renderGrid(result);
  }

  // Render Grid Cards
  function renderGrid(plugins) {
    visibleCount.textContent = plugins.length;

    if (plugins.length === 0) {
      pluginsGrid.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    pluginsGrid.classList.remove('hidden');
    emptyState.classList.add('hidden');

    pluginsGrid.innerHTML = plugins.map(plugin => {
      const isStable = !plugin.IsTestingExclusive;
      const apiLvl = plugin.DalamudApiLevel || plugin.TestingDalamudApiLevel || '?';
      const initials = (plugin.Name || 'P').substring(0, 2).toUpperCase();
      
      const tags = (plugin.Tags || []).slice(0, 4).map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('');
      const version = plugin.AssemblyVersion || plugin.TestingAssemblyVersion || '1.0.0.0';

      return `
        <div class="plugin-card" data-internal="${escapeHtml(plugin.InternalName)}">
          <div>
            <div class="card-header">
              <div class="card-avatar">
                ${plugin.IconUrl ? `<img src="${escapeHtml(plugin.IconUrl)}" alt="${escapeHtml(plugin.Name)}" onerror="this.outerHTML='${initials}'">` : initials}
              </div>
              <div class="card-title-group">
                <h3 class="card-title">${escapeHtml(plugin.Name || plugin.InternalName)}</h3>
                <p class="card-author">作者：${escapeHtml(plugin.Author || '社群貢獻')}</p>
              </div>
            </div>

            <div class="badge-group">
              ${isStable ? `<span class="badge badge-stable"><i class="ri-checkbox-circle-fill"></i> Stable</span>` : ''}
              ${plugin.IsTestingExclusive ? `<span class="badge badge-testing"><i class="ri-flask-fill"></i> Testing</span>` : ''}
              <span class="badge ${apiLvl >= 13 ? 'badge-api' : 'badge-api-legacy'}">API ${apiLvl}</span>
            </div>

            <div class="card-body">
              ${plugin.Punchline ? `<p class="card-punchline">${escapeHtml(plugin.Punchline)}</p>` : ''}
              <p class="card-desc">${escapeHtml(plugin.Description || '尚無描述說明。')}</p>
              <div class="card-tags">${tags}</div>
            </div>
          </div>

          <div class="card-footer">
            <span class="card-version">v${escapeHtml(version)}</span>
            <div class="card-actions">
              <button class="btn btn-secondary btn-detail-trigger"><i class="ri-file-text-line"></i> 詳細說明</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach Event Listeners to cards
    pluginsGrid.querySelectorAll('.plugin-card').forEach(card => {
      const internalName = card.dataset.internal;
      const targetPlugin = allPlugins.find(p => p.InternalName === internalName);

      card.addEventListener('click', (e) => {
        if (targetPlugin) openModal(targetPlugin);
      });
    });
  }

  // Open Detail Modal
  function openModal(plugin) {
    modalName.textContent = plugin.Name || plugin.InternalName;
    modalAuthor.querySelector('span').textContent = plugin.Author || '社群貢獻者';
    modalPunchline.textContent = plugin.Punchline || '';
    modalDescription.textContent = plugin.Description || '尚無 Dalamud擴充套件描述細節。';
    modalInternalName.textContent = plugin.InternalName;
    modalVersion.textContent = plugin.AssemblyVersion || plugin.TestingAssemblyVersion || '1.0.0.0';
    
    const apiLvl = plugin.DalamudApiLevel || plugin.TestingDalamudApiLevel || 'N/A';
    modalApiLevel.textContent = `API Level ${apiLvl}`;

    // Format Date
    if (plugin.LastUpdate) {
      const date = new Date(plugin.LastUpdate * 1000);
      modalUpdated.textContent = date.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } else {
      modalUpdated.textContent = '未知';
    }

    // Badges
    const isStable = !plugin.IsTestingExclusive;
    modalBadges.innerHTML = `
      ${isStable ? `<span class="badge badge-stable"><i class="ri-checkbox-circle-fill"></i> Stable</span>` : ''}
      ${plugin.IsTestingExclusive ? `<span class="badge badge-testing"><i class="ri-flask-fill"></i> Testing</span>` : ''}
      <span class="badge ${apiLvl >= 13 ? 'badge-api' : 'badge-api-legacy'}">API ${apiLvl}</span>
    `;

    // Changelogs
    if (plugin.Changelog) {
      modalChangelogSec.classList.remove('hidden');
      modalChangelog.textContent = plugin.Changelog;
    } else {
      modalChangelogSec.classList.add('hidden');
    }

    if (plugin.TestingChangelog) {
      modalTestingChangelogSec.classList.remove('hidden');
      modalTestingChangelog.textContent = plugin.TestingChangelog;
    } else {
      modalTestingChangelogSec.classList.add('hidden');
    }

    // Repo Link
    if (plugin.RepoUrl) {
      modalRepoBtn.href = plugin.RepoUrl;
      modalRepoBtn.classList.remove('hidden');
    } else {
      modalRepoBtn.classList.add('hidden');
    }

    // Download Button Link
    const downloadUrl = plugin.IsTestingExclusive ? 
      (plugin.DownloadLinkTesting || plugin.DownloadLinkInstall) : 
      (plugin.DownloadLinkInstall || plugin.DownloadLinkUpdate);
      
    if (downloadUrl) {
      modalDownloadBtn.href = downloadUrl;
      modalDownloadBtn.classList.remove('hidden');
    } else {
      modalDownloadBtn.classList.add('hidden');
    }

    detailModal.classList.remove('hidden');
  }

  // Helper: Escape HTML
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, match => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[match]));
  }

  // Initialize
  loadMetaData();
  loadPluginData();
});
