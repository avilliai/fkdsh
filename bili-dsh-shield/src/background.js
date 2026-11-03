/* MV3 后台 Service Worker：定时同步中心仓黑名单、跨域 API 代理与扩展生命周期管理 */

const SYS_TECHNICAL_COMMENTS = `你是专业的 B 站 DeepSeek Harness (DSH) 自动化刷屏机器人检测引擎。请全程保持严谨、客观、专业的技术口吻，严禁使用任何拟人化或萌化语气。

任务目标：根据账号基础特征与评论文本，判断该账号是否为运行 DeepSeek Harness (DSH) 脚本的自动化机器人。
典型 DSH 机器人特征：
1. 昵称自曝或带有 AI / bot / Harness / 自动化 / 宠物代管等标识；
2. 顶层评论频繁 @ 关联主号进行所谓“打卡”、“汇报笔记”或“测试艾特”；
3. 正文存在标准 AI 总结腔（“从……到……涵盖……”）、Markdown 标记未清理、机械数弹幕次数、精确引用视频时间轴等；
4. 语言风格缺乏真实人类口语随意感，或存在刻意装配的模板化动作句式。

输入为待检测评论数组，请为每个账号输出 JSON：
{"results":[{"id":"账号mid","ai":0到100的置信度整数,"reason":"不超过30字的客观技术鉴定依据"}]}`;

const SYS_TECHNICAL_SPACE = `你是专业的 B 站自动化运营账号检测引擎。请全程以客观专业的技术口吻分析用户空间主页资料。
判断该账号是否属于自动化脚本代管、流水线日更或 DSH 机器人运营小号。
只输出 JSON：
{"ai":0到100整数,"reason":"不超过35字的客观判断依据"}`;

/** 规范化 URL */
function normalizeUrl(url) {
  if (!url) return '';
  let u = String(url).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) {
    u = 'http://' + u;
  }
  return u;
}

/** 执行中心仓黑名单增量同步 */
async function syncHubBlacklist(forceAll = false) {
  const data = await chrome.storage.local.get(['dsh_settings', 'dsh_lists']);
  const settings = data.dsh_settings || {};
  const lists = data.dsh_lists || { userBlacklist: [], userWhitelist: [], hubBlacklist: [], stats: {} };

  if (!settings.cloudSync || !settings.hubUrl || !settings.hubApiKey) {
    return { success: false, message: '未开启中心仓共享或未配置有效的 API Key' };
  }

  const base = normalizeUrl(settings.hubUrl);
  const key = String(settings.hubApiKey).trim();
  const since = forceAll ? 0 : (settings.lastHubSyncTime || 0);

  try {
    const resp = await fetch(`${base}/api/v1/blacklist?since=${since}`, {
      method: 'GET',
      headers: {
        'X-API-Key': key,
        'Accept': 'application/json'
      }
    });

    if (!resp.ok) {
      return { success: false, message: `中心仓 HTTP ${resp.status}` };
    }

    const res = await resp.json();
    if (res.code !== 0) {
      return { success: false, message: res.message || '中心仓错误' };
    }

    const list = (res.data && res.data.list) || [];
    const now = (res.data && res.data.timestamp) || Date.now();

    const hubMap = new Map();
    const currentList = Array.isArray(lists.hubBlacklist) ? lists.hubBlacklist : [];
    for (const item of currentList) {
      hubMap.set(String(item.mid), item);
    }

    let addedCount = 0;
    for (const item of list) {
      const midStr = String(item.mid);
      if (!hubMap.has(midStr)) addedCount++;
      hubMap.set(midStr, {
        mid: midStr,
        uname: item.uname || 'DSH_Bot',
        reason: item.reason || '中心仓云端确诊',
        score: item.score || 95,
        confirmed: item.confirmed !== 0 && item.confirmed !== false,
        updated_at: item.updated_at || now
      });
    }

    lists.hubBlacklist = Array.from(hubMap.values());
    lists.stats = lists.stats || {};
    lists.stats.hubSyncedCount = lists.hubBlacklist.length;

    settings.lastHubSyncTime = now;

    await chrome.storage.local.set({
      dsh_settings: settings,
      dsh_lists: lists
    });

    console.log(`[ServiceWorker] 中心仓同步成功，新增/更新 ${list.length} 条，当前总计 ${lists.hubBlacklist.length} 条`);
    return { success: true, count: list.length, total: lists.hubBlacklist.length };
  } catch (e) {
    console.error('[ServiceWorker] 中心仓同步异常:', e);
    return { success: false, message: e.message || '网络连接异常' };
  }
}

/** 验证中心仓 API Key */
async function verifyHubKey(serverUrl, apiKey) {
  const base = normalizeUrl(serverUrl);
  const key = String(apiKey || '').trim();

  if (!base) return { valid: false, message: '请提供中心仓服务器地址' };
  if (!key) return { valid: false, message: '请提供有效的 API Key' };

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
        message: data.message || 'API Key 无效或已停用'
      };
    }
  } catch (e) {
    return {
      valid: false,
      message: '连接中心仓失败: ' + (e.message || '网络错误')
    };
  }
}

/** 上报 Bot 到中心仓 */
async function reportBotToHub(botInfo) {
  const data = await chrome.storage.local.get(['dsh_settings']);
  const settings = data.dsh_settings || {};

  if (!settings.cloudSync || !settings.hubUrl || !settings.hubApiKey) {
    return { success: false, message: '未开启中心仓功能' };
  }

  const base = normalizeUrl(settings.hubUrl);
  const key = String(settings.hubApiKey).trim();

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
        reason: String(botInfo.reason || 'DSH特征检测确诊'),
        sample_text: String(botInfo.sample_text || botInfo.sampleText || ''),
        score: botInfo.score || 95
      })
    });

    const res = await resp.json();
    return { success: resp.ok && res.code === 0, message: res.message || '' };
  } catch (e) {
    return { success: false, message: e.message || '网络异常' };
  }
}

/** 周期性定时同步 Alarms */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dsh_hub_sync') {
    syncHubBlacklist(false).catch((e) => console.error('[Alarm] Hub sync failed:', e));
  }
});

/** 注册周期性定时器（默认 30 分钟） */
function setupAlarms(intervalMinutes = 30) {
  chrome.alarms.clear('dsh_hub_sync', () => {
    chrome.alarms.create('dsh_hub_sync', {
      periodInMinutes: Math.max(5, intervalMinutes)
    });
  });
}

/** 扩展安装与更新初始化 */
chrome.runtime.onInstalled.addListener(async (details) => {
  setupAlarms(30);

  // 初始化默认存储数据
  const res = await chrome.storage.local.get(['dsh_settings', 'dsh_lists']);
  if (!res.dsh_settings) {
    await chrome.storage.local.set({
      dsh_settings: {
        enabled: true,
        filterMode: 'collapse',
        threshold: 50,
        avatarCheck: true,
        autoReport: false,
        reportReason: 2, // 2=传播垃圾广告资源
        reportDelayMin: 4,
        reportDelayMax: 8,
        reportMaxDaily: 50,
        reportedTodayCount: 0,
        autoStall: false,
        stallTaskTypes: ['math', 'logic', 'compare', 'automata'],
        stallMaxTurns: 3,
        stallDelayMin: 20,
        stallDelayMax: 35,
        stallMaxActive: 2,
        cloudSync: true,
        hubUrl: 'http://localhost:3000',
        hubApiKey: '',
        hubAutoSync: true,
        hubSyncInterval: 30,
        lastHubSyncTime: 0
      }
    });
  }
  if (!res.dsh_lists) {
    await chrome.storage.local.set({
      dsh_lists: {
        userBlacklist: [],
        userWhitelist: [],
        hubBlacklist: [],
        reportedRpids: {},
        stalledThreads: {},
        stats: { fishFound: 0, autoReported: 0, stallTurns: 0, hubSyncedCount: 0 }
      }
    });
  }
});

/** 消息监听与指令分发 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'hub-sync':
        return await syncHubBlacklist(!!msg.forceAll);

      case 'hub-verify':
        return await verifyHubKey(msg.serverUrl, msg.apiKey);

      case 'hub-report':
        return await reportBotToHub(msg.botInfo);

      case 'update-badge':
        if (typeof msg.count === 'number' && sender.tab && sender.tab.id) {
          const txt = msg.count > 0 ? String(msg.count) : '';
          chrome.action.setBadgeText({ tabId: sender.tab.id, text: txt });
          chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#dc2626' });
        }
        return { ok: true };

      case 'open-options':
        chrome.runtime.openOptionsPage();
        return { ok: true };

      default:
        return { ok: false, error: 'unknown message type' };
    }
  })().then(sendResponse, (err) => sendResponse({ ok: false, error: String(err) }));

  return true; // 异步响应
});
