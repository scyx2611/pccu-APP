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
