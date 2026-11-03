/* 运行在页面主世界：读取 B 站评论 Web Component 上的 .data 并提取关键信息转交隔离世界 */
(function () {
  if (window.__dshMainWorld) return;
  window.__dshMainWorld = true;

  const ATTR = 'data-dsh-rpid';

  function getPageMeta() {
    let oid = '';
    let commentType = 1; // 1=视频, 12=专栏, 11/17=动态
    let upMid = '';

    try {
      const s = window.__INITIAL_STATE__;
      if (s) {
        if (s.videoData) {
          oid = String(s.videoData.aid || s.aid || '');
          commentType = 1;
          upMid = String((s.videoData.owner && s.videoData.owner.mid) || '');
        } else if (s.upInfo) {
          upMid = String(s.upInfo.mid || '');
        }
      }
    } catch (e) {}

    if (!oid) {
      // 降级尝试获取 DOM bili-comments 属性
      const bc = document.querySelector('bili-comments');
      if (bc) {
        oid = bc.getAttribute('oid') || bc.oid || '';
        const t = bc.getAttribute('type') || bc.type;
        if (t) commentType = parseInt(t, 10);
      }
    }

    return { oid, commentType, upMid };
  }

  function pick(d, isReply, pageMeta) {
    const m = d.member || {};
    return {
      rpid: String(d.rpid_str || d.rpid),
      root: String(d.root_str || d.root || 0),
      mid: String(m.mid || d.mid_str || d.mid),
      uname: m.uname || '',
      avatar: m.avatar || '',
      sign: m.sign || '',
      level: (m.level_info && m.level_info.current_level) || 0,
      verify: m.official_verify ? m.official_verify.type : -1,
      vip: (m.vip && m.vip.vipStatus) || 0,
      text: (d.content && d.content.message) || '',
      ats: atsOf(d.content),
      ctime: d.ctime || 0,
      like: d.like || 0,
      isReply: !!isReply,
      oid: pageMeta.oid,
      type: pageMeta.commentType
    };
  }

  function atsOf(c) {
    const out = [];
    if (!c) return out;
    const map = c.at_name_to_mid || {};
    for (const n in map) out.push({ n, m: String(map[n]) });
    for (const m of c.members || []) {
      if (m && m.uname && !(m.uname in map)) out.push({ n: m.uname, m: String(m.mid) });
    }
    return out;
  }

  function scan() {
    const out = [];
    const meta = getPageMeta();
    const hosts = document.querySelectorAll('bili-comments');

    for (const bc of hosts) {
      const root = bc.shadowRoot;
      if (!root) continue;
      for (const th of root.querySelectorAll('bili-comment-thread-renderer')) {
        visit(th, false, out, meta);
        const rep = th.shadowRoot && th.shadowRoot.querySelector('bili-comment-replies-renderer');
        if (rep && rep.shadowRoot) {
          for (const r of rep.shadowRoot.querySelectorAll('bili-comment-reply-renderer')) {
            visit(r, true, out, meta);
          }
        }
      }
    }

    if (out.length) {
      window.postMessage({
        source: 'dsh-main',
        type: 'comments',
        items: out,
        meta
      }, '*');
    }
  }

  function visit(el, isReply, out, meta) {
    const d = el.data;
    if (!d || !d.member) return;
    const id = String(d.rpid_str || d.rpid);
    if (el.getAttribute(ATTR) === id) return;
    el.setAttribute(ATTR, id);
    out.push(pick(d, isReply, meta));
  }

  let timer = 0;
  function schedule(delay = 200) {
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      try {
        scan();
      } catch (e) {}
    }, delay);
  }

  setInterval(schedule, 1500);

  // 监听评论组件生命周期以极速捕获新评论
  const fast = () => schedule(40);
  for (const tag of ['bili-comment-thread-renderer', 'bili-comment-reply-renderer', 'bili-comment-renderer']) {
    customElements.whenDefined(tag).then(() => {
      const proto = customElements.get(tag).prototype;
      for (const fn of ['connectedCallback', 'updated']) {
        const orig = proto[fn];
        if (typeof orig !== 'function' || orig.__dsh) continue;
        const wrapped = function () {
          const r = orig.apply(this, arguments);
          fast();
          return r;
        };
        wrapped.__dsh = true;
        proto[fn] = wrapped;
      }
    });
  }

  document.addEventListener('scroll', schedule, { passive: true, capture: true });

  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data.source === 'dsh-iso' && e.data.type === 'rescan') {
      for (const bc of document.querySelectorAll('bili-comments')) {
        if (!bc.shadowRoot) continue;
        for (const el of bc.shadowRoot.querySelectorAll('bili-comment-thread-renderer')) {
          el.removeAttribute(ATTR);
          const rep = el.shadowRoot && el.shadowRoot.querySelector('bili-comment-replies-renderer');
          if (rep && rep.shadowRoot) {
            for (const r of rep.shadowRoot.querySelectorAll('bili-comment-reply-renderer')) {
              r.removeAttribute(ATTR);
            }
          }
        }
      }
      schedule();
    }
  });
})();
