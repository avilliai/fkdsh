/* 自动举报引擎：对接 B 站官方举报 API、提取 bili_jct、排队限速与风控熔断保护 */
(function () {
  const DFY = (globalThis.DFY = globalThis.DFY || {});
  const reporter = (DFY.reporter = {});

  let queue = [];
  let isProcessing = false;
  let lastReportTime = 0;
  let pausedForRisk = false;

  /** 获取当前登录用户的 Bilibili CSRF 令牌 (bili_jct) */
  reporter.getCsrf = function () {
    try {
      const match = document.cookie.match(/(?:^|;\s*)bili_jct=([^;]+)/);
      return match ? decodeURIComponent(match[1]) : '';
    } catch (e) {
      return '';
    }
  };

  /** 判断是否已登录 */
  reporter.isLoggedIn = function () {
    return !!reporter.getCsrf();
  };

  /**
   * 向 B 站接口发送举报请求
   * 接口: POST https://api.bilibili.com/x/v2/reply/report
   */
  async function sendReportRequest(item, reasonCode, customContent) {
    const csrf = reporter.getCsrf();
    if (!csrf) {
      return { success: false, code: -101, message: '未检测到 B 站登录凭据 (bili_jct)，请先登录 B 站' };
    }

    const rpid = String(item.rpid);
    const type = String(item.type || '1'); // 1=视频, 12=专栏, 11/17=动态
    const reason = String(reasonCode != null ? reasonCode : ((DFY.settings && DFY.settings.reportReason) || 2));
    const content = customContent || '传播垃圾广告资源：批量自动化脚本机器人刷屏，破坏评论区社区秩序与正常讨论环境';

    const params = new URLSearchParams();
    params.append('rpid', rpid);
    params.append('type', type);
    params.append('reason', reason);
    params.append('content', content);
    params.append('csrf', csrf);

    try {
      const resp = await fetch('https://api.bilibili.com/x/v2/reply/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: params.toString(),
        credentials: 'include'
      });

      const data = await resp.json();

      // B站返回结果处理
      if (data.code === 0) {
        return { success: true, code: 0, message: '举报成功已受理' };
      }

      // 常见业务与风控返回码
      if (data.code === 12015) {
        pausedForRisk = true;
        return {
          success: false,
          code: 12015,
          message: '触发 B 站操作验证码/风控限制，系统已自动暂停自动举报以保护账号'
        };
      }
      if (data.code === 12007) {
        return { success: true, code: 12007, message: '该评论此前已完成过举报' };
      }
      if (data.code === -101) {
        pausedForRisk = true;
        return { success: false, code: -101, message: 'B 站账号登录状态失效，请重新登录' };
      }

      return {
        success: false,
        code: data.code,
        message: data.message || `举报提交返回状态码: ${data.code}`
      };
    } catch (e) {
      return { success: false, code: -999, message: `网络请求异常: ${e.message}` };
    }
  }

  /**
   * 单条手动立即举报
   */
  reporter.reportItem = async function (item, reasonCode, customContent) {
    if (!item || !item.rpid) {
      return { success: false, message: '无效的评论对象' };
    }

    const rpid = String(item.rpid);
    if (DFY.storage && DFY.storage.hasReportedRpid(rpid)) {
      if (DFY.ui && DFY.ui.showToast) {
        DFY.ui.showToast(`评论 #${rpid} 此前已提交过举报，无需重复操作`, 'info');
      }
      return { success: true, code: 0, message: '已处于已举报记录中' };
    }

    if (DFY.ui && DFY.ui.showToast) {
      DFY.ui.showToast(`正在向 B 站提交举报 UID: ${item.mid || ''}...`, 'info');
    }
    const result = await sendReportRequest(item, reasonCode, customContent);

    if (result.success) {
      if (DFY.storage) {
        await DFY.storage.recordReportSuccess(rpid, item.mid, item.uname, result.code);
      }
      if (DFY.ui && DFY.ui.showToast) {
        DFY.ui.showToast(`举报成功: ${item.uname || item.mid} (${result.message})`, 'success');
      }
    } else {
      if (DFY.ui && DFY.ui.showToast) {
        DFY.ui.showToast(`举报未成功: ${result.message}`, result.code === 12015 ? 'danger' : 'warning');
      }
    }

    return result;
  };

  /** 别名兼容 reportManual */
  reporter.reportManual = reporter.reportItem;

  /**
   * 将可疑 Bot 推入自动排队队列
   */
  reporter.queueReport = function (item) {
    if (!DFY.settings || !DFY.settings.autoReport) return;
    if (pausedForRisk) return;
    if (!item || !item.rpid) return;

    const rpid = String(item.rpid);

    // 检查是否已经举报过
    if (DFY.storage && DFY.storage.hasReportedRpid(rpid)) return;

    // 检查每日限额
    const dailyLimit = (DFY.settings && DFY.settings.reportMaxDaily) || 50;
    const todayCount = (DFY.settings && DFY.settings.reportedTodayCount) || 0;
    if (todayCount >= dailyLimit) {
      if (todayCount === dailyLimit && DFY.ui && DFY.ui.showToast) {
        DFY.ui.showToast(`今日自动举报已达上限 (${dailyLimit}条)，停止自动提交`, 'warning');
      }
      return;
    }

    // 防重复入队
    if (queue.some((q) => String(q.rpid) === rpid)) return;

    queue.push(item);
    processQueue();
  };

  /** 别名兼容 queueAutoReport */
  reporter.queueAutoReport = reporter.queueReport;

  /**
   * 排队处理循环（带随机抖动延时防封号）
   */
  async function processQueue() {
    if (isProcessing) return;
    if (pausedForRisk) return;
    if (queue.length === 0) return;

    isProcessing = true;

    try {
      while (queue.length > 0 && !pausedForRisk) {
        // 限额检查
        const dailyLimit = (DFY.settings && DFY.settings.reportMaxDaily) || 50;
        if (((DFY.settings && DFY.settings.reportedTodayCount) || 0) >= dailyLimit) {
          queue = [];
          break;
        }

        const item = queue.shift();
        const rpid = String(item.rpid);

        if (DFY.storage && DFY.storage.hasReportedRpid(rpid)) continue;

        // 计算带抖动的延时 (例如 4~8 秒)
        const minDelay = ((DFY.settings && DFY.settings.reportDelayMin) || 4) * 1000;
        const maxDelay = ((DFY.settings && DFY.settings.reportDelayMax) || 8) * 1000;
        const waitTime = minDelay + Math.floor(Math.random() * (maxDelay - minDelay));

        const now = Date.now();
        const elapsed = now - lastReportTime;
        if (elapsed < waitTime) {
          await new Promise((resolve) => setTimeout(resolve, waitTime - elapsed));
        }

        const res = await sendReportRequest(item);
        lastReportTime = Date.now();

        if (res.success) {
          if (DFY.storage) {
            await DFY.storage.recordReportSuccess(rpid, item.mid, item.uname, res.code);
          }
          if (DFY.ui && DFY.ui.showToast) {
            DFY.ui.showToast(`[自动举报] 已上报 DSH 机器人: ${item.uname || item.mid}`, 'info');
          }
        } else {
          if (res.code === 12015) {
            pausedForRisk = true;
            if (DFY.ui && DFY.ui.showToast) {
              DFY.ui.showToast(`⚠️ ${res.message}`, 'danger');
            }
            break;
          }
        }
      }
    } finally {
      isProcessing = false;
    }
  }

  reporter.resumeQueue = function () {
    pausedForRisk = false;
    processQueue();
  };

  reporter.getStatus = function () {
    return {
      queueLength: queue.length,
      isProcessing,
      pausedForRisk,
      todayCount: (DFY.settings && DFY.settings.reportedTodayCount) || 0,
      dailyLimit: (DFY.settings && DFY.settings.reportMaxDaily) || 50
    };
  };
})();
