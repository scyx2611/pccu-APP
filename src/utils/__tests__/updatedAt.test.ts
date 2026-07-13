import { buildUpdatedAtText, formatUpdatedAt } from '../updatedAt';

describe('updated-at presentation helpers', () => {
  it('formats a local timestamp and keeps null empty', () => {
    const updatedAt = new Date(2024, 0, 2, 3, 4).getTime();

    expect(formatUpdatedAt(updatedAt)).toBe('2024/01/02 03:04');
    expect(formatUpdatedAt(null)).toBe('');
  });

  it('prioritizes the updating label and otherwise uses the available timestamp', () => {
    const updatedAt = new Date(2024, 0, 2, 3, 4).getTime();

    expect(
      buildUpdatedAtText({
        updatedAt,
        updatingLabel: '同步中',
        emptyLabel: '尚未同步',
        isUpdating: true,
      }),
    ).toBe('同步中');
    expect(
      buildUpdatedAtText({ updatedAt, updatingLabel: '同步中', emptyLabel: '尚未同步' }),
    ).toContain('2024/01/02 03:04');
    expect(
      buildUpdatedAtText({ updatedAt: null, updatingLabel: '同步中', emptyLabel: '尚未同步' }),
    ).toBe('尚未同步');
  });
});
