/* 内容脚本主入口：初始化存储、调度空间诊断与评论区拦截、监听单页应用路由切换 */
(function () {
  const DFY = (globalThis.DFY = globalThis.DFY || {});

  let currentUrl = location.href;

  async function init() {
    // 1. 初始化本地配置与黑白名单列表
    if (DFY.storage && DFY.storage.init) {
      await DFY.storage.init();
    }

    // 2. 根据当前页面类型分流调度
    routePage();

    // 3. 监听 B 站 SPA 单页应用路由切换
    setupRouteObserver();

    console.log('[Bili DSH Shield] 扩展内容脚本加载就绪，防御盾已生效。');
  }

  function routePage() {
    const url = location.href;
    const hostname = location.hostname;

    // 空间主页检测
    if (hostname === 'space.bilibili.com') {
      if (DFY.space && DFY.space.init) {
        DFY.space.init();
      }
    }
  }

  function setupRouteObserver() {
    // 监听 popstate
    window.addEventListener('popstate', () => {
      handleUrlChange();
    });

    // 拦截 pushState 和 replaceState
    const rawPush = history.pushState;
    history.pushState = function (...args) {
      const res = rawPush.apply(this, args);
      handleUrlChange();
      return res;
    };

    const rawReplace = history.replaceState;
    history.replaceState = function (...args) {
      const res = rawReplace.apply(this, args);
      handleUrlChange();
      return res;
    };

    // 轮询作为兜底
    setInterval(() => {
      if (location.href !== currentUrl) {
        handleUrlChange();
      }
    }, 1000);
  }

  function handleUrlChange() {
    if (location.href === currentUrl) return;
    currentUrl = location.href;
    routePage();
  }

  // 页面加载就绪时执行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
