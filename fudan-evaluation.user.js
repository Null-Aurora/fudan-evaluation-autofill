// ==UserScript==
// @name         复旦评教一键填写
// @namespace    https://github.com/user/fudan-eval
// @version      1.3
// @description  复旦大学教学质量管理平台 - 自动填写评教问卷
// @author       User
// @include      https://ce.fudan.edu.cn/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ============ 配置 ============
  // 选择器策略：
  //   [class*="selectGroup"] — 匹配 CSS Module 类名，不依赖哈希后缀
  //   .ant-radio-group / .ant-checkbox-group — Ant Design 稳定类名
  //   label.ant-radio-wrapper / label.ant-checkbox-wrapper — 同上
  //   按钮文本匹配（"我知道了"）— 不依赖任何类名
  const CONFIG = {
    clickDelay: 120,
    initTimeout: 5000,
    answerIndex: 1,       // 基准选项索引（1 = 「同意」）
    pctVeryAgree: 35,     // 「非常同意」概率 (%)
    pctNeutral: 10,       // 「一般」概率 (%)
    // 「同意」概率 = 100 - pctVeryAgree - pctNeutral
  };

  // ============ 工具函数 ============
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...args) => console.log('[评教脚本]', ...args);

  // 归一化：确保三个权重之和为 1
  function getWeights() {
    let v = CONFIG.pctVeryAgree / 100;
    let n = CONFIG.pctNeutral / 100;
    let a = 1 - v - n;
    // 如果超 100%，按比例压缩
    if (a < 0) {
      const total = v + n;
      v = v / total;
      n = n / total;
      a = 0;
    }
    return { veryAgree: v, agree: a, neutral: n };
  }

  // ============ URL 检测 ============
  function isEvalPage() {
    return window.location.hash.includes('/my-task/answer/');
  }

  // ============ 核心：填写 ============
  async function fillCurrentPage() {
    const groups = document.querySelectorAll('[class*="selectGroup"]');
    log(`找到 ${groups.length} 道题`);

    let count = 0;
    for (const group of groups) {
      const isCheckbox = group.classList.contains('ant-checkbox-group');

      if (isCheckbox) {
        // 多选题：只选最后一个（通常为「无」）
        const labels = Array.from(group.querySelectorAll('label.ant-checkbox-wrapper'));
        if (!labels.length) continue;
        const last = labels[labels.length - 1];
        const input = last.querySelector('input.ant-checkbox-input');
        if (!input || !input.checked) {
          last.click();
          count++;
          await sleep(CONFIG.clickDelay);
        }
      } else {
        // 单选题：加权随机偏移，确保不全部相同
        const labels = Array.from(group.querySelectorAll('label.ant-radio-wrapper'));
        if (!labels.length) continue;

        // 跳过只有 1 个选项的题（已选中）
        if (labels.length === 1 && labels[0].querySelector('input.ant-radio-input')?.checked) {
          continue;
        }

        const w = getWeights();
        const r = Math.random();
        let offset = 0;
        if (r < w.veryAgree) offset = -1;
        else if (r < w.veryAgree + w.agree) offset = 0;
        else offset = 1;

        let startIdx = Math.max(0, Math.min(CONFIG.answerIndex + offset, labels.length - 1));

        let picked = false;
        // 从 startIdx 往后找；找不到则从头回绕
        for (let i = startIdx; i < labels.length && !picked; i++) {
          labels[i].click();
          await sleep(250);
          if (!group.querySelector('input.ant-input')) picked = true;
        }
        for (let i = 0; i < startIdx && !picked; i++) {
          labels[i].click();
          await sleep(250);
          if (!group.querySelector('input.ant-input')) picked = true;
        }

        if (picked) count++;
        await sleep(CONFIG.clickDelay);
      }
    }

    log(`填写了 ${count} 题`);
    return count;
  }

  // ============ 弹窗处理 ============
  function dismissTipDialog() {
    const tip = document.querySelector('[class*="tip_content"]');
    if (!tip) return false;
    for (const btn of tip.querySelectorAll('button.ant-btn')) {
      if (btn.textContent.includes('我知道了')) {
        btn.click();
        log('已关闭答卷提示弹窗');
        return true;
      }
    }
    return false;
  }

  let tipObserver = null;
  function watchTipDialog() {
    if (tipObserver) return;
    let timer = null;
    tipObserver = new MutationObserver(() => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; dismissTipDialog(); }, 100);
    });
    tipObserver.observe(document.body, { childList: true, subtree: true });
    dismissTipDialog();
  }

  // ============ 主流程 ============
  let isFilling = false; // 防止并发

  async function fillAll() {
    if (isFilling) {
      toast('正在填写中，请稍候', 'nfo');
      return;
    }
    isFilling = true;
    try {
      dismissTipDialog();
      setStatus('填写中...');
      const n = await fillCurrentPage();
      setStatus(`已填 ${n} 题，请手动提交`);
      toast(`已填写 ${n} 题，请检查后手动提交`, 'ok');
    } finally {
      isFilling = false;
    }
  }

  // ============ UI ============
  function createPanel() {
    if (document.getElementById('fudan-eval-panel')) return;

    const style = document.createElement('style');
    style.textContent = `
#fudan-eval-panel{position:fixed;right:20px;bottom:80px;z-index:2147483647;
  background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.2);
  padding:16px;width:185px;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif}
#fudan-eval-panel .t{font-weight:700;margin-bottom:10px;color:#1a1a2e;font-size:14px;text-align:center}
#fudan-eval-panel .b{display:block;width:100%;padding:10px 0;margin-bottom:8px;
  border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;transition:all .15s}
#fudan-eval-panel .b1{background:#1677ff;color:#fff}
#fudan-eval-panel .b1:hover{background:#4096ff}
#fudan-eval-panel .b1:disabled{background:#91caff;cursor:not-allowed}
#fudan-eval-panel .s{text-align:center;color:#999;font-size:11px;margin-top:6px;word-break:break-all}
.fudan-ratio-row{display:flex;align-items:center;justify-content:center;margin-bottom:4px;font-size:12px;gap:4px}
.fudan-ratio-label{width:50px;text-align:right;color:#666}
.fudan-ratio-input{width:42px;padding:2px 4px;border-radius:4px;border:1px solid #d9d9d9;font-size:12px;text-align:center}
.fudan-ratio-warn{color:#ff4d4f !important}
.fudan-toast{position:fixed;top:24px;left:50%;transform:translateX(-50%);z-index:2147483647;
  padding:12px 28px;border-radius:10px;color:#fff;font-size:14px;font-weight:500;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  transition:opacity .3s;pointer-events:none}
.fudan-toast.ok{background:#52c41a}
.fudan-toast.nfo{background:#1677ff}
`;

    const panel = document.createElement('div');
    panel.id = 'fudan-eval-panel';
    panel.innerHTML = `
<div class="t">评教助手</div>
<div class="fudan-ratio-row">
  <span class="fudan-ratio-label">非常同意</span>
  <input class="fudan-ratio-input" id="fudan-v" type="number" min="0" max="100" value="${CONFIG.pctVeryAgree}"><span>%</span>
</div>
<div class="fudan-ratio-row">
  <span class="fudan-ratio-label">一般</span>
  <input class="fudan-ratio-input" id="fudan-n" type="number" min="0" max="100" value="${CONFIG.pctNeutral}"><span>%</span>
</div>
<div class="fudan-ratio-row" style="color:#999">
  <span class="fudan-ratio-label">同意</span>
  <span id="fudan-a" style="font-weight:500">${100 - CONFIG.pctVeryAgree - CONFIG.pctNeutral}</span><span>%</span>
</div>
<button class="b b1" style="margin-top:10px" id="fudan-fill-all">一键填写</button>
<div class="s" id="fudan-status">就绪，等待操作</div>`;

    document.head.appendChild(style);
    document.body.appendChild(panel);

    // --- 比例输入校验 ---
    const inputV = document.getElementById('fudan-v');
    const inputN = document.getElementById('fudan-n');
    const agreeEl = document.getElementById('fudan-a');
    const btn = document.getElementById('fudan-fill-all');

    function clampInput(el) {
      let val = parseInt(el.value);
      if (isNaN(val) || val < 0) val = 0;
      if (val > 100) val = 100;
      el.value = val;
      return val;
    }

    function updateRatio() {
      const v = clampInput(inputV);
      const n = clampInput(inputN);
      const a = 100 - v - n;
      agreeEl.textContent = a;
      agreeEl.className = a < 0 ? 'fudan-ratio-warn' : '';
      btn.disabled = a < 0;
      CONFIG.pctVeryAgree = v;
      CONFIG.pctNeutral = n;
    }

    inputV.addEventListener('input', updateRatio);
    inputN.addEventListener('input', updateRatio);
    updateRatio();

    btn.addEventListener('click', fillAll);
  }

  function setStatus(msg) {
    const el = document.getElementById('fudan-status');
    if (el) el.textContent = msg;
  }

  function toast(msg, cls) {
    const old = document.querySelector('.fudan-toast');
    if (old) old.remove();
    const t = Object.assign(document.createElement('div'), {
      className: 'fudan-toast ' + (cls || 'nfo'),
      textContent: msg,
    });
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2200);
  }

  // ============ 初始化 ============
  function init() {
    if (!isEvalPage()) return;

    watchTipDialog();

    let tries = 0;
    const maxTries = CONFIG.initTimeout / 300;
    const timer = setInterval(() => {
      tries++;
      if (document.querySelectorAll('[class*="selectGroup"]').length > 0) {
        clearInterval(timer);
        createPanel();
        setStatus('就绪，点击按钮开始填写');
      } else if (tries >= maxTries) {
        clearInterval(timer);
        createPanel();
        setStatus('未检测到题目');
      }
    }, 300);
  }

  // ============ 路由监听 ============
  // 用 hashchange 替代轮询，更高效
  window.addEventListener('hashchange', () => {
    const p = document.getElementById('fudan-eval-panel');
    if (p) p.remove();
    if (isEvalPage()) setTimeout(init, 800);
  });

  // ============ 启动 ============
  log('v1.3 已加载');
  init();
  if (document.readyState !== 'complete') {
    window.addEventListener('load', () => {
      if (isEvalPage() && !document.getElementById('fudan-eval-panel')) init();
    });
  }
})();
