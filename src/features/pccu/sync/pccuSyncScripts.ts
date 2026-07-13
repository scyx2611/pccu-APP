export type PCCUCredentials = {
  account: string;
  password: string;
};

const baseHelpers = `
  function post(payload) {
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }

  function docs() {
    var list = [];
    var seen = [];

    function visit(doc) {
      if (!doc || seen.indexOf(doc) !== -1) return;
      seen.push(doc);
      list.push(doc);

      var frames = [];
      try {
        frames = doc.querySelectorAll('iframe, frame');
      } catch (error) {}

      for (var i = 0; i < frames.length; i += 1) {
        try {
          var child = frames[i].contentDocument || (frames[i].contentWindow && frames[i].contentWindow.document);
          if (child) visit(child);
        } catch (error) {}
      }
    }

    visit(document);
    return list;
  }

  function textOf(node) {
    return (node && (node.value || node.innerText || node.textContent) || '').replace(/\\s+/g, '');
  }

  function firstElement(selectors) {
    var allDocs = docs();
    for (var d = 0; d < allDocs.length; d += 1) {
      for (var s = 0; s < selectors.length; s += 1) {
        try {
          var el = allDocs[d].querySelector(selectors[s]);
          if (el) return el;
        } catch (error) {}
      }
    }
    return null;
  }

  function firstByText(patterns) {
    var allDocs = docs();
    var regex = new RegExp(patterns.join('|'), 'i');
    var selector = 'a, button, input, td, th, span, div, label, li';
    for (var d = 0; d < allDocs.length; d += 1) {
      try {
        var nodes = allDocs[d].querySelectorAll(selector);
        for (var i = 0; i < nodes.length; i += 1) {
          var node = nodes[i];
          var text = textOf(node);
          if (text && regex.test(text)) return node;
        }
      } catch (error) {}
    }
    return null;
  }

  function click(node) {
    if (!node) return false;
    try {
      node.click();
      return true;
    } catch (error) {}
    try {
      var evt = node.ownerDocument.createEvent('MouseEvents');
      evt.initEvent('click', true, true);
      node.dispatchEvent(evt);
      return true;
    } catch (error) {}
    return false;
  }

  function findDoc(matcher) {
    var allDocs = docs();
    for (var d = 0; d < allDocs.length; d += 1) {
      try {
        var html = allDocs[d].documentElement ? allDocs[d].documentElement.outerHTML : '';
        if (matcher(allDocs[d], html)) {
          return { doc: allDocs[d], html: html };
        }
      } catch (error) {}
    }
    return null;
  }
`;

export function buildLoginScript(credentials: PCCUCredentials): string {
  return `
    (function() {
      ${baseHelpers}

      try {
        var completed = false;
        var submitted = false;
        var waitingLoginHandler = false;

        function finish(payload) {
          if (completed) return;
          completed = true;
          post(payload);
        }

        function isInsidePage() {
          try {
            return /inside\\.aspx/i.test(window.location.href || '');
          } catch (error) {
            return false;
          }
        }

        function hasPortalFunctionsAvailable() {
          return (
            typeof gfOpenLink === 'function' ||
            (typeof window !== 'undefined' && typeof window.gfOpenLink === 'function') ||
            typeof lfOpenLink === 'function' ||
            (typeof window !== 'undefined' && typeof window.lfOpenLink === 'function')
          );
        }

        function hasLoginInputsVisible() {
          return !!firstElement([
            'input[type="password"]',
            'input[type="text"][name*="Account"]',
            'input[type="text"][id*="Account"]',
            'input[type="text"][name*="User"]',
            'input[type="text"][id*="User"]'
          ]);
        }

        function elements(selectors) {
          var allDocs = docs();
          var out = [];
          var seen = [];
          for (var d = 0; d < allDocs.length; d += 1) {
            for (var s = 0; s < selectors.length; s += 1) {
              try {
                var nodes = allDocs[d].querySelectorAll(selectors[s]);
                for (var i = 0; i < nodes.length; i += 1) {
                  if (seen.indexOf(nodes[i]) === -1) {
                    seen.push(nodes[i]);
                    out.push(nodes[i]);
                  }
                }
              } catch (error) {}
            }
          }
          return out;
        }

        function isUsableCredentialField(node) {
          if (!node) return false;
          try {
            if (node.disabled) return false;
            if (String(node.type || '').toLowerCase() === 'hidden') return false;
            var style = node.ownerDocument && node.ownerDocument.defaultView
              ? node.ownerDocument.defaultView.getComputedStyle(node)
              : window.getComputedStyle(node);
            if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
              return false;
            }
            if (typeof node.getClientRects === 'function' && node.getClientRects().length === 0) {
              return false;
            }
          } catch (error) {}
          return true;
        }

        function findFirstUsableElement(selectors) {
          var candidates = elements(selectors);
          for (var i = 0; i < candidates.length; i += 1) {
            if (isUsableCredentialField(candidates[i])) return candidates[i];
          }
          return candidates[0] || null;
        }

        function isFieldFilled(input) {
          try {
            return !!(input && String(input.value || '').length > 0);
          } catch (error) {
            return false;
          }
        }

        function hasStrongAuthenticatedSignal(text, href) {
          var safeText = text || '';
          var safeHref = href || '';
          var hasPortalShell = /inside\\.aspx|myccu|portal|service/i.test(safeHref);
          var hasLogout = /登出|logout/i.test(safeText);
          var hasStudentIdentity = /同學/i.test(safeText);
          var hasPortalMenu = /課表|成績|課業|教務|校務|學生專區|選課|出缺勤/i.test(safeText);
          return (
            hasPortalFunctionsAvailable() ||
            hasLogout ||
            hasStudentIdentity ||
            (hasPortalShell && hasPortalMenu)
          );
        }

        function detectAuthenticatedState() {
          try {
            var allDocs = docs();
            for (var d = 0; d < allDocs.length; d += 1) {
              var doc = allDocs[d];
              var href = '';
              var text = '';
              try {
                href = doc.location ? String(doc.location.href || '') : '';
              } catch (error) {}
              try {
                text = (doc.body && (doc.body.innerText || doc.body.textContent) || '');
              } catch (error) {}

              var hasPortalShell = /inside\\.aspx|myccu|portal|service/i.test(href);
              var hasPortalFunctions = hasPortalFunctionsAvailable();
              var loginInputsStillVisible = hasLoginInputsVisible();

              if (hasStrongAuthenticatedSignal(text, href) && !loginInputsStillVisible) {
                return {
                  authenticated: true,
                  signal: hasPortalShell ? 'portal_shell' : (hasPortalFunctions ? 'portal_function' : 'portal_greeting')
                };
              }
            }
          } catch (error) {}

          return { authenticated: false, signal: 'none' };
        }

        function tryAuthenticatedFallbackNavigation() {
          try {
            var insideUrl = 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx';
            var loginInputsVisible = hasLoginInputsVisible();

            if (hasPortalFunctionsAvailable() && !loginInputsVisible) {
              post({ t: 'status', m: '\u5075\u6e2c\u5230\u5df2\u767b\u5165\u74b0\u5883\uff0c\u5617\u8a66\u5c0e\u5411 inside.aspx...' });
              window.location.href = insideUrl;
              return true;
            }

            var insideLink = firstElement([
              'a[href*="inside.aspx"]',
              'frame[src*="inside.aspx"]',
              'iframe[src*="inside.aspx"]'
            ]);

            if (insideLink && !loginInputsVisible) {
              var linkBodyText = '';
              try {
                linkBodyText = (document.body && (document.body.innerText || document.body.textContent) || '');
              } catch (error) {}

              if (!hasStrongAuthenticatedSignal(linkBodyText, window.location.href || '')) {
                return false;
              }

              post({ t: 'status', m: '\u627e\u5230 inside.aspx \u5165\u53e3\uff0c\u5617\u8a66\u5c0e\u822a...' });
              if (insideLink.href) {
                window.location.href = insideLink.href;
              } else if (insideLink.src) {
                window.location.href = insideLink.src;
              } else {
                click(insideLink);
              }
              return true;
            }

            if (/default\.aspx/i.test(window.location.href || '')) {
              var bodyText = '';
              try {
                bodyText = (document.body && (document.body.innerText || document.body.textContent) || '');
              } catch (error) {}

              if (!loginInputsVisible && hasStrongAuthenticatedSignal(bodyText, window.location.href || '')) {
                post({ t: 'status', m: '\u767b\u5165\u5f8c\u4ecd\u505c\u5728 default.aspx\uff0c\u5f37\u5236\u9032\u5165 inside.aspx...' });
                window.location.href = insideUrl;
                return true;
              }
            }
          } catch (error) {}

          return false;
        }

        function setValue(input, value) {
          if (!input) return;
          var view = (input.ownerDocument && input.ownerDocument.defaultView) || window;

          try {
            if (input.readOnly) input.readOnly = false;
            input.removeAttribute && input.removeAttribute('readonly');
          } catch (error) {}

          try {
            var proto = view.HTMLInputElement && view.HTMLInputElement.prototype;
            var setter = Object.getOwnPropertyDescriptor(proto, 'value');
            if (setter && setter.set) setter.set.call(input, value);
            else input.value = value;
          } catch (error) {
            input.value = value;
          }

          try {
            input.dispatchEvent(new view.Event('input', { bubbles: true }));
            input.dispatchEvent(new view.Event('change', { bubbles: true }));
            input.dispatchEvent(new view.Event('keyup', { bubbles: true }));
            input.dispatchEvent(new view.Event('blur', { bubbles: true }));
          } catch (error) {}

          try {
            if (input.ownerDocument && input.ownerDocument.activeElement && typeof input.ownerDocument.activeElement.blur === 'function') {
              input.ownerDocument.activeElement.blur();
            }
          } catch (error) {}
        }

        function detectLoginFailure() {
          var picked = findDoc(function(doc) {
            var text = '';
            try {
              text = (doc.body && (doc.body.innerText || doc.body.textContent) || '');
            } catch (error) {}
            return /\\u767b\\u5165\\u5931\\u6557|\\u5e33\\u865f\\u6216\\u5bc6\\u78bc|\\u5bc6\\u78bc\\u932f\\u8aa4|\\u5e33\\u865f\\u932f\\u8aa4|login failed|invalid/i.test(text);
          });
          return !!picked;
        }

        function submitLoginForm() {
          try {
            var accountInput = findFirstUsableElement([
              'input[type="text"][name*="Account"]',
              'input[type="text"][name*="account"]',
              'input[type="text"][id*="Account"]',
              'input[type="text"][id*="account"]',
              'input[type="text"][name*="User"]',
              'input[type="text"][name*="user"]',
              'input[type="text"][id*="User"]',
              'input[type="text"][id*="user"]',
              'input[type="text"][name*="Login"]',
              'input[type="text"][name*="login"]',
              'input[type="text"][id*="Login"]',
              'input[type="text"][id*="login"]',
              'input[type="email"]',
              'input[type="text"]'
            ]);
            var passwordInput = findFirstUsableElement([
              'input[type="password"][name*="Password"]',
              'input[type="password"][name*="password"]',
              'input[type="password"][id*="Password"]',
              'input[type="password"][id*="password"]',
              'input[type="password"][name*="Pwd"]',
              'input[type="password"][name*="pwd"]',
              'input[type="password"][id*="Pwd"]',
              'input[type="password"][id*="pwd"]',
              'input[type="password"]',
              'input[name*="Password"]',
              'input[name*="password"]',
              'input[id*="Password"]',
              'input[id*="password"]',
              'input[placeholder*="密碼"]'
            ]);

            if (!accountInput || !passwordInput) {
              post({ t: 'status', m: '\u627e\u4e0d\u5230\u767b\u5165\u8868\u55ae...' });
              return false;
            }

            post({ t: 'status', m: '\u5df2\u627e\u5230\u767b\u5165\u8868\u55ae' });

            setValue(accountInput, ${JSON.stringify(credentials.account)});
            setValue(passwordInput, ${JSON.stringify(credentials.password)});
            var accountFilled = isFieldFilled(accountInput);
            var passwordFilled = isFieldFilled(passwordInput);
            post({ t: 'status', m: '登入欄位填寫狀態 account=' + accountFilled + ' password=' + passwordFilled });

            if (!accountFilled || !passwordFilled) {
              return false;
            }

            var studentRole = firstElement([
              'input[type="radio"][value="student"]',
              'input[type="radio"][value*="student"]',
              'input[type="radio"][id*="student"]',
              'input[type="radio"][name*="Role"][value*="student"]'
            ]);
            if (studentRole) {
              try {
                studentRole.checked = true;
                studentRole.dispatchEvent(new Event('change', { bubbles: true }));
              } catch (error) {}
            }

            var loginFn =
              typeof lfChkLogin === 'function'
                ? lfChkLogin
                : (typeof window !== 'undefined' && typeof window.lfChkLogin === 'function'
                  ? window.lfChkLogin
                  : null);

            if (loginFn) {
              waitingLoginHandler = false;
              post({ t: 'status', m: '\\u5df2\\u627e\\u5230\\u767b\\u5165\\u8655\\u7406\\u5668\\uff0c\\u767b\\u5165\\u4e2d...' });
              submitted = true;
              loginFn('student', 'zh-TW', false);
              return true;
            }

            if (!waitingLoginHandler) {
              waitingLoginHandler = true;
              post({ t: 'status', m: '\\u7b49\\u5f85\\u767b\\u5165\\u8173\\u672c...' });
            }

            var submit = firstElement([
              'button[type="submit"]',
              'input[type="submit"]',
              'button[id*="Login"]',
              'button[name*="Login"]',
              'input[id*="Login"]',
              'input[name*="Login"]',
              'button[id*="SignIn"]',
              'input[id*="SignIn"]'
            ]) || firstByText(['\\u767b\\u5165', 'Login', 'Sign in']);

            if (submit) {
              post({ t: 'status', m: '\\u627e\\u5230\\u767b\\u5165\\u6309\\u9215\\uff0c\\u7b49\\u5f85\\u767b\\u5165\\u8655\\u7406\\u5668...' });
            }

            return !!submit;
          } catch (error) {
            finish({ t: 'err', m: (error && error.message) || 'Form login failed' });
            return true;
          }
        }

        function loginLoop(attempt) {
          if (completed) return;

          var authState = detectAuthenticatedState();
          if (authState.authenticated) {
            if (authState.signal !== 'inside_page') {
              post({ t: 'status', m: '\u5075\u6e2c\u5230\u5df2\u767b\u5165\uff0c\u4f46\u9801\u9762\u672a\u8f49\u81f3 inside.aspx\uff0c\u7e7c\u7e8c\u9032\u5165\u6821\u52d9\u7cfb\u7d71...' });
            }
            finish({ t: 'login_ok', signal: authState.signal });
            return;
          }

          if (!submitted) {
            if (submitLoginForm()) {
              setTimeout(function() {
                loginLoop(attempt + 1);
              }, 600);
              return;
            }

            if (attempt >= 20) {
              finish({ t: 'err', m: 'Login handler not ready' });
              return;
            }

            if (attempt === 0) {
              post({ t: 'status', m: '\\u6e96\\u5099\\u767b\\u5165...' });
            }

            setTimeout(function() {
              loginLoop(attempt + 1);
            }, 300);
            return;
          }

          if (detectLoginFailure()) {
            finish({ t: 'login_fail', m: '' });
            return;
          }

          if (attempt >= 8 && tryAuthenticatedFallbackNavigation()) {
            setTimeout(function() {
              loginLoop(attempt + 1);
            }, 800);
            return;
          }

          if (attempt >= 40) {
            finish({ t: 'err', m: 'Login redirect timed out (no authenticated shell detected)' });
            return;
          }

          setTimeout(function() {
            loginLoop(attempt + 1);
          }, 400);
        }

        loginLoop(0);
      } catch (error) {
        post({ t: 'err', m: (error && error.message) || 'Login script failed' });
      }
    })();
    true;
  `;
}

export function buildOpenLinkScript(code: string): string {
  return `
    (function() {
      ${baseHelpers}

      try {
        window.open = function(url) {
          var resolvedUrl = url;
          try {
            resolvedUrl = new URL(url, window.location.href).toString();
          } catch (error) {}
          post({ t: 'popup', url: resolvedUrl });
          return null;
        };

        var nameText = '';
        var nameSpan = firstElement(['#lblUserName', '.user-name', '.login-name', '[id*="UserName"]', '[class*="UserName"]']);
        if (nameSpan) {
          nameText = (nameSpan.innerText || nameSpan.textContent || '')
            .replace(/\s*(?:同學|您好).*$/u, '')
            .trim();
        }
        if (!nameText) {
          try {
            var bodyText = (document.body && (document.body.innerText || document.body.textContent) || '').replace(/\s+/g, ' ');
            var match = bodyText.match(/([^\s，,]{2,12})\s*同學/u);
            if (match && match[1]) {
              nameText = match[1].trim();
            }
          } catch (error) {}
        }
        if (nameText) {
          post({ t: 'user_name', n: nameText });
        }

        // 嘗試 gfOpenLink
        if (typeof gfOpenLink === 'function') {
          post({ t: 'status', m: '使用 gfOpenLink 開啟課輔...' });
          gfOpenLink(${JSON.stringify(code)}, 'service', '0', '00', '', '');
          return;
        }

        // 如果 gfOpenLink 不可用，等待並重試
        var attempts = 0;
        var maxAttempts = 20;
        
        function tryOpen() {
          attempts++;
          
          if (typeof gfOpenLink === 'function') {
            post({ t: 'status', m: 'gfOpenLink 已就緒，開啟課輔...' });
            gfOpenLink(${JSON.stringify(code)}, 'service', '0', '00', '', '');
            return;
          }

          // 嘗試直接找連結
          var link = firstElement([
            '[onclick*="gfOpenLink"]',
            '[onclick*="${code}"]',
            'a[href*="${code}"]',
            'a[data-code="${code}"]'
          ]);

          if (link) {
            post({ t: 'status', m: '找到課輔連結，開啟中...' });
            click(link);
            return;
          }

          if (attempts >= maxAttempts) {
            post({ t: 'err', m: 'gfOpenLink not found and no link found for code ${code} after ' + attempts + ' attempts' });
            return;
          }

          if (attempts % 5 === 0) {
            post({ t: 'status', m: '等待 gfOpenLink 載入... (' + attempts + '/' + maxAttempts + ')' });
          }

          setTimeout(tryOpen, 500);
        }

        tryOpen();
      } catch (error) {
        post({ t: 'err', m: (error && error.message) || 'Open link failed' });
      }
    })();
    true;
  `;
}

export function buildSchedulePageScript(): string {
  return `
    (function() {
      ${baseHelpers}

      try {
        var frameLink = firstElement([
          'iframe[src*="queryByStudent"]',
          'frame[src*="queryByStudent"]',
          'iframe[src*="queryByStudent.asp"]',
          'frame[src*="queryByStudent.asp"]'
        ]);
        if (frameLink && frameLink.src && !/queryByStudent/i.test(window.location.href)) {
          post({ t: 'status', m: '??舫?售?蹓遴???..' });
          window.location.href = frameLink.src;
          return;
        }

        var entry = firstElement([
          'td[onclick*="queryByStudent"]',
          '[onclick*="queryByStudent"]',
          'a[href*="queryByStudent"]',
          'a[href*="queryByStudent.asp"]'
        ]) || firstByText(['queryByStudent', '\\\\u8ab2\\\\u8868']);

        if (entry) {
          post({ t: 'status', m: '????方??鈭亙眺...' });
          click(entry);
        }

        setTimeout(function() {
          var search = firstElement([
            '#Search',
            'input[type="submit"]',
            'input[value*="\\\\u67e5\\\\u8a62"]',
            'button[id*="Search"]',
            'button[name*="Search"]'
          ]) || firstByText(['\\\\u67e5\\\\u8a62', 'Search']);

          if (search) {
            post({ t: 'status', m: '?鈭亙眺?方???..' });
            click(search);
          }

          setTimeout(function() {
            var picked = findDoc(function(doc, html) {
              var href = '';
              try {
                href = doc.location ? doc.location.href : '';
              } catch (error) {}
              return /queryByStudent/i.test(href) || /pubContent|\\\\u661f\\\\u671f|\\\\u7bc0/.test(html);
            });

            post({
              t: 'html',
              h: picked && picked.html ? picked.html : (document.documentElement ? document.documentElement.outerHTML : '')
            });
          }, 2500);
        }, entry ? 1200 : 400);
      } catch (error) {
        post({ t: 'err', m: (error && error.message) || 'Schedule sync script failed' });
      }
    })();
    true;
  `;
}

export function buildGradePageScript(): string {
  return `
    (function() {
      ${baseHelpers}

      try {
        var frameLink = firstElement([
          'iframe[src*="scoreListAll"]',
          'frame[src*="scoreListAll"]',
          'iframe[src*="StudentScore"]',
          'frame[src*="StudentScore"]',
          'iframe[src*="studentscore"]',
          'frame[src*="studentscore"]'
        ]);
        if (frameLink && frameLink.src && !/scoreListAll|StudentScore|studentscore/i.test(window.location.href)) {
          post({ t: 'status', m: '??????蹓遴???..' });
          window.location.href = frameLink.src;
          return;
        }

        var historyTab = firstElement([
          'td[onclick*="scoreListAll"]',
          '[onclick*="StudentScore"]',
          '[onclick*="studentscore"]',
          'a[href*="scoreListAll"]',
          'a[href*="StudentScore"]',
          'a[href*="studentscore"]'
        ]) || firstByText([
          '\\\\u6b77\\\\u5e74\\\\u6210\\\\u7e3e',
          '\\\\u5b78\\\\u671f\\\\u6210\\\\u7e3e',
          '\\\\u6210\\\\u7e3e\\\\u67e5\\\\u8a62'
        ]);

        if (historyTab) {
          post({ t: 'status', m: '?????????...' });
          click(historyTab);
        }

        setTimeout(function() {
          var search = firstElement([
            '#Search',
            'input[type="submit"]',
            'input[value*="\\\\u67e5\\\\u8a62"]',
            'button[id*="Search"]',
            'button[name*="Search"]'
          ]) || firstByText(['\\\\u67e5\\\\u8a62', 'Search']);

          if (search) {
            post({ t: 'status', m: '?鈭亙眺?????..' });
            click(search);
          }

          setTimeout(function() {
            var picked = findDoc(function(doc, html) {
              var href = '';
              try {
                href = doc.location ? doc.location.href : '';
              } catch (error) {}
              return /scoreListAll|StudentScore|studentscore/i.test(href) ||
                /\\\\u5e73\\\\u5747|\\\\u73ed\\\\u6392\\\\u540d|\\\\u7cfb\\\\u6392\\\\u540d|\\\\u6210\\\\u7e3e/.test(html);
            });

            post({
              t: 'html',
              h: picked && picked.html ? picked.html : (document.documentElement ? document.documentElement.outerHTML : '')
            });
          }, 3000);
        }, historyTab ? 1500 : 600);
      } catch (error) {
        post({ t: 'err', m: (error && error.message) || 'Grade sync script failed' });
      }
    })();
    true;
  `;
}

export function buildServiceOpenScript(code: '1208' | '1220' | '1202'): string {
  const textPatterns =
    code === '1208'
      ? "'\\u8ab2\\u8868', '\\u8ab2\\u7a0b', '\\u67e5\\u8a62\\u8ab2\\u8868'"
      : code === '1202'
        ? "'\\u8ab2\\u696d\\u8f14\\u5c0e', '\\u8ab2\\u696d\\u8f14\\u5c0e\\u7cfb\\u7d71'"
        : "'\\u6210\\u7e3e', '\\u6b77\\u5e74\\u6210\\u7e3e', '\\u6210\\u7e3e\\u67e5\\u8a62'";
  const fallbackTargetUrl =
    code === '1208'
      ? 'https://ap1.pccu.edu.tw/queryCourse/queryByStudent.asp?QuerySource=queryCourse'
      : code === '1202'
        ? 'https://icas.pccu.edu.tw/cfp/'
        : '';
  const targetReadyPattern =
    code === '1208'
      ? 'TransUrl\\.aspx\\?PrjNo=1208|queryByStudent'
      : code === '1202'
        ? 'TransUrl\\.aspx\\?PrjNo=1202|icas\\.pccu\\.edu\\.tw'
        : 'index_score|scoreListAll|StudentScore|studentscore';

  return `
    (function() {
      ${baseHelpers}

      try {
        window.open = function(url) {
          var resolvedUrl = url;
          try {
            resolvedUrl = new URL(url, window.location.href).toString();
          } catch (error) {}
          post({ t: 'popup', url: resolvedUrl });
          return null;
        };

        var nameText = '';
        var nameSpan = firstElement(['#lblUserName', '.user-name', '.login-name', '[id*="UserName"]', '[class*="UserName"]']);
        if (nameSpan) {
          nameText = (nameSpan.innerText || nameSpan.textContent || '')
            .replace(/\s*(?:同學|您好).*$/u, '')
            .trim();
        }
        if (!nameText) {
          try {
            var bodyText = (document.body && (document.body.innerText || document.body.textContent) || '').replace(/\s+/g, ' ');
            var match = bodyText.match(/([^\s，,]{2,12})\s*同學/u);
            if (match && match[1]) {
              nameText = match[1].trim();
            }
          } catch (error) {}
        }
        if (nameText) {
          post({ t: 'user_name', n: nameText });
        }

        var attempts = 0;
        var fallbackTargetUrl = ${JSON.stringify(fallbackTargetUrl)};
        var gfOpenLinkTriggered = false;
        var domLauncherTriggered = false;
        var fallbackPosted = false;

        function tryDomLauncher() {
          var launcher = firstElement([
            '[onclick*=${JSON.stringify(code)}]',
            'a[href*=${JSON.stringify(code)}]',
            'button[data-code*=${JSON.stringify(code)}]'
          ]);

          if (!launcher) {
            launcher = firstByText([${textPatterns}]);
          }

          return launcher ? click(launcher) : false;
        }

        function openLoop() {
          attempts += 1;

           var currentUrl = '';
           try {
             currentUrl = String(window.location.href || '');
           } catch (error) {}

            if (new RegExp(${JSON.stringify(targetReadyPattern)}, 'i').test(currentUrl)) {
              post({ t: 'status', m: '\u5075\u6e2c\u5230\u5df2\u9032\u5165\u76ee\u6a19\u529f\u80fd\u9801\uff0c\u7e7c\u7e8c\u8f09\u5165...' });
              post({ t: 'popup', url: currentUrl });
              return;
            }

          if (typeof gfOpenLink === 'function' && !gfOpenLinkTriggered) {
            gfOpenLinkTriggered = true;
            gfOpenLink(${JSON.stringify(code)}, 'service', '0', '00', '', '');
            setTimeout(openLoop, 300);
            return;
          }

          if (!domLauncherTriggered && tryDomLauncher()) {
            domLauncherTriggered = true;
            setTimeout(openLoop, 300);
            return;
          }

          if (fallbackTargetUrl && !fallbackPosted && attempts >= 6) {
            fallbackPosted = true;
            post({ t: 'status', m: '\u5617\u8a66\u76f4\u63a5\u9032\u5165\u76ee\u6a19\u9801...' });
            post({ t: 'popup', url: fallbackTargetUrl });
            return;
          }

          if (attempts >= 40) {
            post({ t: 'err', m: 'gfOpenLink not ready' });
            return;
          }

          if (attempts === 1) {
            post({ t: 'status', m: '\\u7b49\\u5f85\\u529f\\u80fd\\u5165\\u53e3...' });
          }

          setTimeout(openLoop, 300);
        }

        openLoop();
      } catch (error) {
        post({ t: 'err', m: (error && error.message) || 'Open link failed' });
      }
    })();
    true;
  `;
}

export function buildRobustSchedulePageScript(): string {
  return buildAdaptiveSchedulePageScript();
}

export function buildAdaptiveSchedulePageScript(): string {
  return `
    (function() {
      ${baseHelpers}

      try {
        var syncState = window.__PCCU_ADAPTIVE_SCHEDULE_SYNC__;
        if (!syncState) {
          syncState = window.__PCCU_ADAPTIVE_SCHEDULE_SYNC__ = {
            active: false,
            clickedEntry: false,
            clickedSearch: false
          };
        }

        if (syncState.active) {
          syncState.active = false;
        }

        syncState.active = true;
        post({ t: 'status', m: '\u958b\u59cb\u540c\u6b65\u8ab2\u8868\u9801\u9762...' });
        var attempts = 0;
        var clickedEntry = !!syncState.clickedEntry;
        var clickedSearch = !!syncState.clickedSearch;

        function release() {
          syncState.active = false;
          syncState.clickedEntry = clickedEntry;
          syncState.clickedSearch = clickedSearch;
        }

        function postResult(payload) {
          release();
          post(payload);
        }

        function normalizeText(value) {
          return String(value || '').replace(/\\u3000/g, ' ').replace(/\\s+/g, ' ').trim();
        }

        function textOfNode(node) {
          return normalizeText(node && (node.innerText || node.textContent || node.value || ''));
        }

        function htmlToLines(html) {
          var text = String(html || '')
            .replace(/<br\\s*\\/?>/gi, '\\n')
            .replace(/<\\/(?:div|p|li|tr|td|th|section|article|h[1-6])>/gi, '\\n')
            .replace(/<[^>]+>/g, ' ');
          var rawLines = text.split(/\\r?\\n/);
          var lines = [];
          for (var i = 0; i < rawLines.length; i += 1) {
            var line = normalizeText(rawLines[i]);
            if (line) lines.push(line);
          }
          return lines;
        }

        function hasRequirementToken(text) {
          return /(?:\\(\\u5fc5\\)|\\(\\u9078\\)|\\u5fc5\\u4fee|\\u9078\\u4fee|(?:^|\\s)\\u5fc5(?=\\s)|(?:^|\\s)\\u9078(?=\\s))/.test(text || '');
        }

        function isRequirementOnly(text) {
          return /^(?:\\(\\u5fc5\\)|\\(\\u9078\\)|\\u5fc5\\u4fee|\\u9078\\u4fee|\\u5fc5|\\u9078)$/.test(normalizeText(text));
        }

        function hasDayToken(text) {
          return /(?:\\u661f\\u671f|\\u9031)[\\u65e5\\u5929\\u4e00\\u4e8c\\u4e09\\u56db\\u4e94\\u516d]/.test(text || '');
        }

        function hasPeriodToken(text) {
          return /(?:\\u7b2c\\s*\\d{1,2}(?:\\s*[-~\\uff5e\\u5230\\u81f3]\\s*\\d{1,2})?\\s*\\u7bc0?|\\d{1,2}\\s*(?:[-~\\uff5e\\u5230\\u81f3]\\s*\\d{1,2}\\s*)?\\u7bc0)/.test(text || '');
        }

        function hasScheduleLayout(html, text) {
          return /pubContent|pubTdItem_Period|queryByStudent/i.test(html || '') ||
            ((hasRequirementToken(text) || hasDayToken(text)) && /\\u7bc0|\\u8ab2\\u8868/.test(text || ''));
        }

        function looksLikeTeacher(value) {
          return !!value &&
            !/[0-9]/.test(value) &&
            value.length <= 16 &&
            !/\\u661f\\u671f|\\u9031|\\u7bc0|\\u6559\\u5ba4|\\u5730\\u9ede/.test(value);
        }

        function looksLikeLocation(value) {
          return !!value &&
            (/(?:[A-Za-z]?\\d{2,4}[A-Za-z]?|\\d{2,4}-?\\d*|\\u9928|\\u6a13|\\u5ba4|\\u6559\\u5ba4|\\u6821\\u5340|\\u83ef\\u5ca1|\\u5927\\u6069|\\u5927\\u7fa9|\\u5927\\u5b5d|\\u5927\\u8ce2|\\u5927\\u5178|\\u5927\\u5fd7)/.test(value));
        }

        var dayMap = {
          '\\u65e5': 0,
          '\\u5929': 0,
          '\\u4e00': 1,
          '\\u4e8c': 2,
          '\\u4e09': 3,
          '\\u56db': 4,
          '\\u4e94': 5,
          '\\u516d': 6
        };

        function parseDayPeriod(value) {
          var compact = normalizeText(value).replace(/\\s+/g, '');
          var dayMatch =
            compact.match(/(?:\\u661f\\u671f|\\u9031)([\\u65e5\\u5929\\u4e00\\u4e8c\\u4e09\\u56db\\u4e94\\u516d])/) ||
            compact.match(/([\\u65e5\\u5929\\u4e00\\u4e8c\\u4e09\\u56db\\u4e94\\u516d])(?:\\u66dc|\\u9031|\\u661f\\u671f)/);
          var periodMatch = compact.match(/\\u7b2c?(\\d{1,2})(?:\\s*[-~\\uff5e\\u5230\\u81f3]\\s*(\\d{1,2}))?\\u7bc0?/);
          if (!dayMatch || !periodMatch) return null;

          var dayOfWeek = dayMap[dayMatch[1]];
          var startPeriod = parseInt(periodMatch[1], 10);
          var endPeriod = parseInt(periodMatch[2] || periodMatch[1], 10);
          if (typeof dayOfWeek === 'undefined' || !startPeriod || !endPeriod) return null;

          return {
            dayOfWeek: dayOfWeek,
            startPeriod: startPeriod,
            endPeriod: endPeriod
          };
        }

        function parseCourseTitle(line) {
          var raw = normalizeText(line);
          if (!raw) return null;

          var required = true;
          if (/^(?:\\(\\u9078\\)|\\u9078\\u4fee|\\u9078\\s)/.test(raw)) required = false;
          if (/^(?:\\(\\u5fc5\\)|\\u5fc5\\u4fee|\\u5fc5\\s)/.test(raw)) required = true;

          raw = raw
            .replace(/^(?:\\(\\u5fc5\\)|\\(\\u9078\\)|\\u5fc5\\u4fee|\\u9078\\u4fee|\\u5fc5\\s+|\\u9078\\s+)/, '')
            .replace(/(?:\\u661f\\u671f|\\u9031)[\\u65e5\\u5929\\u4e00\\u4e8c\\u4e09\\u56db\\u4e94\\u516d].*$/, '')
            .replace(/\\u7b2c?\\s*\\d{1,2}(?:\\s*[-~\\uff5e\\u5230\\u81f3]\\s*\\d{1,2})?\\s*\\u7bc0?.*$/, '')
            .replace(/\\s*\\(\\d+\\)\\s*$/, '')
            .trim();

          var type = '';
          var match = raw.match(/^(.+?)\\s+([A-Z0-9]{3,8})\\s+(.+)$/);
          if (match) {
            type = normalizeText(match[1]);
            raw = normalizeText(match[3]);
          }

          if (!raw) return null;
          return {
            name: raw,
            required: required,
            type: type
          };
        }

        function parseCourseTitleFromLines(lines) {
          var requirementOnly = '';

          for (var i = 0; i < lines.length; i += 1) {
            var line = normalizeText(lines[i]);
            if (!line) continue;
            if (!requirementOnly && isRequirementOnly(line)) requirementOnly = line;
            if (hasDayToken(line) || hasPeriodToken(line)) continue;
            if (hasRequirementToken(line) && !isRequirementOnly(line)) {
              var direct = parseCourseTitle(line);
              if (direct && direct.name) {
                return { course: direct, line: line, prefix: '' };
              }
            }
          }

          for (var j = 0; j < lines.length; j += 1) {
            var rawLine = normalizeText(lines[j]);
            if (!rawLine || isRequirementOnly(rawLine) || hasDayToken(rawLine) || hasPeriodToken(rawLine)) continue;
            if (!requirementOnly && (looksLikeTeacher(rawLine) || looksLikeLocation(rawLine))) continue;

            var candidate = requirementOnly ? requirementOnly + ' ' + rawLine : rawLine;
            var parsed = parseCourseTitle(candidate);
            if (parsed && parsed.name) {
              return { course: parsed, line: rawLine, prefix: requirementOnly };
            }
          }

          return { course: null, line: '', prefix: requirementOnly };
        }

        function splitTeacherLocation(lines) {
          var source = Array.isArray(lines) ? lines.join(' ') : String(lines || '');
          var cleaned = normalizeText(
            source
              .replace(/^(?:\\u6559\\u5e2b|\\u8001\\u5e2b|\\u6388\\u8ab2\\u6559\\u5e2b)[:\\uff1a]?\\s*/, '')
              .replace(/^(?:\\u5730\\u9ede|\\u6559\\u5ba4)[:\\uff1a]?\\s*/, '')
          );

          if (!cleaned) return { teacher: '', location: '' };

          var separators = ['\\u00b7', '|', '\\uff5c', '/', '\\uff0f'];
          for (var i = 0; i < separators.length; i += 1) {
            var separator = separators[i];
            if (cleaned.indexOf(separator) === -1) continue;
            var rawParts = cleaned.split(separator);
            var parts = [];
            for (var j = 0; j < rawParts.length; j += 1) {
              var part = normalizeText(rawParts[j]);
              if (part) parts.push(part);
            }
            if (parts.length < 2) continue;

            var teacher = '';
            var location = '';
            for (var k = 0; k < parts.length; k += 1) {
              if (!teacher && looksLikeTeacher(parts[k])) teacher = parts[k];
              if (!location && looksLikeLocation(parts[k])) location = parts[k];
            }
            if (!teacher) teacher = parts[0];
            if (!location) location = parts[parts.length - 1];
            return { teacher: teacher, location: location };
          }

          var rawTokens = cleaned.split(/\\s+/);
          var tokens = [];
          for (var m = 0; m < rawTokens.length; m += 1) {
            if (rawTokens[m]) tokens.push(rawTokens[m]);
          }
          if (tokens.length === 1) {
            return {
              teacher: looksLikeTeacher(tokens[0]) ? tokens[0] : '',
              location: looksLikeLocation(tokens[0]) ? tokens[0] : ''
            };
          }

          var teacherGuess = '';
          for (var n = 0; n < tokens.length; n += 1) {
            if (looksLikeTeacher(tokens[n])) {
              teacherGuess = tokens[n];
              break;
            }
          }

          var locationParts = [];
          for (var p = 0; p < tokens.length; p += 1) {
            if (tokens[p] !== teacherGuess) locationParts.push(tokens[p]);
          }

          return {
            teacher: teacherGuess || tokens[0] || '',
            location: locationParts.join(' ') || (looksLikeLocation(tokens[0]) ? tokens[0] : '')
          };
        }

        function isScheduleLine(line) {
          return !!parseDayPeriod(line);
        }

        function sameCourse(a, b) {
          return a.name === b.name &&
            a.dayOfWeek === b.dayOfWeek &&
            a.required === b.required &&
            a.type === b.type &&
            a.teacher === b.teacher &&
            a.location === b.location;
        }

        function pushCourse(target, course) {
          for (var i = 0; i < target.length; i += 1) {
            var existing = target[i];
            if (!sameCourse(existing, course)) continue;
            if (course.startPeriod <= existing.endPeriod + 1 && course.endPeriod >= existing.startPeriod - 1) {
              existing.startPeriod = Math.min(existing.startPeriod, course.startPeriod);
              existing.endPeriod = Math.max(existing.endPeriod, course.endPeriod);
              return;
            }
          }
          target.push(course);
        }

        function finalizeCourses(courses) {
          var dayLabels = ['\\u65e5', '\\u4e00', '\\u4e8c', '\\u4e09', '\\u56db', '\\u4e94', '\\u516d'];
          courses.sort(function(a, b) {
            if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
            return a.startPeriod - b.startPeriod;
          });

          var result = [];
          for (var i = 0; i < courses.length; i += 1) {
            var course = courses[i];
            var range = course.startPeriod === course.endPeriod
              ? String(course.startPeriod)
              : course.startPeriod + '-' + course.endPeriod;

            result.push({
              name: course.name,
              teacher: course.teacher || '',
              location: course.location || '',
              required: !!course.required,
              type: course.type || '',
              dayOfWeek: course.dayOfWeek,
              periodRange: '\\u661f\\u671f' + (dayLabels[course.dayOfWeek] || '') + ' \\u7b2c ' + range + ' \\u7bc0',
              startPeriod: course.startPeriod,
              endPeriod: course.endPeriod
            });
          }

          return result;
        }

        function directCells(tr) {
          var cells = [];
          var children = tr && tr.children ? tr.children : [];
          for (var i = 0; i < children.length; i += 1) {
            var child = children[i];
            if (!child || !child.tagName) continue;
            if (String(child.tagName).toLowerCase() === 'td') cells.push(child);
          }
          return cells;
        }

        function extractCoursesFromTable(table) {
          var courses = [];
          var rows = table ? table.querySelectorAll('tr') : [];

          for (var i = 0; i < rows.length; i += 1) {
            var row = rows[i];
            var allCells = directCells(row);
            if (!allCells.length) continue;

            var periodSource = textOfNode(allCells[0]) || textOfNode(allCells[1]);
            var periodMatch = periodSource.match(/\\d{1,2}/);
            if (!periodMatch) continue;

            var period = parseInt(periodMatch[0], 10);
            if (!period) continue;

            var dayCells = [];
            for (var j = 0; j < allCells.length; j += 1) {
              var className = String(allCells[j].className || '');
              if (className.indexOf('pubContent') !== -1) dayCells.push(allCells[j]);
            }
            if (!dayCells.length) dayCells = allCells.slice(2);
            if (!dayCells.length) continue;

            for (var dayIndex = 0; dayIndex < dayCells.length; dayIndex += 1) {
              var cell = dayCells[dayIndex];
              var cellText = textOfNode(cell);
              if (!cellText || cellText === '-' || cellText === '_') continue;

              var lines = htmlToLines(cell.innerHTML || cellText);
              if (!lines.length) continue;

              var titleInfo = parseCourseTitleFromLines(lines);
              var title = titleInfo.course;
              if (!title || !title.name) continue;

              var details = [];
              for (var k = 0; k < lines.length; k += 1) {
                var line = normalizeText(lines[k]);
                if (!line) continue;
                if (line === titleInfo.line) continue;
                if (titleInfo.prefix && line === titleInfo.prefix) continue;
                if (isScheduleLine(line)) continue;
                details.push(line);
              }

              var info = splitTeacherLocation(details);
              pushCourse(courses, {
                name: title.name,
                teacher: info.teacher,
                location: info.location,
                required: title.required,
                type: title.type,
                dayOfWeek: dayIndex + 1,
                startPeriod: period,
                endPeriod: period
              });
            }
          }

          return courses;
        }

        function extractCoursesFromCards(doc) {
          var nodes = doc ? doc.querySelectorAll('div, li, article, section, tr') : [];
          var courses = [];
          var blocks = [];
          var seen = {};

          for (var i = 0; i < nodes.length; i += 1) {
            var node = nodes[i];
            var text = textOfNode(node);
            if (!text || text.length < 8 || text.length > 320) continue;
            if (!hasDayToken(text) || !hasPeriodToken(text)) continue;

            var signature = text.replace(/\\s+/g, '');
            if (seen[signature]) continue;
            seen[signature] = true;

            var lines = htmlToLines(node.innerHTML || node.outerHTML || text);
            if (!lines.length) continue;

            var titleInfo = parseCourseTitleFromLines(lines);
            var title = titleInfo.course;
            if (!title || !title.name) continue;

            var schedule = null;
            for (var j = 0; j < lines.length; j += 1) {
              schedule = parseDayPeriod(lines[j]);
              if (schedule) break;
            }
            if (!schedule && titleInfo.line) schedule = parseDayPeriod(titleInfo.line);
            if (!schedule) continue;

            var details = [];
            for (var k = 0; k < lines.length; k += 1) {
              var line = normalizeText(lines[k]);
              if (!line) continue;
              if (line === titleInfo.line) continue;
              if (titleInfo.prefix && line === titleInfo.prefix) continue;
              if (isScheduleLine(line)) continue;
              details.push(line);
            }

            var info = splitTeacherLocation(details);
            pushCourse(courses, {
              name: title.name,
              teacher: info.teacher,
              location: info.location,
              required: title.required,
              type: title.type,
              dayOfWeek: schedule.dayOfWeek,
              startPeriod: schedule.startPeriod,
              endPeriod: schedule.endPeriod
            });

            if (node.outerHTML) blocks.push(node.outerHTML);
          }

          return {
            courses: courses,
            html: blocks.length ? '<div data-schedule-source="cards">' + blocks.join('') + '</div>' : ''
          };
        }

        function extractScheduleDataFromDoc(doc) {
          try {
            var bestHtml = '';
            var collected = [];
            var tables = doc.querySelectorAll('table');

            for (var i = 0; i < tables.length; i += 1) {
              var table = tables[i];
              var tableHtml = table.outerHTML || '';
              var tableText = textOfNode(table);
              if (!hasScheduleLayout(tableHtml, tableText)) continue;

              var tableCourses = extractCoursesFromTable(table);
              if ((!bestHtml || tableCourses.length > 0) && tableHtml) bestHtml = tableHtml;
              for (var j = 0; j < tableCourses.length; j += 1) {
                pushCourse(collected, tableCourses[j]);
              }
            }

            var cardResult = extractCoursesFromCards(doc);
            if (!bestHtml && cardResult.html) bestHtml = cardResult.html;
            for (var k = 0; k < cardResult.courses.length; k += 1) {
              pushCourse(collected, cardResult.courses[k]);
            }

            return {
              courses: finalizeCourses(collected),
              html: bestHtml
            };
          } catch (error) {
            return {
              courses: [],
              html: ''
            };
          }
        }

        function currentHtml() {
          return document.documentElement ? document.documentElement.outerHTML : '';
        }

        function postScheduleProbe(label, doc, extracted, search, form) {
          try {
            var targetDoc = doc || document;
            var href = getDocUrl(targetDoc);
            var markup = targetDoc.documentElement ? targetDoc.documentElement.outerHTML : '';
            var forms = 0;
            var controls = 0;
            var searchFlag = '';
            var searchValue = '';
            var searchText = '';
            var action = '';
            var method = '';

            try { forms = targetDoc.querySelectorAll('form').length; } catch (error) {}
            try { controls = targetDoc.querySelectorAll('input, button, select, a[onclick]').length; } catch (error) {}
            try { searchFlag = form ? String((form.querySelector('[name="hidChkSearch"]') || {}).value || '') : ''; } catch (error) {}
            try { searchValue = search ? String(search.getAttribute('value') || search.value || '') : ''; } catch (error) {}
            try { searchText = search ? textOfNode(search) : ''; } catch (error) {}
            try { action = form ? String(form.getAttribute('action') || '') : ''; } catch (error) {}
            try { method = form ? String(form.getAttribute('method') || '') : ''; } catch (error) {}

            post({
              t: 'schedule_probe',
              m:
                label +
                ' url=' + href +
                ' html=' + String(markup || '').length +
                ' forms=' + forms +
                ' controls=' + controls +
                ' courses=' + ((extracted && extracted.courses && extracted.courses.length) || 0) +
                ' hasSearch=' + !!search +
                ' searchText=' + searchText +
                ' searchValue=' + searchValue +
                ' method=' + method +
                ' action=' + action +
                ' searchFlag=' + searchFlag
            });
          } catch (error) {}
        }

        function pageText(doc) {
          try {
            return normalizeText((doc.body && (doc.body.innerText || doc.body.textContent)) || '');
          } catch (error) {
            return '';
          }
        }

        function getDocUrl(doc) {
          try {
            return String((doc && doc.location && doc.location.href) || '');
          } catch (error) {
            return '';
          }
        }

        function resolveUrl(baseUrl, maybeRelative) {
          if (!maybeRelative) return '';
          try {
            return new URL(maybeRelative, baseUrl || window.location.href).toString();
          } catch (error) {
            return maybeRelative;
          }
        }

        function hasReloginMarker(text) {
          return /\u903e\u6642\u904e\u671f|\u8acb\u91cd\u65b0\u767b\u5165|\u8acb\u5148\u767b\u5165|login has expired|please login again|session expired/i.test(text || '');
        }

        function hasNoDataMarker(text) {
          return /\u67e5\u7121\u8cc7\u6599|\u7121\u8ab2\u8868\u8cc7\u6599|\u76ee\u524d\u7121\u8cc7\u6599|\u67e5\u8a62\u689d\u4ef6\u4e0d\u53ef\u7a7a\u767d/i.test(text || '');
        }

        function hasQueryByStudentMarker(html, href) {
          return /queryByStudent/i.test(href || '') || /name=["']queryByStudent["']|queryByStudent\.asp/i.test(html || '');
        }

        function hasScheduleResultMarker(html) {
          var markup = String(html || '');
          return /pubTdItem_Period|PrintTitle/.test(markup) &&
            /(?:\u661f\u671f|\u9031)[\u65e5\u5929\u4e00\u4e8c\u4e09\u56db\u4e94\u516d]/.test(markup) &&
            /(?:\(\u5fc5\)|\(\u9078\)|\u5fc5\u4fee|\u9078\u4fee)/.test(markup);
        }

        function classifyScheduleState(doc, html) {
          var href = getDocUrl(doc);
          var text = pageText(doc);
          var markup = String(html || '');

          if (hasReloginMarker(text) || hasReloginMarker(markup)) {
            return 'relogin';
          }

          if (hasScheduleResultMarker(markup)) {
            return 'ready';
          }

          if (hasNoDataMarker(text) || hasNoDataMarker(markup)) {
            return 'no_data';
          }

          if (hasQueryByStudentMarker(markup, href)) {
            return 'query_page';
          }

          return 'unknown';
        }

        function findScheduleWorkDoc() {
          return findDoc(function(doc, html) {
            return classifyScheduleState(doc, html) !== 'unknown';
          });
        }

        function findExactTextNode(labels, selector) {
          var normalized = {};
          for (var i = 0; i < labels.length; i += 1) {
            normalized[normalizeText(labels[i])] = true;
          }

          var allDocs = docs();
          var nodeSelector = selector || 'a, button, input[type="button"], input[type="submit"], td, th, span, div, label';
          for (var d = 0; d < allDocs.length; d += 1) {
            try {
              var nodes = allDocs[d].querySelectorAll(nodeSelector);
              for (var n = 0; n < nodes.length; n += 1) {
                var node = nodes[n];
                var text = normalizeText(node && (node.value || node.innerText || node.textContent || ''));
                if (text && normalized[text]) return node;
              }
            } catch (error) {}
          }

          return null;
        }

        function compactScheduleText(value) {
          return normalizeText(value).replace(/\\s+/g, '');
        }

        function scheduleEntryTextMatches(text) {
          var compact = compactScheduleText(text);
          if (!compact || compact.length < 4 || compact.length > 90) return false;

          var hasSchedule = /\\u8ab2\\u8868/.test(compact);
          var hasStudentish = /\\u5b78\\u751f|\\u500b\\u4eba|\\u6211\\u7684/.test(compact);
          var hasQueryAction = /\\u67e5\\u8a62|\\u67e5|\\u9032\\u5165|\\u958b\\u555f/.test(compact);
          var excluded =
            /\\u6559\\u5e2b|\\u6559\\u5ba4|\\u6210\\u7e3e|\\u6b77\\u5e74|\\u8ab2\\u7a0b\\u5927\\u7db1/.test(compact);

          return hasSchedule && !excluded && (hasStudentish || hasQueryAction) && (hasStudentish || compact.length <= 24);
        }

        function isClickableNode(node) {
          if (!node || !node.tagName) return false;
          var tag = String(node.tagName || '').toUpperCase();
          if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT') return true;
          try {
            if (node.getAttribute('onclick')) return true;
            if (node.getAttribute('href')) return true;
            if (String(node.getAttribute('role') || '').toLowerCase() === 'button') return true;
          } catch (error) {}
          return false;
        }

        function firstClickableDescendant(node) {
          if (!node || !node.querySelector) return null;
          try {
            return node.querySelector('a[href], button, input[type="button"], input[type="submit"], [onclick], [role="button"]');
          } catch (error) {
            return null;
          }
        }

        function closestClickableAncestor(node) {
          var current = node;
          var fallback = node;
          var depth = 0;

          while (current && current.nodeType === 1 && depth < 8) {
            if (isClickableNode(current)) return current;

            var descendant = firstClickableDescendant(current);
            if (descendant && scheduleEntryTextMatches(textOfNode(descendant))) {
              return descendant;
            }

            var tag = String(current.tagName || '').toUpperCase();
            if (/^(TD|TR|LI|DIV|SPAN|LABEL)$/.test(tag)) {
              fallback = current;
            }

            current = current.parentElement;
            depth += 1;
          }

          return fallback || node;
        }

        function findStudentScheduleEntryByText() {
          var allDocs = docs();
          var selector = 'a, button, input[type="button"], input[type="submit"], td, th, span, div, label, li, tr';

          for (var d = 0; d < allDocs.length; d += 1) {
            try {
              var nodes = allDocs[d].querySelectorAll(selector);
              for (var i = 0; i < nodes.length; i += 1) {
                var node = nodes[i];
                var text = textOfNode(node);
                if (!scheduleEntryTextMatches(text)) continue;
                return closestClickableAncestor(node);
              }
            } catch (error) {}
          }

          return null;
        }

        function describeScheduleEntryCandidates() {
          var allDocs = docs();
          var out = [];
          var seen = {};
          var selector = 'a, button, input[type="button"], input[type="submit"], td, th, span, div, label, li, tr';

          for (var d = 0; d < allDocs.length; d += 1) {
            try {
              var nodes = allDocs[d].querySelectorAll(selector);
              for (var i = 0; i < nodes.length; i += 1) {
                var node = nodes[i];
                var text = compactScheduleText(textOfNode(node));
                if (!text || text.length > 60 || (!/\\u8ab2\\u8868/.test(text) && !/queryByStudent/i.test(String(node.outerHTML || '')))) {
                  continue;
                }
                if (seen[text]) continue;
                seen[text] = true;
                out.push(text.slice(0, 36));
                if (out.length >= 5) return out.join(' | ');
              }
            } catch (error) {}
          }

          return out.join(' | ');
        }

        function findStudentScheduleEntry() {
          return firstElement([
            'td[onclick*="queryByStudent"]',
            '[onclick*="queryByStudent"]',
            'a[href*="queryByStudent"]',
            'a[href*="queryByStudent.asp"]'
          ]) ||
            findStudentScheduleEntryByText() ||
            findExactTextNode(['\\u5b78\\u751f\\u8ab2\\u8868\\u67e5\\u8a62', '\\u5b78\\u751f\\u8ab2\\u8868'], 'a, button, td, th, span, div, label');
        }

        function findScheduleSearchControl() {
          return firstElement([
            '#Search',
            'input[type="submit"][id*="Search"]',
            'input[type="submit"][name*="Search"]',
            'input[type="submit"][value*="\\u67e5\\u8a62"]',
            'input[type="button"][id*="Search"]',
            'input[type="button"][name*="Search"]',
            'input[type="button"][value*="\\u67e5\\u8a62"]',
            'button[type="submit"]',
            'button[id*="Search"]',
            'button[name*="Search"]',
            'button[onclick*="Search"]',
            'a[onclick*="Search"]',
            '[onclick*="doSearch"]',
            '[onclick*="query"]'
          ]) || findExactTextNode(['\\u67e5\\u8a62', 'Search'], 'input[type="submit"], input[type="button"], button, a');
        }

        function resolveNavTarget(doc, node) {
          if (!doc || !node) return '';

          function extractScheduleUrlFromScript(value) {
            var raw = String(value || '');
            var quoted = raw.match(/['"]([^'"]*queryByStudent[^'"]*)['"]/i);
            if (quoted && quoted[1]) return quoted[1];
            var direct = raw.match(/(?:^|[^\\w/])(queryByStudent\\.asp[^'")\\s<>]*)/i);
            return direct && direct[1] ? direct[1] : '';
          }

          try {
            var href = node.getAttribute('href') || '';
            if (href && /^javascript:/i.test(href)) {
              var hrefTarget = extractScheduleUrlFromScript(href);
              if (hrefTarget) return resolveUrl(getDocUrl(doc), hrefTarget);
            }
            if (href && !/^javascript:/i.test(href)) {
              return resolveUrl(getDocUrl(doc), href);
            }
          } catch (error) {}

          try {
            var src = node.getAttribute('src') || '';
            if (src) {
              return resolveUrl(getDocUrl(doc), src);
            }
          } catch (error) {}

          try {
            var onclick = node.getAttribute('onclick') || '';
            var scriptTarget = extractScheduleUrlFromScript(onclick);
            if (scriptTarget) {
              return resolveUrl(getDocUrl(doc), scriptTarget);
            }

            var match =
              onclick.match(/window\\.location\\.href\\s*=\\s*['"]([^'"]+)['"]/i) ||
              onclick.match(/location\\.href\\s*=\\s*['"]([^'"]+)['"]/i) ||
              onclick.match(/window\\.open\\(\\s*['"]([^'"]+)['"]/i);
            if (match && match[1]) {
              return resolveUrl(getDocUrl(doc), match[1]);
            }
          } catch (error) {}

          return '';
        }

        function navigateDoc(doc, targetUrl) {
          if (!targetUrl) return false;

          try {
            if (doc && doc.defaultView && doc.defaultView.location) {
              doc.defaultView.location.href = targetUrl;
              return true;
            }
          } catch (error) {}

          try {
            if (doc && doc.location) {
              doc.location.href = targetUrl;
              return true;
            }
          } catch (error) {}

          try {
            window.location.href = targetUrl;
            return true;
          } catch (error) {}

          return false;
        }

        function isScheduleMenuPage(url) {
          return /\\/queryCourse\\/(?:index|queryByCourse)\\.asp/i.test(url || '');
        }

        function navigateToStudentSchedulePage(doc) {
          var baseUrl = getDocUrl(doc) || window.location.href || 'https://ap1.pccu.edu.tw/queryCourse/index.asp';
          var targetUrl = resolveUrl(baseUrl, 'queryByStudent.asp?QuerySource=queryCourse');
          return navigateDoc(doc || document, targetUrl);
        }

        function findQueryForm(doc) {
          if (!doc) return null;

          try {
            return doc.querySelector('form[name="queryByStudent"], form[id="queryByStudent"], form[action*="queryByStudent"], form[name*="queryByStudent"], form[id*="queryByStudent"], form');
          } catch (error) {
            return null;
          }
        }

        function resolveFormAction(doc, form) {
          if (!form) {
            return resolveUrl(getDocUrl(doc), 'queryByStudent.asp?QuerySource=queryCourse');
          }

          var action = '';
          try {
            action = form.getAttribute('action') || '';
          } catch (error) {}

          if (!action) {
            action = 'queryByStudent.asp?QuerySource=queryCourse';
          }

          return resolveUrl(getDocUrl(doc), action);
        }

        function submitQueryForm(doc, form, search) {
          if (!doc || !form) return false;

          var searchAction = 'searchByStudent';

          try {
            var searchOnclick = search ? String(search.getAttribute('onclick') || '') : '';
            var searchMatch = searchOnclick.match(/ToSearch\\([^,]+,\\s*['"]([^'"]+)['"]/i);
            if (searchMatch && searchMatch[1]) {
              searchAction = searchMatch[1];
            }
          } catch (error) {}

          try {
            var searchFlag = form.querySelector('[name="hidChkSearch"]');
            if (searchFlag) {
              searchFlag.value = searchAction;
            }
          } catch (error) {}

          try {
            var actionUrl = resolveFormAction(doc, form);
            if (actionUrl) {
              form.setAttribute('action', actionUrl);
            }
          } catch (error) {}

          try {
            var method = (form.getAttribute('method') || 'post').toLowerCase();
            if (!method) {
              form.setAttribute('method', 'post');
            }
          } catch (error) {}

          try {
            if (search && click(search)) {
              return true;
            }
          } catch (error) {}

          try {
            var view = (doc && doc.defaultView) || window;
            if (view && typeof view.ToSearch === 'function') {
              view.ToSearch(form, searchAction);
              return true;
            }
          } catch (error) {}

          try {
            if (typeof form.requestSubmit === 'function') {
              form.requestSubmit();
              return true;
            }
          } catch (error) {}

          try {
            form.submit();
            return true;
          } catch (error) {
            return false;
          }
        }

        function readSearchSubmittedAt() {
          try {
            var raw = sessionStorage.getItem('__PCCU_SCHEDULE_SEARCH_TS__');
            var value = parseInt(raw || '0', 10);
            return value || 0;
          } catch (error) {
            return 0;
          }
        }

        function markSearchSubmitted() {
          try {
            sessionStorage.setItem('__PCCU_SCHEDULE_SEARCH_TS__', String(Date.now()));
          } catch (error) {}
        }

        function clearSearchSubmitted() {
          try {
            sessionStorage.removeItem('__PCCU_SCHEDULE_SEARCH_TS__');
          } catch (error) {}
        }

        function bestSchedulePayload() {
          var allDocs = docs();
          var best = { courses: [], html: '' };

          for (var i = 0; i < allDocs.length; i += 1) {
            var extracted = extractScheduleDataFromDoc(allDocs[i]);
            if (!best.html && extracted.html) best.html = extracted.html;
            if (extracted.courses.length > best.courses.length) best = extracted;
          }

          return best;
        }

        function extractLoop() {
          attempts += 1;
          var workDocMatch = findScheduleWorkDoc();
          var workDoc = workDocMatch ? workDocMatch.doc : document;
          var workHtml = workDocMatch && workDocMatch.html ? workDocMatch.html : currentHtml();
          var extractedSchedule = extractScheduleDataFromDoc(workDoc);
          var scheduleState = classifyScheduleState(workDoc, workHtml);
          var currentUrl = getDocUrl(workDoc) || window.location.href || '';
          var onQueryPage = scheduleState === 'query_page' || scheduleState === 'ready';
          var searchSubmittedAt = readSearchSubmittedAt();
          var recentlySubmittedSearch = !!searchSubmittedAt && (Date.now() - searchSubmittedAt < 4000);

          if (!onQueryPage) {
            clearSearchSubmitted();
            recentlySubmittedSearch = false;
          }

          if (extractedSchedule.courses.length > 0) {
            postResult({
              t: 'courses',
              c: extractedSchedule.courses,
              h: extractedSchedule.html || workHtml
            });
            return;
          }

          if (scheduleState === 'no_data') {
            postResult({ t: 'html', h: workHtml });
            return;
          }

          if (scheduleState === 'relogin') {
            postResult({ t: 'err', m: 'Schedule query requires relogin' });
            return;
          }

          var frameLink = firstElement([
            'iframe[src*="queryByStudent"]',
            'frame[src*="queryByStudent"]',
            'iframe[src*="queryByStudent.asp"]',
            'frame[src*="queryByStudent.asp"]'
          ]);
          if (frameLink && frameLink.src && !/queryByStudent/i.test(window.location.href)) {
            post({ t: 'status', m: '\\u8f09\\u5165\\u8ab2\\u8868\\u9801\\u9762\\u4e2d...' });
            release();
            window.location.href = frameLink.src;
            return;
          }

          if (!clickedEntry && !/queryByStudent/i.test(currentUrl)) {
            if (isScheduleMenuPage(currentUrl) && navigateToStudentSchedulePage(workDoc)) {
              clickedEntry = true;
              syncState.clickedEntry = true;
              post({ t: 'status', m: '\\u76f4\\u63a5\\u5207\\u5230\\u5b78\\u751f\\u8ab2\\u8868\\u67e5\\u8a62...' });
              setTimeout(extractLoop, 1200);
              return;
            }

            var entry = findStudentScheduleEntry();

            if (entry) {
              var entryDoc = entry.ownerDocument || document;
              var entryTarget = resolveNavTarget(entryDoc, entry);
              clickedEntry = entryTarget ? navigateDoc(entryDoc, entryTarget) : click(entry);
              syncState.clickedEntry = clickedEntry;
              if (clickedEntry) {
                post({ t: 'status', m: '\\u958b\\u555f\\u8ab2\\u8868\\u67e5\\u8a62...' });
                setTimeout(extractLoop, 1000);
                return;
              }
            }

            if (attempts === 1 || attempts % 4 === 0) {
              var entryCandidates = describeScheduleEntryCandidates();
              post({
                t: 'status',
                m: entryCandidates
                  ? '\\u672a\\u9ede\\u5230\\u5b78\\u751f\\u8ab2\\u8868\\u67e5\\u8a62 candidates=' + entryCandidates
                  : '\\u672a\\u627e\\u5230\\u5b78\\u751f\\u8ab2\\u8868\\u67e5\\u8a62\\u5165\\u53e3'
              });
            }
          }

          if (onQueryPage && !clickedSearch && !recentlySubmittedSearch) {
            var search = findScheduleSearchControl();
            var queryForm = findQueryForm(workDoc);
            postScheduleProbe('before-search', workDoc, extractedSchedule, search, queryForm);

            if (submitQueryForm(workDoc, queryForm, search)) {
              clickedSearch = true;
              syncState.clickedSearch = true;
              markSearchSubmitted();
              postScheduleProbe('submitted-search', workDoc, extractedSchedule, search, queryForm);
              post({ t: 'status', m: '\\u67e5\\u8a62\\u8ab2\\u8868\\u4e2d...' });
              setTimeout(extractLoop, 1800);
              return;
            }

            if (search) {
              clickedSearch = click(search);
              syncState.clickedSearch = clickedSearch;
              if (clickedSearch) {
                markSearchSubmitted();
                postScheduleProbe('clicked-search', workDoc, extractedSchedule, search, queryForm);
                post({ t: 'status', m: '\\u67e5\\u8a62\\u8ab2\\u8868\\u4e2d...' });
                setTimeout(extractLoop, 1800);
                return;
              }
            }

            postScheduleProbe('search-not-triggered', workDoc, extractedSchedule, search, queryForm);
          }

          if (onQueryPage && recentlySubmittedSearch) {
            clickedSearch = true;
            syncState.clickedSearch = true;
          }

          if (attempts >= 12) {
            postResult({ t: 'err', m: 'Schedule query timed out' });
            return;
          }

          setTimeout(extractLoop, 500);
        }

        extractLoop();
      } catch (error) {
        try {
          if (window.__PCCU_ADAPTIVE_SCHEDULE_SYNC__) {
            window.__PCCU_ADAPTIVE_SCHEDULE_SYNC__.active = false;
          }
        } catch (releaseError) {}
        post({ t: 'err', m: (error && error.message) || 'Schedule sync script failed' });
      }
    })();
    true;
  `;
}

export function buildRobustGradePageScript(): string {
  return `
    (function() {
      ${baseHelpers}

      try {
        var syncState = window.__PCCU_GRADE_SYNC__;
        if (!syncState) {
          syncState = window.__PCCU_GRADE_SYNC__ = {
            active: false,
            clickedHistory: false,
            clickedSearch: false
          };
        }

        if (syncState.active) {
          syncState.active = false;
        }

        syncState.active = true;
        var attempts = 0;
        var clickedHistory = !!syncState.clickedHistory;
        var clickedSearch = !!syncState.clickedSearch;

        function release() {
          try {
            if (window.__PCCU_GRADE_SYNC__) {
              window.__PCCU_GRADE_SYNC__.active = false;
            }
          } catch (error) {}
        }

        function postResult(payload) {
          release();
          post(payload);
        }

        function currentHtml() {
          return document.documentElement ? document.documentElement.outerHTML : '';
        }

        function pageText(doc) {
          try {
            return ((doc.body && (doc.body.innerText || doc.body.textContent)) || '').replace(/\\s+/g, ' ');
          } catch (error) {
            return '';
          }
        }

        function looksLikeGradeCode(value) {
          var compact = (value || '').replace(/\\s+/g, '').toUpperCase();
          return /^(?:[A-Z]{1,4}\\d{1,4}|\\d{4,}|[A-Z0-9-]{4,})$/.test(compact);
        }

        function countGradeRows(doc) {
          var matched = 0;

          try {
            var rows = doc.querySelectorAll('tr');
            for (var i = 0; i < rows.length; i += 1) {
              var rowText = ((rows[i].innerText || rows[i].textContent || '') + '').replace(/\\s+/g, '');
              if (!rowText) continue;

              var tokens = rowText.match(/[A-Z0-9-]{4,}/gi) || [];
              var hasCode = false;
              for (var j = 0; j < tokens.length; j += 1) {
                if (looksLikeGradeCode(tokens[j])) {
                  hasCode = true;
                  break;
                }
              }

              var hasGradeValue = /(通過|及格|不及格|撤選|退選|免修|抵免|P|F|\\d{1,3}(?:\\.\\d+)?)/i.test(rowText);
              var hasCourseLikeText = /[\\u4e00-\\u9fff]{2,}/.test(rowText) &&
                !/(查詢|列印|總平均|班排名|系排名|排名|學分數|歷年成績|成績單|學年度第?\\d?學期)/.test(rowText);
              if (!hasGradeValue || (!hasCode && !hasCourseLikeText)) continue;

              matched += 1;
              if (matched >= 3) return matched;
            }
          } catch (error) {}

          return matched;
        }

        function postGradeProbe(label, doc, html) {
          try {
            var targetDoc = doc || document;
            var markup = html || (targetDoc.documentElement ? targetDoc.documentElement.outerHTML : '');
            var forms = 0;
            var rows = 0;
            var inputs = 0;
            var hasSearchFlag = false;
            var hasSearchButton = false;
            try { forms = targetDoc.querySelectorAll('form').length; } catch (error) {}
            try { rows = targetDoc.querySelectorAll('tr').length; } catch (error) {}
            try { inputs = targetDoc.querySelectorAll('input, button, select').length; } catch (error) {}
            try { hasSearchFlag = !!targetDoc.querySelector('[name="hidChkSearch"]'); } catch (error) {}
            try {
              hasSearchButton = !!targetDoc.querySelector(
                '#Search, input[type="submit"], input[type="button"], button[type="submit"], button[id*="Search"]'
              );
            } catch (error) {}
            post({
              t: 'grade_probe',
              m:
                label +
                ' url=' + getDocUrl(targetDoc) +
                ' html=' + String(markup || '').length +
                ' rows=' + rows +
                ' gradeRows=' + countGradeRows(targetDoc) +
                ' forms=' + forms +
                ' controls=' + inputs +
                ' searchFlag=' + hasSearchFlag +
                ' searchButton=' + hasSearchButton
            });
          } catch (error) {}
        }

        function resolveNavTarget(doc, node) {
          if (!doc || !node) return '';

          try {
            var href = node.getAttribute('href') || '';
            if (href && !/^javascript:/i.test(href)) {
              return new URL(href, doc.location.href).toString();
            }
          } catch (error) {}

          try {
            var onclick = node.getAttribute('onclick') || '';
            var match =
              onclick.match(/window\\.location\\.href\\s*=\\s*['"]([^'"]+)['"]/i) ||
              onclick.match(/location\\.href\\s*=\\s*['"]([^'"]+)['"]/i);
            if (match && match[1]) {
              return new URL(match[1], doc.location.href).toString();
            }
          } catch (error) {}

          return '';
        }

        function getDocUrl(doc) {
          try {
            return String((doc && doc.location && doc.location.href) || '');
          } catch (error) {
            return '';
          }
        }

        function resolveUrl(baseUrl, maybeRelative) {
          if (!maybeRelative) return '';
          try {
            return new URL(maybeRelative, baseUrl || window.location.href).toString();
          } catch (error) {
            return maybeRelative;
          }
        }

        function navigateDoc(doc, targetUrl) {
          if (!targetUrl) return false;
          try {
            if (doc && doc.defaultView && doc.defaultView.location) {
              doc.defaultView.location.href = targetUrl;
              return true;
            }
          } catch (error) {}

          try {
            if (doc && doc.location) {
              doc.location.href = targetUrl;
              return true;
            }
          } catch (error) {}

          try {
            window.location.href = targetUrl;
            return true;
          } catch (error) {}

          return false;
        }

        function isGradeMenuPage(url) {
          return /\\/studentscore\\/student\\/(?:index|index_score)\\.asp/i.test(url || '');
        }

        function navigateToGradeHistoryPage(doc) {
          var baseUrl = getDocUrl(doc) || window.location.href || 'https://ap2.pccu.edu.tw/studentscore/student/index.asp';
          var targetUrl = resolveUrl(baseUrl, 'scoreListAll.asp');
          return navigateDoc(doc || document, targetUrl);
        }

        function hasGradeResult(doc, html) {
          if (!doc || !html) return false;
          if (html.length < 4000) return false;

          var href = '';
          try {
            href = doc.location ? doc.location.href : '';
          } catch (error) {}

          var text = pageText(doc).replace(/\\s+/g, '');
          var gradeRows = countGradeRows(doc);
          var onHistoryPage = /scoreListAll/i.test(href);
          if (!onHistoryPage) return false;
          var hasStats = /總平均|班排名|系排名|平均|實得學分/.test(text);
          var hasTranscriptHeader =
            /成績單列印|入學前抵免|歷年成績單/.test(text) || /學年度.*年級.*班/.test(text);

          if (gradeRows >= 2 && (hasStats || hasTranscriptHeader)) return true;
          if (onHistoryPage && gradeRows >= 3) return true;

          return false;
        }

        function findGradeWorkDoc() {
          return findDoc(function(doc, html) {
            var href = '';
            try {
              href = doc.location ? doc.location.href : '';
            } catch (error) {}
            return /index_score|scoreListAll|StudentScore|studentscore/i.test(href) ||
              /\u6211\u7684\u6210\u7e3e\u55ae|\u5b78\u751f\u5b78\u671f\u6210\u7e3e\u67e5\u8a62|\u6b77\u5e74\u6210\u7e3e|\u6b77\u5e74\u6210\u7e3e\u55ae/.test(html);
          });
        }

        function findHistoryTab() {
          var globalNode = firstElement([
            'td#MainMenu1',
            '#MainMenu1',
            'td[onclick*="scoreListAll"]',
            '[onclick*="scoreListAll.asp"]',
            'a[href*="scoreListAll"]'
          ]);
          if (globalNode) {
            return { node: globalNode, doc: globalNode.ownerDocument || document };
          }

          var byTextNode = firstByText([
            '\u6b77\u5e74\u6210\u7e3e\u55ae',
            '\u6b77\u5e74\u6210\u7e3e',
            '\u6211\u7684\u6210\u7e3e\u55ae'
          ]);
          if (byTextNode) {
            return { node: byTextNode, doc: byTextNode.ownerDocument || document };
          }

          return null;
        }

        function findGradeSearchControl() {
          return firstElement([
            '#Search',
            'input[type="submit"][id*="Search"]',
            'input[type="submit"][name*="Search"]',
            'input[type="submit"][value*="\\u67e5\\u8a62"]',
            'input[type="button"][id*="Search"]',
            'input[type="button"][name*="Search"]',
            'input[type="button"][value*="\\u67e5\\u8a62"]',
            'button[type="submit"]',
            'button[id*="Search"]',
            'button[name*="Search"]',
            'button[onclick*="Search"]',
            'a[onclick*="Search"]'
          ]) || firstByText(['\\u67e5\\u8a62', 'Search']);
        }

        function findGradeQueryForm(doc) {
          if (!doc) return null;

          var selectors = [
            'form[action*="scoreListAll"]',
            'form[action*="StudentScore"]',
            'form[action*="studentscore"]',
            'form[name*="score"]',
            'form[id*="score"]',
            'form[name*="Score"]',
            'form[id*="Score"]'
          ];

          for (var i = 0; i < selectors.length; i += 1) {
            try {
              var form = doc.querySelector(selectors[i]);
              if (form) return form;
            } catch (error) {}
          }

          try {
            var searchFlag = doc.querySelector('[name="hidChkSearch"]');
            if (searchFlag && searchFlag.form) return searchFlag.form;
          } catch (error) {}

          try {
            var forms = doc.querySelectorAll('form');
            if (forms.length === 1) return forms[0];
          } catch (error) {}

          return null;
        }

        function submitGradeSearchForm(doc, form) {
          if (!doc || !form) return false;

          var searchAction = 'search';
          try {
            var search = findGradeSearchControl();
            var onclick = search ? String(search.getAttribute('onclick') || '') : '';
            var match = onclick.match(/ToSearch\\([^,]+,\\s*['"]([^'"]+)['"]/i);
            if (match && match[1]) {
              searchAction = match[1];
            }
          } catch (error) {}

          try {
            var searchFlag = form.querySelector('[name="hidChkSearch"]');
            if (searchFlag) {
              searchFlag.value = searchAction;
              searchAction = searchFlag.value || searchAction;
            }
          } catch (error) {}

          try {
            form.submit();
            return true;
          } catch (error) {}

          try {
            if (typeof form.requestSubmit === 'function') {
              form.requestSubmit();
              return true;
            }
          } catch (error) {}

          try {
            var view = (doc && doc.defaultView) || window;
            if (view && typeof view.ToSearch === 'function') {
              view.ToSearch(form, searchAction);
              return true;
            }
          } catch (error) {}

          return false;
        }

        function extractLoop() {
          attempts += 1;

          var picked = findDoc(function(doc, html) {
            return hasGradeResult(doc, html);
          });

          if (picked && picked.html && picked.html.length > 500) {
            postGradeProbe('found-history-result', picked.doc, picked.html);
            postResult({ t: 'html', h: picked.html });
            return;
          }

          var workDocMatch = findGradeWorkDoc();
          var workDoc = workDocMatch ? workDocMatch.doc : document;
          var workUrl = '';
          try {
            workUrl = workDoc && workDoc.location ? workDoc.location.href : '';
          } catch (error) {}
          var onHistoryPage = /scoreListAll/i.test(workUrl);
          if (onHistoryPage) {
            clickedHistory = true;
            syncState.clickedHistory = true;
          }

          var frameLink = firstElement([
            'iframe[src*="scoreListAll"]',
            'frame[src*="scoreListAll"]',
            'iframe[src*="StudentScore"]',
            'frame[src*="StudentScore"]',
            'iframe[src*="studentscore"]',
            'frame[src*="studentscore"]'
          ]);
          if (frameLink && frameLink.src && !/scoreListAll|StudentScore|studentscore/i.test(window.location.href)) {
            post({ t: 'status', m: '\u8f09\u5165\u6210\u7e3e\u9801\u9762\u4e2d...' });
            release();
            window.location.href = frameLink.src;
            return;
          }

          if (!clickedHistory && !onHistoryPage) {
            var historyInfo = findHistoryTab();
            if (historyInfo && historyInfo.node) {
              var historyTab = historyInfo.node;
              var historyDoc = historyInfo.doc || workDoc;
              clickedHistory = click(historyTab);
              if (clickedHistory) {
                syncState.clickedHistory = true;
                post({ t: 'status', m: '\u958b\u555f\u6b77\u5e74\u6210\u7e3e\u55ae...' });
                setTimeout(extractLoop, 1800);
                return;
              }

              var historyUrl = resolveNavTarget(historyDoc, historyTab);
              if (historyUrl && /scoreListAll/i.test(historyUrl)) {
                clickedHistory = true;
                syncState.clickedHistory = true;
                post({ t: 'status', m: '\u5df2\u627e\u5230\u6b77\u5e74\u6210\u7e3e\u55ae tab\uff0c\u6b63\u5728\u5207\u63db...' });
                if (navigateDoc(historyDoc, historyUrl)) {
                  setTimeout(extractLoop, 1800);
                  return;
                }
              }
            }

            if (attempts >= 4 && isGradeMenuPage(workUrl) && navigateToGradeHistoryPage(workDoc)) {
              clickedHistory = true;
              syncState.clickedHistory = true;
              post({ t: 'status', m: '\\u76f4\\u63a5\\u5207\\u5230\\u6b77\\u5e74\\u6210\\u7e3e\\u55ae...' });
              setTimeout(extractLoop, 1800);
              return;
            }
          }

          if (onHistoryPage && !clickedSearch) {
            var gradeForm = findGradeQueryForm(workDoc);
            if (submitGradeSearchForm(workDoc, gradeForm)) {
              clickedSearch = true;
              syncState.clickedSearch = true;
              post({ t: 'status', m: '\\u67e5\\u8a62\\u6b77\\u5e74\\u6210\\u7e3e\\u4e2d...' });
              setTimeout(extractLoop, 2200);
              return;
            }

            var search = findGradeSearchControl();
            if (search) {
              clickedSearch = click(search);
              syncState.clickedSearch = clickedSearch;
              if (clickedSearch) {
                post({ t: 'status', m: '\\u67e5\\u8a62\\u6b77\\u5e74\\u6210\\u7e3e\\u4e2d...' });
                setTimeout(extractLoop, 2200);
                return;
              }
            }
          }

          if (clickedHistory) {
            postGradeProbe('waiting-history-result', workDoc, workDocMatch && workDocMatch.html ? workDocMatch.html : '');
            post({ t: 'status', m: '\\u7b49\\u5f85\\u6b77\\u5e74\\u6210\\u7e3e\\u55ae\\u8f09\\u5165...' });
          } else if (attempts <= 4) {
            post({ t: 'status', m: '\\u7b49\\u5f85\\u6210\\u7e3e\\u9801\\u9762\\u5b8c\\u6574\\u8f09\\u5165...' });
          }

          if (attempts >= 12) {
            postGradeProbe('posting-fallback-html', workDoc, workDocMatch && workDocMatch.html ? workDocMatch.html : currentHtml());
            postResult({ t: 'html', h: workDocMatch && workDocMatch.html ? workDocMatch.html : currentHtml() });
            return;
          }

          setTimeout(extractLoop, 500);
        }

        extractLoop();
      } catch (error) {
        release();
        post({ t: 'err', m: (error && error.message) || 'Grade sync script failed' });
      }
    })();
    true;
  `;
}
