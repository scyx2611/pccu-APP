import fs from 'fs';
import path from 'path';

describe('tutoring detail route title', () => {
  it('sets the native header title from the selected course instead of route defaults', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../../../app/tutoring/[courseCode].tsx'),
      'utf8',
    );

    expect(source).toContain('Stack.Screen');
    expect(source).toContain('headerTitle');
    expect(source).toContain('selectedCourse?.courseName');
    expect(source).toContain('normalizeTutoringText');
  });
});
