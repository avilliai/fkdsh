/* 纯净现代 UI 渲染引擎：Toast 实时通知、气泡详情浮窗与交互控制 */
(function () {
  const DFY = (globalThis.DFY = globalThis.DFY || {});
  const ui = (DFY.ui = {});

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  DFY.esc = esc;

  const CSS = `
:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;
  color: #1e293b;
  font-size: 13px;
  line-height: 1.5;
  z-index: 2147483647;
}

/* 屏幕右上角 Toast 通知容器 */
.dfy-toasts {
  position: fixed;
  top: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 2147483647;
  pointer-events: none;
}

.dfy-toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 280px;
  max-width: 420px;
  padding: 12px 16px;
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: #f8fafc;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
  animation: dfy-toast-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  transition: opacity 0.2s, transform 0.2s;
}

.dfy-toast.fade-out {
  opacity: 0;
  transform: translateY(-8px);
}

.dfy-toast-ic {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  flex-shrink: 0;
}

.dfy-toast.info .dfy-toast-ic { background: rgba(56, 189, 248, 0.2); color: #38bdf8; }
.dfy-toast.success .dfy-toast-ic { background: rgba(52, 211, 153, 0.2); color: #34d399; }
.dfy-toast.warning .dfy-toast-ic { background: rgba(251, 191, 36, 0.2); color: #fbbf24; }
.dfy-toast.danger .dfy-toast-ic,
.dfy-toast.error .dfy-toast-ic { background: rgba(248, 113, 113, 0.2); color: #f87171; }

.dfy-toast-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.dfy-toast-title {
  font-weight: 600;
  font-size: 13px;
  color: #f1f5f9;
}

.dfy-toast-desc {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 2px;
  word-break: break-all;
}

@keyframes dfy-toast-in {
  from { opacity: 0; transform: translateY(-12px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* 详情气泡浮窗 (Popover) */
.dfy-popover {
  position: fixed;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  padding: 14px;
  width: 320px;
  z-index: 2147483646;
  color: #334155;
  font-size: 12px;
  display: none;
  animation: dfy-pop-in 0.18s ease-out;
}

.dfy-popover.show {
  display: block;
}

.dfy-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 8px;
  margin-bottom: 8px;
}

.dfy-pop-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #0f172a;
}

.dfy-pop-score {
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}

.dfy-pop-score.fish { background: #fee2e2; color: #dc2626; }
.dfy-pop-score.suspect { background: #fef3c7; color: #d97706; }
.dfy-pop-score.human { background: #dcfce7; color: #16a34a; }

.dfy-pop-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.dfy-pop-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  color: #475569;
}

.dfy-pop-w {
  font-weight: 600;
  color: #e11d48;
  flex-shrink: 0;
}
.dfy-pop-w.neg { color: #16a34a; }

.dfy-pop-foot {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #f1f5f9;
}

.dfy-pop-btn {
  flex: 1;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: all 0.15s;
}

.dfy-pop-btn:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}

.dfy-pop-btn.primary {
  background: #dc2626;
  border-color: #dc2626;
  color: #ffffff;
}
.dfy-pop-btn.primary:hover {
  background: #b91c1c;
}

.dfy-pop-btn.action-stall {
  background: #0284c7;
  border-color: #0284c7;
  color: #ffffff;
}
.dfy-pop-btn.action-stall:hover {
  background: #0369a1;
}

@keyframes dfy-pop-in {
  from { opacity: 0; transform: scale(0.97); }
  to { opacity: 1; transform: scale(1); }
}
`;

  let root = null;
  let toastContainer = null;
  let popoverEl = null;

  function initHost() {
    if (root) return;
    const host = document.createElement('dfy-host');
    root = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    toastContainer = document.createElement('div');
    toastContainer.className = 'dfy-toasts';
    root.appendChild(toastContainer);

    popoverEl = document.createElement('div');
    popoverEl.className = 'dfy-popover';
    root.appendChild(popoverEl);

    document.documentElement.appendChild(host);
  }

  /** 发起 Toast 提示通知 */
  ui.toast = function ({ type = 'info', title = '', desc = '', ms = 3200 }) {
    initHost();
    const t = document.createElement('div');
    const safeType = type === 'danger' ? 'danger' : type === 'error' ? 'error' : type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'info';
    t.className = `dfy-toast ${safeType}`;

    const ic = safeType === 'success' ? DFY.icon('check', 16)
      : (safeType === 'danger' || safeType === 'error') ? DFY.icon('flag', 16)
      : safeType === 'warning' ? DFY.icon('flag', 16)
      : DFY.icon('shield', 16);

    t.innerHTML = `
      <div class="dfy-toast-ic">${ic}</div>
      <div class="dfy-toast-content">
        <div class="dfy-toast-title">${esc(title)}</div>
        ${desc ? `<div class="dfy-toast-desc">${esc(desc)}</div>` : ''}
      </div>
    `;

    toastContainer.appendChild(t);

    const remove = () => {
      t.classList.add('fade-out');
      setTimeout(() => {
        if (t.parentElement) t.parentElement.removeChild(t);
      }, 200);
    };

    setTimeout(remove, ms);
  };

  /** 便捷 Toast 调用别名，支持 showToast('文本', 'info') 或 showToast({ title, ... }) */
  ui.showToast = function (msgOrObj, type = 'info') {
    if (typeof msgOrObj === 'string') {
      ui.toast({ title: msgOrObj, type });
    } else if (msgOrObj && typeof msgOrObj === 'object') {
      ui.toast(msgOrObj);
    }
  };

  /** 弹出详情浮窗 */
  ui.showPopover = function (rect, htmlContent) {
    initHost();
    popoverEl.innerHTML = htmlContent;
    popoverEl.classList.add('show');

    const pWidth = 320;
    const pHeight = popoverEl.offsetHeight || 220;

    let left = rect.left + window.scrollX;
    let top = rect.bottom + 8 + window.scrollY;

    if (left + pWidth > window.innerWidth - 16) {
      left = window.innerWidth - pWidth - 16;
    }
    if (left < 16) left = 16;

    if (top + pHeight > window.innerHeight + window.scrollY - 16) {
      top = rect.top - pHeight - 8 + window.scrollY;
    }

    popoverEl.style.left = `${left}px`;
    popoverEl.style.top = `${top}px`;
  };

  ui.hidePopover = function () {
    if (popoverEl) popoverEl.classList.remove('show');
  };

  document.addEventListener('click', (e) => {
    if (popoverEl && !e.target.closest('dfy-host') && !e.target.closest('.dfy-badge') && !e.target.closest('.dsh-badge')) {
      ui.hidePopover();
    }
  });
})();
