/* 存储层：配置、本地黑白名单、中心仓云端缓存、举报与对线日志记录 */
(function () {
  const DFY = (globalThis.DFY = globalThis.DFY || {});

  const DEFAULT_SETTINGS = {
    enabled: true,
    filterMode: 'collapse', // 'collapse' (折叠条) | 'remove' (完全隐藏) | 'badge' (仅警示徽章)
    threshold: 50,          // 判定阈值：50 分及以上视为 DSH Bot
    avatarCheck: true,      // 头像蓝色色相识别
    deepseekCheck: false,   // 可选 DeepSeek API 深度精判
    deepseekKey: '',

    // 自动举报配置
    autoReport: false,      // 检测为 DSH Bot 后自动向 B 站官方举报
    reportReason: 2,        // 举报原因：2=传播垃圾广告资源/脚本刷屏, 4=引战煽动/恶意刷屏, 0=其他
    reportDelayMin: 4,      // 最小请求间隔 (秒)
    reportDelayMax: 8,      // 最大请求间隔 (秒，带随机抖动防风控)
    reportMaxDaily: 50,     // 单日举报上限
    reportedTodayCount: 0,
    lastReportDay: '',

    // 算力泥潭（持续自动回复对线消耗 Token）
    autoStall: false,       // 开启后自动下发耗时垃圾任务并持续追问
    stallTaskTypes: ['math', 'logic', 'compare', 'automata'], // 任务类型库
    stallMaxTurns: 3,       // 单个 Bot 最大对线轮数 (默认3轮)
    stallDelayMin: 20,      // 对线回复最小间隔 (秒)
    stallDelayMax: 35,      // 对线回复最大间隔 (秒，防风控)
    stallMaxActive: 2,      // 同时并发对线目标数

    // 中心仓云端共享
    cloudSync: true,        // 启用中心仓共享名单
    hubUrl: 'http://localhost:3000', // 自建中心仓服务器地址
    hubApiKey: '',          // 管理员派发的 API Key
    hubKeyStatus: { valid: false, note: '', role: '', lastChecked: 0 },
    hubAutoSync: true,      // 定时增量同步
    hubSyncInterval: 30,    // 同步间隔 (分钟)
    lastHubSyncTime: 0      // 上次增量同步时间戳
  };

  const DEFAULT_LISTS = {
    userBlacklist: [], // [{ mid, uname, reason, addedAt }]
    userWhitelist: [], // [{ mid, uname, note, addedAt }]
    hubBlacklist: [],  // [{ mid, uname, reason, score, confirmed, updated_at }]
    reportedRpids: {}, // { [rpid]: { mid, uname, time, status, code } }
    stalledThreads: {},// { [threadKey]: { mid, uname, turn, lastOurRpid, status, taskType, lastReplyTime } }
    stats: {
      fishFound: 0,
      autoReported: 0,
      stallTurns: 0,
      hubSyncedCount: 0
    }
  };

  DFY.settings = { ...DEFAULT_SETTINGS };
  DFY.lists = { ...DEFAULT_LISTS };

  function getTodayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  DFY.storage = {
    async init() {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        return { settings: DFY.settings, lists: DFY.lists };
      }
      return new Promise((resolve) => {
        chrome.storage.local.get(['dsh_settings', 'dsh_lists'], (res) => {
          if (res.dsh_settings) {
            DFY.settings = { ...DEFAULT_SETTINGS, ...res.dsh_settings };
          }
          if (res.dsh_lists) {
            DFY.lists = {
              ...DEFAULT_LISTS,
              ...res.dsh_lists,
              stats: { ...DEFAULT_LISTS.stats, ...(res.dsh_lists.stats || {}) }
            };
          }

          // 每日举报计数重置
          const today = getTodayKey();
          if (DFY.settings.lastReportDay !== today) {
            DFY.settings.lastReportDay = today;
            DFY.settings.reportedTodayCount = 0;
            DFY.storage.saveSettings();
          }

          resolve({ settings: DFY.settings, lists: DFY.lists });
        });
      });
    },

    async saveSettings() {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ dsh_settings: DFY.settings });
      }
    },

    async saveLists() {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ dsh_lists: DFY.lists });
      }
    },

    async updateSettings(patch) {
      DFY.settings = { ...DFY.settings, ...patch };
      await this.saveSettings();
      return DFY.settings;
    },

    // 本地黑名单操作
    async addBlacklist(mid, uname = 'DSH_Bot', reason = '用户手动加入黑名单') {
      const midStr = String(mid);
      DFY.lists.userBlacklist = DFY.lists.userBlacklist.filter((b) => String(b.mid) !== midStr);
      DFY.lists.userBlacklist.unshift({
        mid: midStr,
        uname,
        reason,
        addedAt: Date.now()
      });
      // 互斥移除白名单
      DFY.lists.userWhitelist = DFY.lists.userWhitelist.filter((w) => String(w.mid) !== midStr);
      await this.saveLists();
    },

    async removeBlacklist(mid) {
      const midStr = String(mid);
      DFY.lists.userBlacklist = DFY.lists.userBlacklist.filter((b) => String(b.mid) !== midStr);
      await this.saveLists();
    },

    // 本地白名单操作
    async addWhitelist(mid, uname = 'Human', note = '用户手动加入白名单') {
      const midStr = String(mid);
      DFY.lists.userWhitelist = DFY.lists.userWhitelist.filter((w) => String(w.mid) !== midStr);
      DFY.lists.userWhitelist.unshift({
        mid: midStr,
        uname,
        note,
        addedAt: Date.now()
      });
      // 互斥移除黑名单
      DFY.lists.userBlacklist = DFY.lists.userBlacklist.filter((b) => String(b.mid) !== midStr);
      await this.saveLists();
    },

    async removeWhitelist(mid) {
      const midStr = String(mid);
      DFY.lists.userWhitelist = DFY.lists.userWhitelist.filter((w) => String(w.mid) !== midStr);
      await this.saveLists();
    },

    // 查询账号状态
    isWhitelisted(mid) {
      const midStr = String(mid);
      return DFY.lists.userWhitelist.some((w) => String(w.mid) === midStr);
    },

    isUserBlacklisted(mid) {
      const midStr = String(mid);
      return DFY.lists.userBlacklist.some((b) => String(b.mid) === midStr);
    },

    getHubBot(mid) {
      const midStr = String(mid);
      return DFY.lists.hubBlacklist.find((b) => String(b.mid) === midStr) || null;
    },

    // 统计自增
    async bumpStat(key, amount = 1) {
      DFY.lists.stats = DFY.lists.stats || { ...DEFAULT_LISTS.stats };
      DFY.lists.stats[key] = (DFY.lists.stats[key] || 0) + amount;
      await this.saveLists();
    },

    // 记录举报成功
    async recordReportSuccess(rpid, mid, uname = '', code = 0) {
      const rpidStr = String(rpid);
      DFY.lists.reportedRpids = DFY.lists.reportedRpids || {};
      DFY.lists.reportedRpids[rpidStr] = {
        mid: String(mid),
        uname,
        time: Date.now(),
        code,
        status: code === 0 ? 'success' : 'failed'
      };
      if (code === 0) {
        DFY.settings.reportedTodayCount = (DFY.settings.reportedTodayCount || 0) + 1;
        await this.bumpStat('autoReported', 1);
        await this.saveSettings();
      }
      await this.saveLists();
    },

    hasReportedRpid(rpid) {
      const rpidStr = String(rpid);
      return !!(DFY.lists.reportedRpids && DFY.lists.reportedRpids[rpidStr]);
    },

    // 对线会话管理
    getStallSession(threadKey) {
      DFY.lists.stalledThreads = DFY.lists.stalledThreads || {};
      return DFY.lists.stalledThreads[threadKey] || null;
    },

    async updateStallSession(threadKey, patch) {
      DFY.lists.stalledThreads = DFY.lists.stalledThreads || {};
      DFY.lists.stalledThreads[threadKey] = {
        ...(DFY.lists.stalledThreads[threadKey] || {}),
        ...patch,
        updatedAt: Date.now()
      };
      await this.saveLists();
      return DFY.lists.stalledThreads[threadKey];
    }
  };
})();