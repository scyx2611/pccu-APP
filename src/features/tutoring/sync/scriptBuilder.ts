/**
 * Script builder factory for tutoring WebView scripts.
 *
 * Provides `baseHelpers` — a shared set of JavaScript utility functions
 * injected into every tutoring script — and a factory to wrap custom
 * script bodies with those helpers.
 */

export const baseHelpers = `
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

  function decodeHtmlEntities(value) {
    return String(value || '')
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)))
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }

  function cleanText(value) {
    return String(value || '')
      .replace(/\\u00a0/g, ' ')
      .replace(/\\r/g, '')
      .replace(/[ \\t]+\\n/g, '\\n')
      .replace(/\\n[ \\t]+/g, '\\n')
      .replace(/[ \\t]{2,}/g, ' ')
      .replace(/\\n{3,}/g, '\\n\\n')
      .trim();
  }

  function htmlToText(value) {
    return cleanText(
      decodeHtmlEntities(
        String(value || '')
          .replace(/<br\\s*\\/>?/gi, '\\n')
          .replace(/<\\/(?:div|p|li|tr|td|th|section|article|h[1-6]|ul|ol)>/gi, '\\n')
          .replace(/<[^>]+>/g, ' ')
      )
    );
  }

  function formatDateTime(value) {
    if (!value) {
      return '';
    }

    var date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    var hour = String(date.getHours()).padStart(2, '0');
    var minute = String(date.getMinutes()).padStart(2, '0');
    return year + '-' + month + '-' + day + ' ' + hour + ':' + minute;
  }

  function normalizeRows(table) {
    return Array.isArray(table?.Rows) ? table.Rows : [];
  }

  function normalizeTutoringCourseRow(row) {
    row = row || {};
    var deptName = cleanText(row.Dept);
    var courseName = cleanText(row.Course);

    return {
      courseCode: row.CCODE != null ? String(row.CCODE) : '',
      coCourseCode: row.CoCODE != null ? String(row.CoCODE) : '',
      deptName: deptName,
      courseName: courseName,
      label: [deptName, courseName].filter(Boolean).join(' - '),
      credit: row.Credit != null ? Number(row.Credit) : null,
      isRemote: Number(row.isRemote || 0) > 0,
      announcementCount: row.Announce != null ? Number(row.Announce) : 0,
      materialCount: row.Material != null ? Number(row.Material) : 0,
      pollCount: row.Vote != null ? Number(row.Vote) : 0,
      homeworkCount: row.Homework != null ? Number(row.Homework) : 0,
      postCount: row.Post != null ? Number(row.Post) : 0
    };
  }

  function normalizeAnnouncementRow(row) {
    row = row || {};
    return {
      serialNo: row.SN ?? null,
      courseCode: row.CCode != null ? String(row.CCode) : '',
      courseName: cleanText(row.Course),
      teacherName: cleanText(row.Name),
      title: htmlToText(row.Title),
      createdAt: formatDateTime(row.CDate),
      isRead: row.isRead != null && row.isRead !== '',
      contentHtml: String(row.Content || ''),
      contentText: htmlToText(row.Content)
    };
  }

  function normalizeMaterialRow(row) {
    row = row || {};
    return {
      targetNo: row.TargetNo ?? null,
      courseCode: row.CCode != null ? String(row.CCode) : '',
      courseName: cleanText(row.Course),
      catalog: cleanText(row.Catalog),
      title: cleanText(row.Title),
      fileName: cleanText(row.FileName || row.Title),
      memoHtml: String(row.Memo || ''),
      memoText: htmlToText(row.Memo),
      endAt: formatDateTime(row.EndDate),
      updatedAt: formatDateTime(row.UpdateDate || row.ODate),
      isNew: row.isNew != null ? Number(row.isNew) > 0 : false,
      downable: row.Downable != null ? Number(row.Downable) > 0 : true
    };
  }

  function buildHomeworkStateLabel(row, strings) {
    row = row || {};
    strings = strings || {};
    switch (String(row.State ?? '')) {
      case '':
        return strings.State_0 || '未繳交';
      case '1':
        return strings.State_1 || '已繳交';
      case '2':
        return row.Score != null && row.Score !== -1 ? String(row.Score) : (strings.State_2 || '已評分');
      case '3':
        return row.Score != null ? String(row.Score) : (strings.State_3 || '已評分');
      case '4':
        return strings.State_4 || '需要重繳';
      default:
        return String(row.State || '');
    }
  }

  function normalizeHomeworkRow(row, strings) {
    row = row || {};
    strings = strings || {};
    var attachments = Array.isArray(row.attachments)
      ? row.attachments.map(function(attachment) {
          return {
            serialNo: attachment.SerialNo ?? null,
            title: cleanText(attachment.Title)
          };
        })
      : [];

    return {
      mySn: row.MySN ?? null,
      homeSn: row.HomeSN ?? null,
      courseCode: row.CCode != null ? String(row.CCode) : '',
      courseName: cleanText(row.Course),
      title: cleanText(row.Title),
      commentText: htmlToText(row.Comment),
      endAt: formatDateTime(row.EndDate || row.ODate),
      lastUpdatedAt: formatDateTime(row.Last),
      stateCode: row.State == null ? '' : String(row.State),
      stateLabel: buildHomeworkStateLabel(row, strings),
      reloadable: Boolean(row.Reload),
      hasFile: Number(row.HasFile || 0) > 0,
      usedCount: row.Used ?? null,
      remainingSubmissionCount: row.remainingSubmissionCount ?? null,
      maxSubmissionCount: row.maxSubmissionCount ?? null,
      reviewText: htmlToText(row.Review),
      attachments: attachments
    };
  }
`;

/**
 * Wrap a tutoring script body with the shared `baseHelpers`.
 *
 * The returned string is a complete IIFE ready for `injectJavaScript`.
 *
 * @param scriptBody - The inner script logic (without the IIFE wrapper).
 *                     Will be placed after `baseHelpers` inside the IIFE.
 * @returns Complete script string: `(function() { baseHelpers; scriptBody })(); true;`
 */
export function createTutoringScript(scriptBody: string): string {
  return `
    (function() {
      ${baseHelpers}

      ${scriptBody}
    })();
    true;
  `;
}
