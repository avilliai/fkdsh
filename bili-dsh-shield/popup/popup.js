/* Bili DSH Shield 弹出面板交互与配置绑定逻辑 (纯原生无依赖，标准 UTF-8) */
(function () {
  'use strict';

  // 默认配置
  const DEFAULT_SETTINGS = {
    enabled: true,
    filterMode: 'collapse',
    threshold: 50,
    avatarCheck: true,
    deepCheck: true,
    autoReport: false,
    reportReason: 2,
    reportDelayMin: 4,
    reportDelayMax: 8,
    reportMaxDaily: 50,
    reportedTodayCount: 0,
    autoStall: false,
    stallTaskTypes: ['math', 'logic', 'compare', 'automata'],
    stallMaxTurns: 3,
    stallDelayMin: 20,
    stallDelayMax: 35,
    cloudSync: false,
    hubUrl: 'http://localhost:3000',
    hubApiKey: '',
    hubAutoSync: true,
    hubReport: true,
    hubSyncInterval: 30,
    lastHubSyncTime: 0
  };

  let currentSettings = { ...DEFAULT_SETTINGS };
  let currentLists = {
    userBlacklist: [],
    userWhitelist: [],
    hubBlacklist: [],
    stats: { fishFound: 0, autoReported: 0, stallTurns: 0, hubSyncedCount: 0 }
  };
  let activeSubTab = 'black';

  /* ---------------- UI 提示 Toast ---------------- */
  function showToast(text, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = text;
    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 2600);
  }

  /* ---------------- 存储读取与更新 ---------------- */
  async function loadData() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['dsh_settings', 'dsh_lists'], (res) => {
        if (res.dsh_settings) {
          currentSettings = { ...DEFAULT_SETTINGS, ...res.dsh_settings };
        }
        if (res.dsh_lists) {
          currentLists = {
            userBlacklist: res.dsh_lists.userBlacklist || [],
            userWhitelist: res.dsh_lists.userWhitelist || [],
            hubBlacklist: res.dsh_lists.hubBlacklist || [],
            stats: res.dsh_lists.stats || { fishFound: 0, autoReported: 0, stallTurns: 0 }
          };
        }
        resolve();
      });
    });
  }

  async function saveSettings(diff) {
    currentSettings = { ...currentSettings, ...diff };
    return new Promise((resolve) => {
      chrome.storage.local.set({ dsh_settings: currentSettings }, () => {
        resolve();
      });
    });
  }

  async function saveLists() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ dsh_lists: currentLists }, () => {
        resolve();
      });
    });
  }

  /* ---------------- DOM 渲染与同步 ---------------- */
  function renderAll() {
    const s = currentSettings;

    // 总开关
    const master = document.getElementById('master-switch');
    if (master) master.checked = !!s.enabled;

    // 过滤模式
    const radios = document.querySelectorAll('input[name="filterMode"]');
    radios.forEach((r) => {
      r.checked = (r.value === s.filterMode);
    });

    // 阈值滑块
    const slider = document.getElementById('threshold-slider');
    const sliderVal = document.getElementById('threshold-val');
    if (slider) slider.value = s.threshold;
    if (sliderVal) sliderVal.textContent = `${s.threshold} 分`;

    // 辅助特征
    const chkAvatar = document.getElementById('check-avatar');
    if (chkAvatar) chkAvatar.checked = !!s.avatarCheck;
    const chkDeep = document.getElementById('check-deep');
    if (chkDeep) chkDeep.checked = s.deepCheck !== false;

    // 自动举报
    const chkAutoRep = document.getElementById('check-autoreport');
    if (chkAutoRep) chkAutoRep.checked = !!s.autoReport;
    const selReason = document.getElementById('report-reason');
    if (selReason) selReason.value = String(s.reportReason || 2);
    const delayMin = document.getElementById('report-delay-min');
    if (delayMin) delayMin.value = s.reportDelayMin || 4;
    const delayMax = document.getElementById('report-delay-max');
    if (delayMax) delayMax.value = s.reportDelayMax || 8;
    const maxDaily = document.getElementById('report-max-daily');
    if (maxDaily) maxDaily.value = s.reportMaxDaily || 50;
    const todayCountEl = document.getElementById('reported-today-val');
    if (todayCountEl) todayCountEl.textContent = String(s.reportedTodayCount || 0);

    // 算力泥潭
    const chkAutoStall = document.getElementById('check-autostall');
    if (chkAutoStall) chkAutoStall.checked = !!s.autoStall;
    const stallTypes = Array.isArray(s.stallTaskTypes) ? s.stallTaskTypes : ['math', 'logic', 'compare', 'automata'];
    document.querySelectorAll('input[name="stallTaskType"]').forEach((box) => {
      box.checked = stallTypes.includes(box.value);
    });
    const stallTurnsSlider = document.getElementById('stall-max-turns');
    const stallTurnsVal = document.getElementById('stall-max-turns-val');
    if (stallTurnsSlider) stallTurnsSlider.value = s.stallMaxTurns || 3;
    if (stallTurnsVal) stallTurnsVal.textContent = `${s.stallMaxTurns || 3} 轮`;
    const stallDelayMin = document.getElementById('stall-delay-min');
    if (stallDelayMin) stallDelayMin.value = s.stallDelayMin || 20;
    const stallDelayMax = document.getElementById('stall-delay-max');
    if (stallDelayMax) stallDelayMax.value = s.stallDelayMax || 35;

    // 中心仓
    const chkHubSync = document.getElementById('check-hub-sync');
    if (chkHubSync) chkHubSync.checked = !!s.cloudSync;
    const hubUrlInput = document.getElementById('hub-url');
    if (hubUrlInput) hubUrlInput.value = s.hubUrl || 'http://localhost:3000';
    const hubApiKeyInput = document.getElementById('hub-apikey');
    if (hubApiKeyInput) hubApiKeyInput.value = s.hubApiKey || '';
    const chkHubAuto = document.getElementById('check-hub-autosync');
    if (chkHubAuto) chkHubAuto.checked = s.hubAutoSync !== false;
    const chkHubRep = document.getElementById('check-hub-report');
    if (chkHubRep) chkHubRep.checked = s.hubReport !== false;

    // 中心仓卡片状态
    updateHubStatusUI(!!s.hubApiKey);

    // 战绩数据看板
    const stats = currentLists.stats || {};
    const fishCountEl = document.getElementById('stat-fish-count');
    if (fishCountEl) fishCountEl.textContent = String(stats.fishFound || 0);
    const repCountEl = document.getElementById('stat-report-count');
    if (repCountEl) repCountEl.textContent = String(stats.autoReported || 0);
    const stallCountEl = document.getElementById('stat-stall-count');
    if (stallCountEl) stallCountEl.textContent = String(stats.stallTurns || 0);
    const hubCountEl = document.getElementById('stat-hub-count');
    if (hubCountEl) hubCountEl.textContent = String((currentLists.hubBlacklist || []).length);

    // 渲染名单
    renderListItems();
  }

  function updateHubStatusUI(hasKey, isValid = null, note = '') {
    const dot = document.getElementById('hub-dot');
    const badge = document.getElementById('hub-status-badge');
    const desc = document.getElementById('hub-status-desc');

    if (!dot || !badge || !desc) return;

    if (isValid === true) {
      dot.className = 'status-dot online';
      badge.textContent = '已激活 (正常在线)';
      desc.textContent = note || 'API Key 授权有效，已开启全网云端黑名单增量同步与众包协防';
    } else if (isValid === false) {
      dot.className = 'status-dot danger';
      badge.textContent = '未通过验证';
      desc.textContent = note || 'API Key 无效或服务器连接超时，请检查后重试';
    } else {
      if (hasKey) {
        dot.className = 'status-dot warn';
        badge.textContent = '已保存凭据 (待校验)';
        desc.textContent = '点击「验证并激活」与中心仓通信并确认状态';
      } else {
        dot.className = 'status-dot';
        badge.textContent = '未激活';
        desc.textContent = '请输入服务端派发的 API Key 并点击「验证并激活」';
      }
    }
  }

  /* ---------------- 名单渲染与搜索 ---------------- */
  function renderListItems() {
    const container = document.getElementById('list-items-container');
    if (!container) return;

    const searchInput = document.getElementById('list-search');
    const keyword = (searchInput ? searchInput.value : '').trim().toLowerCase();

    let targetArray = [];
    if (activeSubTab === 'black') targetArray = currentLists.userBlacklist || [];
    else if (activeSubTab === 'white') targetArray = currentLists.userWhitelist || [];
    else if (activeSubTab === 'hubbl') targetArray = currentLists.hubBlacklist || [];

    // 过滤搜索
    const filtered = targetArray.filter((it) => {
      if (!keyword) return true;
      const midStr = String(it.mid || '');
      const unameStr = String(it.uname || '').toLowerCase();
      return midStr.includes(keyword) || unameStr.includes(keyword);
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div class="empty-list-tip">${keyword ? '未搜索到匹配项' : '当前名单为空'}</div>`;
      return;
    }

    let html = '';
    filtered.forEach((it, idx) => {
      const isHub = (activeSubTab === 'hubbl');
      const reason = it.reason ? ` · ${it.reason}` : '';
      html += `
        <div class="list-item-row">
          <div class="list-item-info">
            <span class="list-item-name">${escapeHtml(it.uname || 'UID ' + it.mid)}</span>
            <span class="list-item-sub">UID: ${it.mid}${escapeHtml(reason)}</span>
          </div>
          ${!isHub ? `<button class="list-item-btn-del" data-mid="${it.mid}">移出</button>` : `<span style="color:#64748b; font-size:10px;">云端确诊</span>`}
        </div>
      `;
    });

    container.innerHTML = html;

    // 绑定删除按钮
    container.querySelectorAll('.list-item-btn-del').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const mid = e.target.getAttribute('data-mid');
        if (!mid) return;
        if (activeSubTab === 'black') {
          currentLists.userBlacklist = currentLists.userBlacklist.filter((x) => String(x.mid) !== String(mid));
        } else if (activeSubTab === 'white') {
          currentLists.userWhitelist = currentLists.userWhitelist.filter((x) => String(x.mid) !== String(mid));
        }
        await saveLists();
        renderListItems();
        showToast(`已从名单移除 UID: ${mid}`, 'info');
      });
    });
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  /* ---------------- 检查 CSRF 状态 ---------------- */
  function checkCsrfStatus() {
    const dot = document.getElementById('csrf-dot');
    const text = document.getElementById('csrf-status-text');
    if (!dot || !text) return;

    // 尝试向活动标签页注入或检查 B 站登录态
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs && tabs[0];
      const isBili = activeTab && activeTab.url && activeTab.url.includes('bilibili.com');

      if (isBili) {
        dot.className = 'status-dot online';
        text.textContent = '已连接到当前 B 站标签页，CSRF 凭据守候中';
      } else {
        dot.className = 'status-dot warn';
        text.textContent = '当前未处于 B 站页面，请在 B 站视频或空间页面使用完整功能';
      }
    });
  }

  /* ---------------- 事件绑定 ---------------- */
  function initEventHandlers() {
    // 1. 主导航 Tabs 切换
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        const targetId = `pane-${btn.getAttribute('data-tab')}`;
        const targetPane = document.getElementById(targetId);
        if (targetPane) targetPane.classList.add('active');
      });
    });

    // 2. 子 Tabs (名单) 切换
    document.querySelectorAll('.sub-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sub-tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeSubTab = btn.getAttribute('data-subtab');
        const manualGroup = document.getElementById('manual-add-group');
        if (manualGroup) {
          manualGroup.style.display = (activeSubTab === 'hubbl') ? 'none' : 'flex';
        }
        renderListItems();
      });
    });

    // 3. 总开关
    const masterSwitch = document.getElementById('master-switch');
    if (masterSwitch) {
      masterSwitch.addEventListener('change', async (e) => {
        await saveSettings({ enabled: e.target.checked });
        showToast(e.target.checked ? '防御系统已启动' : '防御系统已停用', e.target.checked ? 'success' : 'warning');
      });
    }

    // 4. 过滤模式单选
    document.querySelectorAll('input[name="filterMode"]').forEach((radio) => {
      radio.addEventListener('change', async (e) => {
        if (e.target.checked) {
          await saveSettings({ filterMode: e.target.value });
          showToast(`已切换过滤模式为: ${e.target.value}`, 'info');
        }
      });
    });

    // 5. 阈值滑块
    const thresholdSlider = document.getElementById('threshold-slider');
    const thresholdVal = document.getElementById('threshold-val');
    if (thresholdSlider) {
      thresholdSlider.addEventListener('input', (e) => {
        if (thresholdVal) thresholdVal.textContent = `${e.target.value} 分`;
      });
      thresholdSlider.addEventListener('change', async (e) => {
        await saveSettings({ threshold: parseInt(e.target.value, 10) });
      });
    }

    // 6. 辅助特征
    const checkAvatar = document.getElementById('check-avatar');
    if (checkAvatar) {
      checkAvatar.addEventListener('change', async (e) => {
        await saveSettings({ avatarCheck: e.target.checked });
      });
    }
    const checkDeep = document.getElementById('check-deep');
    if (checkDeep) {
      checkDeep.addEventListener('change', async (e) => {
        await saveSettings({ deepCheck: e.target.checked });
      });
    }

    // 7. 自动举报相关
    const checkAutoReport = document.getElementById('check-autoreport');
    if (checkAutoReport) {
      checkAutoReport.addEventListener('change', async (e) => {
        await saveSettings({ autoReport: e.target.checked });
        showToast(e.target.checked ? '已开启检测后自动举报' : '已关闭自动举报', e.target.checked ? 'success' : 'info');
      });
    }
    const reportReason = document.getElementById('report-reason');
    if (reportReason) {
      reportReason.addEventListener('change', async (e) => {
        await saveSettings({ reportReason: parseInt(e.target.value, 10) });
      });
    }
    const reportDelayMin = document.getElementById('report-delay-min');
    const reportDelayMax = document.getElementById('report-delay-max');
    if (reportDelayMin && reportDelayMax) {
      const updateDelay = async () => {
        await saveSettings({
          reportDelayMin: parseInt(reportDelayMin.value, 10) || 4,
          reportDelayMax: parseInt(reportDelayMax.value, 10) || 8
        });
      };
      reportDelayMin.addEventListener('change', updateDelay);
      reportDelayMax.addEventListener('change', updateDelay);
    }
    const reportMaxDaily = document.getElementById('report-max-daily');
    if (reportMaxDaily) {
      reportMaxDaily.addEventListener('change', async (e) => {
        await saveSettings({ reportMaxDaily: parseInt(e.target.value, 10) || 50 });
      });
    }
    const btnResetReportCount = document.getElementById('btn-reset-report-count');
    if (btnResetReportCount) {
      btnResetReportCount.addEventListener('click', async () => {
        await saveSettings({ reportedTodayCount: 0 });
        const valEl = document.getElementById('reported-today-val');
        if (valEl) valEl.textContent = '0';
        showToast('今日自动举报计数已清零', 'success');
      });
    }

    // 8. 算力泥潭相关
    const checkAutoStall = document.getElementById('check-autostall');
    if (checkAutoStall) {
      checkAutoStall.addEventListener('change', async (e) => {
        await saveSettings({ autoStall: e.target.checked });
        showToast(e.target.checked ? '已开启算力泥潭持续对线' : '已关闭算力泥潭对线', e.target.checked ? 'success' : 'info');
      });
    }
    document.querySelectorAll('input[name="stallTaskType"]').forEach((box) => {
      box.addEventListener('change', async () => {
        const checked = Array.from(document.querySelectorAll('input[name="stallTaskType"]:checked')).map((b) => b.value);
        await saveSettings({ stallTaskTypes: checked });
      });
    });
    const stallTurnsSlider = document.getElementById('stall-max-turns');
    const stallTurnsVal = document.getElementById('stall-max-turns-val');
    if (stallTurnsSlider) {
      stallTurnsSlider.addEventListener('input', (e) => {
        if (stallTurnsVal) stallTurnsVal.textContent = `${e.target.value} 轮`;
      });
      stallTurnsSlider.addEventListener('change', async (e) => {
        await saveSettings({ stallMaxTurns: parseInt(e.target.value, 10) });
      });
    }
    const stallDelayMin = document.getElementById('stall-delay-min');
    const stallDelayMax = document.getElementById('stall-delay-max');
    if (stallDelayMin && stallDelayMax) {
      const updateStallDelay = async () => {
        await saveSettings({
          stallDelayMin: parseInt(stallDelayMin.value, 10) || 20,
          stallDelayMax: parseInt(stallDelayMax.value, 10) || 35
        });
      };
      stallDelayMin.addEventListener('change', updateStallDelay);
      stallDelayMax.addEventListener('change', updateStallDelay);
    }

    // 9. 中心仓相关
    const checkHubSync = document.getElementById('check-hub-sync');
    if (checkHubSync) {
      checkHubSync.addEventListener('change', async (e) => {
        await saveSettings({ cloudSync: e.target.checked });
        showToast(e.target.checked ? '已开启中心仓共享' : '已关闭中心仓共享', e.target.checked ? 'success' : 'info');
      });
    }
    const hubUrlInput = document.getElementById('hub-url');
    if (hubUrlInput) {
      hubUrlInput.addEventListener('change', async (e) => {
        await saveSettings({ hubUrl: e.target.value.trim() });
      });
    }
    const hubApiKeyInput = document.getElementById('hub-apikey');
    if (hubApiKeyInput) {
      hubApiKeyInput.addEventListener('change', async (e) => {
        await saveSettings({ hubApiKey: e.target.value.trim() });
      });
    }
    const btnHubVerify = document.getElementById('btn-hub-verify');
    if (btnHubVerify) {
      btnHubVerify.addEventListener('click', async () => {
        const url = (hubUrlInput ? hubUrlInput.value : '').trim();
        const key = (hubApiKeyInput ? hubApiKeyInput.value : '').trim();
        if (!url) return showToast('请输入中心仓服务器地址', 'warning');
        if (!key) return showToast('请输入待验证的 API Key', 'warning');

        btnHubVerify.textContent = '验证中...';
        btnHubVerify.disabled = true;

        chrome.runtime.sendMessage({
          type: 'hub-verify',
          serverUrl: url,
          apiKey: key
        }, async (res) => {
          btnHubVerify.textContent = '验证并激活';
          btnHubVerify.disabled = false;

          if (res && res.valid) {
            await saveSettings({ hubUrl: url, hubApiKey: key, cloudSync: true });
            updateHubStatusUI(true, true, `验证通过 (角色: ${res.data && res.data.role || 'user'})`);
            showToast('API Key 验证通过，中心仓功能已激活！', 'success');
            // 自动触发一次同步
            triggerSync(false);
          } else {
            updateHubStatusUI(true, false, res && res.message || '连接失败');
            showToast(`验证失败: ${res && res.message || '未知错误'}`, 'danger');
          }
        });
      });
    }

    // 手动同步按钮
    const btnSyncInc = document.getElementById('btn-sync-inc');
    if (btnSyncInc) {
      btnSyncInc.addEventListener('click', () => triggerSync(false));
    }
    const btnSyncAll = document.getElementById('btn-sync-all');
    if (btnSyncAll) {
      btnSyncAll.addEventListener('click', () => triggerSync(true));
    }

    const checkHubAuto = document.getElementById('check-hub-autosync');
    if (checkHubAuto) {
      checkHubAuto.addEventListener('change', async (e) => {
        await saveSettings({ hubAutoSync: e.target.checked });
      });
    }
    const checkHubRep = document.getElementById('check-hub-report');
    if (checkHubRep) {
      checkHubRep.addEventListener('change', async (e) => {
        await saveSettings({ hubReport: e.target.checked });
      });
    }

    // 10. 名单添加与搜索
    const btnAddList = document.getElementById('btn-add-list');
    const inputAddMid = document.getElementById('input-add-mid');
    const inputAddName = document.getElementById('input-add-name');
    if (btnAddList && inputAddMid) {
      btnAddList.addEventListener('click', async () => {
        const mid = (inputAddMid.value || '').trim();
        const uname = (inputAddName ? inputAddName.value : '').trim();
        if (!mid || !/^\d+$/.test(mid)) {
          return showToast('请输入有效的数字 UID', 'warning');
        }

        const newItem = { mid, uname: uname || `用户_${mid}`, reason: '手动录入', created_at: Date.now() };

        if (activeSubTab === 'black') {
          if (currentLists.userBlacklist.some((x) => String(x.mid) === mid)) {
            return showToast('该 UID 已存在于黑名单中', 'warning');
          }
          currentLists.userBlacklist.push(newItem);
        } else if (activeSubTab === 'white') {
          if (currentLists.userWhitelist.some((x) => String(x.mid) === mid)) {
            return showToast('该 UID 已存在于白名单中', 'warning');
          }
          currentLists.userWhitelist.push(newItem);
        }

        await saveLists();
        inputAddMid.value = '';
        if (inputAddName) inputAddName.value = '';
        renderListItems();
        showToast(`已成功录入 UID: ${mid}`, 'success');
      });
    }

    const searchInput = document.getElementById('list-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        renderListItems();
      });
    }

    // 11. 清理本地缓存
    const linkClear = document.getElementById('link-clear-cache');
    if (linkClear) {
      linkClear.addEventListener('click', async (e) => {
        e.preventDefault();
        if (confirm('确认清空本地已举报记录与已对线会话缓存？(不影响黑白名单)')) {
          chrome.storage.local.get(['dsh_lists'], async (res) => {
            const l = res.dsh_lists || {};
            l.reportedRpids = {};
            l.stalledThreads = {};
            await chrome.storage.local.set({ dsh_lists: l });
            showToast('本地会话缓存已清理', 'success');
          });
        }
      });
    }
  }

  function triggerSync(forceAll = false) {
    showToast(forceAll ? '正在执行全量黑名单同步...' : '正在执行增量同步...', 'info');
    chrome.runtime.sendMessage({ type: 'hub-sync', forceAll }, (res) => {
      if (res && res.success) {
        showToast(`中心仓同步完成！本次更新 ${res.count} 条，总计 ${res.total} 条`, 'success');
        loadData().then(renderAll);
      } else {
        showToast(`同步未成功: ${res && res.message || '未知异常'}`, 'warning');
      }
    });
  }

  // 初始化入口
  document.addEventListener('DOMContentLoaded', async () => {
    initEventHandlers();
    await loadData();
    renderAll();
    checkCsrfStatus();
  });
})();
