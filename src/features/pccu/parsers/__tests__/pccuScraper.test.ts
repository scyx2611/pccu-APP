import fs from 'fs';
import path from 'path';
import { parseGradesFromHtml, parseScheduleFromHtml } from '../pccuScraper';

const fixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../../../../__fixtures__/html', name), 'utf8');

describe('pccuScraper parser', () => {
  it('valid schedule HTML -> non-empty parsed courses', () => {
    const html = fixture('schedule-valid.html');
    const courses = parseScheduleFromHtml(html);

    expect(courses.length).toBeGreaterThan(0);
    expect(courses[0].name).toBeTruthy();
    expect(courses[0].startPeriod).toBeGreaterThan(0);
  });

  it('valid grade HTML -> non-empty parsed semesters/courses', () => {
    const html = fixture('grade-valid.html');
    const semesters = parseGradesFromHtml(html);

    expect(semesters.length).toBeGreaterThan(0);
    expect(semesters[0].courses.length).toBeGreaterThan(0);
  });

  it('empty HTML -> empty arrays', () => {
    expect(parseScheduleFromHtml('')).toEqual([]);
    expect(parseGradesFromHtml('')).toEqual([]);
  });

  it('malformed HTML -> graceful fallback', () => {
    const malformed = fixture('malformed.html');

    expect(() => parseScheduleFromHtml(malformed)).not.toThrow();
    expect(() => parseGradesFromHtml(malformed)).not.toThrow();
  });

  it('error page HTML -> safe empty result', () => {
    const html = fixture('error-page.html');

    expect(parseScheduleFromHtml(html)).toEqual([]);
    expect(parseGradesFromHtml(html)).toEqual([]);
  });
});
