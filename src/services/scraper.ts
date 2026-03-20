import * as cheerio from 'cheerio';

export interface CourseData {
  name: string;
  teacher: string;
  location: string;
  required: boolean;
  type: string;
  dayOfWeek: number;
  periodRange: string;
  startPeriod: number;
  endPeriod: number;
}

export interface CourseGrade {
  type: string;
  code: string;
  name: string;
  credits: string;
  score: string;
}

export interface SemesterGrade {
  title: string;
  courses: CourseGrade[];
  stats: {
    totalPoints?: string;
    average?: string;
    earnedCredits?: string;
    classRank?: string;
    deptRank?: string;
  };
}

const normalize = (value: string) =>
  value.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();

const stripGarbledChars = (value: string) =>
  value.replace(/[\uE000-\uF8FF\uFFFD]/g, '');

const stripEnrollmentCount = (value: string) =>
  value
    .replace(/\s*[（(]\d+\s*人[）)]/g, ' ')
    .replace(/\s*[（(]\d+\s*[）)]\s*$/g, ' ');

const cleanDisplayText = (value: string) =>
  normalize(stripEnrollmentCount(stripGarbledChars(value || '')));

const cleanCourseNameText = (value: string) =>
  cleanDisplayText(value).replace(/\s*[（(]\d+\s*[）)]\s*$/g, '').trim();

const splitCourseDescriptor = (value: string) => {
  const cleaned = cleanCourseNameText(value).replace(/^(?:\((?:\u5fc5|\u9078)\)|\u5fc5\u4fee|\u9078\u4fee)\s*/, '');
  const match = cleaned.match(/^(.{1,12}?)\s+([A-Z0-9]{3,8})\s+(.+)$/);
  if (!match) {
    return { type: '', name: cleaned };
  }

  const prefix = normalize(match[1]);
  const name = normalize(match[3]);
  if (!/[\u4e00-\u9fff]/.test(prefix) || !/[\u4e00-\u9fffA-Za-z]/.test(name)) {
    return { type: '', name: cleaned };
  }

  return { type: prefix, name };
};

const isNumeric = (value: string) => /^-?\d+(?:\.\d+)?$/.test(value);

const isScoreText = (value: string) =>
  /^(?:\u901a\u904e|\u53ca\u683c|\u514d\u4fee|\u62b5\u514d|\u64a4\u9078|\u9000\u9078|\u4e0d\u53ca\u683c|\u7f3a\u8003|\u4e0d\u901a\u904e|\u5408\u683c|\u4e0d\u5408\u683c|P|F)$/i.test(value);

const guessCredits = (value: string) => {
  if (!isNumeric(value)) return false;
  const n = parseFloat(value);
  return n >= 0 && n <= 10;
};

const guessScore = (value: string) => {
  if (isScoreText(value)) return true;
  if (!isNumeric(value)) return false;
  const n = parseFloat(value);
  return n >= 0 && n <= 100;
};

const isGradeAnnouncementText = (value: string) =>
  /(?:開放時間|成績查詢|學生學期|查詢條件|查詢說明|公告|注意事項|請注意)/.test(normalize(value));

const toHalfWidth = (value: string) =>
  value.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));

const extractSemesterTitle = (text: string) => {
  const normalizedText = normalize(stripGarbledChars(text || ''));
  if (!normalizedText || isGradeAnnouncementText(normalizedText)) return null;

  const compact = toHalfWidth(normalizedText).replace(/\s+/g, '');

  if (/^入學前抵免$/.test(compact)) return '入學前抵免';

  let match = compact.match(/(\d{2,3})學年度第?([一二三四五六七八九十0-9]+)學期/);
  if (match) return `${match[1]}學年度第${match[2]}學期`;

  match = compact.match(/(\d{2,3})學年度(上學期|下學期)/);
  if (match) return `${match[1]}學年度${match[2]}`;

  match = compact.match(/(\d{2,3})學年度([^0-9]{1,12}?系)?(\d{1,2})年級([A-Z])班/);
  if (match) {
    const dept = match[2] ? `${match[2]} ` : '';
    return `${match[1]}學年度 ${dept}${match[3]}年級 ${match[4]}班`.replace(/\s+/g, ' ').trim();
  }

  match = compact.match(/(\d{2,3})學年度([^0-9]{1,12}?系)?(\d{1,2})年級/);
  if (match) {
    const dept = match[2] ? `${match[2]} ` : '';
    return `${match[1]}學年度 ${dept}${match[3]}年級`.replace(/\s+/g, ' ').trim();
  }

  if (/學年度/.test(compact) && normalizedText.length <= 30) {
    return normalizedText;
  }

  return null;
};

export function parseGradesFromHtml(html: string): SemesterGrade[] {
  if (!html) return [];
  const $ = cheerio.load(html);
  const semesters: SemesterGrade[] = [];
  const ensureSemester = (title: string) => {
    const existing = semesters.find((s) => s.title === title);
    if (existing) return existing;
    const next = { title, courses: [], stats: {} } as SemesterGrade;
    semesters.push(next);
    return next;
  };

  const fallbackTitle = '\u6b77\u5e74\u6210\u7e3e';
  let current: SemesterGrade | null = null;

  $('tr').each((_, tr) => {
    const cells = $(tr)
      .find('td, th')
      .map((__, td) => normalize($(td).text()))
      .get()
      .filter(Boolean);

    if (cells.length === 0) return;

    const rowText = cells.join(' ');
    const semTitle = cells.map((cell) => extractSemesterTitle(cell)).find(Boolean) || extractSemesterTitle(rowText);
    if (semTitle) {
      current = ensureSemester(semTitle);
      return;
    }

    if (/(?:\u8ab2\u7a0b|\u79d1\u76ee|\u4ee3\u78bc|\u8ab2\u865f|\u5b78\u5206|\u6210\u7e3e|\u5206\u6578)/.test(rowText)) {
      if (!cells.some((c) => /^[A-Z0-9-]{4,}$/.test(c))) return;
    }

    const codeIndex = cells.findIndex((c) => /^[A-Z0-9-]{4,}$/.test(c));
    if (codeIndex === -1) return;

    if (!current) current = ensureSemester(fallbackTitle);

    const code = cells[codeIndex];
    let type = '';
    const prev = cells[codeIndex - 1];
    if (prev && prev.length <= 6 && !isNumeric(prev)) type = prev;

    let name = '';
    for (let i = codeIndex + 1; i < cells.length; i += 1) {
      const v = cells[i];
      if (!isNumeric(v)) {
        name = v;
        break;
      }
    }
    name = normalize(name);
    if (!name || isGradeAnnouncementText(name)) return;

    let credits = '';
    let score = '';
    for (let i = codeIndex + 1; i < cells.length; i += 1) {
      const v = cells[i];
      if (!credits && guessCredits(v)) {
        credits = v;
        continue;
      }
      if (!score && guessScore(v)) {
        if (credits && v === credits) continue;
        score = v;
      }
    }

    if (!credits) {
      const nums = cells
        .slice(codeIndex + 1)
        .filter(isNumeric)
        .map((n) => parseFloat(n));
      if (nums.length) {
        const min = Math.min(...nums);
        if (min <= 10) credits = String(min);
      }
    }

    if (!score) {
      const nums = cells
        .slice(codeIndex + 1)
        .filter(isNumeric)
        .map((n) => parseFloat(n));
      if (nums.length) {
        const max = Math.max(...nums);
        if (max <= 100) score = String(max);
      }
    }

    if (!current.courses.some((c) => c.code === code && c.name === name)) {
      current.courses.push({ type, code, name, credits, score });
    }
  });

  const allText = normalize($('body').text());
  const average = allText.match(/\u5e73\u5747[^0-9]*([0-9]+(?:\.[0-9]+)?)/)?.[1];
  const classRank = allText.match(/\u73ed[^0-9]*([0-9]+\s*\/\s*[0-9]+)/)?.[1];
  const deptRank = allText.match(/\u7cfb[^0-9]*([0-9]+\s*\/\s*[0-9]+)/)?.[1];

  const nonEmpty = semesters.filter((s) => s.courses.length > 0);

  if (nonEmpty.length > 0) {
    const main = nonEmpty[0];
    if (average) main.stats.average = average;
    if (classRank) main.stats.classRank = classRank.replace(/\s+/g, '');
    if (deptRank) main.stats.deptRank = deptRank.replace(/\s+/g, '');
  }

  return nonEmpty;
}

const extractLinesFromCell = (rawHtml: string) => {
  const withBreaks = rawHtml.replace(/<br\s*\/?>/gi, '\n');
  const text = withBreaks.replace(/<[^>]+>/g, ' ');
  return text
    .split(/\r?\n/)
    .map((line) => normalize(line))
    .filter(Boolean);
};

const scheduleDayMap: Record<string, number> = {
  '\u65e5': 0,
  '\u5929': 0,
  '\u4e00': 1,
  '\u4e8c': 2,
  '\u4e09': 3,
  '\u56db': 4,
  '\u4e94': 5,
  '\u516d': 6,
};

const hasScheduleMarker = (value: string) =>
  /(?:\(\u5fc5\)|\(\u9078\)|\u5fc5\u4fee|\u9078\u4fee|(?:\u661f\u671f|\u9031)[\u4e00-\u4e94\u516d\u65e5\u5929])/.test(value);

const isRequirementOnly = (value: string) =>
  /^(?:\(\u5fc5\)|\(\u9078\)|\u5fc5\u4fee|\u9078\u4fee|\u5fc5|\u9078)$/.test(normalize(value));

const hasDayToken = (value: string) =>
  /(?:\u661f\u671f|\u9031)[\u65e5\u5929\u4e00\u4e8c\u4e09\u56db\u4e94\u516d]/.test(value);

const hasPeriodToken = (value: string) =>
  /(?:\u7b2c\s*\d{1,2}(?:\s*[-~\uff5e\u5230\u81f3]\s*\d{1,2})?\s*\u7bc0?|\d{1,2}\s*(?:[-~\uff5e\u5230\u81f3]\s*\d{1,2}\s*)?\u7bc0)/.test(
    value
  );

const parseDayPeriod = (value: string): { dayOfWeek: number; startPeriod: number; endPeriod: number } | null => {
  const compact = value.replace(/\s+/g, '');
  const dayMatch =
    compact.match(/(?:\u661f\u671f|\u9031)([\u65e5\u5929\u4e00\u4e8c\u4e09\u56db\u4e94\u516d])/) ||
    compact.match(/([\u65e5\u5929\u4e00\u4e8c\u4e09\u56db\u4e94\u516d])(?:\u66dc|\u9031|\u661f\u671f)/);
  const periodMatch = compact.match(/\u7b2c?(\d{1,2})(?:\s*[-~\uff5e\u5230\u81f3]\s*(\d{1,2}))?\u7bc0?/);
  if (!dayMatch || !periodMatch) return null;

  const dayOfWeek = scheduleDayMap[dayMatch[1]];
  const startPeriod = parseInt(periodMatch[1], 10);
  const endPeriod = parseInt(periodMatch[2] || periodMatch[1], 10);
  if (!dayOfWeek && dayOfWeek !== 0) return null;
  if (!startPeriod || !endPeriod) return null;

  return { dayOfWeek, startPeriod, endPeriod };
};

const looksLikeTeacher = (value: string) =>
  !!value &&
  !/[0-9]/.test(value) &&
  value.length <= 12 &&
  !/\u661f\u671f|\u9031|\u7bc0/.test(value);

const looksLikeLocation = (value: string) =>
  !!value &&
  (/(?:[A-Za-z]?\d{2,4}[A-Za-z]?|\d{2,4}-?\d*|\u9928|\u6a13|\u5ba4|\u6559\u5ba4|\u6821\u5340|\u83ef\u5ca1|\u5927[\u6069\u7fa9\u5b5d\u8ce2\u5178\u5fd7])/.test(
    value
  ));

const splitTeacherLocation = (value: string) => {
  const cleaned = normalize(
    value
      .replace(/^(?:\u6559\u5e2b|\u8001\u5e2b|\u6388\u8ab2\u6559\u5e2b)[:\uff1a]?\s*/, '')
      .replace(/^(?:\u5730\u9ede|\u6559\u5ba4)[:\uff1a]?\s*/, '')
  );

  if (!cleaned) return { teacher: '', location: '' };

  const separators = ['\u00b7', '|', '\uff5c', '/', '\uff0f'];
  for (const separator of separators) {
    if (!cleaned.includes(separator)) continue;
    const parts = cleaned.split(separator).map((part) => normalize(part)).filter(Boolean);
    if (parts.length < 2) continue;
    const teacher = parts.find(looksLikeTeacher) || parts[0];
    const location = parts.find((part) => part !== teacher) || parts[parts.length - 1];
    return { teacher, location };
  }

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return {
      teacher: looksLikeTeacher(parts[0]) ? parts[0] : '',
      location: looksLikeLocation(parts[0]) ? parts[0] : '',
    };
  }

  const teacher = parts.find(looksLikeTeacher) || parts[0];
  const locationParts = parts.filter((part) => part !== teacher);
  return {
    teacher,
    location: locationParts.join(' ') || (looksLikeLocation(parts[0]) ? parts[0] : ''),
  };
};

const parseCourseTitle = (line: string) => {
  let raw = cleanDisplayText(line);
  let required = true;

  if (/^\(\u9078\)|^\u9078\u4fee/.test(raw)) required = false;
  if (/^\(\u5fc5\)|^\u5fc5\u4fee/.test(raw)) required = true;

  raw = raw
    .replace(/^\((\u5fc5|\u9078)\)\s*/, '')
    .replace(/^(?:\u5fc5\u4fee|\u9078\u4fee)\s*/, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim();

  let type = '';
  const match = raw.match(/^(.+?)\s+([A-Z0-9]{3,5})\s+(.+)$/);
  if (match) {
    type = normalize(match[1]);
    raw = normalize(match[3]);
  }

  return { name: raw, required, type };
};

export const sanitizeCourseData = (course: CourseData): CourseData => {
  const splitName = splitCourseDescriptor(course.name);
  const cleanedTeacher = cleanDisplayText(course.teacher);
  const cleanedLocationRaw = cleanDisplayText(course.location);
  let cleanedName = splitName.name || cleanCourseNameText(course.name);

  if (cleanedTeacher) {
    const teacherIndex = cleanedName.indexOf(cleanedTeacher);
    if (teacherIndex > 0) cleanedName = cleanedName.slice(0, teacherIndex);
  }

  if (cleanedLocationRaw) {
    const locationIndex = cleanedName.indexOf(cleanedLocationRaw);
    if (locationIndex > 0) cleanedName = cleanedName.slice(0, locationIndex);
  }

  cleanedName = cleanCourseNameText(cleanedName);
  const cleanedType = cleanDisplayText(course.type) || splitName.type;

  return {
    ...course,
    name: cleanedName || normalize(course.name),
    teacher: cleanedTeacher,
    location: cleanedLocationRaw || '\u672a\u77e5',
    type: cleanedType,
  };
};

export const sanitizeCourseList = (courses: CourseData[]) => courses.map(sanitizeCourseData);

const suspiciousCourseNamePattern =
  /^(?:[\u4e00-\u9fff]{1,8}(?:系|所|院)|中文|體育|通識|外文領域\d*|資管系|英文|國文)$/;

const isSuspiciousCourseName = (course: CourseData) => {
  const name = normalize(course.name);
  const type = normalize(course.type);
  if (!name || !suspiciousCourseNamePattern.test(name)) {
    return false;
  }

  if (type && (type === name || type.startsWith(name) || name.startsWith(type))) {
    return true;
  }

  return /(?:系|所|院)$/.test(name);
};

export const hasSuspiciousCourseNames = (courses: CourseData[]) => {
  if (!courses || courses.length === 0) return false;
  const suspiciousCount = courses.filter(isSuspiciousCourseName).length;
  return suspiciousCount >= Math.max(2, Math.ceil(courses.length * 0.5));
};

const parseCourseTitleFromLines = (lines: string[]) => {
  let requirementOnly = '';

  for (const rawLine of lines) {
    const line = normalize(rawLine);
    if (!line) continue;
    if (!requirementOnly && isRequirementOnly(line)) requirementOnly = line;
    if (hasDayToken(line) || hasPeriodToken(line)) continue;

    if (hasScheduleMarker(line) && !isRequirementOnly(line)) {
      const parsed = parseCourseTitle(line);
      if (parsed.name) return { parsedTitle: parsed, titleLine: line, prefix: '' };
    }
  }

  for (const rawLine of lines) {
    const line = normalize(rawLine);
    if (!line || isRequirementOnly(line) || hasDayToken(line) || hasPeriodToken(line)) continue;
    if (!requirementOnly && (looksLikeTeacher(line) || looksLikeLocation(line))) continue;

    const candidate = requirementOnly ? `${requirementOnly} ${line}` : line;
    const parsed = parseCourseTitle(candidate);
    if (parsed.name) return { parsedTitle: parsed, titleLine: line, prefix: requirementOnly };
  }

  return null;
};

const finalizeCourses = (courses: CourseData[]) => {
  const dayLabels = ['\u65e5', '\u4e00', '\u4e8c', '\u4e09', '\u56db', '\u4e94', '\u516d'];
  return sanitizeCourseList(courses)
    .map((course) => {
      const range =
        course.startPeriod === course.endPeriod
          ? String(course.startPeriod)
          : `${course.startPeriod}-${course.endPeriod}`;
      return {
        ...course,
        periodRange: `\u661f\u671f${dayLabels[course.dayOfWeek] || ''} \u7b2c ${range} \u7bc0`,
      };
    })
    .sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.startPeriod - b.startPeriod;
    });
};

const parseScheduleFromTable = ($: cheerio.CheerioAPI) => {
  const tables = $('table').toArray();
  const courseMap = new Map<string, CourseData>();

  for (const table of tables) {
    const tableHtml = $(table).html() || '';
    const tableText = normalize($(table).text());
    const maybeScheduleTable =
      tableHtml.includes('pubContent') ||
      tableHtml.includes('pubTdItem_Period') ||
      (/\u7bc0/.test(tableText) && /(?:\u661f\u671f|\u9031)[\u4e00-\u4e94\u516d\u65e5\u5929]/.test(tableText)) ||
      (/(?:\(\u5fc5\)|\(\u9078\)|\u5fc5\u4fee|\u9078\u4fee)/.test(tableText) && /\u661f\u671f|\u9031/.test(tableText));

    if (!maybeScheduleTable) continue;

    $(table)
      .find('tr')
      .each((_, tr) => {
        const allTds = $(tr).children('td');
        if (allTds.length === 0) return;

        const periodSource = normalize($(allTds[0]).text()) || normalize($(allTds.eq(1)).text());
        const period = parseInt(periodSource.replace(/[^0-9]/g, ''), 10);
        if (!period) return;

        const cells = $(tr).children('td.pubContent, td[class*="pubContent"]');
        const dayCells = cells.length > 0 ? cells : allTds.slice(2);
        if (dayCells.length === 0) return;

        dayCells.each((dayIndex, td) => {
          const cellHtml = $(td).html() || '';
          const cellText = normalize($(td).text());
          if (!cellHtml || !cellText || cellText === '-' || cellText === '_') return;

          const lines = extractLinesFromCell(cellHtml || cellText);
          if (lines.length === 0) return;

          const titleInfo = parseCourseTitleFromLines(lines);
          if (!titleInfo) return;

          const { parsedTitle, titleLine, prefix } = titleInfo;

          const extraInfo = splitTeacherLocation(
            lines
              .filter((line) => line !== titleLine)
              .filter((line) => !prefix || line !== prefix)
              .filter((line) => !hasDayToken(line) && !hasPeriodToken(line))
              .join(' ')
          );
          const dayOfWeek = dayIndex + 1;
          const key = `${parsedTitle.name}-${dayOfWeek}`;
          const existing = courseMap.get(key);
          if (existing) {
            existing.endPeriod = period;
            if (!existing.teacher) existing.teacher = extraInfo.teacher;
            if (!existing.location) existing.location = extraInfo.location;
            if (!existing.type && parsedTitle.type) existing.type = parsedTitle.type;
            return;
          }

          courseMap.set(key, {
            name: parsedTitle.name,
            teacher: extraInfo.teacher,
            location: extraInfo.location,
            required: parsedTitle.required,
            type: parsedTitle.type,
            dayOfWeek,
            periodRange: '',
            startPeriod: period,
            endPeriod: period,
          });
        });
      });
  }

  return finalizeCourses(Array.from(courseMap.values()));
};

const parseScheduleFromCards = ($: cheerio.CheerioAPI) => {
  const seen = new Set<string>();
  const courses: CourseData[] = [];

  $('div, li, article, section, tr').each((_, element) => {
    const text = normalize($(element).text());
    if (!text || text.length < 8 || text.length > 240) return;
    if (!/(?:\u661f\u671f|\u9031)[\u65e5\u5929\u4e00\u4e8c\u4e09\u56db\u4e94\u516d]/.test(text)) return;
    if (!/\u7b2c?\s*\d{1,2}(?:\s*[-~\uff5e\u5230\u81f3]\s*\d{1,2})?\u7bc0?/.test(text)) return;

    const signature = text.replace(/\s+/g, '');
    if (seen.has(signature)) return;
    seen.add(signature);

    const lines = extractLinesFromCell($(element).html() || text);
    if (lines.length === 0) return;

    const titleInfo = parseCourseTitleFromLines(lines);
    if (!titleInfo) return;
    const scheduleIndex = lines.findIndex((line) => !!parseDayPeriod(line));
    if (scheduleIndex === -1) return;

    const parsedTitle = titleInfo.parsedTitle;
    const parsedSlot = parseDayPeriod(lines[scheduleIndex]);
    if (!parsedTitle.name || !parsedSlot) return;

    const infoLine =
      lines.find((line, index) => line !== titleInfo.titleLine && index !== scheduleIndex && (!titleInfo.prefix || line !== titleInfo.prefix)) || '';
    const info = splitTeacherLocation(infoLine);

    courses.push({
      name: parsedTitle.name,
      teacher: info.teacher,
      location: info.location,
      required: parsedTitle.required,
      type: parsedTitle.type,
      dayOfWeek: parsedSlot.dayOfWeek,
      periodRange: '',
      startPeriod: parsedSlot.startPeriod,
      endPeriod: parsedSlot.endPeriod,
    });
  });

  const deduped = Array.from(
    new Map(courses.map((course) => [`${course.name}-${course.dayOfWeek}-${course.startPeriod}-${course.endPeriod}`, course])).values()
  );
  return finalizeCourses(deduped);
};

export function parseScheduleFromHtml(html: string): CourseData[] {
  if (!html) return [];
  const $ = cheerio.load(html);
  const fromTable = parseScheduleFromTable($);
  if (fromTable.length > 0) return fromTable;
  return parseScheduleFromCards($);
}
