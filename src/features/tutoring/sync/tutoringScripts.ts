import type { PCCUCredentials } from '../../pccu/sync/pccuSyncScripts';
import { createTutoringScript } from './scriptBuilder';

export function buildDiagnosticScript(): string {
  return `
    (function() {
      var info = {
        url: window.location.href,
        title: document.title,
        hasCourseFP: typeof window.CourseFP !== 'undefined',
        hasAjaxMethods: typeof window.CourseFP !== 'undefined' && !!(window.CourseFP && window.CourseFP.AjaxMethods),
        scripts: document.scripts ? document.scripts.length : 0,
        bodyLength: document.body ? document.body.innerHTML.length : 0,
        iframeCount: document.querySelectorAll('iframe, frame').length,
        hasGlobalAjax: typeof window.AjaxMethods !== 'undefined'
      };
      window.ReactNativeWebView.postMessage(JSON.stringify({ t: 'diagnostic', info: info }));
    })();
    true;
  `;
}

export function buildWaitForCourseFpScript(callbackScript: string): string {
  return `
    (function() {
      var maxAttempts = 60;
      var attempt = 0;

      function postNative(payload) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }

      function getAjaxContextFromWindow(targetWindow, source) {
        try {
          if (!targetWindow) return null;
          if (targetWindow.CourseFP && targetWindow.CourseFP.AjaxMethods) {
            return {
              source: source + '.CourseFP',
              win: targetWindow,
              courseFp: targetWindow.CourseFP,
              ajaxMethods: targetWindow.CourseFP.AjaxMethods
            };
          }
          if (targetWindow.AjaxMethods) {
            return {
              source: source + '.AjaxMethods',
              win: targetWindow,
              courseFp: null,
              ajaxMethods: targetWindow.AjaxMethods
            };
          }
        } catch (error) {}
        return null;
      }

      function findCourseFpContext() {
        var context = getAjaxContextFromWindow(window, 'top');
        if (context) return context;

        var frames = [];
        try {
          frames = document.querySelectorAll('iframe, frame');
        } catch (error) {}

        for (var i = 0; i < frames.length; i += 1) {
          try {
            var frameWindow = frames[i].contentWindow;
            context = getAjaxContextFromWindow(frameWindow, 'frame[' + i + ']');
            if (context) return context;
          } catch (error) {}
        }

        try {
          for (var j = 0; j < window.frames.length; j += 1) {
            context = getAjaxContextFromWindow(window.frames[j], 'window.frames[' + j + ']');
            if (context) return context;
          }
        } catch (error) {}

        return null;
      }

      function adoptCourseFpContext(context) {
        if (!context || !context.ajaxMethods) return false;
        try {
          if (context.courseFp) {
            window.CourseFP = context.courseFp;
          } else {
            window.CourseFP = { AjaxMethods: context.ajaxMethods };
          }
          return !!(window.CourseFP && window.CourseFP.AjaxMethods);
        } catch (error) {
          return false;
        }
      }

      var interval = setInterval(function() {
        attempt++;
        var context = findCourseFpContext();
        var hasAjax = adoptCourseFpContext(context);
        var hasCourseFP = typeof window.CourseFP !== 'undefined';

        if (attempt % 5 === 0) {
          postNative({
            t: 'waiting',
            attempt: attempt,
            hasCourseFP: hasCourseFP,
            hasAjax: hasAjax,
            source: context ? context.source : '',
            url: window.location.href
          });
        }

        if (hasAjax) {
          clearInterval(interval);
          postNative({ t: 'coursefp_ready', attempt: attempt, source: context ? context.source : 'top' });
          try {
            ${callbackScript}
          } catch (e) {
            postNative({ t: 'err', m: 'CourseFP script error: ' + (e && e.message || e) });
          }
        } else if (attempt >= maxAttempts) {
          clearInterval(interval);
          var info = {
            url: window.location.href,
            title: document.title,
            hasCourseFP: hasCourseFP,
            hasAjaxMethods: hasAjax,
            scripts: document.scripts ? document.scripts.length : 0,
            bodyLength: document.body ? document.body.innerHTML.length : 0,
            iframeCount: document.querySelectorAll('iframe, frame').length,
            frameCount: window.frames ? window.frames.length : 0,
            hasGlobalAjax: typeof window.AjaxMethods !== 'undefined',
            hasCourseFP_obj: typeof window.CourseFP !== 'undefined' ? JSON.stringify(Object.keys(window.CourseFP || {})) : 'none'
          };
          postNative({ t: 'final_diagnostic', info: info });
          postNative({ t: 'err', m: 'CourseFP not ready after ' + attempt + ' attempts' });
        }
      }, 500);
    })();
    true;
  `;
}

function buildWaitForCourseFpScriptLegacy(callbackScript: string): string {
  return `
    (function() {
      var maxAttempts = 60;
      var attempt = 0;
      var interval = setInterval(function() {
        attempt++;
        var hasCourseFP = typeof window.CourseFP !== 'undefined';
        var hasAjax = hasCourseFP && !!(window.CourseFP && window.CourseFP.AjaxMethods);
        
        // 每 5 次回報一次狀態
        if (attempt % 5 === 0) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ 
            t: 'waiting', 
            attempt: attempt, 
            hasCourseFP: hasCourseFP, 
            hasAjax: hasAjax,
            url: window.location.href 
          }));
        }
        
        if (hasAjax) {
          clearInterval(interval);
          window.ReactNativeWebView.postMessage(JSON.stringify({ t: 'coursefp_ready', attempt: attempt }));
          try {
            ${callbackScript}
          } catch (e) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ t: 'err', m: 'CourseFP script error: ' + (e && e.message || e) }));
          }
        } else if (attempt >= maxAttempts) {
          clearInterval(interval);
          // 最後一次診斷
          var info = {
            url: window.location.href,
            title: document.title,
            hasCourseFP: hasCourseFP,
            hasAjaxMethods: hasAjax,
            scripts: document.scripts ? document.scripts.length : 0,
            bodyLength: document.body ? document.body.innerHTML.length : 0,
            iframeCount: document.querySelectorAll('iframe, frame').length,
            hasGlobalAjax: typeof window.AjaxMethods !== 'undefined',
            hasCourseFP_obj: typeof window.CourseFP !== 'undefined' ? JSON.stringify(Object.keys(window.CourseFP || {})) : 'none'
          };
          window.ReactNativeWebView.postMessage(JSON.stringify({ t: 'final_diagnostic', info: info }));
          window.ReactNativeWebView.postMessage(JSON.stringify({ t: 'err', m: 'CourseFP not ready after ' + attempt + ' attempts' }));
        }
      }, 500);
    })();
    true;
  `;
}

export function buildTutoringOverviewScript(): string {
  return createTutoringScript(`
      try {
        if (typeof window.CourseFP === 'undefined' || !window.CourseFP.AjaxMethods) {
          post({ t: 'err', m: 'CourseFP not ready' });
          return;
        }

        var meta = CourseFP.AjaxMethods.GetYYMList().value || {};
        var semesters = String(meta.YYMList || '')
          .split(',')
          .map(function(value) { return value.trim(); })
          .filter(Boolean);
        var selectedSemester = semesters[0] || '';
        var table = selectedSemester
          ? CourseFP.AjaxMethods.GetCourseList(selectedSemester).value
          : null;

        var courses = normalizeRows(table).map(function(row) { return normalizeTutoringCourseRow(row); });

        post({
          t: 'courses',
          welcome: meta.Welcome || '',
          prompt: meta.YourCourse || '',
          language: meta.Language || '',
          semesters: semesters,
          semester: selectedSemester,
          courses: courses
        });
      } catch (error) {
        post({ t: 'err', m: (error && error.message) || 'Tutoring overview script failed' });
      }
  `);
}

export function buildTutoringAnnouncementsScript(courseCode: string, limit: number): string {
  const normalizedLimit = Math.max(1, Number(limit) || 10);
  const courseCodeParam = JSON.stringify(String(courseCode || ''));

  return createTutoringScript(`
      try {
        if (typeof window.CourseFP === 'undefined' || !window.CourseFP.AjaxMethods) {
          post({ t: 'err', m: 'CourseFP not ready' });
          return;
        }

        var courseCode = ${courseCodeParam};
        var pageSize = ${normalizedLimit};

        if (courseCode) {
          CourseFP.AjaxMethods.setCC(courseCode).value;

          var teacherMap = typeof teacherName === 'object' && teacherName ? teacherName : {};
          var data = CourseFP.AjaxMethods.GetAnnoData(courseCode, 1, pageSize).value;
          var rows = Array.isArray(data && data.Rows) ? data.Rows : [];

          var items = rows.map(function(row) {
            var detail = CourseFP.AjaxMethods.GetAnnoDetail(courseCode, row.SN).value || {};
            detail.teacherName = teacherMap[detail.ID] || '';
            detail.createdAt = row.CDate;
            return normalizeAnnouncementRow(Object.assign({}, row, detail));
          });

          post({ t: 'announcements', courseCode: courseCode, items: items });
        } else {
          var table = CourseFP.AjaxMethods.GetAllAnnounce(pageSize).value;
          var items = normalizeRows(table).map(function(row) { return normalizeAnnouncementRow(row); });
          post({ t: 'announcements', courseCode: '', items: items });
        }
      } catch (error) {
        post({ t: 'err', m: (error && error.message) || 'Tutoring announcements script failed' });
      }
  `);
}

export function buildTutoringMaterialsScript(courseCode: string, limit: number): string {
  const normalizedLimit = Math.max(1, Number(limit) || 10);
  const courseCodeParam = JSON.stringify(String(courseCode || ''));

  return createTutoringScript(`
      try {
        if (typeof window.CourseFP === 'undefined' || !window.CourseFP.AjaxMethods) {
          post({ t: 'err', m: 'CourseFP not ready' });
          return;
        }

        var courseCode = ${courseCodeParam};
        var pageSize = ${normalizedLimit};

        if (courseCode) {
          CourseFP.AjaxMethods.setCC(courseCode).value;
          var table = CourseFP.AjaxMethods.GetMaterialData(courseCode).value;
          var items = normalizeRows(table)
            .map(function(row) { return normalizeMaterialRow(row); })
            .slice(0, pageSize);
          post({ t: 'materials', courseCode: courseCode, items: items });
        } else {
          var table = CourseFP.AjaxMethods.GetAllMaterial(pageSize).value;
          var items = normalizeRows(table).map(function(row) { return normalizeMaterialRow(row); });
          post({ t: 'materials', courseCode: '', items: items });
        }
      } catch (error) {
        post({ t: 'err', m: (error && error.message) || 'Tutoring materials script failed' });
      }
  `);
}

export function buildTutoringAssignmentsScript(courseCode: string, limit: number): string {
  const normalizedLimit = Math.max(1, Number(limit) || 10);
  const courseCodeParam = JSON.stringify(String(courseCode || ''));

  return createTutoringScript(`
      try {
        if (typeof window.CourseFP === 'undefined' || !window.CourseFP.AjaxMethods) {
          post({ t: 'err', m: 'CourseFP not ready' });
          return;
        }

        var courseCode = ${courseCodeParam};
        var pageSize = ${normalizedLimit};

        if (courseCode) {
          CourseFP.AjaxMethods.setCC(courseCode).value;

          var strings = CourseFP.AjaxMethods.GetHomeworkString().value || {};
          var table = CourseFP.AjaxMethods.GetHomeworkList().value;
          var rows = Array.isArray(table && table.Rows) ? table.Rows : [];
          var scopedRows = pageSize > 0 ? rows.slice(0, pageSize) : rows;

          var items = scopedRows.map(function(row) {
            var workTable = CourseFP.AjaxMethods.GetWorkAttList(parseInt(row.HomeSN, 10)).value;
            var attachments = Array.isArray(workTable && workTable.Rows) ? workTable.Rows : [];
            return normalizeHomeworkRow(Object.assign({}, row, { attachments: attachments }), strings);
          });

          post({ t: 'assignments', courseCode: courseCode, items: items });
        } else {
          var result = CourseFP.AjaxMethods.GetAllHomework(pageSize);
          var strings = result.value ? (CourseFP.AjaxMethods.GetHomeworkString().value || {}) : {};
          var table = result.value;
          var items = normalizeRows(table).map(function(row) { return normalizeHomeworkRow(row, strings); });
          post({ t: 'assignments', courseCode: '', items: items });
        }
      } catch (error) {
        post({ t: 'err', m: (error && error.message) || 'Tutoring assignments script failed' });
      }
  `);
}

export function buildTutoringAllAssignmentsScript(): string {
  return createTutoringScript(`
      try {
        if (typeof window.CourseFP === 'undefined' || !window.CourseFP.AjaxMethods) {
          post({ t: 'err', m: 'CourseFP not ready' });
          return;
        }

        var meta = CourseFP.AjaxMethods.GetYYMList().value || {};
        var semesters = String(meta.YYMList || '')
          .split(',')
          .map(function(value) { return value.trim(); })
          .filter(Boolean);
        var selectedSemester = semesters[0] || '';
        var table = selectedSemester
          ? CourseFP.AjaxMethods.GetCourseList(selectedSemester).value
          : null;

        var courses = normalizeRows(table).map(function(row) { return normalizeTutoringCourseRow(row); });
        var allAssignments = [];

        courses.forEach(function(course) {
          if (!course.courseCode) return;

          CourseFP.AjaxMethods.setCC(course.courseCode).value;
          var strings = CourseFP.AjaxMethods.GetHomeworkString().value || {};
          var homeworkTable = CourseFP.AjaxMethods.GetHomeworkList().value;
          var rows = Array.isArray(homeworkTable && homeworkTable.Rows) ? homeworkTable.Rows : [];

          rows.forEach(function(row) {
            var homeSn = row.HomeSN != null ? parseInt(row.HomeSN, 10) : null;
            var attachments = [];
            if (homeSn !== null && !isNaN(homeSn)) {
              try {
                var workTable = CourseFP.AjaxMethods.GetWorkAttList(homeSn).value;
                attachments = Array.isArray(workTable && workTable.Rows) ? workTable.Rows : [];
              } catch (e) {}
            }
            var normalized = normalizeHomeworkRow(Object.assign({}, row, { attachments: attachments }), strings);
            allAssignments.push(normalized);
          });
        });

        post({
          t: 'all_assignments',
          semester: selectedSemester,
          totalCount: allAssignments.length,
          items: allAssignments
        });
      } catch (error) {
        post({ t: 'err', m: (error && error.message) || 'Tutoring all assignments script failed' });
      }
  `);
}

export function buildTutoringPendingAssignmentsScript(): string {
  return createTutoringScript(`
      try {
        if (typeof window.CourseFP === 'undefined' || !window.CourseFP.AjaxMethods) {
          post({ t: 'err', m: 'CourseFP not ready' });
          return;
        }

        var meta = CourseFP.AjaxMethods.GetYYMList().value || {};
        var semesters = String(meta.YYMList || '')
          .split(',')
          .map(function(value) { return value.trim(); })
          .filter(Boolean);
        var selectedSemester = semesters[0] || '';
        var table = selectedSemester
          ? CourseFP.AjaxMethods.GetCourseList(selectedSemester).value
          : null;

        var courses = normalizeRows(table).map(function(row) { return normalizeTutoringCourseRow(row); });
        var pendingItems = [];

        courses.forEach(function(course) {
          if (!course.courseCode) return;

          CourseFP.AjaxMethods.setCC(course.courseCode).value;
          var strings = CourseFP.AjaxMethods.GetHomeworkString().value || {};
          var homeworkTable = CourseFP.AjaxMethods.GetHomeworkList().value;
          var rows = Array.isArray(homeworkTable && homeworkTable.Rows) ? homeworkTable.Rows : [];

          rows.forEach(function(row) {
            var stateCode = row.State == null ? '' : String(row.State);
            if (stateCode !== '' && stateCode !== '4') return;

            pendingItems.push({
              courseCode: course.courseCode,
              courseName: course.courseName || course.label || '',
              homeSn: row.HomeSN ?? null,
              title: cleanText(row.Title),
              stateCode: stateCode,
              stateLabel: buildHomeworkStateLabel(row, strings),
              endAt: formatDateTime(row.EndDate || row.ODate),
              hasFile: Number(row.HasFile || 0) > 0,
              reloadable: Boolean(row.Reload)
            });
          });
        });

        post({
          t: 'pending',
          semester: selectedSemester,
          welcome: meta.Welcome || '',
          pendingCount: pendingItems.length,
          items: pendingItems
        });
      } catch (error) {
        post({ t: 'err', m: (error && error.message) || 'Tutoring pending assignments script failed' });
      }
  `);
}

/**
 * Build a script that fetches announcements, materials, and assignments for a SINGLE course.
 * Posts a `single_course` message with the combined detail payload.
 */
export function buildTutoringSingleCourseScript(courseCode: string): string {
  const courseCodeParam = JSON.stringify(String(courseCode || ''));

  return createTutoringScript(`
      try {
        if (typeof window.CourseFP === 'undefined' || !window.CourseFP.AjaxMethods) {
          post({ t: 'err', m: 'CourseFP not ready' });
          return;
        }

        var courseCode = ${courseCodeParam};
        if (!courseCode) {
          post({ t: 'err', m: 'Missing courseCode for single-course sync' });
          return;
        }

        CourseFP.AjaxMethods.setCC(courseCode).value;

        var teacherInfo = {};
        var cInfoData = {};
        try {
          teacherInfo = CourseFP.AjaxMethods.GetTeacherInfo(courseCode, 'mainpage').value || {};
        } catch (error) {}
        try {
          cInfoData = CourseFP.AjaxMethods.LoadCInfo(courseCode).value || {};
        } catch (error) {}
        var infoHtml = [
          cInfoData.cInfo,
          cInfoData.cPTInfo,
          cInfoData.CInfo,
          cInfoData.CPTInfo,
          cInfoData.Info
        ].filter(Boolean).join('\\n');
        var courseNavigationHints = [
          courseCode,
          pickText(cInfoData, ['CourseCode', 'CourseNo', 'CCODE', 'CoCODE', 'Code']),
          parseInfoLabel(infoHtml, ['課程代號', '課程代碼', '科目代號']),
          parseInfoLabel(infoHtml, ['課程名稱', '科目名稱'])
        ].filter(Boolean);
        var courseInfo = normalizeTutoringCourseInfo({
          teacherInfo: teacherInfo,
          cInfoData: cInfoData
        });

        function safeRowsFromMethod(names, args) {
          for (var i = 0; i < names.length; i += 1) {
            var name = names[i];
            try {
              var method = CourseFP.AjaxMethods[name];
              if (typeof method !== 'function') continue;
              var result = method.apply(CourseFP.AjaxMethods, args || []);
              var value = result && result.value != null ? result.value : result;
              var rows = normalizeRows(value);
              if (rows.length > 0) return rows;
            } catch (error) {}
          }
          return [];
        }

        var teacherMap = (teacherInfo && typeof teacherInfo.TeacherObj === 'object' && teacherInfo.TeacherObj)
          ? teacherInfo.TeacherObj
          : (typeof teacherName === 'object' && teacherName ? teacherName : {});
        var annoData = CourseFP.AjaxMethods.GetAnnoData(courseCode, 1, 30).value;
        var annoRows = Array.isArray(annoData && annoData.Rows) ? annoData.Rows : [];
        var announcements = annoRows.map(function(row) {
          var detail = {};
          try {
            detail = CourseFP.AjaxMethods.GetAnnoDetail(courseCode, row.SN).value || {};
          } catch (error) {}
          var annoAttachments = safeRowsFromMethod(
            ['GetAnnoAttList', 'GetAnnounceAttList', 'GetAnnouncementAttList', 'GetAttList'],
            [row.SN, courseCode]
          );
          return normalizeAnnouncementRow(Object.assign({}, row, detail, {
            Name: teacherMap[row.ID] || row.Name || '',
            CDate: row.CDate,
            attachments: annoAttachments
          }));
        });

        // Fetch materials
        var materialTable = CourseFP.AjaxMethods.GetMaterialData(courseCode).value;
        var materials = normalizeRows(materialTable).map(function(row) { return normalizeMaterialRow(row); });

        // Fetch assignments
        var strings = CourseFP.AjaxMethods.GetHomeworkString().value || {};
        var homeworkTable = CourseFP.AjaxMethods.GetHomeworkList().value;
        var homeworkRows = Array.isArray(homeworkTable && homeworkTable.Rows) ? homeworkTable.Rows : [];
        var assignments = homeworkRows.map(function(row) {
          var homeSn = row.HomeSN != null ? parseInt(row.HomeSN, 10) : null;
          var attachments = [];
          var submittedFiles = [];
          if (homeSn !== null && !isNaN(homeSn)) {
            attachments = safeRowsFromMethod(['GetWorkAttList', 'GetHomeworkAttList', 'GetHomeAttList'], [homeSn]);
            submittedFiles = safeRowsFromMethod(['GetMyWorkAttList', 'GetSubmitAttList', 'GetUploadAttList', 'GetMyHomeworkFileList'], [homeSn]);
          }
          return normalizeHomeworkRow(Object.assign({}, row, {
            attachments: attachments,
            submittedFiles: submittedFiles
          }), strings);
        });

        var progressRows = safeRowsFromMethod(
          ['GetLearningProgress', 'GetCourseProgress', 'GetProgressList', 'GetStudyProgress', 'GetProgressData'],
          [courseCode]
        );
        var progress = normalizeProgressRows({ Rows: progressRows });
        var progressSource = progress.length > 0 ? 'ajax' : 'none';
        if (progress.length === 0) {
          progress = normalizeProgressRows({ Rows: readCourseScheduleProgressRowsFromDocuments(courseCode) });
          progressSource = progress.length > 0 ? 'schedule_html' : 'none';
        }
        if (progress.length === 0) {
          progress = normalizeProgressRows({ Rows: readMarkedProgressRowsFromDocuments(courseCode) });
          progressSource = progress.length > 0 ? 'marked_html' : 'none';
        }
        var progressMethodCandidates = [];
        try {
          progressMethodCandidates = Object.keys(CourseFP.AjaxMethods || {})
            .filter(function(name) { return /progress|learn|study|track|rate|complete|history|log|record|read/i.test(name); })
            .slice(0, 30);
        } catch (error) {}
        var fullContentProgressMeta = {};
        var classmatesRows = safeRowsFromMethod(
          ['GetClassmateList', 'GetStudentList', 'GetCourseStudents', 'GetMemberList', 'GetClassStudents'],
          [courseCode]
        );

        function postSingleCourse() {
          post({
            t: 'single_course',
            courseCode: courseCode,
            courseInfo: courseInfo,
            announcements: announcements,
            materials: materials,
            assignments: assignments,
            progress: progress,
            progressSource: progressSource,
            progressMethodCandidates: progressMethodCandidates,
            classmates: normalizeClassmateRows({ Rows: classmatesRows })
          });
        }

        function readProgressAfterNavigation(source) {
          progress = normalizeProgressRows({ Rows: readCourseScheduleProgressRowsFromDocuments(courseCode) });
          progressSource = progress.length > 0 ? source + '_schedule_html' : 'none';
          if (progress.length === 0) {
            progress = normalizeProgressRows({ Rows: readMarkedProgressRowsFromDocuments(courseCode) });
            progressSource = progress.length > 0 ? source + '_marked_html' : 'none';
          }
          return progress.length > 0;
        }

        function fetchCourseFullContentProgressRows(targetCourseCode) {
          return new Promise(function(resolve) {
            if (!targetCourseCode || typeof fetch !== 'function') {
              resolve([]);
              return;
            }

            var url = '';
            try {
              url = new URL('fullcontent.aspx?course=' + encodeURIComponent(targetCourseCode), window.location.href).href;
            } catch (error) {
              url = 'https://icas.pccu.edu.tw/cfp/fullcontent.aspx?course=' + encodeURIComponent(targetCourseCode);
            }
            fullContentProgressMeta = { url: url };

            fetch(url, { credentials: 'include', cache: 'no-store' })
              .then(function(response) {
                fullContentProgressMeta.status = response ? response.status : 0;
                if (!response || !response.ok) return '';
                return response.text();
              })
              .then(function(html) {
                var rows = html ? parseCourseScheduleProgressText(htmlToText(html)) : [];
                fullContentProgressMeta.count = rows.length;
                fullContentProgressMeta.length = html ? html.length : 0;
                resolve(rows);
              })
              .catch(function(error) {
                fullContentProgressMeta.error = (error && error.message) || String(error);
                resolve([]);
              });
          });
        }

        function readFullContentProgress(done) {
          fetchCourseFullContentProgressRows(courseCode).then(function(rows) {
            progress = normalizeProgressRows({ Rows: rows });
            progressSource = progress.length > 0 ? 'fullcontent_html' : 'none';
            post({ t: 'status', m: 'fullcontent_progress ' + JSON.stringify(fullContentProgressMeta) });
            done(progress.length > 0);
          });
        }

        function waitForProgressRows(source, remainingAttempts, delayMs, done) {
          if (readProgressAfterNavigation(source)) {
            done(true);
            return;
          }
          if (remainingAttempts <= 0) {
            done(false);
            return;
          }
          setTimeout(function() {
            waitForProgressRows(source, remainingAttempts - 1, delayMs, done);
          }, delayMs);
        }

        function finishProgressProbe(meta) {
          post({ t: 'status', m: 'progress_probe ' + JSON.stringify(courseProgressProbe(Object.assign({
            hints: courseNavigationHints.slice(0, 4)
          }, meta || {}))) });
          postSingleCourse();
        }

        if (progress.length === 0) {
          var clickedCourse = clickCourseEntry(courseNavigationHints);
          var clickedProgress = false;
          post({ t: 'status', m: '正在讀取課程進度...' });

          readFullContentProgress(function(foundFullContentProgress) {
            if (foundFullContentProgress) {
              postSingleCourse();
              return;
            }

            setTimeout(function() {
            waitForProgressRows(
              clickedCourse ? 'after_course' : 'initial_navigation',
              clickedCourse ? 4 : 1,
              450,
              function(foundAfterCourse) {
                if (foundAfterCourse) {
                  postSingleCourse();
                  return;
                }

                clickedProgress = clickCourseProgressTab();
                waitForProgressRows(
                  clickedProgress ? 'after_progress_tab' : 'after_progress_probe',
                  clickedProgress ? 6 : 1,
                  500,
                  function(foundAfterProgressTab) {
                    if (foundAfterProgressTab) {
                      postSingleCourse();
                      return;
                    }

                    finishProgressProbe({
                      clickedCourse: clickedCourse,
                      clickedProgress: clickedProgress
                    });
                  }
                );
              }
            );
            }, clickedCourse ? 900 : 200);
          });
          return;
        }

        postSingleCourse();
      } catch (error) {
        post({ t: 'err', m: (error && error.message) || 'Tutoring single-course script failed' });
      }
  `);
}

type TutoringDownloadRequest = {
  courseCode: string;
  kind: 'announcement' | 'material' | 'assignment' | 'submitted';
  fileName?: string;
  downloadUrl?: string;
  targetNo?: number | null;
  serialNo?: number | null;
  homeSn?: number | null;
};

type TutoringUploadRequest = {
  courseCode: string;
  homeSn: number | null;
  fileName: string;
  mimeType: string;
  base64: string;
};

export function buildTutoringFileDownloadScript(request: TutoringDownloadRequest): string {
  const requestParam = JSON.stringify(request);

  return createTutoringScript(`
      var request = ${requestParam};

      function safeUrl(value) {
        if (!value) return '';
        try {
          return new URL(String(value), window.location.href).href;
        } catch (error) {
          return String(value);
        }
      }

      function downloadUrlCandidates() {
        var urls = [];
        if (request.downloadUrl) urls.push(safeUrl(request.downloadUrl));

        var targetNo = request.targetNo != null ? encodeURIComponent(String(request.targetNo)) : '';
        var serialNo = request.serialNo != null ? encodeURIComponent(String(request.serialNo)) : '';
        var homeSn = request.homeSn != null ? encodeURIComponent(String(request.homeSn)) : '';

        if (request.kind === 'material' && targetNo) {
          urls.push(safeUrl('/cfp/down.aspx?sn=' + targetNo));
          urls.push(safeUrl('down.aspx?sn=' + targetNo));
        }
        if (request.kind === 'assignment' && serialNo) {
          urls.push(safeUrl('/cfp/down.aspx?type=attach&sn=' + serialNo));
          urls.push(safeUrl('down.aspx?type=attach&sn=' + serialNo));
        }
        if (request.kind === 'submitted' && homeSn) {
          urls.push(safeUrl('/cfp/down.aspx?type=homework&sn=' + homeSn));
          urls.push(safeUrl('down.aspx?type=homework&sn=' + homeSn));
        }
        if (request.kind === 'announcement' && serialNo) {
          urls.push(safeUrl('/cfp/down.aspx?type=anno&sn=' + serialNo));
          urls.push(safeUrl('/cfp/down.aspx?type=attach&sn=' + serialNo));
          urls.push(safeUrl('down.aspx?type=anno&sn=' + serialNo));
          urls.push(safeUrl('down.aspx?type=attach&sn=' + serialNo));
        }

        return urls.filter(Boolean);
      }

      function ajaxUrlCandidates() {
        var methodNames = [
          'GetDownloadUrl',
          'GetFileDownloadUrl',
          'GetMaterialDownloadUrl',
          'GetWorkAttDownloadUrl',
          'DownloadFile'
        ];
        var args = [
          request.targetNo,
          request.serialNo,
          request.homeSn,
          request.courseCode
        ];
        var urls = [];

        for (var i = 0; i < methodNames.length; i += 1) {
          try {
            var method = CourseFP.AjaxMethods[methodNames[i]];
            if (typeof method !== 'function') continue;
            var result = method.apply(CourseFP.AjaxMethods, args);
            var value = result && result.value != null ? result.value : result;
            if (typeof value === 'string' && value) {
              urls.push(safeUrl(value));
            } else if (value && typeof value === 'object') {
              var url = pickUrl(value, ['DownloadUrl', 'downloadUrl', 'Url', 'URL', 'Href', 'FileUrl', 'FileURL', 'Link']);
              if (url) urls.push(url);
            }
          } catch (error) {}
        }

        return urls;
      }

      function matchingAjaxMethodNames() {
        try {
          return Object.keys(CourseFP.AjaxMethods || {})
            .filter(function(name) { return /download|down|file|material|att|upload|work/i.test(name); })
            .slice(0, 40);
        } catch (error) {
          return [];
        }
      }

      function blobToBase64(blob) {
        return new Promise(function(resolve, reject) {
          var reader = new FileReader();
          reader.onloadend = function() {
            var dataUrl = String(reader.result || '');
            resolve(dataUrl.indexOf(',') >= 0 ? dataUrl.split(',').pop() : dataUrl);
          };
          reader.onerror = function() { reject(new Error('File read failed')); };
          reader.readAsDataURL(blob);
        });
      }

      async function fetchFirst(urls) {
        var lastMessage = '';
        var tried = [];
        for (var i = 0; i < urls.length; i += 1) {
          var url = urls[i];
          tried.push(url);
          try {
            var response = await fetch(url, { credentials: 'include' });
            if (!response.ok) {
              lastMessage = 'HTTP ' + response.status;
              continue;
            }
            var blob = await response.blob();
            var base64 = await blobToBase64(blob);
            var disposition = response.headers.get('content-disposition') || '';
            var fileName = request.fileName || '';
            var match = disposition.match(/filename\\*?=(?:UTF-8''|")?([^";]+)/i);
            if (match && match[1]) {
              try {
                fileName = decodeURIComponent(match[1].replace(/"/g, ''));
              } catch (error) {
                fileName = match[1].replace(/"/g, '');
              }
            }
            post({
              t: 'file_downloaded',
              fileName: fileName || 'tutoring-file',
              mimeType: blob.type || response.headers.get('content-type') || 'application/octet-stream',
              base64: base64
            });
            return;
          } catch (error) {
            lastMessage = (error && error.message) || String(error);
          }
        }
        post({
          t: 'err',
          m: (lastMessage || '找不到可下載的附件連結') +
            '；候選=' + tried.slice(0, 4).join(' | ') +
            '；方法=' + matchingAjaxMethodNames().join(',')
        });
      }

      try {
        if (typeof window.CourseFP === 'undefined' || !window.CourseFP.AjaxMethods) {
          post({ t: 'err', m: 'CourseFP not ready' });
          return;
        }
        if (request.courseCode) {
          CourseFP.AjaxMethods.setCC(request.courseCode).value;
        }
        var urls = downloadUrlCandidates().concat(ajaxUrlCandidates());
        if (urls.length === 0) {
          post({
            t: 'err',
            m: '找不到可下載的附件連結；方法=' + matchingAjaxMethodNames().join(',')
          });
          return;
        }
        fetchFirst(urls);
      } catch (error) {
        post({ t: 'err', m: (error && error.message) || 'Tutoring download failed' });
      }
  `);
}

export function buildTutoringFileUploadScript(request: TutoringUploadRequest): string {
  const requestParam = JSON.stringify(request);

  return createTutoringScript(`
      var request = ${requestParam};

      function base64ToBlob(base64, mimeType) {
        var binary = atob(base64);
        var length = binary.length;
        var bytes = new Uint8Array(length);
        for (var i = 0; i < length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
      }

      function checkUploadDone() {
        return new Promise(function(resolve) {
          var settled = false;
          var finish = function(value) {
            if (settled) return;
            settled = true;
            resolve(value);
          };
          try {
            CourseFP.AjaxMethods.CheckUpDone(function(res) {
              if (res && res.error) {
                finish({ ok: false, message: res.error.Message || 'CheckUpDone failed' });
                return;
              }
              finish({ ok: res && res.value === 1, value: res && res.value });
            });
            setTimeout(function() { finish({ ok: true, value: 'timeout_skipped' }); }, 2500);
          } catch (error) {
            try {
              var result = CourseFP.AjaxMethods.CheckUpDone();
              var value = result && result.value != null ? result.value : result;
              finish({ ok: value === 1, value: value });
            } catch (innerError) {
              finish({ ok: true, value: 'check_unavailable' });
            }
          }
        });
      }

      async function tryUploadEndpoints() {
        var endpoints = [
          '/cfp/Files/Upload.ashx?mode=homework',
          'Files/Upload.ashx?mode=homework'
        ].map(function(path) {
          try {
            return new URL(path, window.location.href).href;
          } catch (error) {
            return path;
          }
        });

        var lastMessage = '';
        for (var i = 0; i < endpoints.length; i += 1) {
          try {
            var form = new FormData();
            form.append('sn', request.homeSn != null ? String(request.homeSn) : '');
            form.append('homeworkFile', base64ToBlob(request.base64, request.mimeType), request.fileName || 'homework-upload');

            var response = await fetch(endpoints[i], {
              method: 'POST',
              credentials: 'include',
              body: form
            });

            var text = await response.text();
            if (response.ok && !/error|fail|失敗/i.test(text)) {
              var done = await checkUploadDone();
              if (!done.ok && done.value === 2) {
                lastMessage = done.message || 'Upload Failed';
                continue;
              }
              post({ t: 'file_uploaded', message: htmlToText(text).slice(0, 240) || 'uploaded' });
              return true;
            }
            lastMessage = htmlToText(text).slice(0, 240) || ('HTTP ' + response.status);
          } catch (error) {
            lastMessage = (error && error.message) || String(error);
          }
        }
        post({ t: 'err', m: lastMessage || '作業上傳失敗' });
        return false;
      }

      try {
        if (typeof window.CourseFP === 'undefined' || !window.CourseFP.AjaxMethods) {
          post({ t: 'err', m: 'CourseFP not ready' });
          return;
        }
        if (request.courseCode) {
          CourseFP.AjaxMethods.setCC(request.courseCode).value;
        }
        tryUploadEndpoints();
      } catch (error) {
        post({ t: 'err', m: (error && error.message) || 'Tutoring upload failed' });
      }
  `);
}
