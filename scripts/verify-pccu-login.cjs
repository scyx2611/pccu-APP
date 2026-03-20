const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { chromium } = require('playwright');

const LOGIN_URL = 'https://ecampus.pccu.edu.tw/eCampus/default.aspx';
const TEST_CREDENTIALS = {
  account: 'A123456789',
  password: 'invalid-password-for-verification',
};

function loadSyncScriptsModule() {
  const filePath = path.join(__dirname, '..', 'src', 'features', 'pccu', 'sync', 'pccuSyncScripts.ts');
  const source = fs.readFileSync(filePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filePath,
  });

  const mod = { exports: {} };
  const fn = new Function('require', 'module', 'exports', outputText);
  fn(require, mod, mod.exports);
  return mod.exports;
}

function summarizeMessage(message) {
  if (!message || typeof message !== 'object') return String(message);
  const parts = [message.t];
  if (message.m) parts.push(message.m);
  if (message.url) parts.push(message.url);
  return parts.join(' | ');
}

async function main() {
  const { buildLoginScript } = loadSyncScriptsModule();
  if (typeof buildLoginScript !== 'function') {
    throw new Error('buildLoginScript was not exported correctly');
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const rnMessages = [];
  const navigations = [];
  const requests = [];

  page.on('console', (msg) => {
    const text = msg.text();
    if (!text.startsWith('__RNWV__')) return;
    try {
      rnMessages.push(JSON.parse(text.slice('__RNWV__'.length)));
    } catch (error) {
      rnMessages.push({ t: 'raw', m: text.slice('__RNWV__'.length) });
    }
  });

  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      navigations.push(frame.url());
    }
  });

  page.on('request', (request) => {
    if (request.url().includes('ecampus.pccu.edu.tw')) {
      requests.push({
        method: request.method(),
        url: request.url(),
        resourceType: request.resourceType(),
      });
    }
  });

  await page.addInitScript(() => {
    const forward = (payload) => {
      console.log(`__RNWV__${payload}`);
    };

    Object.defineProperty(window, 'ReactNativeWebView', {
      configurable: true,
      enumerable: true,
      value: { postMessage: forward },
    });
  });

  await page.goto(LOGIN_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  const domSummary = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input')).map((input) => ({
      type: input.getAttribute('type') || '',
      id: input.id || '',
      name: input.getAttribute('name') || '',
      value: input.getAttribute('value') || '',
    }));

    const triggers = Array.from(document.querySelectorAll('button, input, a'))
      .map((node) => ({
        tag: node.tagName.toLowerCase(),
        type: node.getAttribute('type') || '',
        id: node.id || '',
        name: node.getAttribute('name') || '',
        text: (node.innerText || node.textContent || node.getAttribute('value') || '').trim(),
      }))
      .filter((node) => /登入|login|sign in/i.test(node.text) || /submit/i.test(node.type));

    return {
      hasAccountInput: inputs.some((input) => /^(text|email)$/i.test(input.type || 'text')),
      hasPasswordInput: inputs.some((input) => /^password$/i.test(input.type)),
      hasLoginTrigger: triggers.length > 0,
      inputs,
      triggers,
      bodyText: (document.body && (document.body.innerText || document.body.textContent) || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300),
    };
  });

  const loginScript = buildLoginScript(TEST_CREDENTIALS);
  await page.evaluate((script) => {
    eval(script);
  }, loginScript);

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const done = rnMessages.some((message) => ['login_ok', 'login_fail', 'err'].includes(message.t));
    const sentLoginRequest = requests.some((request) => /default\.aspx\/gfChkLogin/i.test(request.url));
    if (done || sentLoginRequest) break;
    await page.waitForTimeout(250);
  }

  const hasRegressionError = rnMessages.some((message) => (
    message &&
    message.t === 'err' &&
    typeof message.m === 'string' &&
    /Network request failed|Login request timed out|Login request aborted/i.test(message.m)
  ));

  const hasSelectorCoverage = domSummary.hasAccountInput && domSummary.hasPasswordInput && domSummary.hasLoginTrigger;
  const sentLoginRequest = requests.some((request) => (
    request.method === 'POST' &&
    /default\.aspx\/gfChkLogin/i.test(request.url)
  ));
  const hasObservableLoginFlow = rnMessages.some((message) => (
    message &&
    (
      message.t === 'status' ||
      message.t === 'login_fail' ||
      message.t === 'login_ok' ||
      message.t === 'err'
    )
  ));

  console.log('PCCU login verification');
  console.log('page title:', await page.title());
  console.log('page url:', page.url());
  console.log('selector coverage:', hasSelectorCoverage);
  console.log('navigation count:', navigations.length);
  console.log('login request sent:', sentLoginRequest);
  console.log('messages:');
  for (const message of rnMessages) {
    console.log(`- ${summarizeMessage(message)}`);
  }

  console.log('requests:');
  for (const request of requests.filter((entry) => /gfChkLogin|default\.aspx|inside\.aspx/i.test(entry.url))) {
    console.log(`- ${request.method} ${request.resourceType} ${request.url}`);
  }

  if (!rnMessages.length) {
    console.log('- <no ReactNativeWebView messages captured>');
  }

  await browser.close();

  if (!hasSelectorCoverage) {
    console.error('Verification failed: login page selectors no longer match the live DOM.');
    console.error(JSON.stringify(domSummary, null, 2));
    process.exitCode = 1;
    return;
  }

  if (!hasObservableLoginFlow) {
    console.error('Verification failed: injected login script produced no observable flow.');
    console.error(JSON.stringify(domSummary, null, 2));
    process.exitCode = 1;
    return;
  }

  if (!sentLoginRequest) {
    console.error('Verification failed: injected login script did not send the live gfChkLogin request.');
    process.exitCode = 1;
    return;
  }

  if (hasRegressionError) {
    console.error('Verification failed: regression error still present in login flow.');
    process.exitCode = 1;
    return;
  }

  console.log('Verification passed: login DOM matches the script and the previous network-request regression was not reproduced.');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
