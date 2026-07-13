import {
  armNextSessionCleanupFailure,
  consumeNextSessionCleanupFailure,
} from '../acceptanceFaults';

describe('acceptanceFaults', () => {
  it('consumes an armed cleanup failure exactly once', () => {
    expect(consumeNextSessionCleanupFailure()).toBe(false);

    armNextSessionCleanupFailure();

    expect(consumeNextSessionCleanupFailure()).toBe(true);
    expect(consumeNextSessionCleanupFailure()).toBe(false);
  });
});
