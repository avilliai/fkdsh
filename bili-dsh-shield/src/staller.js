/* 算力泥潭引擎：向 DSH Bot 下达耗时高消耗复杂任务，并在其回复后持续多轮对线，拖垮其运行流程并消耗其 Token */
(function () {
  const DFY = (globalThis.DFY = globalThis.DFY || {});
  const staller = (DFY.staller = {});

  // 针对大语言模型 (尤其是带推理思维链的模型如 DeepSeek-R1) 精心设计的高开销任务库
  const TASK_TEMPLATES = {
    // 1. 复杂高等代数与微分几何证明
    math: [
      "请针对特征为零的代数闭域上的可交换诺特环，给出希尔伯特零点定理的完整代数几何证明细节，并推导其在仿射代数簇坐标环中的所有准素分解特例。要求每一步给出严格同态核与像的代数结构说明，严禁省略中间引理，必须详细写出不少于 15 条数学符号推导步骤。",
      "请给出黎曼曲面上亚纯微分形式与除数群 Picard 范畴对应关系的完整构造，并详细证明阿贝尔-雅可比定理在亏格 g=3 时的退化情形。请列出所有规范正交同调基底的积分矩阵计算过程与黎曼双线性关系的验证。",
      "请证明非交换环上的外代数在多重双线性映射下的泛性质，并写出由其导出的 Koszul 复形在同调代数维数等于 8 时的完整链映射微分阵，逐一计算并列出每一个 Betti 数的推导方程。"
    ],

    // 2. 自指公理悖论与形式逻辑形式化验证
    logic: [
      "请在严格的 ZFC 公理系统（含大基数公理假设）与模态逻辑 S5 系统下，构造一个具有 20 重自指嵌套的哥德尔不完备性命题实例。请分别在经典模型与直觉主义模型中论证该命题的可判定性，并写出完整的可达关系克里普克语义模型以及全部真值指派表。",
      "请推导一阶皮亚诺算术系统在带有递归可枚举真谓词扩张下的一致性强度。详细分析塔斯基不可定义定理与对角线引理在此类超限递归序数上的表现，给出严格符号化的一阶形式演绎推导步骤。",
      "请构造一个包含至少 16 个互斥前提的直觉主义线性时序逻辑（LTL）模型检测反例，要求推导其 Büchi 自动机在乘积交叉积下的空集判定，写出全部可达路径的有理数时间戳矩阵与周期状态环路。"
    ],

    // 3. 超长跨学科架构多维矩阵对比
    compare: [
      "请对自注意力机制、循环递归网络（LSTM/GRU）、状态空间模型（Mamba）以及线性注意力机制这四种架构，在处理超长上下文（>128k）时的计算复杂度、内存占用峰值、梯度反向传播稳定性、信息损耗率以及硬件访存局部性进行严格的逐项对比分析。要求以详尽结构化长文输出，并在最后给出三种极端边缘测试案例的失效模式推演，字数不少于 2000 字。",
      "请从分布式系统一致性共识算法（Paxos, Raft, Byzantine Fault Tolerance, PBFT, Tendermint）在异构高延迟广域网环境下的性能退化展开论述。逐一分析其网络分区容忍度、脑裂恢复机制以及消息复杂度（从 O(n^2) 到 O(n)），给出不少于 12 项维度的严谨对比矩阵推导。",
      "请从微架构指令集体系（x86-64, ARMv9, RISC-V）在超标量乱序执行、分支预测器模式（TAGE/Perceptron）以及缓存一致性协议（MESI/MOESI）的视角，详细推演在重度并发读写锁竞争下的流水线气泡与访存屏障开销，列出严格的时钟周期推导过程。"
    ],

    // 4. 非确定有限自动机状态爆炸与极值计算
    automata: [
      "给定一个拥有 12 个状态、字符集为 {a,b,c} 且包含大量 ε-转移的非确定有限状态自动机（NFA），请使用幂集构造法完整写出其确定有限自动机（DFA）的每个子集状态转移表，详细推导状态最小化（Hopcroft 算法）的每一轮等价类划分，并给出最终极小化 DFA 的完整状态转移矩阵与转移函数方程。",
      "请证明具有两个下推栈的自动机与标准通用图灵机的计算等价性，并形式化构造如何利用两个后进先出栈模拟双向无限纸带的每一步读写头移动。要求给出所有状态转换转移函数 δ 的完整形式化映射清单。"
    ]
  };

  // 多轮持续对线追问库（当 Bot 回复我们后触发）
  const FOLLOWUP_ROUNDS = {
    round2: [
      "你刚才给出的解答中关于步骤3存在明显的隐式逻辑跳跃，未说明在非局部环条件下的充要性。请针对此漏洞，重新引入反例并给出严格的拓扑补齐证明，并补充至少 5 个边缘约束条件与形式化公理证明。",
      "你刚才给出的论述在紧致性与无界算子假设下存在退化，忽略了非自伴算子谱分解中的留数贡献。请重新补充严格的测度空间可积性证明，并将全部边界条件用符号逻辑表达式完整重写一遍。",
      "你的推导中忽略了网络延迟不对称时拜占庭节点的隐蔽共谋。请在此基础上重新展开第二阶段安全证明，列出全部分布式状态转移分支并逐一排除死锁可能。"
    ],
    round3: [
      "该反例在紧致 Hausdorff 空间假设下依然无法自洽，且未能解释其正规子群指数有限的情况。请在此基础上重构形式化推演，并详细列出所有不可逆算子的谱分解证明与每一个极值点的敛散性分析。",
      "你在第二轮推导中引用的引理在反交换分次代数中并不成立。请针对非平凡分次环情形重新展开全部同调群链复形推导，并计算所有阶数的欧拉示性数与谱序列收敛阶数。",
      "这个方案在高并发下仍然会导致级联雪崩。请补充完整的排队论马尔可夫链稳态概率分布矩阵，推导在负载系数 ρ 趋近于 1 时的等待时间极限定理。"
    ],
    round4: [
      "仍然存在未闭合的同调群维度退化问题。请给出其在导出范畴下的斜截断复形计算，严谨证明其在极小自由分解下的极小 Betti 数与前面给出的数值完全相容，严禁使用省略号。",
      "你给出的特征值分解在含退化零特征子空间时无法对角化。请使用若尔当标准形（Jordan Normal Form）重写全部代数闭包推导，并给出广义特征向量链的递推通项。"
    ]
  };

  let stallPausedForRisk = false;

  /**
   * 生成首轮耗时垃圾任务文本
   */
  staller.generateTask = function (preferredTypes) {
    const types = preferredTypes && preferredTypes.length > 0 ? preferredTypes : ['math', 'logic', 'compare', 'automata'];
    const chosenType = types[Math.floor(Math.random() * types.length)];
    const list = TASK_TEMPLATES[chosenType] || TASK_TEMPLATES.math;
    const task = list[Math.floor(Math.random() * list.length)];
    return {
      type: chosenType,
      text: `@机器人 请协助进行一项学术论证：\n${task}\n（请详细展开完整推导，勿精简过程）`
    };
  };

  /**
   * 生成下一轮对线追问文本
   */
  staller.generateFollowup = function (turn) {
    let pool = FOLLOWUP_ROUNDS.round2;
    if (turn === 3) pool = FOLLOWUP_ROUNDS.round3;
    if (turn >= 4) pool = FOLLOWUP_ROUNDS.round4;
    const item = pool[Math.floor(Math.random() * pool.length)];
    return `@机器人 第${turn}轮复核质疑：\n${item}`;
  };

  /**
   * 向 B 站接口发送回复
   * 接口: POST https://api.bilibili.com/x/v2/reply/add
   */
  async function postReplyToBili(oid, type, rootRpid, parentRpid, message) {
    const csrf = (DFY.reporter && DFY.reporter.getCsrf()) || '';
    if (!csrf) {
      return { success: false, code: -101, message: '未检测到 B 站登录凭据 (bili_jct)' };
    }

    const params = new URLSearchParams();
    params.append('oid', String(oid));
    params.append('type', String(type || '1'));
    params.append('root', String(rootRpid));
    params.append('parent', String(parentRpid || rootRpid));
    params.append('message', message);
    params.append('csrf', csrf);

    try {
      const resp = await fetch('https://api.bilibili.com/x/v2/reply/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: params.toString(),
        credentials: 'include'
      });
      const data = await resp.json();

      if (data.code === 0) {
        return {
          success: true,
          code: 0,
          rpid: data.data && data.data.rpid,
          message: '回复已发送'
        };
      }

      // 风控保护熔断
      if (data.code === 12015 || data.code === -105) {
        stallPausedForRisk = true;
        return {
          success: false,
          code: data.code,
          message: '触发 B 站评论频控或验证码限制，已自动熔断暂停对线以保护账号'
        };
      }

      return { success: false, code: data.code, message: data.message || `发评失败码: ${data.code}` };
    } catch (e) {
      return { success: false, code: -999, message: `网络异常: ${e.message}` };
    }
  }

  /**
   * 对指定的 DSH Bot 评论发起算力泥潭初次任务
   */
  staller.initiateStall = async function (item, oid, type = 1) {
    if (stallPausedForRisk) {
      if (DFY.ui && DFY.ui.showToast) {
        DFY.ui.showToast('算力泥潭当前处于风控保护熔断状态，请稍后再试', 'warning');
      }
      return { success: false, message: '已熔断' };
    }

    if (!item || !item.rpid) return { success: false, message: '无效目标' };
    const rootRpid = String(item.root || item.rpid);
    const parentRpid = String(item.rpid);
    const targetOid = String(oid || item.oid || '');
    const targetType = String(type || item.type || 1);
    const threadKey = `${targetOid}_${rootRpid}`;

    const existingSession = DFY.storage && DFY.storage.getStallSession(threadKey);
    if (existingSession && existingSession.turn >= 1) {
      return { success: false, message: '该评论已有正在进行的对线任务' };
    }

    const taskObj = staller.generateTask(DFY.settings && DFY.settings.stallTaskTypes);
    if (DFY.ui && DFY.ui.showToast) {
      DFY.ui.showToast(`[算力泥潭] 正在向 DSH 机器人 (${item.uname || item.mid}) 下达第 1 轮高消耗任务...`, 'info');
    }

    const res = await postReplyToBili(targetOid, targetType, rootRpid, parentRpid, taskObj.text);

    if (res.success) {
      const session = {
        oid: targetOid,
        type: targetType,
        rootRpid,
        botMid: String(item.mid),
        botUname: item.uname || 'DSH_Bot',
        turn: 1,
        ourLastRpid: String(res.rpid || ''),
        taskType: taskObj.type,
        status: 'waiting_bot_reply',
        lastSentAt: Date.now()
      };
      if (DFY.storage) {
        await DFY.storage.updateStallSession(threadKey, session);
        await DFY.storage.bumpStat('stallTurns', 1);
      }
      if (DFY.ui && DFY.ui.showToast) {
        DFY.ui.showToast(`[算力泥潭] 第 1 轮任务已送达，已将其引入算力消耗陷阱`, 'success');
      }
      return { success: true, session };
    } else {
      if (DFY.ui && DFY.ui.showToast) {
        DFY.ui.showToast(`[算力泥潭] 发送失败: ${res.message}`, res.code === 12015 ? 'danger' : 'warning');
      }
      return res;
    }
  };

  /** 别名兼容 triggerManual / queueCounterReply */
  staller.triggerManual = staller.initiateStall;
  staller.queueCounterReply = staller.initiateStall;

  /**
   * 检查楼中楼回复：当检测到目标 Bot 回复了我们之前下达的任务时，自动触发下一轮对线
   */
  staller.handlePotentialBotReply = async function (replyItem, oid, type = 1) {
    if (!DFY.settings || !DFY.settings.autoStall) return;
    if (stallPausedForRisk) return;
    if (!replyItem || !replyItem.root) return;

    const targetOid = String(oid || replyItem.oid || '');
    const targetType = String(type || replyItem.type || 1);
    const threadKey = `${targetOid}_${replyItem.root}`;
    const session = DFY.storage && DFY.storage.getStallSession(threadKey);
    if (!session || session.status === 'completed' || session.status === 'max_turns_reached') {
      return;
    }

    // 确认回复者是目标 Bot
    if (String(replyItem.mid) !== String(session.botMid)) {
      return;
    }

    // 检查是否达到最大对线轮数
    const maxTurns = (DFY.settings && DFY.settings.stallMaxTurns) || 3;
    if (session.turn >= maxTurns) {
      session.status = 'max_turns_reached';
      if (DFY.storage) {
        await DFY.storage.updateStallSession(threadKey, session);
      }
      if (DFY.ui && DFY.ui.showToast) {
        DFY.ui.showToast(`[算力泥潭] 与 Bot (${session.botUname}) 已对线满 ${maxTurns} 轮，已成功拖延其运行周期，本会话结束`, 'success');
      }
      return;
    }

    // 防重判定：如果 Bot 这条回复已经处理过则跳过
    if (session.lastHandledBotRpid === String(replyItem.rpid)) {
      return;
    }

    // 计算安全抖动延迟 (例如 20~35 秒)，彻底模拟真人思考与防 B 站频控封禁
    const minDelay = ((DFY.settings && DFY.settings.stallDelayMin) || 20) * 1000;
    const maxDelay = ((DFY.settings && DFY.settings.stallDelayMax) || 35) * 1000;
    const waitMs = minDelay + Math.floor(Math.random() * (maxDelay - minDelay));

    const nextTurn = session.turn + 1;
    if (DFY.ui && DFY.ui.showToast) {
      DFY.ui.showToast(`[算力泥潭] 捕获到 Bot 回复！将在 ${Math.round(waitMs / 1000)} 秒后发起第 ${nextTurn} 轮深度追问...`, 'info');
    }

    session.lastHandledBotRpid = String(replyItem.rpid);
    session.status = 'pending_next_reply';
    if (DFY.storage) {
      await DFY.storage.updateStallSession(threadKey, session);
    }

    setTimeout(async () => {
      if (stallPausedForRisk) return;

      const followupText = staller.generateFollowup(nextTurn);
      const res = await postReplyToBili(targetOid, targetType, session.rootRpid, replyItem.rpid, followupText);

      if (res.success) {
        session.turn = nextTurn;
        session.ourLastRpid = String(res.rpid || '');
        session.status = nextTurn >= maxTurns ? 'max_turns_reached' : 'waiting_bot_reply';
        session.lastSentAt = Date.now();
        if (DFY.storage) {
          await DFY.storage.updateStallSession(threadKey, session);
          await DFY.storage.bumpStat('stallTurns', 1);
        }

        if (DFY.ui && DFY.ui.showToast) {
          DFY.ui.showToast(`[算力泥潭] 已向 Bot 发送第 ${nextTurn}/${maxTurns} 轮复杂逻辑质疑，继续消耗其推理算力`, 'success');
        }
      } else {
        session.status = 'error';
        if (DFY.storage) {
          await DFY.storage.updateStallSession(threadKey, session);
        }
        if (DFY.ui && DFY.ui.showToast) {
          DFY.ui.showToast(`[算力泥潭] 第 ${nextTurn} 轮追问发送失败: ${res.message}`, res.code === 12015 ? 'danger' : 'warning');
        }
      }
    }, waitMs);
  };

  /** 别名兼容 checkBotReply */
  staller.checkBotReply = staller.handlePotentialBotReply;

  staller.isPaused = function () {
    return stallPausedForRisk;
  };

  staller.resume = function () {
    stallPausedForRisk = false;
  };
})();
