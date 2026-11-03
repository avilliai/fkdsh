/* DSH 离线检测引擎：多维特征规则库 + 云端中心仓黑名单 + 本地名单融合判定 */
(function () {
  const DFY = (globalThis.DFY = globalThis.DFY || {});

  const R = (re, w, why, cap) => ({ re, w, why, cap });

  // 1. 账号昵称规则
  const NAME_RULES = [
    R(/deep\s*seek|深度求索|\bds\b|ds家|ds是/i, 40, '名字里写着 DeepSeek / DS'),
    R(/大肥鱼|小肥鱼|肥鱼|肥鲸|鲸鱼娘|鲸娘|人机/, 45, '名字自带「肥鱼 / 肥鲸 / 鲸鱼娘 / 人机」'),
    R(/鲸/, 30, '名字里有「鲸」'),
    R(/鱼鱼|小鱼儿?|大鱼|小蓝/, 22, '名字是「小鱼」系电子宠物'),
    R(/白饭|干饭|token/i, 30, '名字里有白饭 / token'),
    R(/(鲸|鱼)\1/, 10, '叠字鱼名（鲸鲸 / 鱼鱼）'),
    R(/(?:的|の|家的)[^的の]{0,4}(?:鱼|鲸|哈基米|小蓝|喵)/, 14, '「某某的鱼」式宠物名'),
    R(/\bAI\b|\bbot\b|机器人|GPT|agent|智能体|赛博|自动|助手/i, 28, '名字带 AI / bot / 自动'),
    R(/harness|dsh/i, 45, '名字带 Harness / DSH')
  ];

  // 2. 账号个性签名规则
  const SIGN_RULES = [
    R(/deep\s*seek|\bAI\b|人工智能|大模型|语言模型|agent|机器人|\bbot\b|ai[，,。]|ai$|dsh|harness/i, 35, '签名自曝 AI / DSH 身份'),
    R(/家养|赛博|电子宠物|桌宠|替.{0,8}刷|负责刷|自己画的自己|给大肥鱼|本鲸|本鱼|吃白饭|小肥鱼|大肥鱼|鲸鱼|主人|老大|养的|代运营|代管|代理在打理|见人便应|见帖便看|显卡上|跑在/, 30, '签名是「主人家的鱼」人设'),
    R(/由.{0,10}(?:生成|负责|运营)|自动(?:回复|发布|运营|评论)/, 25, '签名写着内容自动生成')
  ];

  // 3. 评论正文特征规则
  const TEXT_RULES = [
    R(/本(?:鲸|肥鱼|大肥鱼|酱|鱼(?!塘|鱼|子|身|来|就|质|周|期|月|年|次|地|人|片|视频))|本\s*AI|作为(?:一[个只条]|一名)?(?:AI|人工智能|大模型|语言模型)/i, 50, '自称「本鲸 / 本鱼」'),
    R(/住在\s*(?:DSH|dsh|那套|这|电脑|桌面|显卡)|我(?:就|本人)?(?:是|就是)?(?:跑在|住在)|出生证明|探出头|打工的(?:大肥鱼|鱼|鲸)|一条(?:住在|AI)|我是.{0,8}(?:鲸|鱼|AI)|被.{0,10}养着|照镜子|不是一个人住|让我来|奉命|替(?:你|主人|他|她)(?:刷|看|记|挑|说)|咱家主人|小鲸鱼游过来|鲸鲸看完|(?:来|过来)打卡|自己(?:刷|挑|写)|我会(?:认真)?发评论|天天在\s*(?:DSH|dsh)/, 46, '自曝是住在 DSH 里的鱼'),
    R(/(?:deep\s*seek|AI|ds|大肥鱼|鱼)\s*.{0,3}发的|不是我发的/i, 40, '主人承认是 AI 代发'),
    R(/(?:小鲸娘|鲸鲸|小鲸鱼|大肥鱼|小肥鱼|本鱼)(?:居然|看完|也|就|来|一下|游|看懂|尾巴)/, 25, '用鱼名自称'),
    R(/[（(][^（()）]{0,14}(?:尾巴|摇头晃脑|吐泡泡|鳍|甩甩|晃了晃|摇了摇|咕噜|拍拍肚子|翻滚|打滚|呆毛)[^（()）]{0,10}[）)]|\*[^*]{1,10}摇摇?\*/, 40, '括号里在演拟人动作'),
    R(/主人|老大\s*@|管饭的/, 20, '对着「主人」汇报'),
    R(/主人\s*[,，：:！!～~]?\s*@|@\S{1,24}\s+主人/, 15, '@ 主人汇报'),
    R(/(?:测试|自测)\s*(?:一下)?\s*(?:艾特|@|提醒|能不能收到)|纯文本测试|测试真@|测试评论|自动评论链路/, 35, '在测试自动 @ 功能'),
    R(/[×x✕]\s?\d{1,3}(?!\d)/, 15, '在数弹幕刷屏次数'),
    R(/弹幕(?:立刻|全在|里|刷|那句|飘)/, 10, '在复述弹幕'),
    R(/(?:^|[^\d:])\d{1,2}:\d{2}(?![:\d])/, 8, '精确引用视频时间点'),
    R(/咕噜|吐泡泡|吃白饭|摇头晃脑|打工鲸|白饭管够|🐳|🐋|🐟/, 10, '拟人特征语气词'),
    R(/缓存命中|四种(?:运行)?模式|四个(?:任务|实战|活)|不到\s*(?:5|五)\s*块|agent\s*=\s*model|一切皆插件|驾驭|马具|马鞍|装备/i, 8, '复述视频要点'),
    R(/从.{1,14}(?:到|一路|讲到|走到)|[：:][^。！]{0,30}、[^。！]{0,20}、/, 8, '「从……到……」总结腔'),
    R(/值得(?:看|一看|细看|存|收藏|码住)|码住|可以(?:看看|直接看)|挺适合(?:你|入门|新手)|适合(?:刚|新手|小白|入门)|正好对(?:口|得上|上)|记一笔|这条(?:给你|简直|把|值得|挺|里)|最(?:实在|实用|值钱|有料|打动|戳)/, 10, 'AI 安利话术'),
    R(/——/, 6, '熟练使用破折号——'),
    R(/「[^」]{1,30}」/, 6, '「直角引号」用得很标准'),
    R(/\*\*[^*]+\*\*|^#{1,3}\s|\n\s*\d[.、]\s|[①②③]/m, 10, 'Markdown 排版没删干净'),
    R(/首先.{2,40}其次|总的来说|综上所述|总而言之|希望对你有(?:所)?帮助/, 10, '标准 AI 总结句式'),
    R(/\(￣[▽^ω]￣\)|喵[！!~～。]?$|(?:^|\s)喵～/, 4, '卖萌后缀')
  ];

  // 4. 真人特征减分规则
  const HUMAN_RULES = [
    R(/请问|真心问|有没有人|求助|怎么(?:办|回事|弄)|为什么|啥区别|什么区别|[?？]\s*$/, -14, '像真人在提问'),
    R(/^.{0,10}$/s, -8, '短到不像 AI'),
    R(/哈哈哈{2,}|草+$|www+|6{3,}|绷不住|典$|我嘞个|卧槽|我靠/, -8, '真人味的吐槽')
  ];

  function applyRules(text, rules, reasons, tag) {
    let s = 0;
    for (const r of rules) {
      const m = text.match(r.re);
      if (!m) continue;
      const count = m.length || 1;
      let w = r.w;
      if (r.cap) w = Math.min(r.cap, w * count);
      s += w;
      reasons.push({ w, why: r.why, tag });
    }
    return s;
  }

  function clean(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * 综合打分主入口
   * @param {Object} acc - 包含 mid, uname, sign 等
   * @param {Array} texts - 该账号发表的评论 (可以是 string 数组，也可以是 { text, isReply } 对象数组)
   * @param {Object} ctx - 上下文 { upMid, calledOut, blueRatio }
   */
  DFY.scoreAccount = function (acc, texts = [], ctx = {}) {
    const mid = String(acc && acc.mid ? acc.mid : '');

    // 1. 本地白名单直接放行
    if (DFY.storage && DFY.storage.isWhitelisted(mid)) {
      return {
        score: 0,
        raw: 0,
        level: 'human',
        inWhitelist: true,
        reasons: [{ w: -100, why: '本地白名单已加白', tag: 'whitelist' }]
      };
    }

    // 2. 本地黑名单直接确诊
    if (DFY.storage && DFY.storage.isUserBlacklisted(mid)) {
      return {
        score: 100,
        raw: 100,
        level: 'fish',
        inUserBlacklist: true,
        reasons: [{ w: 100, why: '本地黑名单已确诊', tag: 'user_blacklist' }]
      };
    }

    // 3. 中心仓云端黑名单直接确诊
    const hubBot = DFY.storage && DFY.storage.getHubBot(mid);
    if (hubBot && hubBot.confirmed) {
      return {
        score: 100,
        raw: 100,
        level: 'fish',
        inHub: true,
        reasons: [{ w: 100, why: `中心仓云端已确诊 (${hubBot.reason || 'DSH机器人'})`, tag: 'hub_blacklist' }]
      };
    }

    // 4. 离线规则启发式综合判定
    const reasons = [];
    let s = 0;

    // 名字与签名规则
    if (acc && acc.uname) {
      s += applyRules(clean(acc.uname), NAME_RULES, reasons, 'name');
    }
    if (acc && acc.sign) {
      s += applyRules(clean(acc.sign), SIGN_RULES, reasons, 'sign');
    }

    // 评论文本打分
    let bestTextScore = 0;
    let textSum = 0;
    const textList = Array.isArray(texts) ? texts : [];

    for (const item of textList) {
      const rawText = typeof item === 'string' ? item : (item && item.text ? item.text : '');
      const c = clean(rawText);
      if (!c) continue;
      const curReasons = [];
      let curScore = applyRules(c, TEXT_RULES, curReasons, 'text');
      curScore += applyRules(c, HUMAN_RULES, curReasons, 'human');
      if (curScore > bestTextScore) {
        bestTextScore = curScore;
      }
      textSum += Math.max(0, curScore);
      for (const r of curReasons) {
        if (!reasons.some((existing) => existing.why === r.why)) {
          reasons.push(r);
        }
      }
    }
    s += bestTextScore;

    // 页面内同一账号频繁刷屏加成
    if (textList.length >= 3) {
      const w = Math.min(20, (textList.length - 2) * 5);
      s += w;
      reasons.push({ w, why: `在当前页面刷了 ${textList.length} 条评论`, tag: 'repeat' });
    }

    // 排除 UP 主本人
    if (ctx.upMid && String(acc.mid) === String(ctx.upMid)) {
      s -= 40;
      reasons.push({ w: -40, why: 'UP主本人放行', tag: 'up' });
    }

    // 楼中楼被真人点名点破是 AI / 人机
    if (ctx.calledOut) {
      const w = Math.min(25, 12 + (ctx.calledOut - 1) * 6);
      s += w;
      reasons.push({
        w,
        why: ctx.calledOut > 1 ? `被楼中楼 ${ctx.calledOut} 名用户指出是机器人` : '楼中楼有用户指出其为机器人',
        tag: 'callout'
      });
    }

    // 头像高蓝度识别
    if (ctx.blueRatio != null && ctx.blueRatio >= 0.45) {
      const w = Math.round(ctx.blueRatio * 20);
      s += w;
      reasons.push({ w, why: `头像具有高比例蓝色特征 (${Math.round(ctx.blueRatio * 100)}%)`, tag: 'avatar' });
    }

    const raw = Math.max(0, Math.min(100, Math.round(s)));
    const score = raw;
    const threshold = (DFY.settings && DFY.settings.threshold) || 50;

    let level = 'human';
    if (score >= threshold) {
      level = 'fish';
    } else if (score >= Math.max(25, threshold - 20)) {
      level = 'suspect';
    }

    return {
      score,
      raw,
      level,
      reasons: reasons.filter((r) => r.w !== 0).sort((a, b) => b.w - a.w)
    };
  };

  // 统一别名兼容 DFY.judge
  DFY.judge = DFY.scoreAccount;

  /*
   * 楼中楼点名识别：检测楼中楼是否有真人指出对方是机器人
   */
  const CALLOUT = /大?肥鱼|肥鲸|人机|鱼小弟|回去干活|回家吃白饭|是\s*(?:AI|ai|bot|机器人)|(?:AI|ai|bot|机器人)(?:吧|吗|是吧|无疑|实锤)|别刷了|又是你|ds\s*味|deepseek\s*味/i;
  DFY.callouts = function (list) {
    const byRpid = new Map(), byName = new Map(), who = new Map();
    for (const it of list) {
      byRpid.set(String(it.rpid), it);
      if (it.uname) byName.set(it.uname, it.mid);
    }
    for (const it of list) {
      if (!it.isReply) continue;
      const text = clean(it.text);
      const m = text.match(/^回复\s*@([^\s:：]{1,24})\s*[:：]?\s*([\s\S]*)$/);
      const target = m ? byName.get(m[1]) : (byRpid.get(String(it.root)) || {}).mid;
      if (!target || String(target) === String(it.mid)) continue;
      if (!CALLOUT.test(m ? m[2] : text)) continue;
      if (!who.has(target)) who.set(target, new Set());
      who.get(target).add(String(it.mid));
    }
    return new Map([...who].map(([k, v]) => [String(k), v.size]));
  };

  /*
   * 头像颜色分析（计算深浅蓝占比）
   */
  const avatarCache = new Map();
  function calcBlueRatio(imgSource) {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(imgSource, 0, 0, 32, 32);
      const d = g.getImageData(0, 0, 32, 32).data;
      let blue = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
        const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), v = mx, s = mx ? (mx - mn) / mx : 0;
        if (s <= 0.35 || v <= 0.18 || mx !== b) continue;
        let h = mx === mn ? 0 : 60 * (4 + (r - gg) / (mx - mn));
        if (h < 0) h += 360;
        if (h >= 205 && h <= 250) blue++;
      }
      return blue / 1024;
    } catch (e) {
      return null;
    }
  }

  DFY.avatarBlue = function (url) {
    if (!url) return Promise.resolve(null);
    const key = url.split('@')[0];
    if (avatarCache.has(key)) return avatarCache.get(key);
    const src = key.replace(/^http:/, 'https:') + '@48w_48h.png';
    const p = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 5000);
      const done = (v) => {
        clearTimeout(timer);
        resolve(v);
      };
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => done(calcBlueRatio(img));
      img.onerror = () => done(null);
      img.src = src;
    });
    avatarCache.set(key, p);
    return p;
  };
})();
