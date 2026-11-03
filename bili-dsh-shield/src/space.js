/* 空间主页诊断引擎：全面检测 UP 主资料、投稿节奏、AI 关键特征，生成科技感防御诊断面板 */
(function () {
  const DFY = (globalThis.DFY = globalThis.DFY || {});
  const S = (DFY.space = {});
  const esc = (s) => (DFY.esc ? DFY.esc(s) : String(s == null ? '' : s));

  S.midFromUrl = function (u) {
    try {
      const url = new URL(u || (typeof location !== 'undefined' ? location.href : ''));
      if (url.hostname !== 'space.bilibili.com') return '';
      const m = url.pathname.match(/\/(\d{2,})(?:\/|$)/);
      return m ? m[1] : '';
    } catch (e) {
      return '';
    }
  };

  async function getJSON(url) {
    try {
      const r = await fetch(url, { credentials: 'include' });
      return await r.json();
    } catch (e) {
      return null;
    }
  }

  function fmtNum(n) {
    n = +n || 0;
    return n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(n);
  }

  /**
   * 拉取 UP 主资料及投稿并做综合鉴定
   */
  S.inspect = async function (mid) {
    if (!mid) return null;

    const [card, arc] = await Promise.all([
      getJSON(`https://api.bilibili.com/x/web-interface/card?mid=${mid}&photo=false`),
      getJSON(`https://api.bilibili.com/x/series/recArchivesByKeywords?mid=${mid}&keywords=&ps=30&pn=1&orderby=pubdate`)
    ]);

    const c = card && card.code === 0 && card.data ? card.data.card : null;
    if (!c) return null;

    const prof = {
      mid: String(mid),
      uname: c.name || '',
      avatar: c.face || '',
      sign: c.sign || '',
      level: (c.level_info && c.level_info.current_level) || 0,
      verify: c.official_verify ? c.official_verify.type : -1,
      verifyDesc: (c.official_verify && c.official_verify.desc) || '',
      fans: (card.data && card.data.follower) || c.fans || 0,
      archives: (card.data && card.data.archive_count) || 0,
      videos: ((arc && arc.code === 0 && arc.data && arc.data.archives) || []).map((v) => ({
        title: v.title,
        t: v.pubdate || v.ctime
      }))
    };

    // 头像深浅蓝色相分析
    let blueRatio = null;
    if (DFY.avatarBlue && prof.avatar) {
      blueRatio = await DFY.avatarBlue(prof.avatar);
    }

    // 基础账号打分
    const base = DFY.scoreAccount(prof, prof.videos.map((v) => v.title), { blueRatio });
    let s = base.score;
    const reasons = base.reasons.slice();

    // 视频投稿节奏与流水线特征分析
    const now = Date.now() / 1000;
    const recent = prof.videos.filter((v) => now - v.t < 14 * 86400);
    if (recent.length) {
      const first = Math.min(...recent.map((v) => v.t));
      const days = Math.max(1, (now - first) / 86400);
      const perDay = recent.length / days;
      if (perDay >= 3) {
        s += 25;
        reasons.push({ w: 25, why: `极高频发布: 近期日均投稿 ${perDay.toFixed(1)} 条 (流水线特征)` });
      } else if (perDay >= 1 && recent.length >= 5) {
        s += 12;
        reasons.push({ w: 12, why: `高频日更: 近两周投稿 ${recent.length} 条` });
      }
    }

    if (prof.videos.length >= 3) {
      const aiTitles = prof.videos.filter((v) => /deep\s*seek|\bAI\b|AIGC|大模型|智能体|harness|dsh/i.test(v.title)).length;
      const ratio = aiTitles / prof.videos.length;
      if (ratio >= 0.4) {
        s += 15;
        reasons.push({ w: 15, why: `AI/DSH 高度密集: ${Math.round(ratio * 100)}% 的投稿标题涉及 AI/DSH 自动化` });
      }
      const series = prof.videos.filter((v) => /【?Day\s*\d+|第\s*\d+\s*天|\bD\d+\b/i.test(v.title)).length;
      if (series >= 3) {
        s += 10;
        reasons.push({ w: 10, why: '存在「Day N」流水线批量日更特征' });
      }
    }

    if (prof.level <= 2 && prof.fans >= 5000) {
      s += 8;
      reasons.push({ w: 8, why: `Lv${prof.level} 低等级账号却拥有 ${fmtNum(prof.fans)} 粉丝 (异常涨粉)` });
    }

    const score = Math.max(0, Math.min(100, Math.round(s)));
    let level = 'human';
    if (score >= ((DFY.settings && DFY.settings.threshold) || 50)) {
      level = 'fish';
    } else if (score >= 30) {
      level = 'suspect';
    }

    return {
      prof,
      score,
      level,
      reasons: reasons.filter((r) => r.w !== 0).sort((a, b) => b.w - a.w)
    };
  };

  const PANEL_CSS = `
#dsh-space-panel {
  margin: 16px 0 20px 0;
  padding: 16px 20px;
  background: #0f172a;
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 12px;
  color: #f1f5f9;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: relative;
  z-index: 100;
  box-sizing: border-box;
}

.dsh-sp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: 12px;
}

.dsh-sp-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 700;
  color: #f8fafc;
}

.dsh-sp-shield-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #38bdf8;
}

.dsh-sp-score-badge {
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dsh-sp-score-badge.fish {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.4);
}
.dsh-sp-score-badge.suspect {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.4);
}
.dsh-sp-score-badge.human {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.dsh-sp-body {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 20px;
  font-size: 13px;
}

.dsh-sp-col-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(255, 255, 255, 0.03);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.dsh-sp-info-row {
  display: flex;
  justify-content: space-between;
  color: #94a3b8;
}
.dsh-sp-info-row strong {
  color: #f1f5f9;
}

.dsh-sp-status-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.dsh-sp-pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
  color: #cbd5e1;
}
.dsh-sp-pill.warn {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}
.dsh-sp-pill.safe {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.dsh-sp-col-reasons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dsh-sp-reasons-title {
  font-weight: 600;
  color: #94a3b8;
  font-size: 12px;
}

.dsh-sp-reasons-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 160px;
  overflow-y: auto;
  padding-right: 4px;
}

.dsh-sp-reason-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.02);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: #cbd5e1;
}

.dsh-sp-rw {
  font-weight: 700;
  color: #f87171;
  min-width: 34px;
}
.dsh-sp-rw.neg {
  color: #34d399;
}

.dsh-sp-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 12px;
}

.dsh-sp-btn {
  padding: 7px 16px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dsh-sp-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}

.dsh-sp-btn.btn-danger {
  background: #dc2626;
  border-color: #dc2626;
  color: #ffffff;
}
.dsh-sp-btn.btn-danger:hover {
  background: #b91c1c;
}

.dsh-sp-btn.btn-cyan {
  background: #0284c7;
  border-color: #0284c7;
  color: #ffffff;
}
.dsh-sp-btn.btn-cyan:hover {
  background: #0369a1;
}

.dsh-sp-btn.btn-outline {
  background: transparent;
  border-color: #475569;
  color: #cbd5e1;
}
.dsh-sp-btn.btn-outline:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: #94a3b8;
}
`;

  function ensureStyle() {
    if (document.getElementById('dsh-space-style')) return;
    const st = document.createElement('style');
    st.id = 'dsh-space-style';
    st.textContent = PANEL_CSS;
    document.head.appendChild(st);
  }

  /**
   * 将现代化科技感检测面板注入空间主页
   */
  S.renderPanel = function (report) {
    if (!report || !report.prof) return;
    ensureStyle();

    const old = document.getElementById('dsh-space-panel');
    if (old) old.remove();

    const prof = report.prof;
    const mid = String(prof.mid);
    const isFish = report.level === 'fish';
    const isSuspect = report.level === 'suspect';

    const isBlacklisted = DFY.storage && DFY.storage.isUserBlacklisted(mid);
    const isWhitelisted = DFY.storage && DFY.storage.isWhitelisted(mid);
    const hubBot = DFY.storage && DFY.storage.getHubBot(mid);

    const levelText = isFish ? '确诊 DSH 机器人' : isSuspect ? '疑似自动化账号' : '正常人类用户';
    const badgeClass = isFish ? 'fish' : isSuspect ? 'suspect' : 'human';

    const reasonsHTML = report.reasons.map((r) => `
      <div class="dsh-sp-reason-item">
        <span class="dsh-sp-rw ${r.w < 0 ? 'neg' : ''}">${r.w > 0 ? '+' + r.w : r.w}</span>
        <span>${esc(r.why)}</span>
      </div>
    `).join('') || '<div class="dsh-sp-reason-item">未匹配到显著异常特征</div>';

    const panel = document.createElement('div');
    panel.id = 'dsh-space-panel';
    panel.innerHTML = `
      <div class="dsh-sp-head">
        <div class="dsh-sp-title">
          <span class="dsh-sp-shield-ic">${DFY.icon ? DFY.icon('shield', 18) : '🛡️'}</span>
          <span>Bili DSH Shield · 空间主页自动化特征诊断</span>
        </div>
        <div class="dsh-sp-score-badge ${badgeClass}">
          <span>${report.score}% 风险度</span>
          <span>·</span>
          <span>${levelText}</span>
        </div>
      </div>

      <div class="dsh-sp-body">
        <div class="dsh-sp-col-info">
          <div class="dsh-sp-info-row">
            <span>用户昵称</span>
            <strong>${esc(prof.uname)}</strong>
          </div>
          <div class="dsh-sp-info-row">
            <span>用户 UID</span>
            <strong>${esc(prof.mid)}</strong>
          </div>
          <div class="dsh-sp-info-row">
            <span>账号等级</span>
            <strong>Lv${prof.level}</strong>
          </div>
          <div class="dsh-sp-info-row">
            <span>粉丝 / 投稿</span>
            <strong>${fmtNum(prof.fans)} 粉 / ${prof.archives} 投稿</strong>
          </div>
          <div class="dsh-sp-status-pills">
            ${isBlacklisted ? '<span class="dsh-sp-pill warn">已在本地黑名单</span>' : ''}
            ${isWhitelisted ? '<span class="dsh-sp-pill safe">已在本地白名单</span>' : ''}
            ${hubBot ? '<span class="dsh-sp-pill warn">中心仓已收录</span>' : '<span class="dsh-sp-pill">中心仓未收录</span>'}
          </div>
        </div>

        <div class="dsh-sp-col-reasons">
          <div class="dsh-sp-reasons-title">命中特征与判定依据清单:</div>
          <div class="dsh-sp-reasons-list">
            ${reasonsHTML}
          </div>
        </div>
      </div>

      <div class="dsh-sp-foot">
        <button class="dsh-sp-btn btn-outline" id="dsh-btn-white">
          ${isWhitelisted ? '移出白名单' : '加入白名单'}
        </button>
        <button class="dsh-sp-btn ${isBlacklisted ? 'btn-outline' : 'btn-danger'}" id="dsh-btn-black">
          ${isBlacklisted ? '移出黑名单' : '加入本地黑名单'}
        </button>
        <button class="dsh-sp-btn btn-cyan" id="dsh-btn-hub">
          上报中心仓
        </button>
        <button class="dsh-sp-btn" id="dsh-btn-report-bili">
          向 B 站官方举报
        </button>
      </div>
    `;

    // 确定注入位置
    const container = document.querySelector('#app .h-inner')
      || document.querySelector('.header-upinfo')
      || document.querySelector('.upinfo')
      || document.querySelector('#space-app')
      || document.querySelector('#app')
      || document.body;

    if (container === document.body) {
      document.body.insertBefore(panel, document.body.firstChild);
    } else {
      container.parentElement ? container.parentElement.insertBefore(panel, container.nextSibling) : container.appendChild(panel);
    }

    // 绑定交互按钮
    const btnWhite = panel.querySelector('#dsh-btn-white');
    if (btnWhite) {
      btnWhite.onclick = async () => {
        if (isWhitelisted) {
          await DFY.storage.removeWhitelist(mid);
          DFY.ui.showToast(`已将 UID: ${mid} 移出白名单`, 'info');
        } else {
          await DFY.storage.addWhitelist(mid, prof.uname, '从空间主页加白');
          DFY.ui.showToast(`已将 UID: ${mid} 加入本地白名单`, 'success');
        }
        const updated = await S.inspect(mid);
        S.renderPanel(updated);
      };
    }

    const btnBlack = panel.querySelector('#dsh-btn-black');
    if (btnBlack) {
      btnBlack.onclick = async () => {
        if (isBlacklisted) {
          await DFY.storage.removeBlacklist(mid);
          DFY.ui.showToast(`已将 UID: ${mid} 移出黑名单`, 'info');
        } else {
          await DFY.storage.addBlacklist(mid, prof.uname, '从空间主页拉黑');
          DFY.ui.showToast(`已将 UID: ${mid} 加入本地黑名单`, 'warning');
        }
        const updated = await S.inspect(mid);
        S.renderPanel(updated);
      };
    }

    const btnHub = panel.querySelector('#dsh-btn-hub');
    if (btnHub) {
      btnHub.onclick = async () => {
        if (!DFY.settings || !DFY.settings.hubApiKey) {
          DFY.ui.showToast('请先在插件弹出面板中配置并激活中心仓 API Key', 'warning');
          return;
        }
        DFY.ui.showToast(`正在向中心仓上报 UID: ${mid}...`, 'info');
        const ok = await DFY.hub.reportBot({
          mid,
          uname: prof.uname,
          reason: report.reasons[0] ? report.reasons[0].why : '空间主页确诊',
          sampleText: prof.sign || (prof.videos[0] ? prof.videos[0].title : ''),
          score: report.score
        });
        if (ok) {
          DFY.ui.showToast(`已成功将 UID: ${mid} 上报至自建中心仓`, 'success');
          const updated = await S.inspect(mid);
          S.renderPanel(updated);
        } else {
          DFY.ui.showToast('上报中心仓失败，请检查网络或 Key 权限', 'danger');
        }
      };
    }

    const btnReportBili = panel.querySelector('#dsh-btn-report-bili');
    if (btnReportBili) {
      btnReportBili.onclick = () => {
        window.open(`https://space.bilibili.com/${mid}/dynamic`, '_blank');
        DFY.ui.showToast(`请在用户空间或动态页面使用官方举报入口`, 'info');
      };
    }
  };

  /**
   * 初始化空间主页检测
   */
  S.init = async function () {
    const mid = S.midFromUrl();
    if (!mid) return;

    // 稍作等待以确保 B 站页面骨架加载
    setTimeout(async () => {
      const report = await S.inspect(mid);
      if (report) {
        S.renderPanel(report);
      }
    }, 800);
  };
})();
