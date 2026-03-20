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

        function setValue(input, value) {
          if (!input) return;

          try {
            var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement && window.HTMLInputElement.prototype, 'value');
            if (setter && setter.set) setter.set.call(input, value);
            else input.value = value;
          } catch (error) {
            input.value = value;
          }

          try {
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('blur', { bubbles: true }));
          } catch (error) {}

          try {
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
              document.activeElement.blur();
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
            var accountInput = firstElement([
              'input[type="text"][name*="Account"]',
              'input[type="text"][id*="Account"]',
              'input[type="text"][name*="User"]',
              'input[type="text"][id*="User"]',
              'input[type="text"][name*="Login"]',
              'input[type="text"][id*="Login"]',
              'input[type="email"]',
              'input[type="text"]'
            ]);
            var passwordInput = firstElement([
              'input[type="password"][name*="Password"]',
              'input[type="password"][id*="Password"]',
              'input[type="password"][name*="Pwd"]',
              'input[type="password"][id*="Pwd"]',
              'input[type="password"]'
            ]);

            if (!accountInput || !passwordInput) {
              return false;
            }

            setValue(accountInput, ${JSON.stringify(credentials.account)});
            setValue(passwordInput, ${JSON.stringify(credentials.password)});

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
              post({ t: 'status', m: '\\u767b\\u5165\\u4e2d...' });
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

            return !!submit;
          } catch (error) {
            finish({ t: 'err', m: (error && error.message) || 'Form login failed' });
            return true;
          }
        }

        function loginLoop(attempt) {
          if (completed) return;

          if (isInsidePage()) {
            finish({ t: 'login_ok' });
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

          if (attempt >= 40) {
            finish({ t: 'err', m: 'Login redirect timed out' });
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

        if (typeof gfOpenLink !== 'function') {
          post({ t: 'err', m: 'gfOpenLink not found' });
          return;
        }

        gfOpenLink(${JSON.stringify(code)}, 'service', '0', '00', '', '');
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

export function buildServiceOpenScript(code: '1208' | '1220'): string {
  const textPatterns =
    code === '1208'
      ? "'\\u8ab2\\u8868', '\\u8ab2\\u7a0b', '\\u67e5\\u8a62\\u8ab2\\u8868'"
      : "'\\u6210\\u7e3e', '\\u6b77\\u5e74\\u6210\\u7e3e', '\\u6210\\u7e3e\\u67e5\\u8a62'";

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

          if (typeof gfOpenLink === 'function') {
            gfOpenLink(${JSON.stringify(code)}, 'service', '0', '00', '', '');
            return;
          }

          if (tryDomLauncher()) {
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
  return `
    (function() {
      ${baseHelpers}

      try {
        var attempts = 0;
        var clickedEntry = false;
        var clickedSearch = false;

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

        function hasScheduleMarkers(text) {
          return /(\\(敹\)|\\(?稞\)|敹耨|?訾耨)/.test(text || '');
        }

        function hasScheduleLayout(html, text) {
          return /pubContent|pubTdItem_Period|queryByStudent/i.test(html || '') ||
            (hasScheduleMarkers(text) && /(?:??|??[銝鈭????剜憭夜/.test(text || ''));
        }

        var dayMap = {
          '??: 0,
          '憭?: 0,
          '銝': 1,
          '鈭?: 2,
          '銝?: 3,
          '??: 4,
          '鈭?: 5,
          '??: 6
        };

        function parseDayPeriod(value) {
          var compact = normalizeText(value).replace(/\\s+/g, '');
          var dayMatch =
            compact.match(/(?:??|??([?亙予銝鈭????苗)/) ||
            compact.match(/([?亙予銝鈭????苗)(?:??悴??)/);
          var periodMatch = compact.match(/蝚?(\\d{1,2})(?:\\s*[-~嚚?設\\s*(\\d{1,2}))?蝭?/);
          if (!dayMatch || !periodMatch) return null;

          var dayOfWeek = dayMap[dayMatch[1]];
          var startPeriod = parseInt(periodMatch[1], 10);
          var endPeriod = parseInt(periodMatch[2] || periodMatch[1], 10);
          if ((typeof dayOfWeek === 'undefined') || !startPeriod || !endPeriod) return null;

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
          if (/^\\(?稞\)|^?訾耨/.test(raw)) required = false;
          if (/^\\(敹\)|^敹耨/.test(raw)) required = true;

          raw = raw
            .replace(/^\\((?:敹??\\)\\s*/, '')
            .replace(/^(?:敹耨|?訾耨)\\s*/, '')
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

        function looksLikeTeacher(value) {
          return !!value &&
            !/[0-9]/.test(value) &&
            value.length <= 16 &&
            !/??|?悴蝭|?恕|?圈?/.test(value);
        }

        function looksLikeLocation(value) {
          return !!value &&
            (/[0-9]/.test(value) || /擗育璅摰弋?恕|?∪?|憭扳|憭抒儔|憭批?|憭扯郭|憭批|憭批?|?臬瓷/.test(value));
        }

        function splitTeacherLocation(lines) {
          var source = Array.isArray(lines) ? lines.join(' ') : String(lines || '');
          var cleaned = normalizeText(
            source
              .replace(/^(?:?葦|?葦|?玨?葦)[:嚗?\\s*/, '')
              .replace(/^(?:?圈?|?恕)[:嚗?\\s*/, '')
          );

          if (!cleaned) {
            return { teacher: '', location: '' };
          }

          var separators = ['繚', '|', '嚚?, '/', '嚗?];
          for (var i = 0; i < separators.length; i += 1) {
            var separator = separators[i];
            if (cleaned.indexOf(separator) === -1) continue;
            var parts = cleaned.split(separator).map(normalizeText).filter(Boolean);
            if (parts.length < 2) continue;
            var teacher = '';
            var location = '';
            for (var j = 0; j < parts.length; j += 1) {
              if (!teacher && looksLikeTeacher(parts[j])) teacher = parts[j];
              if (!location && looksLikeLocation(parts[j])) location = parts[j];
            }
            if (!teacher) teacher = parts[0];
            if (!location) location = parts[parts.length - 1];
            return { teacher: teacher, location: location };
          }

          var pieces = cleaned.split(/\\s+/).filter(Boolean);
          if (pieces.length === 1) {
            return {
              teacher: looksLikeTeacher(pieces[0]) ? pieces[0] : '',
              location: looksLikeLocation(pieces[0]) ? pieces[0] : ''
            };
          }

          var teacherGuess = '';
          for (var k = 0; k < pieces.length; k += 1) {
            if (looksLikeTeacher(pieces[k])) {
              teacherGuess = pieces[k];
              break;
            }
          }

          var locationPieces = [];
          for (var n = 0; n < pieces.length; n += 1) {
            if (pieces[n] !== teacherGuess) locationPieces.push(pieces[n]);
          }

          return {
            teacher: teacherGuess || pieces[0] || '',
            location: locationPieces.join(' ') || (looksLikeLocation(pieces[0]) ? pieces[0] : '')
          };
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
          var dayLabels = ['??, '銝', '鈭?, '銝?, '??, '鈭?, '??];
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
              periodRange: '??' + (dayLabels[course.dayOfWeek] || '') + ' 蝚?' + range + ' 蝭',
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
              if (!hasScheduleMarkers(cellText)) continue;

              var lines = htmlToLines(cell.innerHTML || cellText);
              if (!lines.length) continue;

              var titleLine = '';
              for (var lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
                if (hasScheduleMarkers(lines[lineIndex])) {
                  titleLine = lines[lineIndex];
                  break;
                }
              }
              if (!titleLine) titleLine = lines[0];

              var title = parseCourseTitle(titleLine);
              if (!title || !title.name) continue;

              var otherLines = [];
              for (var m = 0; m < lines.length; m += 1) {
                if (lines[m] !== titleLine) otherLines.push(lines[m]);
              }

              pushCourse(courses, {
                name: title.name,
                teacher: splitTeacherLocation(otherLines).teacher,
                location: splitTeacherLocation(otherLines).location,
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
          var seen = {};

          for (var i = 0; i < nodes.length; i += 1) {
            var node = nodes[i];
            var text = textOfNode(node);
            if (!text || text.length < 8 || text.length > 260) continue;
            if (!hasScheduleMarkers(text)) continue;
            if (!/(?:??|??[銝鈭????剜憭夜/.test(text)) continue;
            if (!/蝚?\\s*\\d{1,2}(?:\\s*[-~嚚?設\\s*\\d{1,2})?\\s*蝭/.test(text)) continue;

            var signature = text.replace(/\\s+/g, '');
            if (seen[signature]) continue;
            seen[signature] = true;

            var lines = htmlToLines(node.innerHTML || node.outerHTML || text);
            if (!lines.length) continue;

            var titleLine = '';
            var schedule = null;
            var details = [];

            for (var j = 0; j < lines.length; j += 1) {
              var line = lines[j];
              if (!titleLine && hasScheduleMarkers(line)) {
                titleLine = line;
                continue;
              }

              if (!schedule) {
                schedule = parseDayPeriod(line);
                if (schedule) continue;
              }

              details.push(line);
            }

            var title = parseCourseTitle(titleLine);
            if (!title || !title.name || !schedule) continue;

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
          }

          return courses;
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

            var cardCourses = extractCoursesFromCards(doc);
            if (cardCourses.length > 0 && !bestHtml) {
              var cardHtml = [];
              for (var k = 0; k < cardCourses.length; k += 1) {
                cardHtml.push('<div data-course-index="' + k + '">' + cardCourses[k].name + '</div>');
              }
              bestHtml = '<div data-schedule-source="cards">' + cardHtml.join('') + '</div>';
            }
            for (var n = 0; n < cardCourses.length; n += 1) {
              pushCourse(collected, cardCourses[n]);
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

        function findStudentScheduleEntry() {
          return firstElement([
            'td[onclick*="queryByStudent"]',
            '[onclick*="queryByStudent"]',
            'a[href*="queryByStudent"]',
            'a[href*="queryByStudent.asp"]'
          ]) || findExactTextNode(['\\u5b78\\u751f\\u8ab2\\u8868\\u67e5\\u8a62', '\\u5b78\\u751f\\u8ab2\\u8868'], 'a, button, td, th, span, div, label');
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

        function submitScheduleForm() {
          var form = firstElement([
            'form[name*="query"]',
            'form[id*="query"]',
            'form[name*="form1"]',
            'form[id*="form1"]',
            'form'
          ]);

          if (!form || typeof form.submit !== 'function') return false;

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

          var bestPayload = bestSchedulePayload();
          if (bestPayload.courses.length > 0) {
            post({ t: 'courses', c: bestPayload.courses, h: bestPayload.html || '' });
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
            window.location.href = frameLink.src;
            return;
          }

          if (!clickedEntry && !/queryByStudent/i.test(window.location.href)) {
            var entry = firstElement([
              'td[onclick*="queryByStudent"]',
              '[onclick*="queryByStudent"]',
              'a[href*="queryByStudent"]',
              'a[href*="queryByStudent.asp"]'
            ]) || firstByText(['queryByStudent', '\\u8ab2\\u8868', '\\u67e5\\u8a62\\u8ab2\\u8868']);

            if (entry) {
              clickedEntry = click(entry);
              if (clickedEntry) {
                post({ t: 'status', m: '\\u958b\\u555f\\u8ab2\\u8868\\u67e5\\u8a62...' });
                setTimeout(extractLoop, 1000);
                return;
              }
            }
          }

          if (!clickedSearch) {
            var search = firstElement([
              '#Search',
              'input[type="submit"]',
              'input[value*="\\u67e5\\u8a62"]',
              'button[id*="Search"]',
              'button[name*="Search"]'
            ]) || firstByText(['\\u67e5\\u8a62', 'Search']);

            if (search) {
              clickedSearch = click(search);
              if (clickedSearch) {
                post({ t: 'status', m: '\\u67e5\\u8a62\\u8ab2\\u8868\\u4e2d...' });
                setTimeout(extractLoop, 1800);
                return;
              }
            }
          }

          if (attempts >= 12) {
            post({ t: 'html', h: bestPayload.html || currentHtml() });
            return;
          }

          setTimeout(extractLoop, 500);
        }

        extractLoop();
      } catch (error) {
        post({ t: 'err', m: (error && error.message) || 'Schedule sync script failed' });
      }
    })();
    true;
  `;
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
          return;
        }

        syncState.active = true;
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

        function findStudentScheduleEntry() {
          return firstElement([
            'td[onclick*="queryByStudent"]',
            '[onclick*="queryByStudent"]',
            'a[href*="queryByStudent"]',
            'a[href*="queryByStudent.asp"]'
          ]) || findExactTextNode(['\\u5b78\\u751f\\u8ab2\\u8868\\u67e5\\u8a62', '\\u5b78\\u751f\\u8ab2\\u8868'], 'a, button, td, th, span, div, label');
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

        function submitScheduleForm() {
          var form = firstElement([
            'form[name*="query"]',
            'form[id*="query"]',
            'form[name*="form1"]',
            'form[id*="form1"]',
            'form'
          ]);

          if (!form || typeof form.submit !== 'function') return false;

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
          var currentUrl = window.location.href || '';
          var onQueryPage = /queryByStudent/i.test(currentUrl);
          var searchSubmittedAt = readSearchSubmittedAt();
          var recentlySubmittedSearch = !!searchSubmittedAt && (Date.now() - searchSubmittedAt < 4000);

          if (!onQueryPage) {
            clearSearchSubmitted();
            recentlySubmittedSearch = false;
          }

          var bestPayload = bestSchedulePayload();
          if (bestPayload.courses.length > 0) {
            postResult({ t: 'courses', c: bestPayload.courses, h: bestPayload.html || '' });
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

          if (!clickedEntry && !/queryByStudent/i.test(window.location.href)) {
            var entry = findStudentScheduleEntry();

            if (entry) {
              clickedEntry = click(entry);
              syncState.clickedEntry = clickedEntry;
              if (clickedEntry) {
                post({ t: 'status', m: '\\u958b\\u555f\\u8ab2\\u8868\\u67e5\\u8a62...' });
                setTimeout(extractLoop, 1000);
                return;
              }
            }
          }

          if (onQueryPage && !clickedSearch && !recentlySubmittedSearch) {
            var search = findScheduleSearchControl();

            if (search) {
              clickedSearch = click(search);
              syncState.clickedSearch = clickedSearch;
              if (clickedSearch) {
                markSearchSubmitted();
                post({ t: 'status', m: '\\u67e5\\u8a62\\u8ab2\\u8868\\u4e2d...' });
                setTimeout(extractLoop, 1800);
                return;
              }
            }

            if (onQueryPage && submitScheduleForm()) {
              clickedSearch = true;
              syncState.clickedSearch = true;
              markSearchSubmitted();
              post({ t: 'status', m: '\\u67e5\\u8a62\\u8ab2\\u8868\\u4e2d...' });
              setTimeout(extractLoop, 1800);
              return;
            }
          }

          if (onQueryPage && recentlySubmittedSearch) {
            clickedSearch = true;
            syncState.clickedSearch = true;
          }

          if (attempts >= 12) {
            postResult({ t: 'html', h: currentHtml() });
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
            clickedHistory: false
          };
        }

        if (syncState.active) {
          return;
        }

        syncState.active = true;
        var attempts = 0;
        var clickedHistory = !!syncState.clickedHistory;

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
            return ((doc.body && (doc.body.innerText || doc.body.textContent)) || '').replace(/\s+/g, ' ');
          } catch (error) {
            return '';
          }
        }

        function looksLikeGradeCode(value) {
          var compact = (value || '').replace(/\s+/g, '').toUpperCase();
          return /^(?:[A-Z]{1,4}\d{1,4}|\d{4,}|[A-Z0-9-]{4,})$/.test(compact);
        }

        function countGradeRows(doc) {
          var matched = 0;

          try {
            var rows = doc.querySelectorAll('tr');
            for (var i = 0; i < rows.length; i += 1) {
              var rowText = ((rows[i].innerText || rows[i].textContent || '') + '').replace(/\s+/g, '');
              if (!rowText) continue;

              var tokens = rowText.match(/[A-Z0-9-]{4,}/gi) || [];
              var hasCode = false;
              for (var j = 0; j < tokens.length; j += 1) {
                if (looksLikeGradeCode(tokens[j])) {
                  hasCode = true;
                  break;
                }
              }

              if (!hasCode) continue;
              if (!/(通過|及格|不及格|撤選|退選|免修|抵免|P|F|\d{1,3}(?:\.\d+)?)/i.test(rowText)) continue;

              matched += 1;
              if (matched >= 3) return matched;
            }
          } catch (error) {}

          return matched;
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
              onclick.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/i) ||
              onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/i);
            if (match && match[1]) {
              return new URL(match[1], doc.location.href).toString();
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

        function hasGradeResult(doc, html) {
          if (!doc || !html) return false;
          if (html.length < 4000) return false;

          var href = '';
          try {
            href = doc.location ? doc.location.href : '';
          } catch (error) {}

          var text = pageText(doc).replace(/\s+/g, '');
          var gradeRows = countGradeRows(doc);
          var onHistoryPage = /scoreListAll/i.test(href);
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

        function extractLoop() {
          attempts += 1;

          var picked = findDoc(function(doc, html) {
            return hasGradeResult(doc, html);
          });

          if (picked && picked.html && picked.html.length > 500) {
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

              clickedHistory = click(historyTab);
              if (clickedHistory) {
                syncState.clickedHistory = true;
                post({ t: 'status', m: '\u958b\u555f\u6b77\u5e74\u6210\u7e3e\u55ae...' });
                setTimeout(extractLoop, 1800);
                return;
              }
            }
          }

          if (clickedHistory) {
            post({ t: 'status', m: '\\u7b49\\u5f85\\u6b77\\u5e74\\u6210\\u7e3e\\u55ae\\u8f09\\u5165...' });
          } else if (attempts <= 4) {
            post({ t: 'status', m: '\\u7b49\\u5f85\\u6210\\u7e3e\\u9801\\u9762\\u5b8c\\u6574\\u8f09\\u5165...' });
          }

          if (attempts >= 12) {
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

