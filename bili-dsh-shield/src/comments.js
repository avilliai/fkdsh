/* 评论区过滤与交互管理引擎：识别/折叠/举报/算力泥潭/名单操作 */
(function () {
  const DFY = (globalThis.DFY = globalThis.DFY || {});
  const C = (DFY.comments = {});
  const esc = (s) => (DFY.esc ? DFY.esc(s) : String(s == null ? '' : s));

  const items = new Map(); // rpid -> item
  const accounts = new Map(); // mid -> { acc, rpids: Set, verdict, blueRatio, pending }
  const peeked = new Set(); // 用户主动展开查看的 rpid
  const spared = new Set(); // 本次会话临时放行的 mid
  let pageMeta = { oid: '', commentType: 1, upMid: '' };

  /* ---------------- 监听主世界评论数据 ---------------- */
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'dsh-main' || e.data.type !== 'comments') return;
    if (!DFY.settings || !DFY.settings.enabled) return;

    if (e.data.meta) {
      pageMeta = { ...pageMeta, ...e.data.meta };
    }

    const incoming = Array.isArray(e.data.items) ? e.data.items : [];
    for (const it of incoming) {
      if (!it || !it.rpid) continue;
      it.oid = it.oid || pageMeta.oid;
      it.type = it.type || pageMeta.commentType;
      items.set(String(it.rpid), it);

      const midStr = String(it.mid);
      let a = accounts.get(midStr);
      if (!a) {
        a = { acc: it, rpids: new Set(), verdict: null, blueRatio: null, pending: false };
        accounts.set(midStr, a);

        // 头像深浅蓝色色相判定
        if (DFY.settings.avatarCheck && it.avatar && DFY.avatarBlue) {
          DFY.avatarBlue(it.avatar).then((blueRatio) => {
            if (blueRatio != null) {
              a.blueRatio = blueRatio;
              judge(a);
              renderAll();
            }
          });
        }
      }
      a.rpids.add(String(it.rpid));

      // 检查是否为对线 Bot 回复
      if (DFY.staller && DFY.staller.handlePotentialBotReply) {
        DFY.staller.handlePotentialBotReply(it, pageMeta.oid, pageMeta.commentType);
      }
    }

    // 重新判定受影响账号
    for (const a of accounts.values()) {
      judge(a);
    }

    renderAll();
  });

  function textsOf(a) {
    const out = [];
    for (const id of a.rpids) {
      const it = items.get(id);
      if (it) out.push(it);
    }
    return out;
  }

  function judge(a) {
    const its = textsOf(a);
    const mid = String(a.acc.mid);
    const textItems = its.map((i) => ({ text: i.text, isReply: !!i.isReply }));

    const verdict = DFY.scoreAccount(a.acc, textItems, {
      upMid: pageMeta.upMid,
      blueRatio: a.blueRatio
    });

    a.verdict = verdict;

    // 判定确诊为 DSH Bot 后的联动动作
    if (verdict.level === 'fish') {
      // 1. 自动上报中心仓进行众包审计
      if (DFY.hub && DFY.settings.cloudSync && DFY.settings.hubApiKey) {
        DFY.hub.reportBot({
          mid,
          uname: a.acc.uname,
          reason: (verdict.reasons[0] && verdict.reasons[0].why) || '多维特征确诊',
          sampleText: (its[0] && its[0].text) || '',
          score: verdict.score
        });
      }

      // 2. 自动排队向 B 站官方举报
      if (DFY.reporter && DFY.settings.autoReport) {
        for (const it of its) {
          DFY.reporter.queueReport(it);
        }
      }

      // 3. 自动发起算力泥潭对线 (若开启)
      if (DFY.staller && DFY.settings.autoStall && its[0]) {
        const rootRpid = its[0].root || its[0].rpid;
        const threadKey = `${pageMeta.oid}_${rootRpid}`;
        const session = DFY.storage && DFY.storage.getStallSession(threadKey);
        if (!session) {
          DFY.staller.initiateStall(its[0], pageMeta.oid, pageMeta.commentType);
        }
      }
    }
  }

  /* ---------------- DOM 评论区遍历与渲染 ---------------- */
  function eachRenderer(cb) {
    const bc = document.querySelector('bili-comments');
    if (!bc || !bc.shadowRoot) return;

    for (const th of bc.shadowRoot.querySelectorAll('bili-comment-thread-renderer')) {
      cb(th, false);
      const rep = th.shadowRoot && th.shadowRoot.querySelector('bili-comment-replies-renderer');
      if (rep && rep.shadowRoot) {
        for (const r of rep.shadowRoot.querySelectorAll('bili-comment-reply-renderer')) {
          cb(r, true);
        }
      }
    }
  }

  function accOfEl(el) {
    const id = el.getAttribute('data-dsh-rpid');
    const it = id && items.get(id);
    return it ? accounts.get(String(it.mid)) : null;
  }

  const BADGE_CSS = `
.dsh-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  margin-left: 6px;
  vertical-align: middle;
  transition: all 0.15s;
  user-select: none;
}
.dsh-badge.fish {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fca5a5;
}
.dsh-badge.fish:hover {
  background: #fecaca;
}
.dsh-badge.suspect {
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fde68a;
}
.dsh-badge.suspect:hover {
  background: #fde68a;
}

/* 折叠条样式 */
.dsh-fold-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  margin: 4px 0;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  font-size: 12px;
  color: #64748b;
  box-sizing: border-box;
}
.dsh-fold-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-fold-tag {
  background: #fee2e2;
  color: #dc2626;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}
.dsh-fold-actions {
  display: flex;
  gap: 8px;
}
.dsh-fold-btn {
  background: transparent;
  border: 1px solid #cbd5e1;
  color: #0284c7;
  font-size: 11px;
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 4px;
  transition: all 0.15s;
}
.dsh-fold-btn:hover {
  background: #e0f2fe;
  border-color: #38bdf8;
}
.dsh-fold-btn.danger {
  color: #dc2626;
  border-color: #fca5a5;
}
.dsh-fold-btn.danger:hover {
  background: #fee2e2;
}
.dsh-fold-btn.action-stall {
  color: #0284c7;
  border-color: #7dd3fc;
}
.dsh-fold-btn.action-stall:hover {
  background: #e0f2fe;
}
`;

  function ensureStyle(root) {
    if (root.querySelector('style[data-dsh-style]')) return;
    const s = document.createElement('style');
    s.setAttribute('data-dsh-style', '1');
    s.textContent = BADGE_CSS;
    root.appendChild(s);
  }

  function renderAll() {
    const mode = (DFY.settings && DFY.settings.filterMode) || 'collapse';

    eachRenderer((el, isReply) => {
      const a = accOfEl(el);
      if (!a || !a.verdict) return;

      const rpid = el.getAttribute('data-dsh-rpid');
      const isFish = a.verdict.level === 'fish';
      const isSuspect = a.verdict.level === 'suspect';

      const cr = el.shadowRoot && (el.shadowRoot.querySelector('bili-comment-renderer') || el.shadowRoot);
      if (!cr) return;
      ensureStyle(cr);

      // 人类用户：清除已有拦截或徽章
      if (a.verdict.level === 'human') {
        const oldB = cr.querySelector('.dsh-badge');
        if (oldB) oldB.remove();
        const oldBar = el.parentElement && el.parentElement.querySelector(`[data-dsh-fold="${rpid}"]`);
        if (oldBar) oldBar.remove();
        el.style.display = '';
        return;
      }

      // 1. 渲染警示徽章
      const userInfo = cr.querySelector('bili-comment-user-info') || cr.querySelector('#user-info') || cr.querySelector('#user-name');
      if (userInfo) {
        let badge = userInfo.querySelector('.dsh-badge');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = `dsh-badge ${isFish ? 'fish' : 'suspect'}`;
          userInfo.appendChild(badge);
        }
        badge.textContent = isFish ? `DSH Bot ${a.verdict.score}%` : `疑似 AI ${a.verdict.score}%`;

        // 点击徽章弹出详情浮窗
        badge.onclick = (ev) => {
          ev.stopPropagation();
          showDetailPopover(badge, a, rpid);
        };
      }

      // 2. 根据过滤模式执行动作
      if (isFish && !spared.has(String(a.acc.mid))) {
        if (mode === 'remove') {
          el.style.display = 'none';
          removeFoldBar(el, rpid);
        } else if (mode === 'collapse') {
          if (!peeked.has(rpid)) {
            el.style.display = 'none';
            ensureFoldBar(el, a, rpid);
          } else {
            el.style.display = '';
            removeFoldBar(el, rpid);
          }
        } else {
          // badge 模式：仅标记
          el.style.display = '';
          removeFoldBar(el, rpid);
        }
      } else {
        el.style.display = '';
        removeFoldBar(el, rpid);
      }
    });
  }

  function ensureFoldBar(el, a, rpid) {
    if (el.previousElementSibling && el.previousElementSibling.getAttribute('data-dsh-fold') === rpid) return;

    const bar = document.createElement('div');
    bar.className = 'dsh-fold-bar';
    bar.setAttribute('data-dsh-fold', rpid);
    bar.innerHTML = `
      <div class="dsh-fold-info">
        <span class="dsh-fold-tag">已拦截</span>
        <span>DSH 机器人检测 · <strong>@${esc(a.acc.uname || 'DSH_Bot')}</strong> (UID: ${esc(a.acc.mid)}) · 风险值: ${a.verdict.score}%</span>
      </div>
      <div class="dsh-fold-actions">
        <button class="dsh-fold-btn" data-act="peek">展开查看</button>
        <button class="dsh-fold-btn danger" data-act="report">举报</button>
        <button class="dsh-fold-btn action-stall" data-act="stall">泥潭对线</button>
        <button class="dsh-fold-btn" data-act="whitelist">放行加白</button>
      </div>
    `;

    bar.onclick = (e) => {
      const act = e.target.getAttribute('data-act');
      if (act === 'peek') {
        peeked.add(rpid);
        renderAll();
      } else if (act === 'report') {
        const it = items.get(rpid);
        if (it && DFY.reporter) DFY.reporter.reportItem(it);
      } else if (act === 'stall') {
        const it = items.get(rpid);
        if (it && DFY.staller) DFY.staller.initiateStall(it, pageMeta.oid, pageMeta.commentType);
      } else if (act === 'whitelist') {
        addToWhitelist(a.acc.mid, a.acc.uname);
      }
    };

    el.parentElement.insertBefore(bar, el);
  }

  function removeFoldBar(el, rpid) {
    const prev = el.previousElementSibling;
    if (prev && prev.getAttribute('data-dsh-fold') === rpid) {
      prev.remove();
    }
  }

  function showDetailPopover(targetEl, a, rpid) {
    const rect = targetEl.getBoundingClientRect();
    const v = a.verdict;
    const it = items.get(rpid);

    const reasonsHTML = (v.reasons || []).map((r) => `
      <div class="dfy-pop-item">
        <span class="dfy-pop-w ${r.w < 0 ? 'neg' : ''}">${r.w > 0 ? '+' + r.w : r.w}</span>
        <span>${esc(r.why)}</span>
      </div>
    `).join('');

    const content = `
      <div class="dfy-pop-head">
        <div class="dfy-pop-title">
          ${DFY.icon ? DFY.icon('robot', 16) : '🤖'}
          <span>@${esc(a.acc.uname)}</span>
        </div>
        <span class="dfy-pop-score ${v.level}">${v.score}%</span>
      </div>
      <div class="dfy-pop-list">
        ${reasonsHTML || '<div style="color:#94a3b8">无特殊扣分项</div>'}
      </div>
      <div class="dfy-pop-foot">
        <button class="dfy-pop-btn primary" id="pop-act-report">举报此评</button>
        <button class="dfy-pop-btn action-stall" id="pop-act-stall">泥潭对线</button>
        <button class="dfy-pop-btn" id="pop-act-white">放行加白</button>
      </div>
    `;

    DFY.ui.showPopover(rect, content);

    setTimeout(() => {
      const shadowHost = document.querySelector('dfy-host');
      if (!shadowHost || !shadowHost.shadowRoot) return;
      const sr = shadowHost.shadowRoot;

      const btnRep = sr.getElementById('pop-act-report');
      if (btnRep) {
        btnRep.onclick = () => {
          if (it && DFY.reporter) DFY.reporter.reportItem(it);
          DFY.ui.hidePopover();
        };
      }

      const btnStall = sr.getElementById('pop-act-stall');
      if (btnStall) {
        btnStall.onclick = () => {
          if (it && DFY.staller) DFY.staller.initiateStall(it, pageMeta.oid, pageMeta.commentType);
          DFY.ui.hidePopover();
        };
      }

      const btnWhite = sr.getElementById('pop-act-white');
      if (btnWhite) {
        btnWhite.onclick = () => {
          addToWhitelist(a.acc.mid, a.acc.uname);
          DFY.ui.hidePopover();
        };
      }
    }, 50);
  }

  async function addToWhitelist(mid, uname) {
    if (DFY.storage) {
      await DFY.storage.addWhitelist(mid, uname, '从评论区一键加白');
    }
    if (DFY.ui && DFY.ui.showToast) {
      DFY.ui.showToast(`已将 @${uname} 加入本地白名单，不再进行拦截`, 'success');
    }
    renderAll();
  }

  /** 一键清场：将当前页面已展开的所有 DSH 评论重新折叠 */
  C.quickClear = function () {
    let count = 0;
    eachRenderer((el) => {
      const a = accOfEl(el);
      if (a && a.verdict && a.verdict.level === 'fish') {
        const rpid = el.getAttribute('data-dsh-rpid');
        peeked.delete(rpid);
        count++;
      }
    });

    renderAll();

    if (DFY.ui && DFY.ui.showToast) {
      DFY.ui.showToast(`已重新收拢并折叠当前页 ${count} 条 DSH 机器人评论`, 'success');
    }
    return count;
  };
})();
