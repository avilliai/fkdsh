/* 中心仓客户端：与 DSH Central Hub 通信，验证 API Key，同步确诊与可疑 Bot */
(function () {
  const DFY = (globalThis.DFY = globalThis.DFY || {});
  const hub = (DFY.hub = {});

  /** 规范化 URL */
  function normalizeUrl(url) {
    if (!url) return '';
    let u = String(url).trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(u)) {
      u = 'http://' + u;
    }
    return u;
  }

  /** 验证 API Key 有效性 */
  hub.verifyKey = async function (serverUrl, apiKey) {
    const base = normalizeUrl(serverUrl || (DFY.settings && DFY.settings.hubUrl));
    const key = String(apiKey || (DFY.settings && DFY.settings.hubApiKey) || '').trim();

    if (!base) return { valid: false, message: '请配置中心仓服务器地址' };
    if (!key) return { valid: false, message: '请配置中心仓 API Key' };

    try {
      const resp = await fetch(`${base}/api/v1/auth/verify`, {
        method: 'GET',
        headers: {
          'X-API-Key': key,
          'Accept': 'application/json'
        }
      });

      const data = await resp.json();
      if (resp.ok && data.code === 0 && data.valid) {
        return {
          valid: true,
          message: 'API Key 验证通过，已成功激活中心仓功能',
          data: data.data
        };
      } else {
        return {
          valid: false,
          message: data.message || 'API Key 无效或已被撤销'
        };
      }
    } catch (e) {
      return {
        valid: false,
        message: '连接中心仓失败: ' + (e.message || '网络连接超时')
      };
    }
  };

  /** 同步云端黑名单数据 */
  hub.syncBlacklist = async function (forceAll = false) {
    const s = DFY.settings;
    if (!s || !s.hubUrl || !s.hubApiKey) {
      return { success: false, message: '未配置中心仓地址或 API Key' };
    }

    const base = normalizeUrl(s.hubUrl);
    const key = String(s.hubApiKey).trim();
    const since = forceAll ? 0 : (s.lastHubSyncTime || 0);

    try {
      const resp = await fetch(`${base}/api/v1/blacklist?since=${since}`, {
        method: 'GET',
        headers: {
          'X-API-Key': key,
          'Accept': 'application/json'
        }
      });

      if (!resp.ok) {
        return { success: false, message: `中心仓返回 HTTP ${resp.status}` };
      }

      const res = await resp.json();
      if (res.code !== 0) {
        return { success: false, message: res.message || '同步失败' };
      }

      const list = (res.data && res.data.list) || [];
      const now = (res.data && res.data.timestamp) || Date.now();

      // 更新本地 hubBlacklist 列表
      let currentHubList = Array.isArray(DFY.lists.hubBlacklist) ? DFY.lists.hubBlacklist.slice() : [];
      const hubMap = new Map();
      for (const item of currentHubList) {
        hubMap.set(String(item.mid), item);
      }

      let addedCount = 0;
      for (const item of list) {
        const midStr = String(item.mid);
        if (!hubMap.has(midStr)) addedCount++;
        hubMap.set(midStr, {
          mid: midStr,
          uname: item.uname || 'DSH_Bot',
          reason: item.reason || '中心仓确诊',
          score: item.score || 95,
          confirmed: item.confirmed !== 0 && item.confirmed !== false,
          updated_at: item.updated_at || now
        });
      }

      DFY.lists.hubBlacklist = Array.from(hubMap.values());
      await DFY.storage.saveLists();

      // 记录同步时间与统计
      s.lastHubSyncTime = now;
      await DFY.storage.updateSettings({ lastHubSyncTime: now });
      await DFY.storage.bumpStat('hubSyncedCount', addedCount);

      console.log(`[Hub] 中心仓黑名单同步完成，本次更新/新增 ${list.length} 条，当前总计 ${DFY.lists.hubBlacklist.length} 条`);
      return { success: true, count: list.length, total: DFY.lists.hubBlacklist.length };
    } catch (e) {
      console.error('[Hub] 中心仓同步失败:', e);
      return { success: false, message: e.message || '网络连接异常' };
    }
  };

  /** 上报本地检测到的 DSH Bot 至中心仓进行众包审计 */
  hub.reportBot = async function (botInfo) {
    const s = DFY.settings;
    if (!s || !s.cloudSync || !s.hubUrl || !s.hubApiKey) return false;
    if (!botInfo || !botInfo.mid) return false;

    const base = normalizeUrl(s.hubUrl);
    const key = String(s.hubApiKey).trim();

    try {
      const resp = await fetch(`${base}/api/v1/blacklist/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': key
        },
        body: JSON.stringify({
          mid: String(botInfo.mid),
          uname: String(botInfo.uname || ''),
          reason: String(botInfo.reason || 'DSH机器人规则命中'),
          sample_text: String(botInfo.sampleText || ''),
          score: botInfo.score || 95
        })
      });

      const data = await resp.json();
      if (resp.ok && data.code === 0) {
        console.log(`[Hub] 上报可疑 Bot (UID: ${botInfo.mid}) 至中心仓成功`);
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[Hub] 上报中心仓失败:', e.message);
      return false;
    }
  };
})();
