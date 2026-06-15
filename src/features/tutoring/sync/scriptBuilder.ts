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

  function repairUtf8Mojibake(value) {
    var text = String(value == null ? '' : value);
    if (!/[\\u0080-\\u009f]|[\\u00c0-\\u00ff]/.test(text)) {
      return text;
    }

    var bytes = [];
    for (var i = 0; i < text.length; i += 1) {
      var code = text.charCodeAt(i);
      if (code > 255) {
        return text;
      }
      bytes.push('%' + code.toString(16).padStart(2, '0'));
    }

    try {
      return decodeURIComponent(bytes.join(''));
    } catch (error) {
      return text;
    }
  }

  function textQualityScore(value) {
    var text = String(value == null ? '' : value);
    if (!text) return -1000;

    var hanCount = (text.match(/[\\u3400-\\u9fff]/g) || []).length;
    var entityCount = (text.match(/&(?:#\\d+|#x[0-9a-f]+|[a-z]+);/gi) || []).length;
    var replacementCount = (text.match(/[\\ufffd\\u0080-\\u009f]/g) || []).length;
    var mojibakeCount = (text.match(/[\\u00c0-\\u00ff]/g) || []).length;
    var visibleCount = cleanPlainText(text).length;

    return hanCount * 8 + visibleCount - entityCount * 10 - replacementCount * 20 - mojibakeCount * 2;
  }

  function cleanPlainText(value) {
    return String(value == null ? '' : value)
      .replace(/\\u00a0/g, ' ')
      .replace(/\\r/g, '')
      .replace(/[ \\t]+\\n/g, '\\n')
      .replace(/\\n[ \\t]+/g, '\\n')
      .replace(/[ \\t]{2,}/g, ' ')
      .replace(/\\n{3,}/g, '\\n\\n')
      .trim();
  }

  function cleanText(value) {
    var text = String(value == null ? '' : value);
    for (var i = 0; i < 3; i += 1) {
      var decoded = decodeHtmlEntities(text);
      if (decoded === text) break;
      text = decoded;
    }

    var repaired = repairUtf8Mojibake(text);
    if (textQualityScore(repaired) > textQualityScore(text)) {
      text = repaired;
    }

    return cleanPlainText(text);
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

  function toNumberOrNull(value) {
    if (value == null || value === '') return null;
    var number = Number(value);
    return Number.isNaN(number) ? null : number;
  }

  function normalizeRows(table) {
    if (Array.isArray(table)) return table;
    return Array.isArray(table?.Rows) ? table.Rows : [];
  }

  function pickUrl(row, keys) {
    row = row || {};
    keys = keys || [];

    for (var i = 0; i < keys.length; i += 1) {
      var value = row[keys[i]];
      if (value == null || cleanText(value) === '') continue;
      var url = cleanText(value);
      try {
        return new URL(url, window.location.href).href;
      } catch (error) {
        return url;
      }
    }

    return '';
  }

  function normalizeFileAttachment(row) {
    row = row || {};
    var serialNo = toNumberOrNull(row.SerialNo ?? row.SN ?? row.AttSN ?? row.FileSN);
    var targetNo = toNumberOrNull(row.TargetNo ?? row.TargetSN ?? row.FileNo);
    var fileName = cleanText(row.FileName || row.Name || row.Title || row.FileTitle);

    return {
      serialNo: serialNo,
      targetNo: targetNo,
      title: cleanText(row.Title || row.FileTitle || fileName),
      fileName: fileName,
      downloadUrl: pickUrl(row, ['DownloadUrl', 'downloadUrl', 'Url', 'URL', 'Href', 'FileUrl', 'FileURL', 'Link'])
    };
  }

  function normalizeAttachmentRows(value) {
    var rows = Array.isArray(value)
      ? value
      : Array.isArray(value && value.Rows)
        ? value.Rows
        : [];

    return rows
      .map(function(row) { return normalizeFileAttachment(row); })
      .filter(function(item) {
        return item.title || item.fileName || item.serialNo != null || item.targetNo != null || item.downloadUrl;
      });
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

  function pickText(source, keys) {
    source = source || {};
    keys = keys || [];
    var candidates = [];

    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (source[key] != null && cleanText(source[key]) !== '') {
        candidates.push(cleanText(source[key]));
      }
    }

    var normalized = {};
    Object.keys(source).forEach(function(key) {
      normalized[String(key).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '')] = source[key];
    });

    for (var j = 0; j < keys.length; j += 1) {
      var normalizedKey = String(keys[j]).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
      if (normalized[normalizedKey] != null && cleanText(normalized[normalizedKey]) !== '') {
        candidates.push(cleanText(normalized[normalizedKey]));
      }
    }

    candidates = candidates.filter(Boolean);
    if (candidates.length === 0) return '';

    candidates.sort(function(a, b) {
      return textQualityScore(b) - textQualityScore(a);
    });
    return candidates[0];
  }

  function parseInfoLabel(html, labels) {
    var text = htmlToText(html)
      .replace(/\\r/g, '\\n')
      .replace(/[ \\t]*[:：][ \\t]*/g, ': ')
      .replace(/\\n{2,}/g, '\\n');
    var lines = text.split('\\n');

    for (var i = 0; i < labels.length; i += 1) {
      var label = String(labels[i]);
      for (var j = 0; j < lines.length; j += 1) {
        var line = cleanText(lines[j]);
        var index = line.indexOf(label);
        if (index === -1) continue;
        var value = line.slice(index + label.length).replace(/^[ \\t]*[:：]?[ \\t]*/, '');
        if (cleanText(value)) {
          return cleanText(value);
        }
      }
    }

    return '';
  }

  function normalizeTeacherName(teacherInfo) {
    teacherInfo = teacherInfo || {};

    if (teacherInfo.NoTeacher) {
      return '';
    }

    if (teacherInfo.TeacherList) {
      return cleanText(String(teacherInfo.TeacherList).split(',').filter(Boolean).join('、'));
    }

    if (typeof teacherInfo.TeacherObj === 'string') {
      return cleanText(teacherInfo.TeacherObj);
    }

    if (teacherInfo.TeacherObj && typeof teacherInfo.TeacherObj === 'object') {
      var names = [];
      Object.keys(teacherInfo.TeacherObj).forEach(function(key) {
        var value = cleanText(teacherInfo.TeacherObj[key]);
        if (value && names.indexOf(value) === -1) {
          names.push(value);
        }
      });
      return names.join('、');
    }

    return pickText(teacherInfo, ['TeacherName', 'Teacher', 'Name']);
  }

  function normalizeTutoringCourseInfo(payload) {
    payload = payload || {};
    var course = payload.course || {};
    var cInfoData = payload.cInfoData || {};
    var infoHtml = [
      cInfoData.cInfo,
      cInfoData.cPTInfo,
      cInfoData.CInfo,
      cInfoData.CPTInfo,
      cInfoData.Info
    ].filter(Boolean).join('\\n');

    return {
      teacherName: normalizeTeacherName(payload.teacherInfo) || pickText(cInfoData, ['TeacherName', 'Teacher', 'Name']),
      academicYearTerm:
        pickText(cInfoData, ['YYM', 'YearTerm', 'AcademicYearTerm', 'OpenYearTerm', '開課學年期']) ||
        parseInfoLabel(infoHtml, ['開課學年期', '學年期']),
      departmentClass:
        pickText(cInfoData, ['Dept', 'Department', 'DepartmentClass', 'OpenDept', '開課院系別']) ||
        parseInfoLabel(infoHtml, ['開課院系別', '開課院系', '院系別']) ||
        cleanText(course.deptName || course.Dept),
      requiredType:
        pickText(cInfoData, ['RequiredType', 'ReqType', 'OpenType', '必選修別']) ||
        parseInfoLabel(infoHtml, ['必選修別', '必選修']),
      creditText:
        pickText(cInfoData, ['Credit', 'Credits', '學分數']) ||
        parseInfoLabel(infoHtml, ['學分數', '學分']) ||
        (course.credit != null ? String(course.credit) : ''),
      englishLevel:
        pickText(cInfoData, ['EnglishLevel', 'EMILevel', 'EnglishGrade', '英語化分級']) ||
        parseInfoLabel(infoHtml, ['英語化分級', '英語分級', 'EMI']),
      scheduleText:
        pickText(cInfoData, ['ClassTime', 'TimePlace', 'Schedule', 'PlaceTime', '上課時地']) ||
        parseInfoLabel(infoHtml, ['上課時地', '上課時間地點', '上課時/地']),
      expectedEnrollment:
        pickText(cInfoData, ['ExpectedEnrollment', 'Limit', 'Quota', 'People', '預計開課人數']) ||
        parseInfoLabel(infoHtml, ['預計開課人數', '預計人數', '開課人數'])
    };
  }

  function normalizeAnnouncementRow(row) {
    row = row || {};
    var content = row.Content || row.Detail || row.Memo || row.Comment || row.Description || row.Body || row.Message || '';
    return {
      serialNo: row.SN ?? null,
      courseCode: row.CCode != null ? String(row.CCode) : '',
      courseName: cleanText(row.Course),
      teacherName: cleanText(row.Name),
      title: htmlToText(row.Title),
      createdAt: formatDateTime(row.CDate),
      isRead: row.isRead != null && row.isRead !== '',
      contentHtml: String(content || ''),
      contentText: htmlToText(content),
      attachments: normalizeAttachmentRows(row.attachments || row.Attachments || row.AttList || row.Files)
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
      downable: row.Downable != null ? Number(row.Downable) > 0 : true,
      downloadUrl: pickUrl(row, ['DownloadUrl', 'downloadUrl', 'Url', 'URL', 'Href', 'FileUrl', 'FileURL', 'Link'])
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
    var attachments = normalizeAttachmentRows(row.attachments || row.Attachments || row.AttList || row.Files);
    var submittedFiles = normalizeAttachmentRows(row.submittedFiles || row.SubmittedFiles || row.UploadFiles || row.MyFiles);

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
      attachments: attachments,
      submittedFiles: submittedFiles,
      uploadable: row.Uploadable != null ? Number(row.Uploadable) > 0 : Boolean(row.Reload) || String(row.State ?? '') === '' || String(row.State ?? '') === '4'
    };
  }

  function normalizeProgressRow(row, index) {
    row = row || {};
    var percent = row.Percent ?? row.Progress ?? row.Rate ?? row.CompleteRate ?? null;
    var number = toNumberOrNull(percent);
    if (number != null && number > 1 && number <= 100) {
      number = number / 100;
    }

    return {
      id: cleanText(row.ID || row.Id || row.SN || row.No || index),
      title: pickText(row, ['Title', 'Name', 'Item', 'Label', 'Course']),
      value: pickText(row, ['Value', 'Text', 'Status', 'Score', 'ProgressText']) || cleanText(percent || ''),
      percent: number != null ? Math.max(0, Math.min(1, number)) : null
    };
  }

  function normalizeProgressRows(value) {
    return normalizeRows(value)
      .map(function(row, index) { return normalizeProgressRow(row, index); })
      .filter(function(item) { return item.title || item.value || item.percent != null; });
  }

  function parseCourseScheduleProgressText(text) {
    var rows = [];
    var seen = {};
    var datePattern = /(20\\d{2})[\\/.-](\\d{1,2})[\\/.-](\\d{1,2})/;

    function pushScheduleRow(week, dateText, title, detail) {
      title = cleanText(title || '課程進度');
      title = title.replace(/Detail\\.{0,3}.*/i, '').replace(/^[)）\\]\\s]+/, '').trim();
      detail = cleanText(detail || '').replace(/Detail\\.{0,3}/gi, '').trim();
      title = title.replace(/^[|｜\\s]+/, '').trim();
      if (!title || title.length > 80) return;

      var normalizedWeek = week || String(rows.length + 1);
      var label = '第 ' + normalizedWeek + ' 週 ' + title;
      var value = [dateText, detail].filter(Boolean).join(' · ');
      var key = label + '|' + value;
      if (seen[key]) return;
      seen[key] = true;
      rows.push({
        ID: 'course-schedule-progress-' + rows.length,
        Title: label,
        Value: value,
        Percent: null
      });
    }

    function parseScheduleText(sourceText) {
      var source = cleanText(sourceText).replace(/\\s*Reading\\s*[:：]\\s*/i, ' Reading: ');
      var compactWeekDateMatch = source.match(/^(\\d{1,2})(20\\d{2}[\\/.-]\\d{1,2}[\\/.-]\\d{1,2})/);
      if (compactWeekDateMatch) {
        source = compactWeekDateMatch[1] + ' ' + compactWeekDateMatch[2] + source.slice(compactWeekDateMatch[0].length);
      }
      var dateMatch = source.match(datePattern);
      if (!dateMatch) return;

      var dateText = dateMatch[0].replace(/-/g, '/').replace(/\\./g, '/');
      var beforeDate = source.slice(0, dateMatch.index).trim();
      var afterDate = source.slice((dateMatch.index || 0) + dateMatch[0].length).trim();
      var weekMatch = beforeDate.match(/(?:^|\\D)(\\d{1,2})\\s*$/);
      if (!weekMatch) {
        weekMatch = beforeDate.match(/(?:^|\\D)(\\d{1,2})\\s*\\.?\\s*$/);
      }
      var week = weekMatch ? weekMatch[1] : '';
      var readingIndex = afterDate.search(/Reading\\s*:|指定研讀資料/i);
      var title = readingIndex >= 0 ? afterDate.slice(0, readingIndex).trim() : afterDate;
      var detail = readingIndex >= 0 ? afterDate.slice(readingIndex).trim() : '';
      detail = detail.replace(/^指定研讀資料\\s*/i, 'Reading: ');
      pushScheduleRow(week, dateText, title, detail);
    }

    var source = cleanText(text).replace(/\\s*Reading\\s*[:：]\\s*/gi, ' Reading: ');
    source = source.replace(/(^|\\s)(\\d{1,2})\\.\\s+(20\\d{2}[\\/.-]\\d{1,2}[\\/.-]\\d{1,2})/g, '$1$2 $3');
    source = source.replace(/(^|\\s)(\\d{1,2})(20\\d{2}[\\/.-]\\d{1,2}[\\/.-]\\d{1,2})/g, '$1$2 $3');
    var dateRegex = /(20\\d{2})[\\/.-](\\d{1,2})[\\/.-](\\d{1,2})/g;
    var matches = [];
    var match;
    while ((match = dateRegex.exec(source)) !== null) {
      var prefix = source.slice(Math.max(0, match.index - 4), match.index);
      var weekPrefixMatch = prefix.match(/(\\d{1,2})\\s*$/);
      var prefixContext = source.slice(Math.max(0, match.index - 18), match.index);
      if (weekPrefixMatch && /[a-z][a-z\\s:]*\\d{1,2}\\s*$/i.test(prefixContext)) {
        weekPrefixMatch = null;
      }
      var startIndex = weekPrefixMatch ? match.index - weekPrefixMatch[0].length : match.index;
      matches.push({ index: match.index, startIndex: startIndex, value: match[0] });
      if (matches.length >= 40) break;
    }

    for (var i = 0; i < matches.length; i += 1) {
      var start = matches[i].startIndex;
      var end = i + 1 < matches.length ? matches[i + 1].startIndex : source.length;
      parseScheduleText(source.slice(start, end));
    }

    return rows;
  }

  function isCourseProgressDocument(info, courseCode) {
    info = info || {};
    var normalizedCourseCode = cleanText(courseCode || '');
    var url = cleanText(info.url || '');
    var title = cleanText(info.title || '');
    var activeText = cleanText(info.activeText || '');
    var headerText = cleanText(info.headerText || '');
    var bodyText = cleanText(info.bodyText || '');
    var headerHaystack = [title, activeText, headerText].join(' ');
    var progressHaystack = [url, title, activeText, headerText].join(' ');
    var firstDateIndex = bodyText.search(/20\\d{2}[\\/.-]\\d{1,2}[\\/.-]\\d{1,2}/);
    var bodyHeaderText = firstDateIndex >= 0 ? bodyText.slice(0, firstDateIndex) : bodyText.slice(0, 240);
    var hasCourseHeader =
      !normalizedCourseCode ||
      headerHaystack.indexOf(normalizedCourseCode) !== -1 ||
      bodyHeaderText.indexOf(normalizedCourseCode) !== -1;
    var hasProgressSignal = /progress|schedule|進度/i.test(progressHaystack);
    var hasScheduleRows = (bodyText.match(/20\\d{2}[\\/.-]\\d{1,2}[\\/.-]\\d{1,2}/g) || []).length > 0;

    return hasCourseHeader && hasProgressSignal && hasScheduleRows;
  }

  function readMarkedProgressRowsFromDocuments(courseCode) {
    var rows = [];
    var allDocs = docs();
    var seen = {};

    function pushProgress(title, value, percent) {
      title = cleanText(title || '課程進度');
      value = cleanText(value || '');
      var key = title + '|' + value + '|' + percent;
      if (seen[key]) return;
      seen[key] = true;
      rows.push({
        ID: 'html-progress-' + rows.length,
        Title: title,
        Value: value,
        Percent: percent
      });
    }

    for (var d = 0; d < allDocs.length; d += 1) {
      var doc = allDocs[d];
      try {
        var marked = doc.querySelectorAll('[aria-valuenow], progress, [role="progressbar"], .progress, .progress-bar, [class*="progress"], [id*="progress"]');
        for (var i = 0; i < marked.length; i += 1) {
          var node = marked[i];
          var label = '';
          var value = '';
          var percent = null;
          try {
            label = node.getAttribute('aria-label') || node.getAttribute('title') || textOf(node.parentElement) || textOf(node);
            value = textOf(node) || label;
            percent = toNumberOrNull(node.getAttribute('aria-valuenow') || node.getAttribute('value') || '');
            if (percent == null) {
              var style = String(node.getAttribute('style') || '');
              var styleMatch = style.match(/width\\s*:\\s*(\\d+(?:\\.\\d+)?)%/i);
              if (styleMatch) percent = Number(styleMatch[1]);
            }
          } catch (error) {}
          pushProgress(label || value || '課程進度', value || label, percent);
        }
      } catch (error) {}

    }

    return rows;
  }

  function visibleTextOf(node) {
    return cleanText(node && (node.value || node.innerText || node.textContent) || '');
  }

  function clickCourseProgressTab() {
    var allDocs = docs();
    var selectors = 'a, button, input, td, [role="tab"], [onclick], li, span';
    for (var d = 0; d < allDocs.length; d += 1) {
      try {
        var nodes = allDocs[d].querySelectorAll(selectors);
        for (var i = 0; i < nodes.length; i += 1) {
          var node = nodes[i];
          var text = visibleTextOf(node);
          var href = String(node.getAttribute && (node.getAttribute('href') || node.getAttribute('onclick') || '') || '');
          if (!/^(?:進度|progress)(?:\\s*\\d+)?$/i.test(text) && !/progress|schedule|courseprogress|進度/i.test(href)) continue;
          var target = node.closest && node.closest('a, button, [role="tab"]') || node;
          if (click(target)) return true;
        }
      } catch (error) {}
    }
    return false;
  }

  function clickCourseEntry(hints) {
    hints = (hints || []).map(function(value) { return cleanText(value); }).filter(Boolean);
    if (hints.length === 0) return false;

    var allDocs = docs();
    var selectors = 'a, button, tr, li, [role="button"], [onclick], [data-ccode], [data-course], [data-course-code]';
    for (var d = 0; d < allDocs.length; d += 1) {
      try {
        var nodes = allDocs[d].querySelectorAll(selectors);
        for (var i = 0; i < nodes.length; i += 1) {
          var node = nodes[i];
          var haystack = [
            visibleTextOf(node),
            String(node.getAttribute && (node.getAttribute('href') || '') || ''),
            String(node.getAttribute && (node.getAttribute('onclick') || '') || ''),
            String(node.getAttribute && (node.getAttribute('data-ccode') || '') || ''),
            String(node.getAttribute && (node.getAttribute('data-course') || '') || ''),
            String(node.getAttribute && (node.getAttribute('data-course-code') || '') || '')
          ].join(' ');

          var matched = hints.some(function(hint) { return haystack.indexOf(hint) !== -1; });
          if (!matched) continue;

          var target = node.closest && node.closest('a, button, [role="button"], [onclick]') || node;
          if (click(target)) return true;
        }
      } catch (error) {}
    }

    return false;
  }

  function courseProgressProbe(extra) {
    var doc = document;
    try {
      var body = visibleTextOf(doc.body);
      var active = visibleTextOf(doc.querySelector('.active, .selected, .current, [aria-selected="true"]'));
      return Object.assign({
        url: String(window.location && window.location.href || ''),
        title: String(doc.title || ''),
        active: active.slice(0, 120),
        body: body.slice(0, 240),
        hasReading: /Reading\\s*:/i.test(body),
        dateCount: (body.match(/20\\d{2}[\\/.-]\\d{1,2}[\\/.-]\\d{1,2}/g) || []).length
      }, extra || {});
    } catch (error) {
      return Object.assign({ error: (error && error.message) || String(error) }, extra || {});
    }
  }

  function readCourseScheduleProgressRowsFromDocuments(courseCode) {
    var rows = [];
    var seen = {};
    var allDocs = docs();
    var datePattern = /(20\\d{2})[\\/.-](\\d{1,2})[\\/.-](\\d{1,2})/;

    function pushScheduleRow(week, dateText, title, detail) {
      title = cleanText(title || '課程進度');
      title = title.replace(/Detail\\.{0,3}.*/i, '').trim();
      detail = cleanText(detail || '').replace(/Detail\\.{0,3}/gi, '').trim();
      var label = (week ? '第 ' + week + ' 週 ' : '') + title;
      var value = [dateText, detail].filter(Boolean).join(' · ');
      var key = label + '|' + value;
      if (seen[key]) return;
      seen[key] = true;
      rows.push({
        ID: 'course-schedule-progress-' + rows.length,
        Title: label,
        Value: value,
        Percent: null
      });
    }

    function looksLikeProgressDocument(doc) {
      try {
        var url = String(doc.location && doc.location.href || '');
        var title = visibleTextOf(doc.querySelector('title'));
        var activeText = visibleTextOf(doc.querySelector('.active, .selected, .current, [aria-selected="true"]'));
        var headerText = visibleTextOf(doc.querySelector('h1, h2, h3, .title, .course-title, [class*="title"], [id*="title"], [id*="Course"], [class*="Course"]'));
        var bodyText = visibleTextOf(doc.body);
        return isCourseProgressDocument({
          url: url,
          title: title,
          activeText: activeText,
          headerText: headerText,
          bodyText: bodyText
        }, courseCode);
      } catch (error) {
        return false;
      }
    }

    function parseScheduleText(text) {
      var source = cleanText(text).replace(/\\s*Reading\\s*[:：]\\s*/i, ' Reading: ');
      var compactWeekDateMatch = source.match(/^(\\d{1,2})(20\\d{2}[\\/.-]\\d{1,2}[\\/.-]\\d{1,2})/);
      if (compactWeekDateMatch) {
        source = compactWeekDateMatch[1] + ' ' + compactWeekDateMatch[2] + source.slice(compactWeekDateMatch[0].length);
      }
      var dateMatch = source.match(datePattern);
      if (!dateMatch) return;

      var dateText = dateMatch[0].replace(/-/g, '/').replace(/\\./g, '/');
      var beforeDate = source.slice(0, dateMatch.index).trim();
      var afterDate = source.slice((dateMatch.index || 0) + dateMatch[0].length).trim();
      var weekMatch = beforeDate.match(/(?:^|\\D)(\\d{1,2})\\s*$/);
      var week = weekMatch ? weekMatch[1] : '';
      var readingIndex = afterDate.search(/Reading\\s*:/i);
      var title = readingIndex >= 0 ? afterDate.slice(0, readingIndex).trim() : afterDate;
      var detail = readingIndex >= 0 ? afterDate.slice(readingIndex).trim() : '';
      title = title.replace(/Detail\\.{0,3}.*/i, '').trim();
      detail = detail.replace(/Detail\\.{0,3}/gi, '').trim();

      if (!title || title.length > 80) return;
      pushScheduleRow(week, dateText, title, detail);
    }

    function parseScheduleDocumentText(text) {
      var source = cleanText(text).replace(/\\s*Reading\\s*[:：]\\s*/gi, ' Reading: ');
      source = source.replace(/(^|\\s)(\\d{1,2})(20\\d{2}[\\/.-]\\d{1,2}[\\/.-]\\d{1,2})/g, '$1$2 $3');
      var dateRegex = /(20\\d{2})[\\/.-](\\d{1,2})[\\/.-](\\d{1,2})/g;
      var matches = [];
      var match;
      while ((match = dateRegex.exec(source)) !== null) {
        var prefix = source.slice(Math.max(0, match.index - 4), match.index);
        var weekPrefixMatch = prefix.match(/(\\d{1,2})\\s*$/);
        var startIndex = weekPrefixMatch ? match.index - weekPrefixMatch[0].length : Math.max(0, match.index - 12);
        matches.push({ index: match.index, startIndex: startIndex, value: match[0] });
        if (matches.length >= 40) break;
      }
      for (var i = 0; i < matches.length; i += 1) {
        var start = matches[i].startIndex;
        var end = i + 1 < matches.length ? matches[i + 1].startIndex : source.length;
        parseScheduleText(source.slice(start, end));
      }
    }

    for (var d = 0; d < allDocs.length; d += 1) {
      var doc = allDocs[d];
      if (!looksLikeProgressDocument(doc)) continue;
      try {
        var nodes = doc.querySelectorAll('tr, li, [class*="progress"], [id*="progress"], [class*="schedule"], [id*="schedule"], [class*="week"], [id*="week"], [class*="lesson"], [id*="lesson"], [class*="unit"], [id*="unit"]');
        for (var i = 0; i < nodes.length; i += 1) {
          parseScheduleText(visibleTextOf(nodes[i]));
          if (rows.length >= 30) return rows;
        }
      } catch (error) {}

      if (rows.length < 2) {
        var bodyRows = parseCourseScheduleProgressText(visibleTextOf(doc.body));
        for (var rowIndex = 0; rowIndex < bodyRows.length; rowIndex += 1) {
          var row = bodyRows[rowIndex];
          var key = row.Title + '|' + row.Value;
          if (seen[key]) continue;
          seen[key] = true;
          rows.push(row);
          if (rows.length >= 30) return rows;
        }
      }
    }

    return rows;
  }

  function normalizeClassmateRow(row, index) {
    row = row || {};
    var id = cleanText(row.ID || row.Id || row.StdNo || row.StudentNo || row.Account || index);
    return {
      id: id,
      name: pickText(row, ['Name', 'StdName', 'StudentName', 'CName']),
      departmentClass: pickText(row, ['Dept', 'Class', 'DepartmentClass', 'DeptClass']),
      email: pickText(row, ['Email', 'Mail', 'EMail'])
    };
  }

  function normalizeClassmateRows(value) {
    return normalizeRows(value)
      .map(function(row, index) { return normalizeClassmateRow(row, index); })
      .filter(function(item) { return item.name || item.id; });
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
